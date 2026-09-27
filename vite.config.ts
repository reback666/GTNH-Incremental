import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 版本号只有一个来源：package.json 的 version。发新版改这里，界面与诊断日志自动跟上。
function appVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
  return String(pkg.version);
}

// 构建时间戳：版本号可能一天里改很多次，时间戳用来看手上这份是不是最新的。
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
    __APP_VERSION__: JSON.stringify(appVersion()),
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
