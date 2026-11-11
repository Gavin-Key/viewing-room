// Shared vocabulary for the desktop dialog and the VR menu, so both surfaces
// use the same sections, labels and folder navigation.
export type MenuSection = 'library' | 'panels' | 'view';
export const MENU_SECTIONS: { id: MenuSection; label: string }[] = [
  { id: 'library', label: 'Library' },
  { id: 'panels', label: 'Panels' },
  { id: 'view', label: 'View' },
];
// [value, label, compact label]
export const STEREO_OPTIONS: [string, string, string][] = [
  ['mono', '2D', '2D'],
  ['sbs-full', 'Side by side', 'SBS'],
  ['sbs-half', 'Side by side, half', 'SBS ½'],
  ['tb-full', 'Top-bottom', 'TB'],
  ['tb-half', 'Top-bottom, half', 'TB ½'],
];
export const ORDER_SHORT: Record<string, string> = {
  'date-desc': 'Newest',
  'date-asc': 'Oldest',
  'name-asc': 'A–Z',
  'name-desc': 'Z–A',
  random: 'Shuffle',
};
export const EYE_OPTIONS: [string, string][] = [
  ['source', 'Original'],
  ['left', 'Left eye'],
  ['right', 'Right eye'],
];
export function parentFolder(folder: string) {
  return folder.split('/').slice(0, -1).join('/');
}
// Immediate children of a folder ('' is the library root). Children are
// derived from any deeper path, so a NAS share root appears even when only
// its subfolders have been listed.
export function childFolders(
  folders: readonly string[],
  folder: string,
  compare: (a: string, b: string) => number,
) {
  const prefix = folder ? folder + '/' : '';
  const children = new Set<string>();
  for (const f of folders) {
    if (!f.startsWith(prefix) || f.length === prefix.length) continue;
    const slash = f.indexOf('/', prefix.length);
    children.add(slash < 0 ? f : f.slice(0, slash));
  }
  return [...children].sort(compare);
}
// Breadcrumb segments for a folder path: [path, label] pairs from the root.
export function breadcrumb(folder: string, name: (path: string) => string) {
  if (!folder) return [];
  const parts = folder.split('/');
  return parts.map((_, i) => {
    const path = parts.slice(0, i + 1).join('/');
    return [path, i === 0 ? name(path) : parts[i]] as [string, string];
  });
}
