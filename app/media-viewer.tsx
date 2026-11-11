'use client';
import { useEffect, useRef, useState } from 'react';
import { loadSnapshot } from '@/lib/load-pressure';
import { consumeTime, completionAction } from '@/lib/playback';
import { requestMediaFrame, cancelMediaFrame } from '@/lib/media-frame';
import { prepareImage, mediaBlob } from '@/lib/media-preload';
import { imageSize } from '@/lib/folder-format';
import { videoPreload, successorDelay } from '@/lib/video-preload';
import { queuePreload, createPreloadQueue } from '@/lib/preload-queue';
import { trace, traceId } from '@/lib/vr-trace';
const queueVideoResume = createPreloadQueue(400);
export type Media = {
  id: string;
  name: string;
  path: string;
  folder: string;
  url: string;
  video: boolean;
  modified?: number;
};
type Props = {
  media: Media;
  stereo?: string;
  eye?: string;
  thumb?: boolean;
  running?: boolean;
  seconds?: number;
  pinned?: boolean;
  onComplete?: () => void;
  onReady?: (ready: boolean) => void;
  onWarm?: () => void;
  preparing?: boolean;
  muted?: boolean;
  requested?: boolean;
};

// The clock belongs to one displayed item. Pauses preserve its remaining duration.
function useImageClock(
  ready: boolean,
  seconds: number,
  running: boolean,
  done: () => void,
) {
  const latest = useRef({ running, done });
  latest.current = { running, done };
  useEffect(() => {
    if (!ready) return;
    let remaining = seconds * 1000,
      previous = performance.now(),
      frame = 0;
    function tick(now: number) {
      remaining = consumeTime(
        remaining,
        now - previous,
        latest.current.running,
      );
      previous = now;
      if (!remaining) latest.current.done();
      else frame = requestMediaFrame(tick);
    }
    frame = requestMediaFrame(tick);
    return () => cancelMediaFrame(frame);
  }, [ready, seconds]);
}
function FullViewer({
  media,
  stereo = 'mono',
  eye = 'source',
  thumb = false,
  running = true,
  seconds = 8,
  pinned = false,
  onComplete = () => {},
  onReady = () => {},
  onWarm = () => {},
  preparing = false,
  muted = true,
  requested = true,
}: Props) {
  // Load pressure must never pause playback: doing so froze every panel
  // whenever one panel started loading its successor.
  const [ratio, setRatio] = useState(1.5),
    [ready, setReady] = useState(false),
    [error, setError] = useState('');
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const mounted = useRef(0),
    tag = traceId(media.id);
  const latest = useRef({ running, pinned, onComplete });
  latest.current = { running, pinned, onComplete };
  const readyCallback = useRef(onReady);
  readyCallback.current = onReady;
  useEffect(() => {
    if (ready || error) readyCallback.current(true);
    return () => readyCallback.current(false);
  }, [ready, error]);
  const gif = /\.gif$/i.test(media.name);
  useEffect(() => {
    if (gif || media.video) return;
    const abort = new AbortController(),
      started = performance.now();
    setReady(false);
    setError('');
    void prepareImage(media.url, stereo, abort.signal)
      .then(({ bitmap, ratio }) => {
        const target = canvas.current;
        trace('img:ready', {
          id: traceId(media.id),
          size: bitmap.width + 'x' + bitmap.height,
          ms: performance.now() - started,
        });
        if (target && !abort.signal.aborted) {
          target.width = bitmap.width;
          target.height = bitmap.height;
          target.getContext('2d')?.drawImage(bitmap, 0, 0);
          target.dataset.still = 'true';
          target.dataset.ready = 'true';
          target.dataset.frame = String(Number(target.dataset.frame || 0) + 1);
          setRatio(ratio);
          setReady(true);
        }
        bitmap.close();
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setError(
            e instanceof Error ? e.message : 'Image preparation failed.',
          );
      });
    const target = canvas.current;
    return () => {
      abort.abort();
      if (target) {
        target.width = target.height = 1;
        delete target.dataset.ready;
      }
    };
  }, [gif, media.video, media.url, media.id, stereo]);
  const [started, setStarted] = useState(running || preparing);
  useEffect(() => {
    if (running) setStarted(true);
  }, [running]);
  const finish = (event: 'timeout' | 'ended') => {
    if (
      completionAction(
        media.video ? 'video' : gif ? 'gif' : 'image',
        event,
        latest.current.pinned,
      ) === 'advance'
    )
      latest.current.onComplete();
  };
  useImageClock(
    ready && !media.video && !gif && !thumb,
    seconds,
    running && !pinned,
    () => finish('timeout'),
  );
  useEffect(() => {
    const el = video.current;
    if (!el || thumb) return;
    if (running) {
      if (el.ended) {
        if (!pinned) latest.current.onComplete();
        el.currentTime = 0;
      }
      return queueVideoResume((release) => {
        void el.play().catch((error) => {
          if (error?.name !== 'AbortError' && latest.current.running)
            setError('Playback blocked. Use Resume in the menu.');
        });
        release();
      });
    } else el.pause();
  }, [running, thumb, pinned]);
  useEffect(() => {
    const el = video.current;
    // Metadata lookahead does not promise a decoded first frame. When the
    // transition actually requests this video, start buffering while the old
    // panel remains visible. Do not interrupt an already-playing video.
    if (el && requested && !running && el.readyState < 2) {
      const started = performance.now(),
        ready = el.readyState;
      el.preload = 'auto';
      el.load();
      trace('v:reload', {
        id: el.dataset.trace,
        ready,
        ms: performance.now() - started,
      });
    }
  }, [requested, running]);
  useEffect(() => {
    const el = video.current;
    return () => {
      if (el) {
        const started = performance.now(),
          ready = el.readyState;
        el.pause();
        el.removeAttribute('src');
        el.load();
        trace('v:teardown', {
          id: el.dataset.trace,
          ready,
          ms: performance.now() - started,
        });
      }
    };
  }, []);
  useEffect(() => {
    if (!gif || thumb || !started) return;
    let cancelled = false,
      decoder: any,
      frame = 0;
    const abort = new AbortController();
    let release: (() => void) | undefined;
    const wait = (duration: number) =>
      new Promise<void>((resolve) => {
        release = resolve;
        let remaining = duration,
          previous = performance.now();
        const tick = (now: number) => {
          if (cancelled) {
            resolve();
            return;
          }
          remaining = consumeTime(
            remaining,
            now - previous,
            latest.current.running,
          );
          previous = now;
          if (!remaining) resolve();
          else frame = requestMediaFrame(tick);
        };
        frame = requestMediaFrame(tick);
      });
    async function animate() {
      try {
        const Decoder = (window as any).ImageDecoder;
        if (!Decoder)
          throw new Error(
            'GIF completion playback needs Chrome or Edge. This panel will not auto-skip.',
          );
        const blob = await mediaBlob(media.url, abort.signal);
        decoder = new Decoder({
          data: await blob.arrayBuffer(),
          type: 'image/gif',
          preferAnimation: true,
        });
        await decoder.tracks.ready;
        await decoder.completed;
        const count = decoder.tracks.selectedTrack?.frameCount;
        if (!count) throw new Error('No GIF frames could be read.');
        do {
          for (let i = 0; i < count && !cancelled; i++) {
            const { image } = await decoder.decode({ frameIndex: i });
            if (cancelled) {
              image.close();
              return;
            }
            const target = canvas.current;
            if (!target) {
              image.close();
              return;
            }
            const size = imageSize(
              image.displayWidth,
              image.displayHeight,
              stereo,
            );
            if (target.width !== size.width) target.width = size.width;
            if (target.height !== size.height) target.height = size.height;
            setRatio(image.displayWidth / image.displayHeight);
            target
              .getContext('2d')
              ?.drawImage(image, 0, 0, size.width, size.height);
            target.dataset.ready = 'true';
            target.dataset.frame = String(
              Number(target.dataset.frame || 0) + 1,
            );
            if (i === 0) setReady(true);
            const duration = Math.max(20, (image.duration || 100000) / 1000);
            image.close();
            await wait(duration);
          }
          if (cancelled) return;
          // Keep animating until the panel swaps in its successor.
          if (!latest.current.pinned) latest.current.onComplete();
        } while (!cancelled);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Unable to decode GIF.');
      }
    }
    void animate();
    const target = canvas.current;
    return () => {
      cancelled = true;
      abort.abort();
      cancelMediaFrame(frame);
      release?.();
      decoder?.close();
      if (target) {
        target.width = target.height = 1;
        delete target.dataset.ready;
      }
    };
  }, [gif, thumb, media.url, started, stereo]);
  const cropped = stereo !== 'mono' && eye !== 'source',
    sbs = stereo.startsWith('sbs');
  const displayRatio =
    cropped && !stereo.endsWith('half') ? (sbs ? ratio / 2 : ratio * 2) : ratio;
  const style = cropped
    ? {
        width: sbs ? '200%' : '100%',
        height: sbs ? '100%' : '200%',
        left: sbs && eye === 'right' ? '-100%' : 0,
        top: !sbs && eye === 'right' ? '-100%' : 0,
      }
    : {};
  return (
    <div
      className={'viewer ' + (thumb ? 'thumbnail' : '')}
      style={{ aspectRatio: displayRatio }}
    >
      {error ? (
        <p className="media-error" role="alert">
          {error}
        </p>
      ) : media.video ? (
        <video
          ref={video}
          data-trace={tag}
          src={media.url}
          onLoadStart={(e) => {
            mounted.current = performance.now();
            trace('v:load', {
              id: tag,
              requested,
              running,
              preload: e.currentTarget.preload,
            });
          }}
          style={style}
          muted={muted}
          playsInline
          loop={pinned}
          preload={videoPreload(requested, running)}
          onLoadedData={() => {
            trace('v:data', {
              id: tag,
              ms: performance.now() - mounted.current,
            });
            setReady(true);
          }}
          onWaiting={(e) =>
            trace('v:waiting', { id: tag, at: e.currentTarget.currentTime })
          }
          onPlaying={() => trace('v:playing', { id: tag })}
          onLoadedMetadata={(e) => {
            trace('v:meta', {
              id: tag,
              size:
                e.currentTarget.videoWidth + 'x' + e.currentTarget.videoHeight,
              ms: performance.now() - mounted.current,
            });
            setRatio(
              e.currentTarget.videoWidth / e.currentTarget.videoHeight || 1.5,
            );
            onWarm();
          }}
          onEnded={(e) => {
            trace('v:ended', { id: tag, running: latest.current.running });
            if (!latest.current.running) return;
            finish('ended');
            // Loop until the panel swaps in its successor rather than holding
            // the last frame while the next video loads.
            const el = e.currentTarget;
            el.currentTime = 0;
            void el.play().catch(() => {});
          }}
          onError={() =>
            setError(
              'This video could not be played. Open the panel menu to skip it.',
            )
          }
        />
      ) : (
        <canvas ref={canvas} style={style} aria-label={media.name} />
      )}
    </div>
  );
}

// Animated library tiles must not instantiate media decoders. Only the selected
// viewing panels play animation; still previews load only while on screen.
function Thumbnail({ media }: { media: Media }) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const animation = media.video || /\.(gif|webp|avif)$/i.test(media.name);
  useEffect(() => {
    if (animation || !host.current) return;
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries[0].isIntersecting),
      { rootMargin: '0px' },
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [animation]);
  return (
    <div ref={host} className="viewer thumbnail">
      {animation ? (
        <span className="preview-label">
          {media.video ? 'VIDEO' : media.name.split('.').pop()?.toUpperCase()}
          <small>Open in a panel to play</small>
        </span>
      ) : visible ? (
        <img src={media.url} alt={media.name} decoding="async" />
      ) : (
        <span className="preview-label">IMAGE</span>
      )}
    </div>
  );
}
export function Viewer(props: Props) {
  return props.thumb ? (
    <Thumbnail media={props.media} />
  ) : (
    <FullViewer {...props} />
  );
}

// Two stable slots per panel: displayed media plus one paused, decoded successor.
// Keep the old slot visible and playing until the requested successor has its
// first frame.
export function PanelViewer(
  props: Props & {
    cycle: number;
    nextMedia?: Media;
    onDisplayed?: (id: string) => void;
  },
) {
  const requestedKey = props.media.id + ':' + props.cycle;
  const [shown, setShown] = useState({
    media: props.media,
    cycle: props.cycle,
    key: requestedKey,
  });
  const [preparedKey, setPreparedKey] = useState('');
  const [shownReadyKey, setShownReadyKey] = useState('');
  const [lookaheadKey, setLookaheadKey] = useState('');
  const preloadRelease = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    if (
      shownReadyKey !== shown.key ||
      !props.running ||
      props.pinned ||
      !props.nextMedia
    )
      return;
    let frame = 0,
      start: number | undefined,
      deferred = false;
    let cancel: (() => void) | undefined;
    const tick = (time: number) => {
      start ??= time;
      const pressure = loadSnapshot();
      // Pressure postpones a lookahead but never cancels one already loading;
      // cancelling restarted the load and caused repeated stalls.
      const due = time - start >= successorDelay(shown.media.video);
      if (due && (pressure.frames || pressure.memory) && !deferred) {
        deferred = true;
        trace('p:deferred', { id: traceId(props.nextMedia!.id), ...pressure });
      }
      if (due && !pressure.frames && !pressure.memory) {
        cancel = queuePreload((release) => {
          trace('p:lookahead', { id: traceId(props.nextMedia!.id) });
          preloadRelease.current = release;
          setLookaheadKey(shown.key + ':' + props.nextMedia!.id);
        });
      } else frame = requestMediaFrame(tick);
    };
    frame = requestMediaFrame(tick);
    return () => {
      cancelMediaFrame(frame);
      cancel?.();
      preloadRelease.current = undefined;
      setLookaheadKey('');
    };
  }, [
    shown.key,
    shownReadyKey,
    shown.media.video,
    props.running,
    props.pinned,
    props.nextMedia?.id,
  ]);
  const displayedCallback = useRef(props.onDisplayed);
  displayedCallback.current = props.onDisplayed;
  const requestedAt = useRef(0),
    requestedId = props.media.id;
  useEffect(() => {
    requestedAt.current = performance.now();
    trace('p:request', { id: traceId(requestedId) });
  }, [requestedKey, requestedId]);
  useEffect(() => {
    trace('p:swap', {
      id: traceId(shown.media.id),
      waited: performance.now() - requestedAt.current,
    });
    displayedCallback.current?.(shown.media.id);
  }, [shown.key]);

  const candidate =
    requestedKey !== shown.key
      ? { media: props.media, cycle: props.cycle, key: requestedKey }
      : props.running &&
          !props.pinned &&
          props.nextMedia &&
          lookaheadKey === shown.key + ':' + props.nextMedia.id
        ? {
            media: props.nextMedia,
            cycle: props.cycle + 1,
            key: props.nextMedia.id + ':' + (props.cycle + 1),
          }
        : null;
  useEffect(() => {
    if (requestedKey !== shown.key && preparedKey === requestedKey) {
      setShown({ media: props.media, cycle: props.cycle, key: requestedKey });
      setShownReadyKey(requestedKey);
    }
  }, [requestedKey, shown.key, preparedKey, props.media, props.cycle]);
  const slots = candidate ? [shown, candidate] : [shown];
  return (
    <div className="buffered-panel">
      {slots.map((slot) => (
        <div
          key={slot.key}
          data-current-media={slot.key === shown.key ? 'true' : 'false'}
          className={
            slot.key === shown.key
              ? 'media-slot current'
              : 'media-slot preparing'
          }
        >
          <FullViewer
            {...props}
            media={slot.media}
            preparing
            requested={slot.key === requestedKey}
            muted={slot.key !== shown.key || (props.muted ?? true)}
            // The outgoing slot keeps playing (looping at its end) until the
            // requested successor has a frame ready to replace it.
            running={slot.key === shown.key && props.running}
            onReady={(ready) => {
              if (slot.key === shown.key && ready) setShownReadyKey(slot.key);
              if (slot.key !== shown.key && ready) preloadRelease.current?.();
              if (slot.key !== shown.key)
                setPreparedKey((current) =>
                  ready ? slot.key : current === slot.key ? '' : current,
                );
            }}
            onWarm={() => {
              if (slot.key !== shown.key) preloadRelease.current?.();
            }}
            onComplete={() => {
              if (slot.key === requestedKey) props.onComplete?.();
            }}
          />
        </div>
      ))}
    </div>
  );
}
