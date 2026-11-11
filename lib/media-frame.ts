// Keep slideshow/GIF clocks alive when the browser switches from window RAF to XR RAF.
let immersive = false;
let nativeFrame = 0;
let nextId = 1;
const callbacks = new Map<number, FrameRequestCallback>();
function flush(time: number) {
  const pending = [...callbacks.values()];
  callbacks.clear();
  for (const callback of pending) callback(time);
}
function arm() {
  if (immersive || nativeFrame || !callbacks.size) return;
  nativeFrame = requestAnimationFrame((time) => {
    nativeFrame = 0;
    flush(time);
    arm();
  });
}
export function requestMediaFrame(callback: FrameRequestCallback) {
  const id = nextId++;
  callbacks.set(id, callback);
  arm();
  return id;
}
export function cancelMediaFrame(id: number) {
  callbacks.delete(id);
}
export function setImmersiveClock(value: boolean) {
  immersive = value;
  if (nativeFrame) cancelAnimationFrame(nativeFrame);
  nativeFrame = 0;
  arm();
}
export function driveMediaFrames(time: number) {
  if (immersive) flush(time);
}
