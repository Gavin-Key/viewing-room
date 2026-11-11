import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PacedVideoTexture,
  videoTextureSize,
} from '../lib/paced-video-texture.ts';

test('portrait and landscape 4K uploads have one quarter the source pixels', () => {
  assert.deepEqual(videoTextureSize(2160, 3840, 8192), {
    width: 1080,
    height: 1920,
  });
  assert.deepEqual(videoTextureSize(3840, 2160, 8192), {
    width: 1920,
    height: 1080,
  });
  assert.deepEqual(videoTextureSize(1920, 1080, 8192), {
    width: 1920,
    height: 1080,
  });
  assert.deepEqual(videoTextureSize(7680, 1080, 1024), {
    width: 1024,
    height: 144,
  });
});

test('large video snapshots only on admission, holds between eye renders, and releases resources', (t) => {
  const draws = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: (...args) => draws.push(args) }),
  };
  const original = globalThis.document;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: { createElement: () => canvas },
  });
  t.after(() => {
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  });
  let callback, cancelled;
  const video = {
    videoWidth: 2160,
    videoHeight: 3840,
    readyState: 2,
    currentTime: 0,
    requestVideoFrameCallback(fn) {
      callback = fn;
      return 7;
    },
    cancelVideoFrameCallback(id) {
      cancelled = id;
    },
  };
  const texture = new PacedVideoTexture(video, 8192);
  assert.equal(texture.image, canvas);
  assert.equal(texture.isVideoTexture, false);
  assert.equal(texture.generateMipmaps, false);
  callback();
  assert.equal(draws.length, 0);
  assert.equal(texture.uploadFrame(), true);
  assert.deepEqual(draws[0], [video, 0, 0, 1080, 1920]);
  const version = texture.version;
  callback();
  texture.update();
  texture.update();
  assert.equal(draws.length, 1);
  assert.equal(texture.version, version);
  texture.uploadFrame();
  assert.equal(draws.length, 2);
  texture.dispose();
  callback();
  assert.equal(cancelled, 7);
  assert.equal(canvas.width, 0);
  assert.equal(texture.pendingFrame, false);
  assert.equal(texture.uploadFrame(), false);
});

test('fallback polls playback time without continually uploading a paused video', () => {
  const video = {
    videoWidth: 1920,
    videoHeight: 1080,
    readyState: 1,
    currentTime: 0,
  };
  const texture = new PacedVideoTexture(video);
  assert.equal(texture.isVideoTexture, true);
  assert.equal(texture.uploadFrame(), false);
  video.readyState = 2;
  texture.uploadFrame();
  assert.equal(texture.pendingFrame, false);
  video.currentTime = 1;
  assert.equal(texture.pendingFrame, true);
  texture.uploadFrame();
  texture.update();
  assert.equal(texture.pendingFrame, false);
  texture.dispose();
});
