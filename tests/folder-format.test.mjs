import test from 'node:test';
import assert from 'node:assert/strict';
import { folderFormat, imageSize } from '../lib/folder-format.ts';
import { newPanel, assignPanels } from '../lib/viewer-model.ts';
test('folder formats use the nearest ancestor and apply when assigning panels', () => {
  const formats = { Pictures: 'mono', 'Pictures/Stereo': 'sbs-half' };
  assert.equal(folderFormat('Pictures/Trip', formats), 'mono');
  assert.equal(folderFormat('Pictures/Stereo/Trip', formats), 'sbs-half');
  assert.equal(folderFormat('Pictures2', formats), 'sbs-full');
  const panels = assignPanels(
    [{ id: '1', folder: 'Pictures' }],
    [newPanel(1)],
    'Pictures',
    [1],
    formats,
  );
  assert.equal(panels[0].stereo, 'mono');
  assert.equal(panels[0].eye, 'source');
});
test('prepared image dimensions are bounded without distorting the aspect ratio', () => {
  assert.deepEqual(imageSize(8000, 4000, 'mono'), {
    width: 2048,
    height: 1024,
  });
  assert.deepEqual(imageSize(8000, 4000, 'sbs-full'), {
    width: 3072,
    height: 1536,
  });
  assert.deepEqual(imageSize(800, 1200, 'mono'), { width: 800, height: 1200 });
});
