import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchMedia } from '../lib/media-fetch.ts';
test('NAS media renews an expired session before handing bytes to a decoder', async () => {
  const original = globalThis.fetch,
    calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    return calls.length === 1
      ? new Response('{"error":"expired"}', { status: 403 })
      : url === '/'
        ? new Response('viewer')
        : new Response('image bytes', {
            headers: { 'content-type': 'image/png' },
          });
  };
  try {
    assert.equal(
      await (await fetchMedia('/__nas/file?id=x')).text(),
      'image bytes',
    );
    assert.deepEqual(calls, ['/__nas/file?id=x', '/', '/__nas/file?id=x']);
  } finally {
    globalThis.fetch = original;
  }
});
test('NAS error responses never reach GIF metadata decoding', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response('{"error":"Share offline"}', { status: 400 });
    await assert.rejects(fetchMedia('/__nas/file?id=x'), /Share offline/);
    globalThis.fetch = async () =>
      new Response('<html>error</html>', {
        headers: { 'content-type': 'text/html' },
      });
    await assert.rejects(
      fetchMedia('/__nas/file?id=x'),
      /page instead of media/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
