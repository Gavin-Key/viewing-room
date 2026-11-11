import test from 'node:test';
import assert from 'node:assert/strict';
import { readNasResponse } from '../lib/nas-response.ts';
test('NAS errors preserve service messages and hide JSON parser exceptions', async () => {
  assert.deepEqual(await readNasResponse(new Response('{"connections":[]}')), {
    connections: [],
  });
  await assert.rejects(
    readNasResponse(
      new Response('{"error":"Share unavailable"}', { status: 400 }),
    ),
    /Share unavailable/,
  );
  for (const body of [
    'Your worker threw an exception',
    '<!DOCTYPE html><html>Not found</html>',
    '',
  ]) {
    await assert.rejects(
      readNasResponse(new Response(body, { status: 404 })),
      (error) =>
        error.message.includes('Reload the viewer') &&
        !error.message.includes('Unexpected token'),
    );
  }
  await assert.rejects(
    readNasResponse(new Response('null')),
    /incomplete connection data/,
  );
});
