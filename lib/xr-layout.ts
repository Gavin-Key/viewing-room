export function eyeUV(stereo: string, eye: 0 | 1) {
  if (stereo.startsWith('sbs')) return { x: eye * 0.5, y: 0, w: 0.5, h: 1 };
  if (stereo.startsWith('tb'))
    return { x: 0, y: eye === 0 ? 0.5 : 0, w: 1, h: 0.5 };
  return { x: 0, y: 0, w: 1, h: 1 };
}
export function eyeAspect(aspect: number, stereo: string) {
  if (stereo.endsWith('half')) return aspect;
  return stereo.startsWith('sbs')
    ? aspect / 2
    : stereo.startsWith('tb')
      ? aspect * 2
      : aspect;
}
