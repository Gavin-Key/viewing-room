'use client';
import { useEffect, useRef, useState } from 'react';
import type { XRBridge } from './immersive';
import { installAwayReset, watchSession } from '@/lib/away-reset';
export function QuestEntry({
  bridge,
  onEnter,
  hasMedia,
}: {
  bridge: XRBridge;
  onEnter: () => void;
  hasMedia: boolean;
}) {
  const [supported, setSupported] = useState(false),
    [ready, setReady] = useState(false),
    [active, setActive] = useState(false),
    [message, setMessage] = useState('');
  const module = useRef<typeof import('./immersive') | null>(null);
  const latest = useRef(bridge);
  latest.current = bridge;
  useEffect(() => {
    let live = true;
    if (!navigator.xr) return;
    void navigator.xr
      .isSessionSupported('immersive-vr')
      .then(async (supported) => {
        if (!live) return;
        setSupported(supported);
        if (supported) {
          installAwayReset();
          module.current = await import('./immersive');
          if (live) setReady(true);
        }
      })
      .catch(() => {
        if (live) setMessage('Could not check headset availability.');
      });
    return () => {
      live = false;
    };
  }, []);
  async function enter() {
    if (!module.current || !navigator.xr) return;
    setMessage('');
    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor'],
      });
      watchSession(session);
      onEnter();
      setActive(true);
      await module.current.startImmersive(session, {
        snapshot: () => latest.current.snapshot(),
        play: () => latest.current.play(),
        folderName: (path) => latest.current.folderName(path),
        arrangement: (layout) => latest.current.arrangement(layout),
        wallPage: (direction) => latest.current.wallPage(direction),
        scroll: () => latest.current.scroll(),
        assign: (id, path) => latest.current.assign(id, path),
        assignAll: (path) => latest.current.assignAll(path),
        folderFormat: (path, stereo) =>
          latest.current.folderFormat(path, stereo),
        add: () => latest.current.add(),
        remove: (id) => latest.current.remove(id),
        view: (patch) => latest.current.view(patch),
        select: (id) => latest.current.select(id),
        next: (id) => latest.current.next(id),
        previous: (id) => latest.current.previous(id),
        patch: (id, patch) => latest.current.patch(id, patch),
        folder: (path) => latest.current.folder(path),
        ended: () => {
          setActive(false);
          latest.current.ended();
        },
      });
    } catch (error) {
      setActive(false);
      setMessage(error instanceof Error ? error.message : 'Could not enter VR');
    }
  }
  return (
    <div className="quest-entry" hidden={active}>
      {supported ? (
        <button
          className="primary"
          disabled={!ready || !hasMedia}
          onClick={enter}
        >
          {ready ? 'Enter VR' : 'Preparing VR...'}
        </button>
      ) : (
        <span>Open in Quest Browser for immersive VR</span>
      )}
      {message && <p role="alert">{message}</p>}
    </div>
  );
}
