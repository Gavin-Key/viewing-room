import {
  readFile,
  writeFile,
  rename,
  mkdir,
  readdir,
  realpath,
  stat,
} from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const mime = {
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
export function inside(root, file) {
  const rel = path.relative(root, file);
  return (
    !path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep)
  );
}
export function byteRange(value, size) {
  if (!value) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!m || (!m[1] && !m[2])) throw Error('Invalid range');
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1]
    ? m[2]
      ? Math.min(Number(m[2]), size - 1)
      : size - 1
    : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  )
    throw Error('Invalid range');
  return { start, end };
}
async function connect(profile, password) {
  const share = profile.root.match(/^\\\\[^\\]+\\[^\\]+/)?.[0];
  if (!share) throw Error('Use a Windows share path such as \\\\NAS\\Photos');
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-File',
        fileURLToPath(new URL('./smb-connect.ps1', import.meta.url)),
      ],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let output = '',
      error = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(Error('NAS connection timed out'));
    }, 20000);
    child.stdout.on('data', (c) => (output += c));
    child.stderr.on('data', (c) => (error += c));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code) reject(Error(error.trim() || 'NAS connection failed'));
      else {
        try {
          resolve(JSON.parse(output.replace(/^\uFEFF/, '')));
        } catch {
          reject(Error('Invalid connection response'));
        }
      }
    });
    child.stdin.end(
      JSON.stringify({
        share,
        username: profile.username,
        password,
        encrypted: profile.encrypted,
      }),
    );
  });
}
export function createNasHandler({
  configFile,
  origin,
  authenticate,
  connectShare = connect,
  resolveRoot = (root) => root,
}) {
  if (configFile instanceof URL) configFile = fileURLToPath(configFile);
  let queue = Promise.resolve();
  const connected = new Set();
  const load = async () => {
    try {
      return JSON.parse(await readFile(configFile, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  };
  const save = async (profiles) => {
    await mkdir(path.dirname(configFile), { recursive: true });
    await writeFile(configFile + '.tmp', JSON.stringify(profiles), {
      mode: 0o600,
    });
    await rename(configFile + '.tmp', configFile);
  };
  const publicProfile = (p) => ({
    id: p.id,
    name: p.name,
    root: p.root,
    username: p.username,
    remembered: !!p.encrypted,
    defaultPath: p.defaultPath || '',
    isDefault: !!p.isDefault,
  });
  return async (req, res) => {
    const url = new URL(req.url, origin);
    if (!url.pathname.startsWith('/__nas/')) return false;
    const json = (status, data) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify(data));
    };
    try {
      if (
        !authenticate(req) ||
        (req.headers.origin && req.headers.origin !== origin)
      ) {
        json(403, { error: 'Open the viewer at its local address first.' });
        return true;
      }
      if (!['GET', 'HEAD', 'POST', 'DELETE'].includes(req.method)) {
        json(405, { error: 'Method not allowed' });
        return true;
      }
      if (
        ['POST', 'DELETE'].includes(req.method) &&
        req.headers.origin !== origin
      ) {
        json(403, { error: 'Origin denied' });
        return true;
      }
      if (url.pathname === '/__nas/connections') {
        if (req.method === 'GET') {
          json(200, { connections: (await load()).map(publicProfile) });
          return true;
        }
        if (req.method === 'POST') {
          let body = '';
          for await (const chunk of req) {
            body += chunk;
            if (body.length > 16384)
              throw Error('Connection settings too large');
          }
          const input = JSON.parse(body);
          if (
            typeof input.root !== 'string' ||
            !/^\\\\[^\\/]+\\[^\\/]+/.test(input.root) ||
            input.root.includes('..')
          )
            throw Error('Enter a valid NAS share path');
          const profile = {
            id: randomUUID(),
            name: String(input.name || 'NAS').slice(0, 80),
            root: input.root.replace(/\\+$/, ''),
            username: String(input.username || ''),
            encrypted: null,
          };
          const credentials = await connectShare(profile, input.password);
          profile.encrypted = credentials.encrypted;
          const root = await realpath(resolveRoot(profile.root));
          if (!(await stat(root)).isDirectory())
            throw Error('Share is not a folder');
          const action = queue.then(async () => {
            const profiles = await load();
            const existing = profiles.find(
              (p) => p.root.toLowerCase() === profile.root.toLowerCase(),
            );
            if (existing) {
              profile.id = existing.id;
              profile.defaultPath = existing.defaultPath;
              profile.isDefault = existing.isDefault;
            }
            await save([
              ...profiles.filter((p) => p.id !== profile.id),
              profile,
            ]);
          });
          queue = action.catch(() => {});
          await action;
          connected.add(profile.id);
          json(200, { connection: publicProfile(profile) });
          return true;
        }
        if (req.method === 'DELETE') {
          const id = url.searchParams.get('id');
          const action = queue.then(async () =>
            save((await load()).filter((p) => p.id !== id)),
          );
          queue = action.catch(() => {});
          await action;
          connected.delete(id);
          json(200, { ok: true });
          return true;
        }
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        json(405, { error: 'Read only' });
        return true;
      }
      const profile = (await load()).find(
        (p) => p.id === url.searchParams.get('id'),
      );
      if (!profile) {
        json(404, { error: 'Saved connection not found' });
        return true;
      }
      if (!connected.has(profile.id)) {
        await connectShare(profile);
        connected.add(profile.id);
      }
      const root = await realpath(resolveRoot(profile.root));
      const relative = url.searchParams.get('path') || '';
      if (relative.includes(':') || relative.includes('\0'))
        throw Error('Invalid path');
      const candidate = path.resolve(root, relative);
      if (!inside(root, candidate)) throw Error('Outside configured share');
      const file = await realpath(candidate);
      if (!inside(root, file)) throw Error('Outside configured share');
      if (url.pathname === '/__nas/browse') {
        const items = [],
          folders = [];
        let truncated = false,
          scanned = 0;
        const recursive = url.searchParams.get('recursive') === 'true';
        const prefix = 'NAS ' + profile.id;
        async function walk(dir) {
          for (const entry of await readdir(dir, { withFileTypes: true })) {
            if (++scanned > 10000 || items.length >= 3000) {
              truncated = true;
              return;
            }
            if (entry.isSymbolicLink()) continue;
            const full = await realpath(path.join(dir, entry.name));
            if (!inside(root, full)) continue;
            const rel = path.relative(root, full).split(path.sep).join('/');
            if (entry.isDirectory()) {
              folders.push(prefix + '/' + rel);
              if (recursive) await walk(full);
            } else if (
              entry.isFile() &&
              mime[path.extname(entry.name).toLowerCase()]
            ) {
              const info = await stat(full);
              items.push({
                id: profile.id + ':' + rel,
                name: entry.name,
                path: prefix + '/' + rel,
                folder:
                  prefix +
                  (path.posix.dirname(rel) === '.'
                    ? ''
                    : '/' + path.posix.dirname(rel)),
                url:
                  '/__nas/file?id=' +
                  profile.id +
                  '&path=' +
                  encodeURIComponent(rel),
                video: /\.(mp4|m4v|webm)$/i.test(rel),
                modified: info.mtimeMs,
              });
            }
            if (truncated) return;
          }
        }
        await walk(file);
        json(200, { items, folders, truncated });
        return true;
      }
      if (url.pathname === '/__nas/file') {
        const info = await stat(file),
          type = mime[path.extname(file).toLowerCase()];
        if (!info.isFile() || !type) throw Error('Unsupported media file');
        let range;
        try {
          range = byteRange(req.headers.range, info.size);
        } catch {
          res.setHeader('Content-Range', 'bytes */' + info.size);
          json(416, { error: 'Invalid range' });
          return true;
        }
        res.writeHead(range ? 206 : 200, {
          'Content-Type': type,
          'X-Content-Type-Options': 'nosniff',
          'Accept-Ranges': 'bytes',
          'Content-Length': range ? range.end - range.start + 1 : info.size,
          'Cache-Control': 'private, max-age=60',
          ...(range
            ? {
                'Content-Range': `bytes ${range.start}-${range.end}/${info.size}`,
              }
            : {}),
        });
        if (req.method === 'HEAD') res.end();
        else {
          const stream = createReadStream(file, range || undefined);
          res.on('close', () => stream.destroy());
          stream.on('error', () => res.destroy());
          stream.pipe(res);
        }
        return true;
      }
      json(404, { error: 'Not found' });
    } catch (error) {
      if (!res.headersSent)
        json(400, {
          error: error.code
            ? 'Share unavailable. Check that the NAS is online and the saved account can read this folder.'
            : error.message,
        });
      else res.destroy();
    }
    return true;
  };
}
