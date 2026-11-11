export function videoPreload(
  requested: boolean,
  running: boolean,
): 'auto' | 'metadata' {
  return requested || running ? 'auto' : 'metadata';
}
export function successorDelay(video: boolean) {
  return video ? 1500 : 350;
}
