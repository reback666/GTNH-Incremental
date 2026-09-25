// 构建时间戳由 vite.config.ts 的 define 在打包时注入。
// 单文件产物会发给别人玩，界面上标出来才能确认手上是哪个版本。
declare const __BUILD_STAMP__: string;
