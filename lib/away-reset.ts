// Taking the headset off starts Viewing Room over. Once the viewer has been out
// of sight for AWAY_LIMIT_MS, coming back ends VR and reloads the page, so no
// folder, panel, playback or menu state survives. Shorter gaps (a sensor
// flicker, a quick look outside) resume as they were. While away, the 2D page
// and the VR scene are concealed so nothing is visible during the decision.
import { trace } from './vr-trace.ts';

export const AWAY_LIMIT_MS = 30_000;

export function createAwayClock(limit = AWAY_LIMIT_MS) {
  let since: number | null = null;
  return {
    get away() {
      return since !== null;
    },
    leave(now: number) {
      if (since === null) since = now;
    },
    expired(now: number) {
      return since !== null && now - since >= limit;
    },
    /** Marks the viewer present again; true means it was gone too long. */
    back(now: number) {
      const expired = this.expired(now);
      since = null;
      return expired;
    },
  };
}

const clock = createAwayClock();
let current: XRSession | null = null;
let resetting = false;
let installed = false;

/** True while the viewer is away or a reset is under way; hide the scene. */
export function concealed() {
  return resetting || clock.away;
}

function cover(on: boolean) {
  document.documentElement.classList.toggle('away', on);
}
function leave() {
  if (!clock.away) trace('away');
  clock.leave(Date.now());
  cover(true);
}
function reset() {
  if (resetting) return;
  resetting = true;
  cover(true);
  trace('away:reset');
  const session = current;
  current = null;
  void (session ? session.end().catch(() => {}) : Promise.resolve()).finally(
    () => location.reload(),
  );
}
function returned() {
  if (resetting || !clock.away) return;
  if (clock.back(Date.now())) return reset();
  trace('away:back');
  cover(false);
}

/** Watches the 2D page. Install only on headsets: desktops keep their state. */
export function installAwayReset() {
  if (installed) return;
  installed = true;
  const check = () => {
    // During VR the session's own visibility is authoritative.
    if (current) return;
    if (document.visibilityState === 'hidden') leave();
    else returned();
  };
  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
  // Any interaction proves the viewer is present, in case no visibility
  // event arrives after the system ended VR while the headset was off.
  window.addEventListener('pointerdown', check, true);
  // A page restored from the back/forward cache carries its old state.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      cover(true);
      location.reload();
    }
  });
}

/** Watches an immersive session; removing the headset hides it. */
export function watchSession(session: XRSession) {
  current = session;
  const check = () => {
    if (session.visibilityState === 'hidden') leave();
    else returned();
  };
  session.addEventListener('visibilitychange', check);
  session.addEventListener(
    'end',
    () => {
      session.removeEventListener('visibilitychange', check);
      if (current === session) current = null;
      // The system ended VR while the headset was off for long enough.
      if (clock.expired(Date.now())) reset();
    },
    { once: true },
  );
}
