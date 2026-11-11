// Layout of the VR menu in metres: one flat panel, origin at its centre, y up.
// The menu is painted once into a single canvas texture and hit-tested here,
// so hover feedback never re-uploads it.
import { ORDER_OPTIONS } from './viewer-model.ts';
import {
  MENU_SECTIONS,
  ORDER_SHORT,
  STEREO_OPTIONS,
  parentFolder,
  type MenuSection,
} from './menu-model.ts';
import type { IconName } from './vr-icons.ts';

export const MENU_WIDTH = 1.4,
  MENU_HEIGHT = 0.9,
  // Headset sizing: 85 mm targets subtend about 4 degrees at the 1.2 m menu
  // distance, and 12 mm separates neighbouring targets.
  TARGET = 0.085,
  GAP = 0.016,
  SEGMENT_GAP = 0.012,
  FONT = 0.032,
  SMALL = 0.024;
const PAD = 0.035,
  RAIL = 0.3,
  X0 = -MENU_WIDTH / 2 + RAIL + PAD,
  X1 = MENU_WIDTH / 2 - PAD,
  TOP = MENU_HEIGHT / 2 - PAD,
  LABEL = 0.19;
export const ENTRIES_PER_PAGE = 8;

export type ControlKind =
  | 'tab'
  | 'button'
  | 'primary'
  | 'segment'
  | 'entry'
  | 'chip'
  | 'danger'
  | 'ghost'
  | 'value';
export type Control = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: ControlKind;
  label?: string;
  icon?: IconName;
  selected?: boolean;
  disabled?: boolean;
  action?: () => void;
};
export type Text = {
  x: number;
  y: number;
  text: string;
  size: number;
  color?: string;
  weight?: number;
  align?: 'left' | 'right' | 'center';
  maxWidth?: number;
  // Which end to keep when the text is too long.
  keep?: 'start' | 'end';
};
export type MenuLayout = {
  controls: Control[];
  texts: Text[];
  rules: number[];
  page?: (direction: number) => void;
};
export type Entry =
  | { kind: 'folder'; path: string; name: string }
  | { kind: 'image' | 'video'; id: string; name: string };
type PanelSummary = {
  id: number;
  stereo: string;
  pinned: boolean;
  seconds: number;
  order?: string;
  includeSubfolders?: boolean;
  sourceFolder: string | null;
  historyIndex?: number;
};
export type MenuState = {
  section: MenuSection;
  page: number;
  playing: boolean;
  panels: PanelSummary[];
  active: number;
  showing: string | null;
  folder: string;
  folderName: (path: string) => string;
  entries: Entry[];
  fileCount: number;
  folderStereo: string;
  distance: number;
  zoom: number;
  layout: string;
  wallPage: number;
  wallPages: number;
  scrolling: boolean;
};
export type MenuActions = {
  section: (section: MenuSection) => void;
  close: () => void;
  play: () => void;
  exit: () => void;
  page: (page: number) => void;
  open: (path: string) => void;
  show: (id: string) => void;
  folderFormat: (stereo: string) => void;
  assign: () => void;
  assignAll: () => void;
  select: (id: number) => void;
  add: () => void;
  remove: (id: number) => void;
  previous: () => void;
  next: () => void;
  patch: (patch: Partial<PanelSummary>) => void;
  source: () => void;
  view: (patch: Partial<{ distance: number; zoom: number }>) => void;
  arrangement: (layout: string) => void;
  recenter: () => void;
  wallPage: (direction: number) => void;
  scroll: () => void;
};

const SECTION_ICONS: Record<MenuSection, IconName> = {
  library: 'images',
  panels: 'panels',
  view: 'view',
};
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function buildMenu(s: MenuState, act: MenuActions): MenuLayout {
  const controls: Control[] = [],
    texts: Text[] = [],
    rules: number[] = [];
  const control = (c: Control) => {
    controls.push(c);
    return c;
  };
  // Left-anchored helper: x is the left edge.
  const at = (
    x: number,
    y: number,
    w: number,
    c: Omit<Control, 'x' | 'y' | 'w' | 'h'>,
    h = TARGET,
  ) => control({ x: x + w / 2, y, w, h, ...c });
  const text = (t: Text) => texts.push(t);
  const panelIndex = Math.max(
    0,
    s.panels.findIndex((p) => p.id === s.active),
  );
  const panel = s.panels[panelIndex];
  const panelName = 'Panel ' + (panelIndex + 1);

  // Rail
  const railX = -MENU_WIDTH / 2 + RAIL / 2,
    railW = RAIL - 0.06;
  text({
    x: -MENU_WIDTH / 2 + 0.03,
    y: TOP - TARGET / 2,
    text: 'Viewing Room',
    size: 0.036,
    weight: 600,
    color: '#b8dc7e',
  });
  MENU_SECTIONS.forEach((section, i) =>
    control({
      x: railX,
      y: TOP - TARGET * 1.5 - 0.04 - i * (TARGET + GAP),
      w: railW,
      h: TARGET,
      kind: 'tab',
      label: section.label,
      icon: SECTION_ICONS[section.id],
      selected: s.section === section.id,
      action: () => act.section(section.id),
    }),
  );
  control({
    x: railX,
    y: -TOP + TARGET / 2,
    w: railW,
    h: TARGET,
    kind: 'ghost',
    label: 'Exit VR',
    icon: 'exit',
    action: act.exit,
  });

  // Header
  const headerY = TOP - TARGET / 2;
  text({
    x: X0,
    y: headerY,
    text: MENU_SECTIONS.find((m) => m.id === s.section)!.label,
    size: 0.044,
    weight: 600,
  });
  control({
    x: X1 - TARGET / 2,
    y: headerY,
    w: TARGET,
    h: TARGET,
    kind: 'ghost',
    icon: 'x',
    action: act.close,
  });
  at(X1 - TARGET - GAP - 0.31, headerY, 0.31, {
    kind: s.playing ? 'button' : 'primary',
    label: s.playing ? 'Pause all' : 'Resume all',
    icon: s.playing ? 'pause' : 'play',
    action: act.play,
  });
  rules.push(TOP - TARGET - 0.018);

  let y = TOP - TARGET - 0.036;
  const row = (h = TARGET) => {
    const center = y - h / 2;
    y -= h + GAP;
    return center;
  };
  const label = (cy: number, value: string) =>
    text({
      x: X0,
      y: cy,
      text: value,
      size: SMALL,
      color: '#a9b5bb',
      maxWidth: LABEL - 0.01,
    });
  const segments = (
    cy: number,
    options: [string, string][],
    value: string,
    pick: (value: string) => void,
    x = X0 + LABEL,
    width = X1 - X0 - LABEL,
  ) => {
    const w = (width - SEGMENT_GAP * (options.length - 1)) / options.length;
    options.forEach(([v, l], i) =>
      at(x + i * (w + SEGMENT_GAP), cy, w, {
        kind: 'segment',
        label: l,
        selected: v === value,
        action: () => pick(v),
      }),
    );
  };
  const stepper = (
    cy: number,
    value: string,
    down: () => void,
    up: () => void,
    x = X0 + LABEL,
  ) => {
    at(x, cy, TARGET, { kind: 'button', icon: 'minus', action: down });
    at(x + TARGET + SEGMENT_GAP, cy, 0.13, { kind: 'value', label: value });
    at(x + TARGET + 0.13 + SEGMENT_GAP * 2, cy, TARGET, {
      kind: 'button',
      icon: 'plus',
      action: up,
    });
    return x + TARGET * 2 + 0.13 + SEGMENT_GAP * 2;
  };

  if (s.section === 'library') {
    const pages = Math.max(1, Math.ceil(s.entries.length / ENTRIES_PER_PAGE));
    const page = clamp(s.page, 0, pages - 1);
    const go = (direction: number) => {
      const next = clamp(page + direction, 0, pages - 1);
      if (next !== page) act.page(next);
    };
    // Location row: up, path and file count, pager.
    const cy = row();
    let x = X0;
    if (s.folder) {
      at(x, cy, 0.15, {
        kind: 'button',
        label: 'Up',
        icon: 'up',
        action: () => act.open(parentFolder(s.folder)),
      });
      x += 0.15 + GAP;
    }
    const pagerW = TARGET * 2 + 0.11 + SEGMENT_GAP * 2;
    const pathW = X1 - pagerW - GAP - x;
    text({
      x,
      y: cy + 0.014,
      text: s.folder ? s.folderName(s.folder) : 'All folders',
      size: 0.028,
      weight: 600,
      maxWidth: pathW,
      // Long paths keep their end, which names the current folder.
      keep: 'end',
    });
    text({
      x,
      y: cy - 0.022,
      text: !s.folder
        ? s.entries.length + (s.entries.length === 1 ? ' folder' : ' folders')
        : s.fileCount === 1
          ? '1 file here'
          : s.fileCount.toLocaleString() + ' files here',
      size: SMALL,
      color: '#a9b5bb',
      maxWidth: pathW,
    });
    const px = X1 - pagerW;
    at(px, cy, TARGET, {
      kind: 'button',
      icon: 'chevron-left',
      disabled: page === 0,
      action: () => go(-1),
    });
    at(px + TARGET + SEGMENT_GAP, cy, 0.11, {
      kind: 'value',
      label: page + 1 + ' / ' + pages,
    });
    at(px + TARGET + 0.11 + SEGMENT_GAP * 2, cy, TARGET, {
      kind: 'button',
      icon: 'chevron-right',
      disabled: page + 1 >= pages,
      action: () => go(1),
    });
    // Entries: folders first, then files, two columns.
    const colW = (X1 - X0 - GAP) / 2;
    const rowsTop = y;
    s.entries
      .slice(page * ENTRIES_PER_PAGE, (page + 1) * ENTRIES_PER_PAGE)
      .forEach((entry, i) => {
        const ey = rowsTop - TARGET / 2 - Math.floor(i / 2) * (TARGET + GAP);
        at(X0 + (i % 2) * (colW + GAP), ey, colW, {
          kind: 'entry',
          label:
            entry.kind === 'folder'
              ? s.folderName(entry.path).split('/').pop()
              : entry.name,
          icon:
            entry.kind === 'folder'
              ? 'folder'
              : entry.kind === 'video'
                ? 'film'
                : 'image',
          action:
            entry.kind === 'folder'
              ? () => act.open(entry.path)
              : () => act.show(entry.id),
        });
      });
    if (!s.entries.length)
      text({
        x: X0,
        y: rowsTop - TARGET / 2,
        text: 'This folder is empty.',
        size: FONT,
        color: '#a9b5bb',
      });
    y = rowsTop - (ENTRIES_PER_PAGE / 2) * (TARGET + GAP);
    if (s.folder) {
      const fy = row();
      label(fy, 'Folder format');
      segments(
        fy,
        STEREO_OPTIONS.map(([v, , short]) => [v, short]),
        s.folderStereo,
        act.folderFormat,
      );
      const ay = row();
      at(X0, ay, colW, {
        kind: 'primary',
        label: 'Play in ' + panelName,
        icon: 'play',
        action: act.assign,
      });
      at(X0 + colW + GAP, ay, colW, {
        kind: 'button',
        label: 'Play in all panels',
        icon: 'panels',
        action: act.assignAll,
      });
    } else {
      const hy = row();
      text({
        x: X0,
        y: hy,
        text:
          'Choose a folder. Selecting a file shows it in ' + panelName + '.',
        size: SMALL,
        color: '#a9b5bb',
      });
    }
    return { controls, texts, rules, page: go };
  }

  if (s.section === 'panels') {
    // Panel chips, then the selected panel's settings.
    const cy = row();
    const count = s.panels.length + 1;
    const visible = Math.min(count, 6);
    const chipW = Math.min(0.24, (X1 - X0 - GAP * (visible - 1)) / visible);
    const first = clamp(
      panelIndex - 2,
      0,
      Math.max(0, s.panels.length + 1 - visible),
    );
    for (let i = first; i < first + visible; i++) {
      const p = s.panels[i];
      at(
        X0 + (i - first) * (chipW + GAP),
        cy,
        chipW,
        p
          ? {
              kind: 'chip',
              label: 'Panel ' + (i + 1),
              icon: p.pinned ? 'pin' : undefined,
              selected: p.id === s.active,
              action: () => act.select(p.id),
            }
          : { kind: 'button', label: 'Add', icon: 'plus', action: act.add },
      );
    }
    // Now showing / source.
    const info = row(0.1);
    text({
      x: X0,
      y: info + 0.024,
      text: s.showing || 'Nothing showing yet',
      size: 0.028,
      weight: 600,
      maxWidth: X1 - X0 - 0.33,
    });
    text({
      x: X0,
      y: info - 0.022,
      text: panel?.sourceFolder
        ? 'From ' + s.folderName(panel.sourceFolder)
        : 'No folder chosen',
      size: SMALL,
      color: '#a9b5bb',
      maxWidth: X1 - X0 - 0.33,
    });
    at(X1 - 0.3, info, 0.3, {
      kind: 'button',
      label: panel?.sourceFolder ? 'Change folder' : 'Choose folder',
      icon: 'folder',
      action: act.source,
    });
    if (!panel) return { controls, texts, rules };
    const ty = row();
    const third = (X1 - X0 - GAP * 2) / 3;
    at(X0, ty, third, {
      kind: 'button',
      label: 'Previous',
      icon: 'skip-back',
      disabled: (panel.historyIndex ?? 0) <= 0,
      action: act.previous,
    });
    at(X0 + third + GAP, ty, third, {
      kind: 'button',
      label: 'Next',
      icon: 'skip-forward',
      action: act.next,
    });
    at(X0 + (third + GAP) * 2, ty, third, {
      kind: 'segment',
      label: panel.pinned ? 'Pinned' : 'Pin',
      icon: 'pin',
      selected: panel.pinned,
      action: () => act.patch({ pinned: !panel.pinned }),
    });
    const fy = row();
    label(fy, 'Format');
    segments(
      fy,
      STEREO_OPTIONS.map(([v, , short]) => [v, short]),
      panel.stereo,
      (stereo) => act.patch({ stereo }),
    );
    const oy = row();
    label(oy, 'Order');
    segments(
      oy,
      ORDER_OPTIONS.map(([v]) => [v, ORDER_SHORT[v] || v]),
      panel.order || 'date-desc',
      (order) => act.patch({ order }),
    );
    const iy = row();
    label(iy, 'Image time');
    const end = stepper(
      iy,
      panel.seconds + ' s',
      () => act.patch({ seconds: Math.max(1, panel.seconds - 1) }),
      () => act.patch({ seconds: Math.min(3600, panel.seconds + 1) }),
    );
    const subX = end + GAP * 2;
    at(subX, iy, X1 - subX, {
      kind: 'segment',
      label: 'Include subfolders',
      icon: panel.includeSubfolders ? 'check' : undefined,
      selected: !!panel.includeSubfolders,
      action: () => act.patch({ includeSubfolders: !panel.includeSubfolders }),
    });
    at(X1 - 0.36, row(), 0.36, {
      kind: 'danger',
      label: 'Remove panel',
      icon: 'trash',
      disabled: s.panels.length === 1,
      action: () => act.remove(panel.id),
    });
    return { controls, texts, rules };
  }

  const ay = row();
  label(ay, 'Arrangement');
  segments(
    ay,
    [
      ['row', 'Panels'],
      ['wall', 'Thumbnail wall'],
    ],
    s.layout,
    act.arrangement,
    X0 + LABEL,
    0.6,
  );
  const dy = row();
  label(dy, 'Distance');
  stepper(
    dy,
    s.distance.toFixed(1) + ' m',
    () =>
      act.view({
        distance: Math.max(0.7, Math.round((s.distance - 0.1) * 10) / 10),
      }),
    () =>
      act.view({
        distance: Math.min(3, Math.round((s.distance + 0.1) * 10) / 10),
      }),
  );
  const zy = row();
  label(zy, 'Image size');
  stepper(
    zy,
    Math.round(s.zoom * 100) + '%',
    () =>
      act.view({ zoom: Math.max(0.5, Math.round((s.zoom - 0.1) * 10) / 10) }),
    () =>
      act.view({ zoom: Math.min(1.6, Math.round((s.zoom + 0.1) * 10) / 10) }),
  );
  const ry = row();
  label(ry, 'Position');
  at(X0 + LABEL, ry, 0.33, {
    kind: 'button',
    label: 'Recenter view',
    icon: 'recenter',
    action: act.recenter,
  });
  if (s.layout === 'wall') {
    const wy = row();
    label(wy, 'Wall');
    at(X0 + LABEL, wy, TARGET, {
      kind: 'button',
      icon: 'chevron-left',
      action: () => act.wallPage(-1),
    });
    at(X0 + LABEL + TARGET + SEGMENT_GAP, wy, 0.13, {
      kind: 'value',
      label: s.wallPage + 1 + ' / ' + s.wallPages,
    });
    at(X0 + LABEL + TARGET + 0.13 + SEGMENT_GAP * 2, wy, TARGET, {
      kind: 'button',
      icon: 'chevron-right',
      action: () => act.wallPage(1),
    });
    at(X0 + LABEL + TARGET * 2 + 0.13 + SEGMENT_GAP * 2 + GAP * 2, wy, 0.3, {
      kind: 'segment',
      label: 'Slow scroll',
      icon: s.scrolling ? 'check' : undefined,
      selected: s.scrolling,
      action: act.scroll,
    });
  }
  text({
    x: X0,
    y: -TOP + 0.05,
    text: 'Thumbstick: left / right for back and next, up / down for distance.',
    size: SMALL,
    color: '#8d9aa1',
  });
  text({
    x: X0,
    y: -TOP + 0.012,
    text: 'Hold grip on a panel to move it. Select a panel to open its settings.',
    size: SMALL,
    color: '#8d9aa1',
  });
  return {
    controls,
    texts,
    rules,
    page: s.layout === 'wall' ? act.wallPage : undefined,
  };
}

// The topmost enabled control under a point on the menu plane.
export function hitControl(layout: MenuLayout, x: number, y: number) {
  for (let i = layout.controls.length - 1; i >= 0; i--) {
    const c = layout.controls[i];
    if (
      c.action &&
      !c.disabled &&
      Math.abs(x - c.x) <= c.w / 2 &&
      Math.abs(y - c.y) <= c.h / 2
    )
      return c;
  }
  return undefined;
}
