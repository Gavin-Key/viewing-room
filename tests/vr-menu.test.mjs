import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMenu,
  hitControl,
  ENTRIES_PER_PAGE,
  MENU_HEIGHT,
  MENU_WIDTH,
} from '../lib/vr-menu.ts';
import { childFolders, breadcrumb } from '../lib/menu-model.ts';
import { naturalCompare } from '../lib/viewer-model.ts';

const calls = [];
const act = new Proxy(
  {},
  {
    get:
      (_, name) =>
      (...args) =>
        calls.push([name, ...args]),
  },
);
const panel = (id, extra = {}) => ({
  id,
  stereo: 'sbs-full',
  pinned: false,
  seconds: 8,
  order: 'date-desc',
  includeSubfolders: false,
  sourceFolder: 'NAS a/Photos',
  historyIndex: 1,
  ...extra,
});
const entries = Array.from({ length: 19 }, (_, i) =>
  i < 3
    ? { kind: 'folder', path: 'NAS a/Photos/F' + i, name: 'F' + i }
    : { kind: i % 2 ? 'video' : 'image', id: 'm' + i, name: 'file ' + i },
);
const state = (extra = {}) => ({
  section: 'library',
  page: 0,
  playing: true,
  panels: [panel(1), panel(2), panel(3, { pinned: true })],
  active: 2,
  showing: 'file 4',
  folder: 'NAS a/Photos',
  folderName: (p) => p.replace('NAS a', 'Share'),
  entries,
  fileCount: 16,
  folderStereo: 'sbs-full',
  distance: 1.6,
  zoom: 1,
  layout: 'wall',
  wallPage: 0,
  wallPages: 3,
  scrolling: false,
  ...extra,
});
const sections = [
  state(),
  state({ folder: '', entries: entries.slice(0, 3) }),
  state({ section: 'panels' }),
  state({
    section: 'panels',
    panels: [1, 2, 3, 4, 5, 6, 7].map((id) => panel(id)),
  }),
  state({ section: 'view' }),
];

test('VR menu controls stay on the panel at headset target sizes', () => {
  for (const s of sections) {
    const { controls } = buildMenu(s, act);
    for (const c of controls) {
      assert.ok(Math.abs(c.x) + c.w / 2 <= MENU_WIDTH / 2 + 1e-9, c.label);
      assert.ok(Math.abs(c.y) + c.h / 2 <= MENU_HEIGHT / 2 + 1e-9, c.label);
      if (c.action) {
        assert.ok(c.h >= 0.08 && c.w >= 0.08, `${c.label} is too small`);
      }
    }
    const targets = controls.filter((c) => c.action);
    for (let i = 0; i < targets.length; i++)
      for (let j = i + 1; j < targets.length; j++) {
        const a = targets[i],
          b = targets[j];
        const gapX = Math.abs(a.x - b.x) - (a.w + b.w) / 2,
          gapY = Math.abs(a.y - b.y) - (a.h + b.h) / 2;
        assert.ok(
          Math.max(gapX, gapY) >= 0.012 - 1e-9,
          `${s.section}: ${a.label ?? a.icon} and ${b.label ?? b.icon} are closer than 12 mm`,
        );
      }
  }
});

test('VR menu hit-testing finds enabled controls only', () => {
  const layout = buildMenu(state({ section: 'panels' }), act);
  const next = layout.controls.find((c) => c.label === 'Next');
  assert.equal(hitControl(layout, next.x, next.y), next);
  const panels = buildMenu(
    state({ section: 'panels', panels: [panel(1)], active: 1 }),
    act,
  );
  const remove = panels.controls.find((c) => c.label === 'Remove panel');
  assert.equal(remove.disabled, true);
  assert.equal(hitControl(panels, remove.x, remove.y), undefined);
  assert.equal(hitControl(layout, MENU_WIDTH, 0), undefined);
});

test('VR library pages through folders then files', () => {
  calls.length = 0;
  const first = buildMenu(state(), act);
  const items = first.controls.filter((c) => c.kind === 'entry');
  assert.equal(items.length, ENTRIES_PER_PAGE);
  assert.deepEqual(
    items.slice(0, 3).map((c) => c.icon),
    ['folder', 'folder', 'folder'],
  );
  first.page(1);
  first.page(-1);
  assert.deepEqual(calls, [['page', 1]]);
  const last = buildMenu(state({ page: 99 }), act);
  assert.equal(
    last.controls.filter((c) => c.kind === 'entry').length,
    entries.length - ENTRIES_PER_PAGE * 2,
  );
  calls.length = 0;
  items[0].action();
  items[5].action();
  assert.deepEqual(calls, [
    ['open', 'NAS a/Photos/F0'],
    ['show', 'm5'],
  ]);
});

test('VR library play buttons name the active panel', () => {
  const { controls } = buildMenu(state(), act);
  assert.ok(controls.some((c) => c.label === 'Play in Panel 2'));
  const root = buildMenu(state({ folder: '' }), act);
  assert.ok(!root.controls.some((c) => c.label === 'Play in Panel 2'));
});

test('child folders include share roots known only from deeper paths', () => {
  const folders = ['NAS a/Photos/2024', 'NAS a/Photos', 'Local/x', 'NAS b/z/y'];
  assert.deepEqual(childFolders(folders, '', naturalCompare), [
    'Local',
    'NAS a',
    'NAS b',
  ]);
  assert.deepEqual(childFolders(folders, 'NAS a', naturalCompare), [
    'NAS a/Photos',
  ]);
  assert.deepEqual(childFolders(folders, 'NAS b', naturalCompare), ['NAS b/z']);
  assert.deepEqual(
    breadcrumb('NAS a/Photos/2024', () => 'Share'),
    [
      ['NAS a', 'Share'],
      ['NAS a/Photos', 'Photos'],
      ['NAS a/Photos/2024', '2024'],
    ],
  );
});
