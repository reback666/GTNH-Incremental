import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 计划书第十四章：网页游戏，构建用 Vite，产物要能直接发链接。
export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
    // 产物要内联成单个 HTML（scripts/inline-dist.ts 会删掉 assets 目录），
    // 所以贴图必须全部内联成 data URL —— 矿脉的帧条带最大有 23 KB，
    // 超过 Vite 默认的 4 KB 阈值就会变成外部文件，双击打开时图会丢。
    assetsInlineLimit: 4_000_000,
  },
});
