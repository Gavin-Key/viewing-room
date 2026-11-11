// Headset diagnostics: missed XR frames, long main-thread tasks and media
// lifecycle events, posted to the local entry server (work/perf/). Active only
// during an immersive session.
type TraceEvent = { t: number; e: string } & Record<string, unknown>;
let events: TraceEvent[] = [];
let session = '';
let timer: ReturnType<typeof setInterval> | undefined;
let observers: PerformanceObserver[] = [];
const round = (value: number) => Math.round(value * 10) / 10;

export function traceId(value: string) {
  let h = 2166136261;
  for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
}
export function trace(e: string, data?: Record<string, unknown>) {
  if (!session) return;
  const values = Object.entries(data || {}).map(([k, v]) => [
    k,
    typeof v === 'number' ? round(v) : v,
  ]);
  events.push({
    t: round(performance.now()),
    e,
    ...Object.fromEntries(values),
  });
  if (events.length > 6000) events = events.slice(-5000);
}
function flush() {
  if (!events.length) return;
  const body = JSON.stringify({ session, events });
  events = [];
  void fetch('/__perf', {
    method: 'POST',
    body,
    keepalive: body.length < 60000,
    headers: { 'Content-Type': 'application/json' },
  }).catch(() => {});
}
function observe(type: string, record: (entry: any) => void) {
  try {
    const observer = new PerformanceObserver((list) =>
      list.getEntries().forEach(record),
    );
    observer.observe({ type, buffered: false });
    observers.push(observer);
  } catch {}
}
export function startTrace() {
  lastTime = windowStart = 0;
  deltas = [];
  session =
    new Date().toISOString() + '-' + Math.random().toString(36).slice(2, 6);
  trace('start', {
    ua: navigator.userAgent,
    cores: navigator.hardwareConcurrency,
    memory: (navigator as any).deviceMemory,
  });
  observe('longtask', (entry) =>
    trace('longtask', {
      start: round(entry.startTime),
      ms: round(entry.duration),
      name: entry.attribution?.[0]?.containerType || entry.name,
    }),
  );
  observe('long-animation-frame', (entry) =>
    trace('loaf', {
      start: round(entry.startTime),
      ms: round(entry.duration),
      blocking: round(entry.blockingDuration || 0),
      layout: round(
        entry.styleAndLayoutStart
          ? entry.startTime + entry.duration - entry.styleAndLayoutStart
          : 0,
      ),
      scripts: (entry.scripts || [])
        .filter((s: any) => s.duration >= 5)
        .slice(0, 6)
        .map((s: any) => ({
          ms: round(s.duration),
          invoker: s.invoker,
          fn: s.sourceFunctionName,
          src: String(s.sourceURL || '')
            .split('/')
            .pop(),
          char: s.sourceCharPosition,
        })),
    }),
  );
  timer = setInterval(flush, 10000);
}
export function stopTrace() {
  if (!session) return;
  trace('stop');
  flush();
  clearInterval(timer);
  observers.forEach((o) => o.disconnect());
  observers = [];
  session = '';
}

// Per-frame timing inside the XR loop. A stall is any XR frame interval above
// 25 ms (a missed frame at 72-90 Hz); `work` is what our own callback spent.
type Work = Record<string, number>;
let lastTime = 0,
  previousWork: Work = {},
  windowStart = 0,
  deltas: number[] = [];
export function traceFrame(time: number, work: Work) {
  if (!session) return;
  const delta = lastTime ? time - lastTime : 0;
  lastTime = time;
  if (delta) deltas.push(delta);
  if (delta > 25)
    trace('stall', {
      delta: round(delta),
      previous: roundWork(previousWork),
      current: roundWork(work),
    });
  previousWork = work;
  windowStart ||= time;
  if (time - windowStart >= 5000) {
    const sorted = [...deltas].sort((a, b) => a - b);
    trace('frames', {
      count: sorted.length,
      p50: round(sorted[Math.floor(sorted.length / 2)] || 0),
      p95: round(sorted[Math.floor(sorted.length * 0.95)] || 0),
      max: round(sorted[sorted.length - 1] || 0),
      missed: sorted.filter((d) => d > 25).length,
    });
    deltas = [];
    windowStart = time;
  }
}
const roundWork = (work: Work) =>
  Object.fromEntries(Object.entries(work).map(([k, v]) => [k, round(v)]));
