import { describe, expect, it } from 'vitest';
import { isSoundId, playSound, SOUNDS } from '../src/game/audio';

// 音效模块：没有 WebAudio 的环境（jsdom / 老浏览器）要静默降级，不能抛错
describe('音效', () => {
  it('音效表 16 种，id 分组齐全且不重复', () => {
    expect(SOUNDS.length).toBe(16);
    expect(new Set(SOUNDS.map((sound) => sound.id)).size).toBe(16);
    expect(SOUNDS.every((sound) => sound.group === '操作' || sound.group === '事件')).toBe(true);
  });

  it('isSoundId 只认表里的 id', () => {
    expect(isSoundId('mine')).toBe(true);
    expect(isSoundId('no-such')).toBe(false);
    expect(isSoundId(42)).toBe(false);
  });

  it('不支持 WebAudio 时播一声是静默空操作', () => {
    expect(() => playSound('mine', true, [])).not.toThrow();
    // 总开关关着 / 被单独关掉时同样直接跳过
    expect(() => playSound('mine', false, [])).not.toThrow();
    expect(() => playSound('mine', true, ['mine'])).not.toThrow();
  });
});
