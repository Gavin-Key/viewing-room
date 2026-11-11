'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Viewer, PanelViewer, type Media } from './media-viewer';
import { QuestEntry } from './quest-entry';
import { folderFormat, type FolderFormats } from '@/lib/folder-format';
import { readNasResponse } from '@/lib/nas-response';
import { SourcePicker, type Connection } from './source-picker';
import { isHorizontalSwipe } from '@/lib/swipe';
import {
  collectDirectory,
  supportedMedia,
  normalizeMediaPath,
  type SelectedFile,
} from '@/lib/folder-import';
import {
  newPanel as blank,
  planNext,
  freshItem,
  showItem,
  navigateHistory,
  assignPanels,
  panelQueue,
  ORDER_OPTIONS,
  inFolder,
  naturalCompare,
  type PanelState as Panel,
} from '@/lib/viewer-model';
import {
  childFolders,
  breadcrumb,
  MENU_SECTIONS,
  ORDER_SHORT,
  STEREO_OPTIONS,
  EYE_OPTIONS,
  type MenuSection,
} from '@/lib/menu-model';
import { Segmented, Stepper, SettingRow } from './menu-controls';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Film,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Images,
  Menu,
  Pause,
  Pin,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

const INITIAL_STATUS =
  'Choose a folder to start. Your media stays on this device.';
const SECTION_ICONS = {
  library: Images,
  panels: Columns3,
  view: SlidersHorizontal,
};
const STEREO_SEGMENTS = STEREO_OPTIONS.map(
  ([v, long, short]) => [v, short, long] as [string, string, string],
);
const ORDER_SEGMENTS = ORDER_OPTIONS.map(
  ([v, long]) => [v, ORDER_SHORT[v] || long, long] as [string, string, string],
);
export default function Home() {
  const [media, setMedia] = useState<Media[]>([]);
  const [folder, setFolder] = useState('');
  const [sourcePicker, setSourcePicker] = useState(false);
  const [nasFolders, setNasFolders] = useState<string[]>([]);
  const [nasConnections, setNasConnections] = useState<Connection[]>([]);
  const [immersive, setImmersive] = useState(false);
  const folderLabel = (path: string) => {
    const c = nasConnections.find(
      (c) => path === 'NAS ' + c.id || path.startsWith('NAS ' + c.id + '/'),
    );
    return c ? path.replace('NAS ' + c.id, c.name) : path;
  };
  async function browseNas(path: string, recursive = false) {
    const match = /^NAS ([^/]+)(?:\/(.*))?$/.exec(path);
    if (!match) return [];
    const response = await fetch(
      '/__nas/browse?id=' +
        encodeURIComponent(match[1]) +
        '&path=' +
        encodeURIComponent(match[2] || '') +
        (recursive ? '&recursive=true' : ''),
    );
    const data = await readNasResponse<{
      error?: string;
      items: Media[];
      folders: string[];
      truncated: boolean;
    }>(response);
    if (!Array.isArray(data.items) || !Array.isArray(data.folders))
      throw Error(
        'The NAS folder listing is unavailable. Reload the viewer and try again.',
      );
    const ids = new Set(data.items.map((m) => m.id));
    setMedia((ms) => [...ms.filter((m) => !ids.has(m.id)), ...data.items]);
    setNasFolders((fs) => [...new Set([...fs, path, ...data.folders])]);
    if (data.truncated)
      setStatus(
        'This folder exceeds the 3,000-media scan limit. Choose a smaller subfolder for a complete sequence.',
      );
    return data.items as Media[];
  }

  const [panels, setPanels] = useState<Panel[]>([blank(1), blank(2), blank(3)]);
  const [active, setActive] = useState(1);
  const [folderFormats, setFolderFormats] = useState<FolderFormats>({});
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem('viewing-room.folder-formats') || '{}',
      );
      if (saved && typeof saved === 'object') setFolderFormats(saved);
    } catch {}
  }, []);
  function setFolderFormat(path: string, stereo: string) {
    const formats = { ...folderFormats, [path]: stereo };
    setFolderFormats(formats);
    try {
      localStorage.setItem(
        'viewing-room.folder-formats',
        JSON.stringify(formats),
      );
    } catch {}
    setPanels((ps) =>
      ps.map((p) => {
        const format = folderFormat(p.sourceFolder, formats);
        return p.sourceFolder
          ? { ...p, stereo: format, eye: format === 'mono' ? 'source' : 'left' }
          : p;
      }),
    );
  }

  const [defaultPanelFolder, setDefaultPanelFolder] = useState<string | null>(
    null,
  );
  const [playing, setPlaying] = useState(false);
  const [menu, setMenu] = useState(false);
  const [menuTab, setMenuTab] = useState<MenuSection>('library');

  const [view, setView] = useState({ distance: 1.6, zoom: 1 });
  function setRoomView(patch: Partial<{ distance: number; zoom: number }>) {
    setView((v) => ({ ...v, ...patch }));
    if (patch.distance !== undefined)
      setPanels((ps) =>
        ps.map((p) =>
          p.distance === undefined ? p : { ...p, distance: undefined },
        ),
      );
  }
  const [layout, setLayout] = useState('row');
  useEffect(() => {
    setLayout('row');
  }, []);
  const [page, setPage] = useState(0);
  const pageSize = 12;
  const [scrolling, setScrolling] = useState(false);
  const wall = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scrolling || layout !== 'wall' || immersive) return;
    let frame = 0,
      last = 0,
      position = wall.current?.scrollTop || 0;
    const tick = (time: number) => {
      const el = wall.current;
      if (el && last) {
        position += Math.min(time - last, 100) * 0.025;
        if (position > Math.max(0, el.scrollHeight - el.clientHeight) + 40) {
          position = 0;
          setPage((p) => p + 1);
        }
        el.scrollTop = position;
      }
      last = time;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scrolling, layout, immersive]);
  const [status, setStatus] = useState(INITIAL_STATUS);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);
  const nextId = useRef(4);
  const swipe = useRef<{
    id: number;
    x: number;
    y: number;
    pointer: number;
  } | null>(null);
  const swipedAt = useRef(0);
  useEffect(() => () => urls.current.forEach(URL.revokeObjectURL), []);
  const folders = useMemo(
    () =>
      [
        ...new Set([
          ...nasFolders,
          ...media.flatMap((m) => {
            const parts = m.folder.split('/');
            return parts.map((_, i) => parts.slice(0, i + 1).join('/'));
          }),
        ]),
      ].sort(naturalCompare),
    [media, nasFolders],
  );
  const formattedPanels = useMemo(
    () =>
      panels.map((p) => {
        const path =
          media.find((m) => m.id === p.media)?.folder || p.sourceFolder;
        const stereo = folderFormat(path, folderFormats);
        return stereo === p.stereo
          ? p
          : { ...p, stereo, eye: stereo === 'mono' ? 'source' : 'left' };
      }),
    [media, panels, folderFormats],
  );
  const visible = useMemo(
    () =>
      panelQueue(
        media.filter((m) => folder === '' || m.folder === folder),
        { media: null, sourceFolder: null, order: 'date-desc' },
      ),
    [media, folder],
  );
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = page % pageCount;
  const pageMedia = visible.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );
  const pagination = (
    <div className="media-pages">
      <button
        aria-label="Previous page"
        disabled={currentPage === 0}
        onClick={() => setPage(currentPage - 1)}
      >
        <ChevronLeft size={18} />
      </button>
      <span>
        {currentPage + 1} / {pageCount}
      </span>
      <button
        aria-label="Next page"
        disabled={currentPage + 1 >= pageCount}
        onClick={() => setPage(currentPage + 1)}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
  const selectFolder = (value: string) => {
    setFolder(value);
    setPage(0);
    if (value.startsWith('NAS '))
      void browseNas(value).catch((e) => setStatus(e.message));
  };
  const update = (id: number, patch: Partial<Panel>) => {
    const panel = panels.find((p) => p.id === id);
    if (patch.stereo && panel?.sourceFolder) {
      setFolderFormat(
        media.find((m) => m.id === panel.media)?.folder || panel.sourceFolder,
        patch.stereo,
      );
      return;
    }
    setPanels((ps) => {
      const current = ps.find((p) => p.id === id);
      if (!current) return ps;
      if (patch.media) {
        if (
          patch.media === current.media ||
          ps.some(
            (p) =>
              p.id !== id &&
              (p.media === patch.media || p.heldMedia === patch.media),
          )
        )
          return ps;
        const changed = ps.map((p) =>
          p.id === id
            ? {
                ...p,
                ...patch,
                sourceFolder:
                  patch.sourceFolder ??
                  media.find((m) => m.id === patch.media)?.folder ??
                  p.sourceFolder,
              }
            : p,
        );
        return showItem(changed, id, patch.media, false);
      }
      return ps.map((p) => (p.id === id ? { ...p, ...patch } : p));
    });
  };
  const assignFolder = async (id: number | null, path: string) => {
    let items = media;
    if (path.startsWith('NAS ')) {
      try {
        setBusy(true);
        items = await browseNas(path, true);
      } catch (e) {
        setStatus(e instanceof Error ? e.message : 'NAS unavailable');
        return;
      } finally {
        setBusy(false);
      }
    }
    if (id === null) setDefaultPanelFolder(path);
    setPanels((ps) =>
      assignPanels(
        items,
        ps,
        path,
        id === null ? ps.map((p) => p.id) : [id],
        folderFormats,
      ),
    );
    setPlaying(true);
    setStatus(
      'Panels use distinct files, newest first by default. If no different file is available, the panel holds; extra panels stay empty.',
    );
  };
  const playbackKey = panels
    .map((p) =>
      [
        p.id,
        p.media,
        p.cycle,
        p.pinned,
        p.sourceFolder,
        p.order,
        p.includeSubfolders,
        p.heldMedia,
      ].join(':'),
    )
    .join('|');
  const nextItems = useMemo(
    () => planNext(media, panels),
    [media, playbackKey],
  );
  const advance = (id: number, automatic = false, direction = 1) =>
    setPanels((ps) => {
      const p = ps.find((p) => p.id === id);
      if (!p || (automatic && p.pinned) || p.heldMedia) return ps;
      const historical = navigateHistory(
        ps,
        id,
        direction,
        new Set(media.map((m) => m.id)),
      );
      if (historical !== ps) return historical;
      if (direction < 0) return ps;

      const next =
        direction > 0 && !p.pinned
          ? planNext(media, ps).get(id)
          : freshItem(media, p, ps, new Set(), direction);
      return next
        ? showItem(ps, id, next.id)
        : ps.map((v) => (v.id === id ? { ...v, waiting: automatic } : v));
    });
  const displayed = (id: number, item: string) =>
    setPanels((ps) => {
      const p = ps.find((p) => p.id === id);
      return p?.heldMedia && p.media === item
        ? ps.map((v) => (v.id === id ? { ...v, heldMedia: null } : v))
        : ps;
    });
  useEffect(() => {
    if (
      !playing ||
      !panels.some((p) => p.waiting && !p.pinned && nextItems.has(p.id))
    )
      return;
    setPanels((ps) => {
      let next = ps;
      for (const p of ps) {
        if (!p.waiting || p.pinned) continue;
        const item = planNext(media, next).get(p.id);
        if (item) next = showItem(next, p.id, item.id);
      }
      return next;
    });
  }, [media, panels, playing, nextItems]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(false);
      if (
        e.key.toLowerCase() === 'm' &&
        !(e.target instanceof HTMLInputElement)
      ) {
        setMenu((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const selected =
    formattedPanels.find((p) => p.id === active) || formattedPanels[0];
  const selectedIndex = formattedPanels.indexOf(selected);
  const selectedItem = media.find((m) => m.id === selected.media);
  const subfolders = useMemo(
    () => childFolders(folders, folder, naturalCompare),
    [folders, folder],
  );
  function openPanel(id: number) {
    setActive(id);
    setMenuTab('panels');
    setMenu(true);
  }
  async function importFiles(files: File[] | SelectedFile[]) {
    const selectedFiles: SelectedFile[] = files.map((value) =>
      'file' in value
        ? value
        : { file: value, path: value.webkitRelativePath || value.name },
    );
    const imported = selectedFiles
      .map(({ file, path }) => ({
        file,
        path: normalizeMediaPath(path, file.name),
      }))
      .filter(({ path }) => supportedMedia(path))
      .map(({ file: f, path }) => {
        const url = URL.createObjectURL(f);
        urls.current.push(url);
        return {
          id: `local:${path}:${f.size}:${f.lastModified}`,
          name: path.split('/').pop() || f.name,
          modified: f.lastModified,
          path,
          folder: path.includes('/')
            ? path.slice(0, path.lastIndexOf('/'))
            : 'Selected files',
          url,
          video: /\.(mp4|webm|m4v)$/i.test(path),
        };
      })
      .sort((a, b) => naturalCompare(a.path, b.path));
    const ids = new Set(imported.map((m) => m.id));
    setMedia((ms) => [...ms.filter((m) => !ids.has(m.id)), ...imported]);
    if (imported.length) {
      const choices = [...new Set(imported.map((m) => m.folder))];
      setFolder(choices[0].split('/')[0]);
      setMenuTab('library');
      setMenu(true);
      if (choices.length === 1) {
        setPlaying(true);
        setPanels((ps) =>
          assignPanels(
            imported,
            ps,
            choices[0],
            ps.filter((p) => !p.media).map((p) => p.id),
            folderFormats,
          ),
        );
      }
    }
    setStatus(
      imported.length
        ? `Added ${imported.length} files. Choose a subfolder, then Use this folder for your panel.`
        : 'No supported images or videos found in that folder.',
    );
  }
  async function chooseFolder() {
    const picker = (
      window as unknown as {
        showDirectoryPicker?: (options: object) => Promise<any>;
      }
    ).showDirectoryPicker;
    if (!picker || /Android|OculusBrowser/i.test(navigator.userAgent)) {
      input.current?.click();
      return;
    }
    setBusy(true);
    try {
      const root = await picker.call(window, { mode: 'read' });
      setStatus('Reading folders...');
      const result = await collectDirectory(root);
      await importFiles(result.files);
      if (result.failures.length)
        setStatus(
          `Opened ${result.files.length} files; skipped ${result.failures.length} inaccessible files or folders.`,
        );
    } catch (e) {
      setStatus(
        e instanceof Error && e.name === 'AbortError'
          ? 'Folder selection cancelled.'
          : `This browser could not grant folder access (${e instanceof Error ? e.name : 'unknown error'}). Use Choose files on this device, or Try alternative folder picker. Your files stay on this device.`,
      );
    } finally {
      setBusy(false);
    }
  }
  function removePanel(id: number) {
    setPanels((ps) => (ps.length > 1 ? ps.filter((p) => p.id !== id) : ps));
    setActive((current) =>
      current === id
        ? (panels.find((p) => p.id !== id)?.id ?? current)
        : current,
    );
  }
  function addPanel() {
    const id = nextId.current++;
    setPanels((ps) => {
      const next = [...ps, blank(id)];
      return defaultPanelFolder
        ? assignPanels(media, next, defaultPanelFolder, [id], folderFormats)
        : next;
    });
    setActive(id);
    setMenuTab('library');
  }
  useEffect(() => {
    const ctx = (document as any).modelContext;
    if (!ctx?.registerTool) return;
    const controller = new AbortController();
    try {
      Promise.resolve(
        ctx.registerTool(
          {
            name: 'add_media_panel',
            description: 'Add an empty media panel to the workspace.',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
            execute: (args: unknown) => {
              if (!args || typeof args !== 'object' || Object.keys(args).length)
                throw new Error('Expected an empty object');
              addPanel();
              return { added: true };
            },
          },
          { signal: controller.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => controller.abort();
  }, []);
  async function openNasConnection(connection: Connection) {
    setNasConnections((cs) => [
      ...cs.filter((c) => c.id !== connection.id),
      connection,
    ]);
    const root =
      'NAS ' +
      connection.id +
      (connection.defaultPath ? '/' + connection.defaultPath : '');
    await browseNas(root);
    setFolder(root);
    setPage(0);
    setMenuTab('library');
    setMenu(true);
  }
  async function openDefaultFolder() {
    setBusy(true);
    try {
      const response = await fetch('/__nas/connections');
      const data = (response.headers.get('content-type') || '').includes('json')
        ? await readNasResponse<{ connections: Connection[] }>(response)
        : { connections: [] as Connection[] };
      const saved = data.connections.find((c) => c.isDefault);
      if (saved) await openNasConnection(saved);
      else setSourcePicker(true);
    } catch (e) {
      setStatus(
        e instanceof Error ? e.message : 'Could not open the default folder.',
      );
      setSourcePicker(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="viewing-room dark">
      <SourcePicker
        open={sourcePicker}
        onClose={() => setSourcePicker(false)}
        onLocal={() => {
          void chooseFolder();
        }}
        onNas={openNasConnection}
      />
      <QuestEntry
        bridge={{
          snapshot: () => ({
            panels: formattedPanels,
            playing,
            active,
            items: media,
            folders,
            folder,
            folderItems: visible,
            folderStereo: folderFormat(folder, folderFormats),
            ...view,
            layout,
            wallItems: pageMedia,
            wallPage: currentPage,
            wallPages: pageCount,
            scrolling,
          }),
          play: () => setPlaying((v) => !v),
          select: setActive,
          next: advance,
          previous: (id) => advance(id, false, -1),
          patch: update,
          folder: selectFolder,
          ended: () => setImmersive(false),
          folderName: folderLabel,
          arrangement: setLayout,
          wallPage: (direction) =>
            setPage((p) => (p + direction + pageCount) % pageCount),
          scroll: () => setScrolling((v) => !v),
          assignAll: (path) => {
            void assignFolder(null, path);
          },
          assign: (id, path) => {
            void assignFolder(id, path);
          },
          folderFormat: setFolderFormat,
          add: addPanel,
          remove: removePanel,
          view: setRoomView,
        }}
        onEnter={() => {
          setImmersive(true);
          setMenu(false);
          setPlaying(true);
        }}
        hasMedia={media.length > 0}
      />

      <input
        hidden
        ref={input}
        type="file"
        multiple
        {...{ webkitdirectory: '' }}
        onChange={(e) => {
          void importFiles(Array.from(e.target.files || []));
          e.target.value = '';
        }}
      />
      {!media.length ? (
        <div className="welcome">
          <Images size={38} />
          <h1>Viewing Room</h1>
          <p>Your collection, all around you.</p>
          <button
            className="primary"
            onClick={() => void openDefaultFolder()}
            disabled={busy}
          >
            <FolderOpen size={22} />
            {busy ? 'Reading folders...' : 'Open Folder'}
          </button>
          <p role="status" className="connection-status">
            {status}
          </p>
          <span>
            Choose files from your Images folder, then Enter VR. Nothing is
            uploaded.
          </span>
        </div>
      ) : layout === 'wall' ? (
        <div
          ref={wall}
          className="scroll-wall"
          onWheel={() => setScrolling(false)}
          onTouchStart={() => setScrolling(false)}
        >
          {pageMedia.map((m) => (
            <button
              key={m.id}
              className="wall-item"
              aria-label={'Open ' + m.name}
              onClick={() => {
                update(active, { media: m.id, cycle: selected.cycle + 1 });
                setLayout('row');
                setScrolling(false);
              }}
            >
              <Viewer media={m} thumb />
            </button>
          ))}
        </div>
      ) : (
        <div className={'media-surface ' + layout}>
          {formattedPanels.map((p, i) => {
            const item = media.find((m) => m.id === p.media);
            return (
              <section className="media-panel" data-panel-id={p.id} key={p.id}>
                {item?.video && (
                  <button
                    className="panel-audio"
                    aria-label={
                      p.muted === false ? 'Mute video' : 'Unmute video'
                    }
                    aria-pressed={p.muted === false}
                    onClick={() => update(p.id, { muted: p.muted === false })}
                  >
                    {p.muted === false ? (
                      <Volume2 size={14} />
                    ) : (
                      <VolumeX size={14} />
                    )}
                  </button>
                )}

                {item && (
                  <button
                    className={'panel-pin' + (p.pinned ? ' pinned' : '')}
                    aria-label={
                      p.pinned
                        ? 'Unpin: resume playing the next file'
                        : 'Pin: keep this file on screen'
                    }
                    title={p.pinned ? 'Unpin' : 'Pin this file'}
                    aria-pressed={p.pinned}
                    onClick={() => update(p.id, { pinned: !p.pinned })}
                  >
                    <Pin size={14} />
                  </button>
                )}
                {item ? (
                  <button
                    className="media-target"
                    aria-label={
                      'Panel ' + (i + 1) + ': ' + item.name + '. Open controls'
                    }
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      swipe.current = {
                        id: p.id,
                        x: e.clientX,
                        y: e.clientY,
                        pointer: e.pointerId,
                      };
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onPointerCancel={() => {
                      swipe.current = null;
                    }}
                    onPointerUp={(e) => {
                      const start = swipe.current;
                      swipe.current = null;
                      if (
                        start?.id === p.id &&
                        start.pointer === e.pointerId &&
                        isHorizontalSwipe(
                          e.clientX - start.x,
                          e.clientY - start.y,
                          45,
                        )
                      ) {
                        swipedAt.current = performance.now();
                        advance(p.id);
                      }
                    }}
                    onDragStart={(e) => e.preventDefault()}
                    onClick={() => {
                      if (performance.now() - swipedAt.current > 350)
                        openPanel(p.id);
                    }}
                  >
                    <PanelViewer
                      cycle={p.cycle}
                      key={p.generation || 0}
                      nextMedia={nextItems.get(p.id)}
                      onDisplayed={(item) => displayed(p.id, item)}
                      media={item}
                      stereo={p.stereo}
                      eye={p.eye}
                      running={playing}
                      seconds={p.seconds}
                      pinned={p.pinned}
                      muted={p.muted ?? true}
                      onComplete={() => advance(p.id, true)}
                    />
                  </button>
                ) : (
                  <button
                    className="empty-panel"
                    onClick={() => {
                      setActive(p.id);
                      setMenuTab('library');
                      setMenu(true);
                    }}
                  >
                    <Plus size={28} />
                    <span>Add media</span>
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}
      <button
        className="summon-menu"
        aria-label="Open viewing menu"
        title="Menu (M)"
        onClick={() => setMenu(true)}
      >
        <Menu size={23} />
        <span>Menu</span>
      </button>
      <Dialog open={menu} onOpenChange={setMenu}>
        <DialogContent
          className="spatial-menu viewing-menu"
          showCloseButton={false}
        >
          <nav className="menu-rail" aria-label="Menu sections">
            <div className="menu-brand">
              <Images size={20} />
              Viewing Room
            </div>
            {MENU_SECTIONS.map((section) => {
              const Icon = SECTION_ICONS[section.id];
              return (
                <button
                  key={section.id}
                  className="rail-tab"
                  aria-current={menuTab === section.id ? 'page' : undefined}
                  onClick={() => setMenuTab(section.id)}
                >
                  <Icon size={20} />
                  {section.label}
                </button>
              );
            })}
          </nav>
          <div className="menu-main">
            <header className="menu-header">
              <DialogTitle>
                {MENU_SECTIONS.find((s) => s.id === menuTab)?.label}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Choose media, adjust panels or change the view.
              </DialogDescription>
              <button
                className={playing ? '' : 'primary'}
                disabled={!media.length}
                onClick={() => setPlaying((v) => !v)}
              >
                {playing ? <Pause size={18} /> : <Play size={18} />}
                {playing ? 'Pause all' : 'Resume all'}
              </button>
              <DialogClose className="icon-button" aria-label="Close menu">
                <X size={20} />
              </DialogClose>
            </header>
            {menuTab === 'library' && (
              <>
                <div className="library-location">
                  <nav className="crumbs" aria-label="Folder path">
                    <button
                      aria-current={!folder ? 'location' : undefined}
                      onClick={() => selectFolder('')}
                    >
                      All folders
                    </button>
                    {breadcrumb(folder, folderLabel).map(([path, name]) => (
                      <span key={path}>
                        <ChevronRight size={16} aria-hidden />
                        <button
                          aria-current={
                            path === folder ? 'location' : undefined
                          }
                          onClick={() => selectFolder(path)}
                        >
                          {name}
                        </button>
                      </span>
                    ))}
                  </nav>
                  <button onClick={() => setSourcePicker(true)} disabled={busy}>
                    <FolderOpen size={18} />
                    {busy ? 'Reading…' : 'Open folder'}
                  </button>
                </div>
                <div className="menu-body">
                  {subfolders.length > 0 && (
                    <section>
                      <h3>
                        Folders <span>{subfolders.length}</span>
                      </h3>
                      <div className="folder-grid">
                        {subfolders.map((f) => (
                          <button key={f} onClick={() => selectFolder(f)}>
                            <Folder size={20} />
                            <span>{folderLabel(f).split('/').pop()}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                  <section>
                    <h3>
                      {folder ? 'Files here' : 'All files'}{' '}
                      <span>{visible.length.toLocaleString()}</span>
                    </h3>
                    {visible.length ? (
                      <div className="file-list">
                        {pageMedia.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => {
                              update(active, {
                                media: m.id,
                                cycle: selected.cycle + 1,
                              });
                              setMenu(false);
                            }}
                          >
                            {m.video ? (
                              <Film size={18} aria-label="Video" />
                            ) : (
                              <ImageIcon size={18} aria-label="Image" />
                            )}
                            <span>{m.name}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-note">
                        No media directly in this folder. Open a subfolder, or
                        play this folder with Include subfolders on.
                      </p>
                    )}
                    {pageCount > 1 && pagination}
                  </section>
                </div>
                {folder && (
                  <footer className="library-footer">
                    <div
                      className="footer-format"
                      title="Saved for this folder and its subfolders"
                    >
                      <span>Format</span>
                      <Segmented
                        value={folderFormat(folder, folderFormats)}
                        options={STEREO_SEGMENTS}
                        onChange={(value) => setFolderFormat(folder, value)}
                      />
                    </div>
                    <div className="footer-actions">
                      <button
                        disabled={busy}
                        onClick={async () => {
                          await assignFolder(null, folder);
                          setMenu(false);
                        }}
                      >
                        <Columns3 size={18} />
                        Play in all panels
                      </button>
                      <button
                        className="primary"
                        disabled={
                          busy ||
                          (!folder.startsWith('NAS ') &&
                            !media.some((m) =>
                              inFolder(m.folder, folder, true),
                            ))
                        }
                        onClick={async () => {
                          await assignFolder(active, folder);
                          setPlaying(true);
                          setMenu(false);
                        }}
                      >
                        <Play size={18} />
                        Play in Panel {selectedIndex + 1}
                      </button>
                    </div>
                  </footer>
                )}
                <p className="status" role="status">
                  {status === INITIAL_STATUS && media.length ? '' : status}
                </p>
              </>
            )}
            {menuTab === 'panels' && (
              <div className="menu-body">
                <div className="panel-strip">
                  {formattedPanels.map((p, i) => (
                    <button
                      key={p.id}
                      className="panel-card"
                      aria-pressed={p.id === active}
                      onClick={() => setActive(p.id)}
                    >
                      <strong>
                        Panel {i + 1}
                        {p.pinned && <Pin size={14} aria-label="Pinned" />}
                      </strong>
                      <span>
                        {media.find((m) => m.id === p.media)?.name || 'Empty'}
                      </span>
                    </button>
                  ))}
                  <button className="panel-card add" onClick={addPanel}>
                    <Plus size={20} />
                    Add panel
                  </button>
                </div>
                <div className="now-showing">
                  <div>
                    <strong>
                      {selectedItem?.name || 'Nothing showing yet'}
                    </strong>
                    <span>
                      {selected.sourceFolder
                        ? 'From ' + folderLabel(selected.sourceFolder)
                        : 'No folder chosen'}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      if (selected.sourceFolder)
                        selectFolder(selected.sourceFolder);
                      setMenuTab('library');
                    }}
                  >
                    <Folder size={18} />
                    {selected.sourceFolder ? 'Change folder' : 'Choose folder'}
                  </button>
                </div>
                <div className="transport-row">
                  <button
                    onClick={() => advance(active, false, -1)}
                    disabled={(selected.historyIndex ?? 0) <= 0}
                  >
                    <SkipBack size={18} />
                    Previous
                  </button>
                  <button onClick={() => advance(active)}>
                    <SkipForward size={18} />
                    Next
                  </button>
                  <button
                    className="toggle"
                    aria-pressed={selected.pinned}
                    onClick={() => update(active, { pinned: !selected.pinned })}
                  >
                    <Pin size={18} />
                    {selected.pinned ? 'Pinned' : 'Pin'}
                  </button>
                </div>
                <SettingRow
                  label="Format"
                  hint={
                    selected.sourceFolder ? 'Saved for its folder' : undefined
                  }
                >
                  <Segmented
                    value={selected.stereo}
                    options={STEREO_SEGMENTS}
                    onChange={(stereo) => update(active, { stereo })}
                  />
                </SettingRow>
                <SettingRow label="Order">
                  <Segmented
                    value={selected.order || 'date-desc'}
                    options={ORDER_SEGMENTS}
                    onChange={(order) => update(active, { order })}
                  />
                </SettingRow>
                <SettingRow label="Image time">
                  <Stepper
                    label="Image time"
                    value={selected.seconds + ' s'}
                    onDown={() =>
                      update(active, {
                        seconds: Math.max(1, selected.seconds - 1),
                      })
                    }
                    onUp={() =>
                      update(active, {
                        seconds: Math.min(3600, selected.seconds + 1),
                      })
                    }
                  />
                  <button
                    className="toggle"
                    aria-pressed={!!selected.includeSubfolders}
                    onClick={() =>
                      update(active, {
                        includeSubfolders: !selected.includeSubfolders,
                      })
                    }
                  >
                    {selected.includeSubfolders && <Check size={18} />}
                    Include subfolders
                  </button>
                </SettingRow>
                {selected.stereo !== 'mono' && (
                  <SettingRow label="Desktop preview">
                    <Segmented
                      value={selected.eye}
                      options={EYE_OPTIONS}
                      onChange={(eye) => update(active, { eye })}
                    />
                  </SettingRow>
                )}
                <div className="danger-row">
                  <button
                    className="danger"
                    disabled={panels.length === 1}
                    onClick={() => removePanel(active)}
                  >
                    <Trash2 size={18} />
                    Remove panel
                  </button>
                </div>
              </div>
            )}
            {menuTab === 'view' && (
              <div className="menu-body">
                <SettingRow label="Arrangement">
                  <Segmented
                    value={layout}
                    options={[
                      ['row', 'Panels'],
                      ['wall', 'Thumbnail wall'],
                    ]}
                    onChange={setLayout}
                  />
                </SettingRow>
                <SettingRow label="VR distance">
                  <div className="range">
                    <input
                      aria-label="VR distance"
                      type="range"
                      min="0.7"
                      max="3"
                      step="0.1"
                      value={view.distance}
                      onChange={(e) =>
                        setRoomView({ distance: Number(e.target.value) })
                      }
                    />
                    <output>{view.distance.toFixed(1)} m</output>
                  </div>
                </SettingRow>
                <SettingRow label="VR image size">
                  <div className="range">
                    <input
                      aria-label="VR image size"
                      type="range"
                      min="0.5"
                      max="1.6"
                      step="0.1"
                      value={view.zoom}
                      onChange={(e) =>
                        setView((v) => ({ ...v, zoom: Number(e.target.value) }))
                      }
                    />
                    <output>{Math.round(view.zoom * 100)}%</output>
                  </div>
                </SettingRow>
                {layout === 'wall' && (
                  <SettingRow label="Wall">
                    {pagination}
                    <button
                      className="toggle"
                      aria-pressed={scrolling}
                      onClick={() => {
                        setScrolling((v) => !v);
                        setMenu(false);
                      }}
                    >
                      {scrolling && <Check size={18} />}
                      Slow scroll
                    </button>
                  </SettingRow>
                )}
                <p className="hint">
                  In VR, point at a panel and use the thumbstick: left and right
                  for back and next, up and down for distance. Hold grip to move
                  a panel. The thumbnail wall opens the selected item in the
                  active panel.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
