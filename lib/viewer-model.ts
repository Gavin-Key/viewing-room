import { folderFormat, type FolderFormats } from './folder-format.ts';
export const DEFAULT_STEREO = 'sbs-full';
export const VIEW_TABS = [
  { id: 'library', label: 'Library' },
  { id: 'panel', label: 'Panel' },
  { id: 'view', label: 'View' },
] as const;
export type PanelState = {
  id: number;
  media: string | null;
  pinned: boolean;
  stereo: string;
  eye: string;
  seconds: number;
  cycle: number;
  sourceFolder: string | null;
  order?: string;
  includeSubfolders?: boolean;
  heldMedia?: string | null;
  visits?: Record<string, number>;
  generation?: number;
  waiting?: boolean;
  history?: string[];
  historyIndex?: number;
  distance?: number;
  muted?: boolean;
};
export const newPanel = (id: number): PanelState => ({
  id,
  media: null,
  pinned: false,
  stereo: DEFAULT_STEREO,
  eye: 'left',
  seconds: 8,
  cycle: 0,
  sourceFolder: null,
  order: 'date-desc',
  includeSubfolders: false,
});
export const ORDER_OPTIONS: [string, string][] = [
  ['date-desc', 'Newest first (modified date)'],
  ['date-asc', 'Oldest first (modified date)'],
  ['name-asc', 'Name A-Z'],
  ['name-desc', 'Name Z-A'],
  ['random', 'Shuffle'],
];
export function inFolder(folder: string, root: string, recursive = false) {
  return folder === root || (recursive && folder.startsWith(root + '/'));
}
// localeCompare with options builds a collator per call. Sorting a large folder
// that way blocked the main thread, and with it every XR frame, for seconds at
// each panel transition.
const byName = new Intl.Collator(undefined, { numeric: true }),
  byId = new Intl.Collator();
export const naturalCompare = (a: string, b: string) => byName.compare(a, b);
// Library arrays are replaced, never mutated, so each sorted queue is reused
// until the library changes. Callers must not mutate the returned queue.
const queues = new WeakMap<object, Map<string, readonly unknown[]>>();
export function panelQueue<
  T extends { id: string; folder: string; name?: string; modified?: number },
>(
  items: readonly T[],
  panel: Pick<PanelState, 'media' | 'sourceFolder'> & Partial<PanelState>,
): readonly T[] {
  const folder =
    panel.sourceFolder ?? items.find((m) => m.id === panel.media)?.folder;
  const order = panel.order || 'date-desc';
  const key = JSON.stringify([
    folder ?? null,
    !!panel.includeSubfolders,
    order,
    order === 'random' ? String(panel.id) : null,
  ]);
  let cached = queues.get(items);
  if (!cached) queues.set(items, (cached = new Map()));
  const hit = cached.get(key);
  if (hit) return hit as readonly T[];
  const queue =
    folder === undefined
      ? [...items]
      : items.filter((m) =>
          inFolder(m.folder, folder, panel.includeSubfolders),
        );
  const hash = (value: string) => {
    let h = 2166136261;
    for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return h >>> 0;
  };
  const name = (a: T, b: T) =>
    byName.compare(a.name || a.id, b.name || b.id) || byId.compare(a.id, b.id);
  let compare = name;
  if (order === 'random') {
    const hashes = new Map(
      queue.map((m) => [m.id, hash(panel.id + ':' + m.id)]),
    );
    compare = (a, b) => hashes.get(a.id)! - hashes.get(b.id)! || name(a, b);
  } else if (order.startsWith('date'))
    compare = (a, b) => (a.modified || 0) - (b.modified || 0) || name(a, b);
  queue.sort(order.endsWith('desc') ? (a, b) => -compare(a, b) : compare);
  cached.set(key, queue);
  return queue;
}
export function nextPanelItem<
  T extends { id: string; folder: string; name?: string; modified?: number },
>(
  items: T[],
  panel: Pick<PanelState, 'media' | 'sourceFolder'> & Partial<PanelState>,
  direction = 1,
) {
  const queue = panelQueue(items, panel),
    index = queue.findIndex((m) => m.id === panel.media);
  return queue.length
    ? queue[(index + direction + queue.length) % queue.length]
    : undefined;
}
type QueueItem = {
  id: string;
  folder: string;
  name?: string;
  modified?: number;
};
export function freshItem<T extends QueueItem>(
  items: T[],
  panel: PanelState,
  panels: PanelState[],
  reserved = new Set<string>(),
  direction = 1,
) {
  const blocked = new Set([
    ...reserved,
    ...panels.flatMap((p) =>
      [p.media, p.heldMedia].filter((v): v is string => !!v),
    ),
  ]);
  const seen: Record<string, number> = {};
  for (const p of panels)
    for (const [id, stamp] of Object.entries(p.visits || {}))
      seen[id] = Math.max(seen[id] || 0, stamp);
  const queue =
    direction < 0
      ? [...panelQueue(items, panel)].reverse()
      : panelQueue(items, panel);
  const candidates = queue.filter((m) => !blocked.has(m.id));
  const unseen = candidates.find((m) => !seen[m.id]);
  if (unseen) return unseen;
  if (queue.some((m) => !seen[m.id] && reserved.has(m.id))) return undefined;
  // Reuse only after fresh eligible media is exhausted, oldest shown first.
  return candidates.reduce<T | undefined>(
    (oldest, m) =>
      !oldest || (seen[m.id] || 0) < (seen[oldest.id] || 0) ? m : oldest,
    undefined,
  );
}
export function planNext<T extends QueueItem>(
  items: T[],
  panels: PanelState[],
) {
  const result = new Map<number, T>(),
    reserved = new Set<string>(),
    valid = new Set(items.map((m) => m.id));
  for (const p of panels) {
    if (p.pinned || !p.media || p.heldMedia) continue;
    const forward = historyTarget(panels, p.id, 1, valid, reserved);
    const item =
      (forward ? items.find((m) => m.id === forward.media) : undefined) ||
      freshItem(items, p, panels, reserved);
    if (item) {
      result.set(p.id, item);
      reserved.add(item.id);
    }
  }
  return result;
}
export function showItem(
  panels: PanelState[],
  id: number,
  media: string,
  buffer = true,
) {
  let stamp = 0;
  for (const p of panels)
    for (const v of Object.values(p.visits || {})) stamp = Math.max(stamp, v);
  return panels.map((p) =>
    p.id === id
      ? {
          ...p,
          media,
          heldMedia: buffer ? p.media : null,
          cycle: p.cycle + 1,
          waiting: false,
          history: [
            ...(p.history || []).slice(
              0,
              (p.historyIndex ?? (p.history || []).length - 1) + 1,
            ),
            media,
          ].slice(-200),
          historyIndex: Math.min(
            199,
            (p.historyIndex ?? (p.history || []).length - 1) + 1,
          ),
          visits: { ...p.visits, [media]: stamp + 1 },
          generation: (p.generation || 0) + (buffer ? 0 : 1),
        }
      : p,
  );
}
export function historyTarget(
  panels: PanelState[],
  id: number,
  direction: number,
  valid: Set<string>,
  reserved = new Set<string>(),
) {
  const panel = panels.find((p) => p.id === id);
  if (!panel) return;
  const history = panel.history || [],
    blocked = new Set([
      ...reserved,
      ...panels
        .filter((p) => p.id !== id)
        .flatMap((p) => [p.media, p.heldMedia].filter((m): m is string => !!m)),
    ]);
  for (
    let index = (panel.historyIndex ?? history.length - 1) + direction;
    index >= 0 && index < history.length;
    index += direction
  ) {
    const media = history[index];
    if (media !== panel.media && valid.has(media) && !blocked.has(media))
      return { media, index };
  }
}
export function navigateHistory(
  panels: PanelState[],
  id: number,
  direction: number,
  valid: Set<string>,
) {
  const target = historyTarget(panels, id, direction, valid),
    panel = panels.find((p) => p.id === id);
  if (!target || !panel) return panels;
  return showItem(panels, id, target.media).map((p) =>
    p.id === id
      ? { ...p, history: panel.history, historyIndex: target.index }
      : p,
  );
}
export function assignPanels<T extends QueueItem>(
  items: T[],
  panels: PanelState[],
  folder: string,
  ids = panels.map((p) => p.id),
  formats: FolderFormats = {},
) {
  const recursive = !items.some((m) => m.folder === folder);
  let next = panels.map((p) =>
    ids.includes(p.id)
      ? {
          ...p,
          sourceFolder: folder,
          stereo: folderFormat(folder, formats),
          eye: folderFormat(folder, formats) === 'mono' ? 'source' : 'left',
          includeSubfolders: recursive,
          media: null,
          heldMedia: null,
          waiting: false,
          history: [],
          historyIndex: -1,
          generation: (p.generation || 0) + 1,
        }
      : p,
  );
  for (const id of ids) {
    const panel = next.find((p) => p.id === id)!;
    const item = freshItem(items, panel, next);
    if (item) next = showItem(next, id, item.id, false);
  }
  return next;
}
