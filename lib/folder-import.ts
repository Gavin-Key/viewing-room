export type SelectedFile = { file: File; path: string };
// Android's picker can expose a document URI instead of a relative path.
// Decode the document ID, not the tree URI's scaffolding.
export function normalizeMediaPath(raw: string, name: string) {
  let path = raw.replaceAll('\\', '/');
  const android =
    /(?:^|\/)(?:tree|document)\//i.test(path) || /primary%3a/i.test(path);
  if (android) {
    try {
      path = decodeURIComponent(path);
    } catch {}
    const document = path.match(/\/(?:document|documents)\/(.+)$/i);
    if (document) path = document[1];
    else {
      const primary = path.lastIndexOf('primary:');
      if (primary >= 0) path = path.slice(primary);
    }
    path = path.replace(/^(?:primary|[a-z0-9-]+):/i, '');
    // Some pickers place the encoded document ID in the file name.
    let decodedName = name;
    try {
      decodedName = decodeURIComponent(name);
    } catch {}
    if (/^(?:primary|[a-z0-9-]+):.+\//i.test(decodedName))
      path = decodedName.replace(/^[^:]+:/, '');
  }
  return path.replace(/^\/+|\/+$/g, '') || name;
}
type Entry = {
  kind: string;
  name: string;
  getFile?: () => Promise<File>;
  values?: () => AsyncIterable<Entry>;
};
export const supportedMedia = (name: string) =>
  /\.(jpe?g|png|gif|webp|avif|bmp|mp4|webm|m4v)$/i.test(name);
// A bad file or inaccessible subfolder must not discard the readable selection.
export async function collectDirectory(root: Entry) {
  const files: SelectedFile[] = [];
  const failures: string[] = [];
  async function walk(dir: Entry, parent: string) {
    try {
      if (!dir.values) throw new Error('Directory enumeration unavailable');
      for await (const entry of dir.values()) {
        const relative = parent + '/' + entry.name;
        if (entry.kind === 'directory') await walk(entry, relative);
        else if (supportedMedia(entry.name)) {
          try {
            if (!entry.getFile) throw new Error('File unavailable');
            files.push({ file: await entry.getFile(), path: relative });
          } catch {
            failures.push(relative);
          }
        }
      }
    } catch (error) {
      if (dir === root) throw error;
      failures.push(parent);
    }
  }
  await walk(root, root.name);
  return { files, failures };
}
