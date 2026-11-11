import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPanel,
  showItem,
  navigateHistory,
  planNext,
} from '../lib/viewer-model.ts';
const items = ['a', 'b', 'c', 'd'].map((id, i) => ({
  id,
  folder: 'f',
  modified: 4 - i,
}));
const valid = new Set(items.map((m) => m.id));
const release = (panels) => panels.map((p) => ({ ...p, heldMedia: null }));
test('Back revisits actual playback history and Next follows it forward', () => {
  let panels = [{ ...newPanel(1), sourceFolder: 'f' }];
  for (const id of ['a', 'c', 'b']) panels = release(showItem(panels, 1, id));
  panels = release(navigateHistory(panels, 1, -1, valid));
  assert.equal(panels[0].media, 'c');
  assert.deepEqual(panels[0].history, ['a', 'c', 'b']);
  assert.equal(planNext(items, panels).get(1).id, 'b');
  panels = release(navigateHistory(panels, 1, -1, valid));
  assert.equal(panels[0].media, 'a');
  assert.equal(navigateHistory(panels, 1, -1, valid), panels);
  panels = release(navigateHistory(panels, 1, 1, valid));
  assert.equal(panels[0].media, 'c');
  assert.equal(panels[0].pinned, false);
  assert.equal(panels[0].waiting, false);
});
test('history navigation preserves unique visible media and skips missing files', () => {
  let panels = [{ ...newPanel(1), sourceFolder: 'f' }];
  for (const id of ['a', 'b', 'c']) panels = release(showItem(panels, 1, id));
  panels.push({ ...newPanel(2), media: 'b', sourceFolder: 'f' });
  assert.equal(navigateHistory(panels, 1, -1, valid)[0].media, 'a');
  assert.equal(navigateHistory(panels, 1, -1, new Set(['b', 'c'])), panels);
});
