// 版本号与构建时间戳由 vite.config.ts 的 define 在打包时注入。
// 单文件产物会发给别人玩，界面上标出来才能确认手上是哪个版本。
// 版本号的唯一来源是 package.json 的 version。
declare const __APP_VERSION__: string;
declare const __BUILD_STAMP__: string;
