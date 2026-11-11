import { fetchMedia } from './media-fetch.ts';
import { imageSize } from './folder-format.ts';
function limiter(limit: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async function run<T>(work: () => Promise<T>) {
    await new Promise<void>((resolve) => {
      const start = () => {
        active++;
        resolve();
      };
      if (active < limit) start();
      else waiting.push(start);
    });
    try {
      return await work();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}
const download = limiter(1),
  decode = limiter(1);
const cache = new Map<
  string,
  {
    promise: Promise<Blob>;
    size: number;
    users: number;
    controller: AbortController;
  }
>();
const budget = 8 * 1024 * 1024;
export function trimMediaCache() {
  for (const [url, entry] of cache) {
    if (!entry.users && entry.size) cache.delete(url);
  }
}
export async function mediaBlob(url: string, signal?: AbortSignal) {
  let entry = cache.get(url);
  if (!entry) {
    const controller = new AbortController();
    const pending = {
      promise: Promise.resolve(new Blob()),
      size: 0,
      users: 0,
      controller,
    };
    pending.promise = download(async () => {
      if (!pending.users) throw new DOMException('Cancelled', 'AbortError');
      const blob = await (await fetchMedia(url, controller.signal)).blob();
      pending.size = blob.size;
      let used = [...cache.values()].reduce((sum, e) => sum + e.size, 0);
      for (const [key, value] of cache) {
        if (used <= budget) break;
        if (value.size) {
          cache.delete(key);
          used -= value.size;
        }
      }
      return blob;
    }).catch((error) => {
      if (cache.get(url) === pending) cache.delete(url);
      throw error;
    });
    entry = pending;
    cache.set(url, entry);
  } else {
    cache.delete(url);
    cache.set(url, entry);
  }
  entry.users++;
  let listening = true;
  const release = () => {
    if (listening) {
      listening = false;
      entry.users--;
      if (!entry.users && !entry.size) {
        entry.controller.abort();
        if (cache.get(url) === entry) cache.delete(url);
      }
    }
  };
  const aborted = () => release();
  signal?.addEventListener('abort', aborted, { once: true });
  if (signal?.aborted) release();
  try {
    const blob = await entry.promise;
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    return blob;
  } finally {
    signal?.removeEventListener('abort', aborted);
    release();
  }
}
export async function prepareImage(
  url: string,
  stereo: string,
  signal: AbortSignal,
) {
  const blob = await mediaBlob(url, signal);
  return decode(async () => {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const original = await createImageBitmap(blob);
    const ratio = original.width / original.height,
      size = imageSize(original.width, original.height, stereo);
    let bitmap = original;
    try {
      if (size.width !== original.width || size.height !== original.height) {
        bitmap = await createImageBitmap(original, {
          resizeWidth: size.width,
          resizeHeight: size.height,
          resizeQuality: 'high',
        });
        original.close();
      }
      if (signal.aborted) {
        bitmap.close();
        throw new DOMException('Cancelled', 'AbortError');
      }
      return { bitmap, ratio };
    } catch (error) {
      original.close();
      throw error;
    }
  });
}
