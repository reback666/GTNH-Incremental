const scope = typeof document === 'undefined' ? '' : document.documentElement.dataset.storageScope ?? '';

export function storageKey(key: string): string {
  return scope ? `${scope}:${key}` : key;
}
