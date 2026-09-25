import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 构build时间戳：单文件产物会发给别人玩，界面上标出来才能确认手上是哪个版本。
function buildStamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

// 计划书第十四章：网页游戏，构建用 Vite，产物要能直接发链接。
export default defineConfig({
  plugins: [vue()],
  base: './',
  define: {
    __BUILD_STAMP__: JSON.stringify(buildStamp()),
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    // 产物要内联成单个 HTML（scripts/inline-dist.ts 会删掉 assets 目录），
    // 所以贴图必须全部内联成 data URL —— 矿脉的帧条带最大有 23 KB，
    // 超过 Vite 默认的 4 KB 阈值就会变成外部文件，双击打开时图会丢。
    assetsInlineLimit: 4_000_000,
  },
});
