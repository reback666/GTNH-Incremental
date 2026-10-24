"""Read native block faces and StructureLib definitions from a local running GTNH client."""
from __future__ import annotations

import argparse
import base64
import json
import subprocess
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pid', required=True, type=int)
    parser.add_argument('--java-home', required=True, type=Path)
    parser.add_argument('--meta', action='append', type=int, default=[])
    args = parser.parse_args()
    capture = HERE / 'capture.json'
    existing = json.loads(capture.read_text(encoding='utf-8-sig'))
    metas = sorted({int(key) for key in existing if key.isdigit()} | set(args.meta))
    name = 'ModelProbe' + str(time.time_ns())
    # Attach agents stay loaded in the client class loader; Windows keeps their JAR
    # open until the client exits. Keep that short-lived input under the ignored
    # probe directory instead of reporting a false failure while deleting it.
    work = ROOT / '.tmp-blueprint' / 'native-models' / 'attached-agents' / f'capture-{time.time_ns()}'
    work.mkdir(parents=True)
    source = work / (name + '.java')
    source.write_text((HERE / 'ModelProbe.java').read_text(encoding='utf-8').replace('ModelProbe', name), encoding='utf-8')
    classes = work / 'classes'
    classes.mkdir()
    manifest = work / 'MANIFEST.MF'
    manifest.write_text(f'Manifest-Version: 1.0\nAgent-Class: gtnh.models.{name}\n\n', encoding='ascii')
    jar = work / 'probe.jar'
    metas_file = work / 'metas.txt'
    metas_file.write_text('\n'.join(map(str, metas)), encoding='utf-8')
    (work / 'blocks.txt').write_text('\n'.join(existing['blockFaces']), encoding='utf-8')
    def run(tool, *parameters):
        subprocess.run([str(args.java_home / 'bin' / (tool + '.exe')), *map(str, parameters)], check=True)
    run('javac', '-encoding', 'UTF-8', '-d', classes, source)
    run('jar', 'cfm', jar, manifest, '-C', classes, '.')
    encoded = base64.b64encode(f'{work}|{metas_file}'.encode('utf-8')).decode('ascii')
    run('java', '-cp', jar, f'gtnh.models.{name}', args.pid, jar, encoded)
    deadline = time.monotonic() + 60
    while not (work / 'done.txt').exists():
        if (work / 'error.txt').exists():
            raise RuntimeError((work / 'error.txt').read_text(encoding='utf-8'))
        if time.monotonic() > deadline:
            raise TimeoutError('GTNH client did not finish native model capture within 60 seconds')
        time.sleep(0.2)
    result = json.loads((work / 'probe.json').read_text(encoding='utf-8'))
    clean = {key: {field: value for field, value in entry.items() if field in ('class', 'shapes', 'elements', 'faces')}
             for key, entry in result.items() if key.isdigit()}
    for key, entry in clean.items():
        if len(entry['faces']) != 12:
            raise ValueError(f'Missing native machine faces: {key}')
    clean['blockFaces'] = result['blockFaces']
    capture.write_text(json.dumps(clean, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'Captured {len(clean) - 1} machine definitions and {len(clean["blockFaces"])} blocks')


if __name__ == '__main__':
    main()
