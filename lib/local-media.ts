import { realpath, readdir, readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
export function insideRoot(root: string, file: string) {
  const relative = path.relative(root, file);
  return (
    relative !== '' &&
    !relative.startsWith('..' + path.sep) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  );
}
export function parseRange(header: string | undefined, size: number) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new Error('Invalid range');
  let start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  let end = match[1]
    ? match[2]
      ? Math.min(Number(match[2]), size - 1)
      : size - 1
    : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  )
    throw new Error('Invalid range');
  return { start, end };
}
const mime: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
};
export function localMedia(): Plugin {
  return {
    name: 'viewing-room-local-media',
    configureServer(server) {
      server.middlewares.use('/__media', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const fail = (status: number, error: string) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error }));
        };
        // Intended only for loopback and adb reverse; never expose this dev service to the LAN.
        const address = req.socket.remoteAddress || '';
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) {
          fail(403, 'USB/localhost access only');
          return;
        }
        if (
          req.headers.origin &&
          !['http://localhost:3000', 'http://127.0.0.1:3000'].includes(
            req.headers.origin,
          )
        ) {
          fail(403, 'Origin denied');
          return;
        }
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          fail(405, 'Read only');
          return;
        }
        try {
          let configured: { root: string };
          try {
            configured = JSON.parse(
              await readFile('.local-media.json', 'utf8'),
            );
          } catch {
            fail(
              503,
              'PC library not configured yet. Use the calibration scene or select a folder on this device.',
            );
            return;
          }
          const root = await realpath(configured.root);
          const url = new URL(req.url || '/', 'http://localhost');
          if (url.pathname === '/catalog') {
            const items: object[] = [];
            let scanned = 0,
              truncated = false;
            async function walk(dir: string) {
              for (const entry of await readdir(dir, { withFileTypes: true })) {
                if (++scanned > 10000 || items.length >= 2000) {
                  truncated = true;
                  return;
                }
                if (entry.isSymbolicLink()) continue;
                const full = path.join(dir, entry.name);
                const resolved = await realpath(full);
                if (!insideRoot(root, resolved)) continue;
                if (entry.isDirectory()) await walk(resolved);
                else if (
                  entry.isFile() &&
                  mime[path.extname(entry.name).toLowerCase()]
                ) {
                  const relative = path
                    .relative(root, resolved)
                    .split(path.sep)
                    .join('/');
                  items.push({
                    id: 'pc:' + relative,
                    name: entry.name,
                    path: relative,
                    folder:
                      path.posix.dirname(relative) === '.'
                        ? 'PC library'
                        : path.posix.dirname(relative),
                    url: '/__media/file?path=' + encodeURIComponent(relative),
                    video: /\.(mp4|m4v|webm)$/i.test(entry.name),
                  });
                }
              }
            }
            await walk(root);
            items.sort((a: any, b: any) =>
              a.path.localeCompare(b.path, undefined, { numeric: true }),
            );
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ items, truncated }));
            return;
          }
          if (url.pathname !== '/file') {
            fail(404, 'Not found');
            return;
          }
          const requested = url.searchParams.get('path');
          if (!requested) {
            fail(400, 'Missing file');
            return;
          }
          const candidate = path.resolve(root, requested);
          if (!insideRoot(root, candidate)) {
            fail(403, 'Outside library');
            return;
          }
          const file = await realpath(candidate);
          if (
            !insideRoot(root, file) ||
            !mime[path.extname(file).toLowerCase()]
          ) {
            fail(403, 'Unsupported file');
            return;
          }
          const info = await stat(file);
          if (!info.isFile()) {
            fail(404, 'Not a file');
            return;
          }
          let range;
          try {
            range = parseRange(req.headers.range, info.size);
          } catch {
            res.setHeader('Content-Range', 'bytes */' + info.size);
            fail(416, 'Range not satisfiable');
            return;
          }
          res.setHeader('Content-Type', mime[path.extname(file).toLowerCase()]);
          res.setHeader('Accept-Ranges', 'bytes');
          if (range) {
            res.statusCode = 206;
            res.setHeader(
              'Content-Range',
              `bytes ${range.start}-${range.end}/${info.size}`,
            );
            res.setHeader('Content-Length', range.end - range.start + 1);
          } else res.setHeader('Content-Length', info.size);
          if (req.method === 'HEAD') {
            res.end();
            return;
          }
          const stream = createReadStream(file, range || undefined);
          res.on('close', () => stream.destroy());
          stream.on('error', () => res.destroy());
          stream.pipe(res);
        } catch {
          if (!res.headersSent)
            fail(
              404,
              'Library or file unavailable. Check the PC folder connection.',
            );
          else res.destroy();
        }
      });
    },
  };
}
