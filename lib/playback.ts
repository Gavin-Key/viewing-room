export function consumeTime(
  remaining: number,
  elapsed: number,
  running: boolean,
) {
  return Math.max(0, remaining - (running ? Math.max(0, elapsed) : 0));
}
export function completionAction(
  kind: 'image' | 'gif' | 'video',
  event: 'timeout' | 'ended',
  pinned: boolean,
) {
  if (pinned) return 'hold';
  return (kind === 'image' ? event === 'timeout' : event === 'ended')
    ? 'advance'
    : 'hold';
}
export function nextInFolder<T extends { id: string; folder: string }>(
  items: T[],
  currentId: string | null,
  fallback: T[],
) {
  const current = items.find((item) => item.id === currentId);
  const queue = current
    ? items.filter((item) => item.folder === current.folder)
    : fallback;
  return queue.length
    ? queue[
        (queue.findIndex((item) => item.id === currentId) + 1) % queue.length
      ]
    : undefined;
}
