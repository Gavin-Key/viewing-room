import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreloadQueue } from '../lib/preload-queue.ts';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('background preparation is serialized with breathing room after readiness', async () => {
  const queue = createPreloadQueue(20);
  const started = [];
  let releaseFirst, releaseSecond;
  queue((release) => {
    started.push(1);
    releaseFirst = release;
  });
  queue((release) => {
    started.push(2);
    releaseSecond = release;
  });
  await wait(30);
  assert.deepEqual(started, [1]);
  releaseFirst();
  releaseFirst();
  assert.deepEqual(started, [1]);
  await wait(35);
  assert.deepEqual(started, [1, 2]);
  releaseSecond();
});

test('cancelling queued and active media does not strand the next panel', async () => {
  const queue = createPreloadQueue(5);
  const started = [];
  const cancelActive = queue(() => started.push(1));
  const cancelQueued = queue(() => started.push(2));
  queue((release) => {
    started.push(3);
    release();
  });
  cancelQueued();
  cancelActive();
  await wait(20);
  assert.deepEqual(started, [1, 3]);
});
