import { readGroundFile } from './ground-file';

self.onmessage = async (event: MessageEvent<{ buffer: ArrayBuffer; filename: string }>) => {
  try { self.postMessage({ structure: await readGroundFile(event.data.buffer, event.data.filename) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : '场地文件读取失败。' }); }
};
