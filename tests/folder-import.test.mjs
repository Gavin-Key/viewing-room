import test from 'node:test';
import assert from 'node:assert/strict';
import { collectDirectory, normalizeMediaPath } from '../lib/folder-import.ts';
test('Android document paths preserve real subfolders without URI scaffolding', () => {
  assert.equal(
    normalizeMediaPath(
      'content://com.android.externalstorage.documents/tree/primary%3APictures/document/primary%3APictures%2FHoliday%2FBeach%2F001.jpg',
      '001.jpg',
    ),
    'Pictures/Holiday/Beach/001.jpg',
  );
  assert.equal(
    normalizeMediaPath(
      'tree/primary%3APictures/document/primary%3APictures%2FFamily%20Trip%2F002.jpg',
      '002.jpg',
    ),
    'Pictures/Family Trip/002.jpg',
  );
  assert.equal(
    normalizeMediaPath('Pictures/100%20literal/image.jpg', 'image.jpg'),
    'Pictures/100%20literal/image.jpg',
  );
});
const image = {
  kind: 'file',
  name: 'photo.jpg',
  getFile: async () => Object.freeze(new File(['test'], 'photo.jpg')),
};
test('folder paths are separate from immutable File objects', async () => {
  const root = {
    kind: 'directory',
    name: 'Images',
    async *values() {
      yield image;
    },
  };
  const result = await collectDirectory(root);
  assert.equal(result.files[0].path, 'Images/photo.jpg');
  assert.equal(result.files[0].file.webkitRelativePath, undefined);
});
test('unreadable entries do not discard readable images', async () => {
  const root = {
    kind: 'directory',
    name: 'Images',
    async *values() {
      yield image;
      yield {
        kind: 'file',
        name: 'broken.gif',
        getFile: async () => {
          throw new Error('Denied');
        },
      };
      yield {
        kind: 'directory',
        name: 'Private',
        async *values() {
          throw new Error('Denied');
        },
      };
    },
  };
  const result = await collectDirectory(root);
  assert.equal(result.files.length, 1);
  assert.equal(result.failures.length, 2);
});
test('root permission failure is reported instead of claiming an empty folder', async () => {
  await assert.rejects(
    collectDirectory({
      kind: 'directory',
      name: 'Images',
      async *values() {
        throw new Error('Denied');
      },
    }),
    /Denied/,
  );
});
