export function appVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '开发环境';
}

export function buildStamp(): string {
  return typeof __BUILD_STAMP__ === 'string' ? __BUILD_STAMP__ : '开发环境';
}
