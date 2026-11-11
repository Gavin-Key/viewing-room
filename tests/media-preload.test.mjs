import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaBlob, trimMediaCache } from '../lib/media-preload.ts';
test('lookahead downloads are shared and limited to one concurrent request', async () => {
  const original = globalThis.fetch;
  let active = 0,
    peak = 0,
    calls = 0;
  globalThis.fetch = async () => {
    active++;
    peak = Math.max(peak, active);
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 10));
    active--;
    return new Response('pixels', { headers: { 'content-type': 'image/png' } });
  };
  try {
    const [a, b] = await Promise.all([
      mediaBlob('/__nas/test-a'),
      mediaBlob('/__nas/test-a'),
      mediaBlob('/__nas/test-b'),
      mediaBlob('/__nas/test-c'),
    ]);
    assert.equal(a, b);
    assert.equal(calls, 3);
    assert.equal(peak, 1);
    await mediaBlob('/__nas/test-a');
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = original;
  }
});

test('discarding the last consumer aborts its in-flight download', async () => {
  const original = globalThis.fetch;
  let fetchSignal;
  globalThis.fetch = async (_url, options) => {
    fetchSignal = options.signal;
    return new Promise((_resolve, reject) => {
      fetchSignal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')));
    });
  };
  try {
    const abort = new AbortController();
    const pending = mediaBlob('/__nas/cancelled', abort.signal);
    await new Promise((resolve) => setTimeout(resolve, 0));
    abort.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(fetchSignal.aborted, true);
  } finally { globalThis.fetch = original; }
});

test('memory pressure evicts unused compressed blobs', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response('pixels', { headers: { 'content-type': 'image/png' } });
  };
  try {
    await mediaBlob('/__nas/eviction');
    await mediaBlob('/__nas/eviction');
    assert.equal(calls, 1);
    trimMediaCache();
    await mediaBlob('/__nas/eviction');
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});
