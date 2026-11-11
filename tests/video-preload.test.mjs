import test from 'node:test';
import assert from 'node:assert/strict';
import { videoPreload, successorDelay } from '../lib/video-preload.ts';
test('hidden successors cannot request a full video preload', () => {
  assert.equal(videoPreload(false, false), 'metadata');
  // A requested successor must buffer even while the old panel is still visible.
  assert.equal(videoPreload(true, false), 'auto');
  assert.equal(videoPreload(true, true), 'auto');
});
test('video startup gets a longer quiet period before successor loading', () => {
  assert.equal(successorDelay(true), 1500);
  assert.equal(successorDelay(false), 350);
});
