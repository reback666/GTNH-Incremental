import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 版本号只有一个来源：package.json 的 version。
// 只有 master 上构建出来的算正式版；dev 和其他分支都带 -dev 后缀，
// 免得测试版被当成正式版发出去。dev 合进 master 后重新构建，后缀自动消失。
function appVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
  const version = String(pkg.version);
  return branchName() === 'master' ? version : `${version}-dev`;
}

// 拿不到分支名（没装 git、源码不在仓库里）时按测试版处理，宁可多标一个 -dev
function branchName(): string {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
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
    outDir: 'dist/web',
    target: 'es2022',
    // Web 素材独立下载；便携版由 build-game.ts 单独构建并内联。
    assetsInlineLimit: 4096,
  },
});
