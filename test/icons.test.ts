import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MACHINE_MODELS } from '../src/game/models';
import { MAX_TIER } from '../src/numeric/voltage';

const ICON_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'assets',
  'machines',
);

function pngSize(bytes: Buffer): string {
  // PNG 的宽高写在 IHDR 里：文件头 8 字节 + 长度 4 + 类型 4 之后就是宽高各 4 字节
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

// 图标是脚本生成的，最容易出的错是漏生成（界面会静默回退成代码画的图标）和尺寸变了。
describe('机型图标', () => {
  it('每个机型都有图标文件，且都是 32×32', () => {
    const missing: string[] = [];
    const wrongSize: string[] = [];
    for (const model of MACHINE_MODELS) {
      const file = path.join(ICON_DIR, `${model.id}.png`);
      if (!existsSync(file)) {
        missing.push(model.id);
        continue;
      }
      const size = pngSize(readFileSync(file));
      if (size !== '32x32') wrongSize.push(`${model.id}=${size}`);
    }
    expect(missing, '缺图标的机型').toEqual([]);
    expect(wrongSize, '尺寸不对的图标').toEqual([]);
  });

  it('采矿机与制造机的全部电压图标两两不同（机壳按电压染色生效）', () => {
    for (const prefix of ['m-', 'c-']) {
      const hashes = new Set<string>();
      for (let tier = 1; tier <= MAX_TIER; tier += 1) {
        const file = path.join(ICON_DIR, `${prefix}${tier}.png`);
        hashes.add(createHash('md5').update(readFileSync(file)).digest('hex'));
      }
      expect(hashes.size, `${prefix} 系列的图标数`).toBe(MAX_TIER);
    }
  });

  it('魔法机器的 6 级图标两两不同（电压色叠奥术紫）', () => {
    for (const prefix of ['mm-', 'mg-', 'mc-']) {
      const hashes = new Set<string>();
      for (let tier = 2; tier <= 7; tier += 1) {
        const file = path.join(ICON_DIR, `${prefix}${tier}.png`);
        expect(existsSync(file), `缺 ${prefix}${tier}.png`).toBe(true);
        hashes.add(createHash('md5').update(readFileSync(file)).digest('hex'));
      }
      expect(hashes.size, `${prefix} 系列的图标数`).toBe(6);
    }
  });

  it('镐子三条线覆盖全部电压：金刚杵全线动画，采集/爆破仅满级为动画', () => {
    const dir = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      'src',
      'assets',
      'pickaxe',
    );
    // 金刚杵用材质包贴图，全线 33 拍动画（33×32=1056）；
    // 采集（原版机体+电压色钻头）与爆破满级都是 31 帧无尽矿石流动条带
    const stripHeight: Record<string, (tier: number) => number> = {
      vajra: () => 1056,
      drill: (tier) => (tier === MAX_TIER ? 992 : 32),
      blast: (tier) => (tier === MAX_TIER ? 992 : 32),
    };
    for (const line of ['vajra', 'drill', 'blast']) {
      const hashes = new Set<string>();
      for (let tier = 1; tier <= MAX_TIER; tier += 1) {
        const file = path.join(dir, `${line}-${tier}.png`);
        expect(existsSync(file), `缺 ${line}-${tier}.png`).toBe(true);
        const bytes = readFileSync(file);
        expect(pngSize(bytes), `${line}-${tier} 尺寸`).toBe(`32x${stripHeight[line]!(tier)}`);
        hashes.add(createHash('md5').update(bytes).digest('hex'));
      }
      expect(hashes.size, `${line} 系列的图标数`).toBe(MAX_TIER);
    }
  });
});
