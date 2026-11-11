import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createNasHandler, inside, byteRange } from '../server/nas.mjs';
test('NAS serves folder trees and byte ranges, remembers profiles, and rejects escapes', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'viewing-room-shares-'));
  const root = path.join(temp, 'library'),
    configFile = path.join(temp, 'connections.json');
  await mkdir(path.join(root, 'Subfolder'), { recursive: true });
  await writeFile(path.join(root, 'Subfolder', 'clip.mp4'), '0123456789');
  await writeFile(path.join(temp, 'outside.jpg'), 'private');
  await writeFile(
    configFile,
    JSON.stringify([
      {
        id: 'test',
        name: 'Test',
        root,
        username: 'user',
        encrypted: 'not-public',
      },
    ]),
  );
  let origin = '',
    connections = 0;
  const handler = createNasHandler({
    configFile,
    origin: 'http://localhost',
    authenticate: (req) => req.headers.authorization === 'test',
    connectShare: async () => {
      connections++;
      return {};
    },
  });
  const server = http.createServer(async (req, res) => {
    if (!(await handler(req, res))) {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  const get = (url, headers = {}) =>
    fetch(origin + url, { headers: { Authorization: 'test', ...headers } });
  try {
    const profiles = await (await get('/__nas/connections')).json();
    assert.equal(profiles.connections[0].name, 'Test');
    assert.equal('encrypted' in profiles.connections[0], false);
    const direct = await (await get('/__nas/browse?id=test')).json();
    assert.equal(direct.items.length, 0);
    assert.deepEqual(direct.folders, ['NAS test/Subfolder']);
    const nested = await (
      await get('/__nas/browse?id=test&path=Subfolder')
    ).json();
    assert.equal(nested.items.length, 1);
    const response = await get(nested.items[0].url, { Range: 'bytes=2-5' });
    assert.equal(response.status, 206);
    assert.equal(await response.text(), '2345');
    assert.equal(response.headers.get('content-range'), 'bytes 2-5/10');
    assert.equal(
      (await get('/__nas/file?id=test&path=../outside.jpg')).status,
      400,
    );
    assert.equal(
      (await get(nested.items[0].url, { Range: 'bytes=99-' })).status,
      416,
    );
    assert.equal((await fetch(origin + '/__nas/connections')).status, 403);
    assert.equal(
      (await get('/__nas/connections', { Origin: 'https://other.example' }))
        .status,
      403,
    );
    assert.equal(connections, 1);
    const reloaded = createNasHandler({
      configFile,
      origin: 'http://localhost',
      authenticate: () => true,
      connectShare: async () => ({}),
    });
    assert.equal(typeof reloaded, 'function');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    assert.ok(
      path
        .resolve(temp)
        .startsWith(path.resolve(os.tmpdir()) + path.sep + 'viewing-room-shares-'),
    );
    await rm(temp, { recursive: true, force: true });
  }
});
test('NAS range parsing and root checks cover siblings and suffix ranges', () => {
  const root = path.resolve('library');
  assert.equal(inside(root, root), true);
  assert.equal(inside(root, root + '-other'), false);
  assert.deepEqual(byteRange('bytes=-3', 10), { start: 7, end: 9 });
  assert.throws(() => byteRange('bytes=-0', 10));
});
