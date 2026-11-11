// Paints a VR menu layout into a canvas. Browser-only.
import { drawIcon, type IconName } from './vr-icons.ts';
import {
  FONT,
  MENU_HEIGHT,
  MENU_WIDTH,
  type Control,
  type MenuLayout,
  type Text,
} from './vr-menu.ts';

export const PX_PER_M = 1200;
const RADIUS = 0.018;
const COLORS = {
  surface: '#161d21',
  rail: '#10161a',
  border: '#2f3b41',
  text: '#e9eef0',
  muted: '#a9b5bb',
  accent: '#b8dc7e',
  onAccent: '#18230f',
  control: '#263035',
  controlBorder: '#38464e',
  well: '#1d252a',
  selected: '#2b3824',
  selectedText: '#dff0c4',
  danger: '#f1a99d',
  dangerBorder: '#6b3b36',
};
const FAMILY = "Inter, 'Segoe UI', system-ui, sans-serif";

function fit(
  ctx: CanvasRenderingContext2D,
  value: string,
  max: number,
  keep: 'start' | 'end' = 'start',
) {
  if (!max || ctx.measureText(value).width <= max) return value;
  let low = 0,
    high = value.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate =
      keep === 'start'
        ? value.slice(0, mid) + '…'
        : '…' + value.slice(value.length - mid);
    if (ctx.measureText(candidate).width <= max) low = mid;
    else high = mid - 1;
  }
  return keep === 'start'
    ? value.slice(0, low) + '…'
    : '…' + value.slice(value.length - low);
}
function drawText(ctx: CanvasRenderingContext2D, t: Text, ppm: number) {
  ctx.font = `${t.weight || 500} ${Math.round(t.size * ppm)}px ${FAMILY}`;
  ctx.fillStyle = t.color || COLORS.text;
  ctx.textAlign = t.align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    fit(ctx, t.text, (t.maxWidth || 0) * ppm, t.keep),
    (t.x + MENU_WIDTH / 2) * ppm,
    (MENU_HEIGHT / 2 - t.y) * ppm,
  );
}
type Style = { fill?: string; stroke?: string; text: string; bar?: boolean };
function style(c: Control): Style {
  switch (c.kind) {
    case 'primary':
      return { fill: COLORS.accent, text: COLORS.onAccent };
    case 'tab':
      return c.selected
        ? { fill: COLORS.selected, text: COLORS.selectedText, bar: true }
        : { text: COLORS.muted };
    case 'segment':
      return c.selected
        ? { fill: COLORS.accent, text: COLORS.onAccent }
        : { fill: COLORS.well, stroke: COLORS.border, text: COLORS.text };
    case 'chip':
      return c.selected
        ? {
            fill: COLORS.selected,
            stroke: COLORS.accent,
            text: COLORS.selectedText,
          }
        : { fill: COLORS.well, stroke: COLORS.border, text: COLORS.text };
    case 'entry':
      return { fill: COLORS.well, text: COLORS.text };
    case 'danger':
      return { stroke: COLORS.dangerBorder, text: COLORS.danger };
    case 'ghost':
      return { text: COLORS.muted };
    case 'value':
      return { text: COLORS.text };
    default:
      return {
        fill: COLORS.control,
        stroke: COLORS.controlBorder,
        text: COLORS.text,
      };
  }
}
// (ox, oy) is the canvas position of the layout origin, in metres.
function drawControl(
  ctx: CanvasRenderingContext2D,
  c: Control,
  ppm: number,
  ox = MENU_WIDTH / 2,
  oy = MENU_HEIGHT / 2,
) {
  const s = style(c);
  const left = (c.x - c.w / 2 + ox) * ppm,
    top = (oy - c.y - c.h / 2) * ppm,
    w = c.w * ppm,
    h = c.h * ppm,
    r = RADIUS * ppm;
  ctx.save();
  if (c.disabled) ctx.globalAlpha = 0.35;
  if (s.fill || s.stroke) {
    ctx.beginPath();
    ctx.roundRect(left, top, w, h, r);
    if (s.fill) {
      ctx.fillStyle = s.fill;
      ctx.fill();
    }
    if (s.stroke) {
      ctx.lineWidth = Math.max(2, ppm * 0.002);
      ctx.strokeStyle = s.stroke;
      ctx.stroke();
    }
  }
  if (s.bar) {
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.roundRect(left, top + h * 0.22, ppm * 0.006, h * 0.56, ppm * 0.003);
    ctx.fill();
  }
  const font = Math.round(FONT * ppm * (c.kind === 'segment' ? 0.86 : 1));
  ctx.font = `${c.kind === 'primary' || c.selected ? 600 : 500} ${font}px ${FAMILY}`;
  const iconSize = font * 1.05,
    gap = font * 0.45,
    inset = ppm * (c.kind === 'value' ? 0.004 : 0.014);
  const leftAligned = c.kind === 'entry' || c.kind === 'tab';
  const room = w - inset * 2 - (c.icon && c.label ? iconSize + gap : 0);
  const label = c.label ? fit(ctx, c.label, room) : '';
  const labelW = label ? ctx.measureText(label).width : 0;
  const contentW =
    (c.icon ? iconSize : 0) + (c.icon && label ? gap : 0) + labelW;
  let x = leftAligned
    ? left + inset + (s.bar ? ppm * 0.008 : 0)
    : left + (w - contentW) / 2;
  const cy = top + h / 2;
  if (c.icon) {
    drawIcon(ctx, c.icon as IconName, x + iconSize / 2, cy, iconSize, s.text);
    x += iconSize + gap;
  }
  if (label) {
    ctx.fillStyle = s.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, cy + font * 0.04);
  }
  ctx.restore();
}

export function paintMenu(
  canvas: HTMLCanvasElement,
  layout: MenuLayout,
  ppm = PX_PER_M,
) {
  const width = Math.round(MENU_WIDTH * ppm),
    height = Math.round(MENU_HEIGHT * ppm);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, width, height);
  const r = ppm * 0.034;
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, r);
  ctx.fillStyle = COLORS.surface;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = COLORS.rail;
  ctx.fillRect(0, 0, ppm * 0.3, height);
  ctx.fillStyle = COLORS.border;
  ctx.fillRect(ppm * 0.3 - 2, 0, 2, height);
  for (const rule of layout.rules)
    ctx.fillRect(
      ppm * 0.335,
      (MENU_HEIGHT / 2 - rule) * ppm,
      width - ppm * 0.37,
      2,
    );
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.border;
  ctx.beginPath();
  ctx.roundRect(1.5, 1.5, width - 3, height - 3, r);
  ctx.stroke();
  for (const c of layout.controls) drawControl(ctx, c, ppm);
  for (const t of layout.texts) drawText(ctx, t, ppm);
}

// A free-standing rounded button (dock and wall controls).
export function paintPill(
  canvas: HTMLCanvasElement,
  text: string,
  icon?: IconName,
  width = 0.3,
  height = 0.1,
  ppm = PX_PER_M,
) {
  canvas.width = Math.round(width * ppm);
  canvas.height = Math.round(height * ppm);
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  ctx.roundRect(2, 2, canvas.width - 4, canvas.height - 4, canvas.height / 2);
  ctx.fillStyle = 'rgba(22, 29, 33, 0.92)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#4a5860';
  ctx.stroke();
  drawControl(
    ctx,
    { x: 0, y: 0, w: width, h: height, kind: 'value', label: text, icon },
    ppm,
    width / 2,
    height / 2,
  );
}
