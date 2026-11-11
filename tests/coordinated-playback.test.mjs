import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPanel,
  assignPanels,
  planNext,
  showItem,
} from '../lib/viewer-model.ts';
const items = Array.from({ length: 9 }, (_, i) => ({
  id: String(i),
  name: i + '.jpg',
  folder: 'photos',
  modified: 900 - i,
}));
test('all-panel assignment starts newest first without duplicate occupants or preloads', () => {
  const panels = assignPanels(
    items,
    [newPanel(1), newPanel(2), newPanel(3)],
    'photos',
  );
  assert.deepEqual(
    panels.map((p) => p.media),
    ['0', '1', '2'],
  );
  const planned = [...planNext(items, panels).values()].map((m) => m.id);
  assert.deepEqual(planned, ['3', '4', '5']);
  assert.equal(new Set([...panels.map((p) => p.media), ...planned]).size, 6);
});
test('independent completion keeps outgoing images reserved until replacements display', () => {
  let panels = assignPanels(
    items,
    [newPanel(1), newPanel(2), newPanel(3)],
    'photos',
  );
  const seen = new Set(panels.map((p) => p.media));
  for (let turn = 0; turn < 24; turn++) {
    const id = (turn % 3) + 1,
      old = panels.find((p) => p.id === id).media;
    const planned = planNext(items, panels).get(id);
    if (!planned) continue;
    assert.notEqual(planned.id, old);
    if (seen.size < items.length) assert.equal(seen.has(planned.id), false);
    panels = showItem(panels, id, planned.id);
    seen.add(planned.id);
    for (const item of planNext(items, panels).values())
      assert.notEqual(item.id, old);
    assert.equal(new Set(panels.map((p) => p.media)).size, 3);
    panels = panels.map((p) => (p.id === id ? { ...p, heldMedia: null } : p));
  }
  assert.equal(seen.size, items.length);
});
test('short folders leave surplus panels empty and hold when no fresh item is available', () => {
  const panels = assignPanels(
    items.slice(0, 2),
    [newPanel(1), newPanel(2), newPanel(3)],
    'photos',
  );
  assert.deepEqual(
    panels.map((p) => p.media),
    ['0', '1', null],
  );
  assert.equal(planNext(items.slice(0, 2), panels).size, 0);
});
