import test from 'node:test';
import assert from 'node:assert/strict';
import { createAwayClock, AWAY_LIMIT_MS } from '../lib/away-reset.ts';

test('a short absence resumes without a reset', () => {
  const clock = createAwayClock(10_000);
  clock.leave(1_000);
  assert.equal(clock.away, true);
  assert.equal(clock.back(10_999), false);
  assert.equal(clock.away, false);
});

test('an absence at or beyond the limit resets', () => {
  const clock = createAwayClock(10_000);
  clock.leave(1_000);
  assert.equal(clock.expired(10_999), false);
  assert.equal(clock.back(11_000), true);
});

test('repeated leave signals keep the earliest time', () => {
  const clock = createAwayClock(10_000);
  clock.leave(0); // XR session hidden
  clock.leave(8_000); // page hidden later as the headset sleeps
  assert.equal(clock.back(10_000), true);
});

test('returning when never away does nothing', () => {
  const clock = createAwayClock();
  assert.equal(clock.back(Date.now()), false);
  assert.equal(AWAY_LIMIT_MS, 30_000);
});
