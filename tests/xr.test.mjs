import test from 'node:test';
import assert from 'node:assert/strict';
import { eyeUV, eyeAspect } from '../lib/xr-layout.ts';
import {
  requestMediaFrame,
  cancelMediaFrame,
  setImmersiveClock,
  driveMediaFrames,
} from '../lib/media-frame.ts';
import { parseRange, insideRoot } from '../lib/local-media.ts';
import path from 'node:path';
test('pending slideshow callbacks resume on desktop after leaving VR', () => {
  let scheduled;
  globalThis.requestAnimationFrame = (callback) => {
    scheduled = callback;
    return 42;
  };
  globalThis.cancelAnimationFrame = () => {};
  setImmersiveClock(true);
  const seen = [];
  requestMediaFrame((t) => {
    seen.push(t);
    requestMediaFrame((next) => seen.push(next));
  });
  driveMediaFrames(10);
  setImmersiveClock(false);
  assert.equal(typeof scheduled, 'function');
  scheduled(30);
  assert.deepEqual(seen, [10, 30]);
});
test('stereo crops send separate halves to the corresponding eye', () => {
  assert.deepEqual(eyeUV('sbs-full', 0), { x: 0, y: 0, w: 0.5, h: 1 });
  assert.deepEqual(eyeUV('sbs-full', 1), { x: 0.5, y: 0, w: 0.5, h: 1 });
  assert.equal(eyeUV('tb-full', 0).y, 0.5);
  assert.equal(eyeUV('tb-full', 1).y, 0);
  assert.equal(eyeAspect(3, 'sbs-full'), 1.5);
  assert.equal(eyeAspect(1.5, 'sbs-half'), 1.5);
});
test('slideshow frame callbacks continue in immersive mode without window RAF', () => {
  globalThis.requestAnimationFrame = () => 123;
  globalThis.cancelAnimationFrame = () => {};
  setImmersiveClock(true);
  const seen = [];
  requestMediaFrame((time) => {
    seen.push(time);
    requestMediaFrame((next) => seen.push(next));
  });
  const cancelled = requestMediaFrame(() => seen.push('wrong'));
  cancelMediaFrame(cancelled);
  driveMediaFrames(100);
  assert.deepEqual(seen, [100]);
  driveMediaFrames(200);
  assert.deepEqual(seen, [100, 200]);
  setImmersiveClock(false);
});
test('local media ranges and path boundary are validated', () => {
  assert.deepEqual(parseRange('bytes=20-29', 100), { start: 20, end: 29 });
  assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.throws(() => parseRange('bytes=100-', 100));
  const root = path.resolve('library');
  assert.equal(insideRoot(root, path.join(root, 'image.jpg')), true);
  assert.equal(insideRoot(root, path.resolve(root, '../secret.txt')), false);
});
