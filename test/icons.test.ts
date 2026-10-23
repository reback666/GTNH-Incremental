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
const manifest = JSON.parse(readFileSync(new URL('../scripts/native-icons/manifest.json', import.meta.url), 'utf8')) as {
  size: number;
  models: Record<string, { registry: string; meta: number; name: string }>;
};

function pngSize(bytes: Buffer): string {
  // PNG 的宽高写在 IHDR 里：文件头 8 字节 + 长度 4 + 类型 4 之后就是宽高各 4 字节
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

// 防止原生导出漏项后静默回退到代码图标，或扩展等级再次被人工染色。
describe('机型图标', () => {
  it('每个机型都有原生物品映射与 64×64 图标', () => {
    const missing: string[] = [];
    const wrongSize: string[] = [];
    for (const model of MACHINE_MODELS) {
      const key = model.icon ?? model.id;
      expect(manifest.models[key], `${model.id} 的原生物品来源`).toBeDefined();
      const file = path.join(ICON_DIR, `${key}.png`);
      if (!existsSync(file)) {
        missing.push(model.id);
        continue;
      }
      const size = pngSize(readFileSync(file));
      if (size !== '64x64') wrongSize.push(`${model.id}=${size}`);
    }
    expect(missing, '缺图标的机型').toEqual([]);
    expect(wrongSize, '尺寸不对的图标').toEqual([]);
    expect(manifest.size).toBe(64);
  });

  it('同一原版物品的复用图标保持完全一致，不添加电压色或自绘标记', () => {
    const originals = new Map<string, Buffer>();
    for (const [id, item] of Object.entries(manifest.models)) {
      expect(item.registry).not.toBe('');
      expect(Number.isInteger(item.meta) && item.meta >= 0).toBe(true);
      expect(item.name).not.toBe('');
      const identity = `${item.registry}:${item.meta}`;
      const icon = readFileSync(path.join(ICON_DIR, `${id}.png`));
      const original = originals.get(identity);
      if (original) {
        expect(icon.equals(original), `${id} 的复用素材不应重绘`).toBe(true);
      } else {
        originals.set(identity, icon);
      }
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
