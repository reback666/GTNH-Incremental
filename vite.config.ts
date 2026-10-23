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
    // 同时产出标准 Web 目录与便携单文件，贴图在两种产物中都自包含。
    // 贴图内联成 data URL —— 矿脉的帧条带最大有 23 KB，
    // 超过 Vite 默认的 4 KB 阈值就会变成外部文件，双击打开时图会丢。
    assetsInlineLimit: 4_000_000,
  },
});
