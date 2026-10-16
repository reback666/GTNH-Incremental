import type { FactoryOverview, FactoryFacility } from '../game/presentation/types';
import { CONNECTIONS, machinePlacements, project, SCENE_HEIGHT, SCENE_WIDTH, SITES, type Point, type Site } from './layout';

export interface SceneState {
  factory: FactoryOverview;
  selected: string;
  zoom: number;
  light: boolean;
  time: number;
  minePulse: number;
  veinTier: number;
  images: Map<string, HTMLImageElement>;
}

type Paint = [string, string, string];
const STEEL: Paint = ['#8b9299', '#474d55', '#626972'];
const DARK: Paint = ['#4c535c', '#252a31', '#383e46'];
function polygon(ctx: CanvasRenderingContext2D, points: Point[], fill: string, stroke?: string): void {
  ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}
function line(ctx: CanvasRenderingContext2D, points: Point[], color: string, width = 1): void {
  ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.lineWidth = width; ctx.strokeStyle = color; ctx.stroke();
}
function circle(ctx: CanvasRenderingContext2D, p: Point, radius: number, color: string): void {
  ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
}
function block(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, d: number, h: number, colors: Paint = STEEL, base = 0): void {
  const a = project(x, y, base + h), b = project(x + w, y, base + h);
  const c = project(x + w, y + d, base + h), e = project(x, y + d, base + h);
  polygon(ctx, [e, c, project(x + w, y + d, base), project(x, y + d, base)], colors[1], '#12141780');
  polygon(ctx, [b, c, project(x + w, y + d, base), project(x + w, y, base)], colors[2], '#12141780');
  polygon(ctx, [a, b, c, e], colors[0], '#d9dce035');
}

// 用仿射变换将完整机壳/功能面贴图投影到方块表面，而不是叠一个平面图标。
function texture(ctx: CanvasRenderingContext2D, image: HTMLImageElement | undefined, points: Point[], shade = 'transparent'): void {
  if (!image?.complete || !image.naturalWidth) return;
  const [a, b, , d] = points;
  ctx.save(); ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.clip();
  ctx.transform((b.x - a.x) / image.naturalWidth, (b.y - a.y) / image.naturalWidth,
    (d.x - a.x) / image.naturalHeight, (d.y - a.y) / image.naturalHeight, a.x, a.y);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 0, 0);
  ctx.fillStyle = shade; ctx.fillRect(0, 0, image.naturalWidth, image.naturalHeight); ctx.restore();
}
function machine(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, height: number, base: number,
  front: HTMLImageElement | undefined, side: HTMLImageElement | undefined, top: HTMLImageElement | undefined): void {
  block(ctx, x, y, size, size, height, STEEL, base);
  const a = project(x, y, base + height), b = project(x + size, y, base + height);
  const c = project(x + size, y + size, base + height), d = project(x, y + size, base + height);
  texture(ctx, top ?? side, [a, b, c, d], '#ffffff08');
  texture(ctx, side, [b, c, project(x + size, y + size, base), project(x + size, y, base)], '#00000038');
  texture(ctx, front ?? side, [d, c, project(x + size, y + size, base), project(x, y + size, base)], '#00000012');
}
function pipe(ctx: CanvasRenderingContext2D, from: Site, to: Site, color: string, active: boolean, time: number, count = 3): void {
  const a = project(from.x, from.y), b = project(from.x, to.y), c = project(to.x, to.y);
  line(ctx, [a, b, c], '#16191c', 12); line(ctx, [a, b, c], '#70757c', 7);
  line(ctx, [a, b, c], active ? color + 'a0' : '#4a4e55', 3);
  if (!active) return;
  const first = Math.hypot(b.x - a.x, b.y - a.y), second = Math.hypot(c.x - b.x, c.y - b.y), length = first + second;
  if (!length) return;
  for (let i = 0; i < count; i++) {
    const distance = (time * 55 + i * length / count) % length;
    const start = distance < first ? a : b, end = distance < first ? b : c;
    const ratio = distance < first ? distance / first : (distance - first) / second;
    const p = { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
    ctx.fillStyle = color; ctx.fillRect(p.x - 3, p.y - 2, 6, 4);
  }
}
function floor(ctx: CanvasRenderingContext2D, light: boolean): void {
  block(ctx, -4.8, -4.8, 9.6, 9.6, 13, light ? ['#8b8e94', '#555961', '#6d717a'] : ['#323840', '#161a20', '#252a32'], -13);
  for (let n = -4; n <= 4; n++) {
    line(ctx, [project(n, -4.8), project(n, 4.8)], light ? '#55596160' : '#9fa9b02b');
    line(ctx, [project(-4.8, n), project(4.8, n)], light ? '#55596160' : '#9fa9b02b');
  }
  for (let n = -4; n <= 4; n++) {
    const p = project(n, 4.77);
    polygon(ctx, [p, project(n + 0.3, 4.77), project(n + 0.3, 4.57), project(n, 4.57)], n % 2 ? '#292c31' : '#a59b64');
  }
}
function oreBed(ctx: CanvasRenderingContext2D, state: SceneState): void {
  const image = state.images.get(`ore:${state.veinTier}`);
  for (let i = 0; i < 9; i++) {
    const x = -3.95 + i % 3 * 0.46, y = 2.55 + Math.floor(i / 3) * 0.43;
    machine(ctx, x, y, 0.42, 15 + i % 3 * 6, 9, image, image, image);
  }
}
function facility(ctx: CanvasRenderingContext2D, site: Site, data: FactoryFacility | undefined, state: SceneState): void {
  const installed = (data?.count ?? 0) > 0, active = (data?.activity ?? 0) > 0;
  const selected = state.selected === site.kind;
  const color = data?.faulty ? '#ef8075' : site.color;
  const extent = installed && data!.count > 16 ? 1.24 : 1.06;
  block(ctx, site.x - extent, site.y - extent, extent * 2, extent * 2, 8, DARK);
  const corners = [project(site.x - extent, site.y - extent, 8), project(site.x + extent, site.y - extent, 8),
    project(site.x + extent, site.y + extent, 8), project(site.x - extent, site.y + extent, 8)];
  ctx.save(); if (!installed) ctx.setLineDash([5, 6]);
  line(ctx, [...corners, corners[0]], selected ? color : color + '60', selected ? 2 : 1); ctx.restore();
  if (!installed || !data) return;
  const placements = machinePlacements(data).sort((a, b) => a.rackX + a.rackY - b.rackX - b.rackY || a.rack - b.rack || a.base - b.base || a.x + a.y - b.x - b.y);
  const decks = new Set<string>();
  for (const item of placements) {
    const deck = `${item.rack}:${item.base}`;
    if (!decks.has(deck)) {
      block(ctx, site.x + item.rackX - item.rackSize / 2, site.y + item.rackY - item.rackSize / 2,
        item.rackSize, item.rackSize, 3, DARK, item.base - 3);
      decks.add(deck);
    }
    machine(ctx, site.x + item.x, site.y + item.y, item.size, item.height, item.base,
      state.images.get(item.machine.modelId), state.images.get(`side:${item.machine.tier}`), state.images.get(`top:${item.machine.tier}`));
    if (active && item.machine.running > 0) {
      const lamp = project(site.x + item.x + item.size * 0.7, site.y + item.y + item.size, item.base + item.height * 0.45);
      ctx.fillStyle = '#99ca81'; ctx.fillRect(lamp.x - 1, lamp.y - 1, 3, 3);
    }
    if (site.kind === 'storage') {
      const p = project(site.x + item.x + item.size * 0.5, site.y + item.y + item.size, item.base + item.height * 0.3);
      ctx.fillStyle = '#30342e'; ctx.fillRect(p.x - 4, p.y - 6, 8, 10);
      ctx.fillStyle = '#92bf6e'; const fill = state.factory.batteryRatio * 10; ctx.fillRect(p.x - 3, p.y + 4 - fill, 6, fill);
    }
  }
  if (site.kind === 'generator') {
    const outlets = new Map<number, typeof placements[number]>();
    for (const item of placements) {
      const current = outlets.get(item.rack);
      if (!current || item.base + item.height > current.base + current.height) outlets.set(item.rack, item);
    }
    for (const [rack, top] of outlets) {
      const x = site.x + top.x + top.size / 2 - 0.06;
      const y = site.y + top.y + top.size / 2 - 0.06;
      const z = top.base + top.height;
      block(ctx, x, y, 0.12, 0.12, 18, DARK, z);
      if (active) for (let n = 0; n < 4; n++) {
        const age = (state.time * 0.55 + n / 4 + rack * 0.15) % 1;
        const p = project(x + 0.06, y + 0.06, z + 18);
        ctx.save(); ctx.globalAlpha = (1 - age) * 0.22; circle(ctx, { x: p.x + age * 20, y: p.y - age * 38 }, 4 + age * 10, '#aeb4bc'); ctx.restore();
      }
    }
  } else if (site.kind === 'miner') {
    const p = project(site.x - 0.7, site.y + 0.7, 57);
    line(ctx, [p, project(site.x - 0.7, site.y + 0.7, 14 + (active ? Math.sin(state.time * 7) * 5 : 0))], '#bfc5cd', 5);
  } else if (site.kind === 'machine') {
    const p = project(site.x, site.y, 55 + (active ? Math.sin(state.time * 4) * 7 : 0));
    line(ctx, [project(site.x - 0.8, site.y - 0.8, 53), p, project(site.x + 0.6, site.y + 0.4, 22)], '#bcac73', 4);
  } else if (site.kind === 'research' || site.kind === 'arcane') {
    const top = placements.at(-1)!; const p = project(site.x, site.y, top.base + top.height + 16);
    const size = active ? 6 + Math.sin(state.time * 3) : 4;
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(p.x, p.y, size * 2, size, active ? state.time * 0.2 : 0, 0, Math.PI * 2); ctx.stroke();
  }
}
export function renderFactory(ctx: CanvasRenderingContext2D, state: SceneState): void {
  ctx.clearRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
  ctx.fillStyle = state.light ? '#a3a5ae' : '#161a20'; ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
  ctx.save(); ctx.translate(SCENE_WIDTH / 2, SCENE_HEIGHT / 2); ctx.scale(state.zoom, state.zoom); ctx.translate(-SCENE_WIDTH / 2, -SCENE_HEIGHT / 2);
  floor(ctx, state.light);
  const visible = SITES.filter(site => state.factory.facilities.some(item => item.kind === site.kind) || site.kind === 'research');
  for (const [fromKind, toKind, resource] of CONNECTIONS) {
    const from = visible.find(site => site.kind === fromKind), to = visible.find(site => site.kind === toKind);
    if (!from || !to) continue;
    const data = state.factory.facilities.find(item => item.kind === fromKind), target = state.factory.facilities.find(item => item.kind === toKind);
    pipe(ctx, from, to, resource === 'power' ? '#d1ae5f' : '#a8b3ad', (data?.activity ?? 0) > 0 && (target?.count ?? 0) > 0,
      state.time, Math.min(9, 2 + Math.ceil(Math.log2((data?.count ?? 0) + 1))));
  }
  oreBed(ctx, state);
  for (const site of [...visible].sort((a, b) => (a.x + a.y) - (b.x + b.y))) facility(ctx, site, state.factory.facilities.find(item => item.kind === site.kind), state);
  const made = state.factory.facilities.find(item => item.kind === 'machine');
  if (made?.count) pipe(ctx, SITES.find(site => site.kind === 'machine')!, { kind: 'machine', x: 1.7, y: 3.7, color: '#a8b3ad', label: '成品' }, '#b4bdc3', made.activity > 0, state.time);
  if (state.minePulse > 0) {
    const p = project(-3.4, 3.2, 25); const age = 1 - state.minePulse;
    ctx.save(); ctx.globalAlpha = state.minePulse;
    for (let i = 0; i < 15; i++) {
      const angle = i * 2.39; ctx.fillStyle = i % 3 ? '#8c939c' : '#d0c38d';
      ctx.fillRect(p.x + Math.cos(angle) * age * 85, p.y + Math.sin(angle) * age * 45 - Math.sin(age * Math.PI) * 32, 4, 4);
    }
    ctx.restore();
  }
  ctx.restore();
}
