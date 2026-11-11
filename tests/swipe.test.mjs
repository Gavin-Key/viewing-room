import test from 'node:test';
import assert from 'node:assert/strict';
import { isHorizontalSwipe } from '../lib/swipe.ts';
test('swipe accepts either horizontal direction, rejects taps and vertical gestures', () => {
  assert.equal(isHorizontalSwipe(60, 10, 45), true);
  assert.equal(isHorizontalSwipe(-60, 10, 45), true);
  assert.equal(isHorizontalSwipe(10, 2, 45), false);
  assert.equal(isHorizontalSwipe(60, 80, 45), false);
  assert.equal(isHorizontalSwipe(0.2, 0.02, 0.12), true);
});
