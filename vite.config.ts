import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 计划书第十四章：网页游戏，构建用 Vite，产物要能直接发链接。
export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
});
