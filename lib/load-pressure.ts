// This is a workload estimate, not a measurement of free headset RAM.
export function createLoadGuard() {
  let last = 0,
    slow = 0,
    until = 0,
    memoryBlocked = false;
  return {
    sample(time: number, bytes: number) {
      const delta = last ? time - last : 0;
      last = time;
      slow = delta > 22 ? slow + 1 : Math.max(0, slow - 1);
      if (slow >= 3) until = time + 2000;
      if (bytes > 96 * 1024 * 1024) memoryBlocked = true;
      else if (bytes < 64 * 1024 * 1024) memoryBlocked = false;
      return { frames: time < until, memory: memoryBlocked };
    },
  };
}
let state = { frames: false, memory: false };
const listeners = new Set<() => void>();
export const loadSnapshot = () => state;
export const subscribeLoad = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function setLoadPressure(next: typeof state) {
  if (next.frames === state.frames && next.memory === state.memory) return;
  state = next;
  for (const listener of listeners) listener();
}
