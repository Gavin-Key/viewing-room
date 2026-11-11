import test from 'node:test';
import assert from 'node:assert/strict';
test('panel ordering supports dates, natural names, reverse, descendants and stable shuffle', async () => {
  const { nextPanelItem, newPanel } = await import('../lib/viewer-model.ts');
  const items = [
    { id: 'a', name: '2.jpg', folder: 'Pics/A', modified: 300 },
    { id: 'b', name: '10.jpg', folder: 'Pics/A', modified: 100 },
    { id: 'c', name: '1.jpg', folder: 'Pics/A/Child', modified: 200 },
    { id: 'd', name: 'other.jpg', folder: 'Pics/AB', modified: 50 },
  ];
  const p = { ...newPanel(1), media: 'a', sourceFolder: 'Pics/A' };
  assert.equal(nextPanelItem(items, p).id, 'b');
  assert.equal(
    nextPanelItem(items, { ...p, order: 'date-asc', includeSubfolders: true })
      .id,
    'b',
  );
  assert.equal(
    nextPanelItem(items, { ...p, order: 'date-desc', includeSubfolders: true })
      .id,
    'c',
  );
  assert.equal(
    nextPanelItem(
      items,
      { ...p, order: 'name-asc', includeSubfolders: true },
      -1,
    ).id,
    'c',
  );
  let shuffled = { ...p, order: 'random', includeSubfolders: true };
  const visited = new Set();
  for (let i = 0; i < 3; i++) {
    const next = nextPanelItem(items, shuffled);
    assert.equal(
      next.id,
      nextPanelItem(items, shuffled).id,
      'preload and advance agree',
    );
    visited.add(next.id);
    shuffled = { ...shuffled, media: next.id };
  }
  assert.deepEqual([...visited].sort(), ['a', 'b', 'c']);
});
test('explicit panel folders stay independent through reassignment', async () => {
  const { newPanel, nextPanelItem } = await import('../lib/viewer-model.ts');
  const items = [
    { id: 'a1', folder: 'a' },
    { id: 'b1', folder: 'b' },
    { id: 'a2', folder: 'a' },
  ];
  const a = { ...newPanel(1), media: 'a1', sourceFolder: 'a' };
  const b = { ...newPanel(2), media: 'b1', sourceFolder: 'b' };
  assert.equal(nextPanelItem(items, a).id, 'a2');
  assert.equal(nextPanelItem(items, b).id, 'b1');
  assert.equal(nextPanelItem(items, { ...a, sourceFolder: 'b' }).id, 'b1');
  assert.equal(
    nextPanelItem(items, { ...a, sourceFolder: 'empty' }),
    undefined,
  );
  assert.equal(newPanel(3).stereo, 'sbs-full');
});
test('reverse lookups leave the reused panel queue in forward order', async () => {
  const { newPanel, panelQueue, freshItem } =
    await import('../lib/viewer-model.ts');
  const items = ['a', 'b', 'c'].map((id, i) => ({
    id,
    folder: 'f',
    modified: 3 - i,
  }));
  const panel = { ...newPanel(1), media: 'a', sourceFolder: 'f' };
  const forward = panelQueue(items, panel).map((m) => m.id);
  assert.equal(freshItem(items, panel, [panel], new Set(), -1).id, 'c');
  assert.deepEqual(
    panelQueue(items, panel).map((m) => m.id),
    forward,
  );
  assert.equal(freshItem(items, panel, [panel]).id, 'b');
});
import {
  consumeTime,
  completionAction,
  nextInFolder,
} from '../lib/playback.ts';
test('video and GIF cannot advance on a still-image timeout', () => {
  for (const kind of ['video', 'gif']) {
    assert.equal(completionAction(kind, 'timeout', false), 'hold');
    assert.equal(completionAction(kind, 'ended', false), 'advance');
  }
  assert.equal(completionAction('image', 'timeout', false), 'advance');
});
test('pin prevents automatic completion for every media kind', () => {
  for (const kind of ['video', 'gif', 'image'])
    for (const event of ['ended', 'timeout'])
      assert.equal(completionAction(kind, event, true), 'hold');
});
test('independent panel clocks and pauses retain remaining duration', () => {
  let a = 8000,
    b = 12000;
  a = consumeTime(a, 3000, true);
  b = consumeTime(b, 3000, true);
  assert.equal(a, 5000);
  assert.equal(b, 9000);
  a = consumeTime(a, 10000, false);
  b = consumeTime(b, 5000, true);
  assert.equal(a, 5000);
  assert.equal(b, 4000);
  assert.equal(consumeTime(a, 6000, true), 0);
});
test('next item stays in its panel folder and wraps', () => {
  const items = [
    { id: 'a1', folder: 'a' },
    { id: 'b1', folder: 'b' },
    { id: 'a2', folder: 'a' },
  ];
  assert.equal(nextInFolder(items, 'a1', []).id, 'a2');
  assert.equal(nextInFolder(items, 'a2', []).id, 'a1');
  assert.equal(nextInFolder(items, 'b1', []).id, 'b1');
  assert.equal(nextInFolder([], null, []), undefined);
});
