// Lucide icon outlines (ISC licence, lucide-react 1.31.0) drawn onto a canvas
// for the VR menu, so the headset uses the same icons as the desktop menu.
type Shape =
  | ['path', string]
  | ['rect', number, number, number, number, number]
  | ['circle', number, number, number]
  | ['line', number, number, number, number];
const ICONS = {
  play: [
    [
      'path',
      'M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z',
    ],
  ],
  pause: [
    ['rect', 14, 3, 5, 18, 1],
    ['rect', 5, 3, 5, 18, 1],
  ],
  x: [
    ['path', 'M18 6 6 18'],
    ['path', 'm6 6 12 12'],
  ],
  folder: [
    [
      'path',
      'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
    ],
  ],
  'chevron-left': [['path', 'm15 18-6-6 6-6']],
  'chevron-right': [['path', 'm9 18 6-6-6-6']],
  up: [
    ['path', 'M14 9 9 4 4 9'],
    ['path', 'M20 20h-7a4 4 0 0 1-4-4V4'],
  ],
  plus: [
    ['path', 'M5 12h14'],
    ['path', 'M12 5v14'],
  ],
  minus: [['path', 'M5 12h14']],
  pin: [
    ['path', 'M12 17v5'],
    [
      'path',
      'M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z',
    ],
  ],
  'skip-back': [
    [
      'path',
      'M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z',
    ],
    ['path', 'M3 20V4'],
  ],
  'skip-forward': [
    ['path', 'M21 4v16'],
    [
      'path',
      'M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z',
    ],
  ],
  image: [
    ['rect', 3, 3, 18, 18, 2],
    ['circle', 9, 9, 2],
    ['path', 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'],
  ],
  film: [
    ['rect', 3, 3, 18, 18, 2],
    ['path', 'M7 3v18'],
    ['path', 'M3 7.5h4'],
    ['path', 'M3 12h18'],
    ['path', 'M3 16.5h4'],
    ['path', 'M17 3v18'],
    ['path', 'M17 7.5h4'],
    ['path', 'M17 16.5h4'],
  ],
  images: [
    ['path', 'm22 11-1.296-1.296a2.4 2.4 0 0 0-3.408 0L11 16'],
    ['path', 'M4 8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2'],
    ['circle', 13, 7, 1],
    ['rect', 8, 2, 14, 14, 2],
  ],
  panels: [
    ['rect', 3, 3, 18, 18, 2],
    ['path', 'M9 3v18'],
    ['path', 'M15 3v18'],
  ],
  view: [
    ['path', 'M10 5H3'],
    ['path', 'M12 19H3'],
    ['path', 'M14 3v4'],
    ['path', 'M16 17v4'],
    ['path', 'M21 12h-9'],
    ['path', 'M21 19h-5'],
    ['path', 'M21 5h-7'],
    ['path', 'M8 10v4'],
    ['path', 'M8 12H3'],
  ],
  exit: [
    ['path', 'm16 17 5-5-5-5'],
    ['path', 'M21 12H9'],
    ['path', 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'],
  ],
  recenter: [
    ['line', 2, 12, 5, 12],
    ['line', 19, 12, 22, 12],
    ['line', 12, 2, 12, 5],
    ['line', 12, 19, 12, 22],
    ['circle', 12, 12, 7],
    ['circle', 12, 12, 3],
  ],
  trash: [
    ['path', 'M10 11v6'],
    ['path', 'M14 11v6'],
    ['path', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6'],
    ['path', 'M3 6h18'],
    ['path', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
  ],
  check: [['path', 'M20 6 9 17l-5-5']],
  menu: [
    ['path', 'M4 5h16'],
    ['path', 'M4 12h16'],
    ['path', 'M4 19h16'],
  ],
  wall: [
    ['rect', 3, 3, 7, 7, 1],
    ['rect', 14, 3, 7, 7, 1],
    ['rect', 14, 14, 7, 7, 1],
    ['rect', 3, 14, 7, 7, 1],
  ],
} satisfies Record<string, Shape[]>;
export type IconName = keyof typeof ICONS;
// Solid glyphs read better at headset resolution.
const FILLED = new Set<IconName>([
  'play',
  'pause',
  'skip-back',
  'skip-forward',
]);
const paths = new Map<IconName, Path2D[]>();
export function drawIcon(
  ctx: CanvasRenderingContext2D,
  name: IconName,
  cx: number,
  cy: number,
  size: number,
  color: string,
) {
  let shapes = paths.get(name);
  if (!shapes) {
    shapes = (ICONS[name] as Shape[]).map((shape) => {
      const p = new Path2D();
      if (shape[0] === 'path') p.addPath(new Path2D(shape[1]));
      else if (shape[0] === 'rect')
        p.roundRect(shape[1], shape[2], shape[3], shape[4], shape[5]);
      else if (shape[0] === 'circle') p.arc(shape[1], shape[2], shape[3], 0, 7);
      else {
        p.moveTo(shape[1], shape[2]);
        p.lineTo(shape[3], shape[4]);
      }
      return p;
    });
    paths.set(name, shapes);
  }
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.lineWidth = 2.25;
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const p of shapes) {
    if (FILLED.has(name)) ctx.fill(p);
    ctx.stroke(p);
  }
  ctx.restore();
}
