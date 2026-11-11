import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoadGuard } from '../lib/load-pressure.ts';
import { PacedVideoTexture } from '../lib/paced-video-texture.ts';

test('sustained missed frames suspend load until two seconds of recovery', () => {
  const guard = createLoadGuard();
  guard.sample(100, 0);
  assert.equal(guard.sample(130, 0).frames, false);
  guard.sample(160, 0);
  assert.equal(guard.sample(190, 0).frames, true);
  for (let t = 200; t < 2190; t += 10)
    assert.equal(guard.sample(t, 0).frames, true);
  assert.equal(guard.sample(2190, 0).frames, false);
});

test('estimated media memory has separate high and low thresholds', () => {
  const guard = createLoadGuard();
  const mib = 1024 * 1024;
  assert.equal(guard.sample(10, 97 * mib).memory, true);
  assert.equal(guard.sample(20, 80 * mib).memory, true);
  assert.equal(guard.sample(30, 63 * mib).memory, false);
});

test('video callbacks defer GPU upload until scheduled and are cancelled on disposal', () => {
  let callback, cancelled;
  const video = {
    requestVideoFrameCallback(fn) {
      callback = fn;
      return 42;
    },
    cancelVideoFrameCallback(id) {
      cancelled = id;
    },
  };
  const texture = new PacedVideoTexture(video);
  const version = texture.version;
  callback();
  assert.equal(texture.version, version);
  texture.uploadFrame();
  assert.equal(texture.version, version + 1);
  assert.equal(texture.pendingFrame, false);
  callback();
  assert.equal(texture.pendingFrame, true);
  assert.equal(texture.version, version + 1);
  texture.dispose();
  assert.equal(cancelled, 42);
});
