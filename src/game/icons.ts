// 机型图标。
//
// 来源：从用户的 GTNH 安装（GT5-Unofficial 的 jar）里提取的方块贴图，
// 按 GT 自己的渲染方式合成 —— 底层是 MACHINE_<电压>_SIDE 机壳，上面叠该机器的功能面片。
// 文件名就是机型 id，见 src/assets/machines/。
//
// 用 Vite 的 glob 收集：这些小图都小于内联阈值，打包时会被转成 data URL，
// 所以单文件产物依然是自包含的，不依赖任何外部资源。
const files = import.meta.glob('../assets/machines/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const URLS: Record<string, string> = {};
for (const [assetPath, url] of Object.entries(files)) {
  const id = assetPath.replace(/^.*\/([^/]+)\.png$/i, '$1');
  URLS[id] = url;
}

export function modelIconUrl(modelId: string): string | undefined {
  return URLS[modelId];
}

export const MODEL_ICON_COUNT = Object.keys(URLS).length;
