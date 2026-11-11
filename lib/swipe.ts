export function isHorizontalSwipe(dx: number, dy: number, threshold: number) {
  return Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 1.3;
}
