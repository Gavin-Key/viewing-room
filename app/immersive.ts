import * as THREE from 'three';
import { PacedVideoTexture } from '@/lib/paced-video-texture';
import {
  createLoadGuard,
  loadSnapshot,
  setLoadPressure,
} from '@/lib/load-pressure';
import { trimMediaCache } from '@/lib/media-preload';
import { driveMediaFrames, setImmersiveClock } from '@/lib/media-frame';
import { eyeUV, eyeAspect } from '@/lib/xr-layout';
import { startTrace, stopTrace, trace, traceFrame } from '@/lib/vr-trace';
import { concealed } from '@/lib/away-reset';
import { isHorizontalSwipe } from '@/lib/swipe';
import { naturalCompare, type PanelState as Panel } from '@/lib/viewer-model';
import { childFolders, type MenuSection } from '@/lib/menu-model';
import {
  MENU_HEIGHT,
  MENU_WIDTH,
  buildMenu,
  hitControl,
  type Control,
  type MenuLayout,
} from '@/lib/vr-menu';
import { PX_PER_M, paintMenu, paintPill } from '@/lib/vr-menu-paint';
import { drawIcon, type IconName } from '@/lib/vr-icons';
type Item = {
  id: string;
  name: string;
  folder: string;
  url: string;
  video: boolean;
};
export type XRBridge = {
  snapshot: () => {
    panels: Panel[];
    playing: boolean;
    active: number;
    items: Item[];
    folders: string[];
    folder: string;
    // Media directly in the current folder, newest first.
    folderItems: readonly Item[];
    folderStereo: string;
    distance: number;
    zoom: number;
    layout: string;
    wallItems: Item[];
    wallPage: number;
    wallPages: number;
    scrolling: boolean;
  };
  play: () => void;
  arrangement: (layout: string) => void;
  wallPage: (direction: number) => void;
  scroll: () => void;
  assign: (id: number, folder: string) => void;
  assignAll: (folder: string) => void;
  folderFormat: (folder: string, stereo: string) => void;
  folderName: (path: string) => string;
  add: () => void;
  remove: (id: number) => void;
  view: (patch: Partial<{ distance: number; zoom: number }>) => void;
  select: (id: number) => void;
  next: (id: number) => void;
  previous: (id: number) => void;
  patch: (id: number, patch: Partial<Panel>) => void;
  folder: (path: string) => void;
  ended: () => void;
};

export async function startImmersive(session: XRSession, bridge: XRBridge) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  renderer.xr.setFramebufferScaleFactor(1);
  renderer.setSize(16, 16);
  renderer.domElement.className = 'xr-output';
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#090d10');
  const camera = new THREE.PerspectiveCamera(65, 1, 0.05, 50);
  const root = new THREE.Group();
  scene.add(root);
  const mediaGroup = new THREE.Group();
  root.add(mediaGroup);
  const wallGroup = new THREE.Group();
  root.add(wallGroup);
  const menuGroup = new THREE.Group();
  root.add(menuGroup);
  const dock = new THREE.Group();
  root.add(dock);
  dock.position.set(0, -0.52, -2);
  const raycaster = new THREE.Raycaster();
  raycaster.layers.enableAll();
  const rotation = new THREE.Matrix4();
  let menuOpen = false,
    menuSection: MenuSection = 'panels',
    libraryPage = 0;
  let menuSignature = '',
    panelSignature = '',
    initialized = false,
    cleaned = false;
  type Surface = {
    group: THREE.Group;
    source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
    texture: THREE.Texture | null;
    meshes: THREE.Mesh[];
    id: number;
    stereo: string;
    ratio: number;
    key: string;
    label: THREE.Texture | null;
    frame?: string;
    lastUpload?: number;
    angle: number;
    audio: THREE.Mesh;
    audioLabel: string;
    pin: THREE.Mesh;
    pinned: boolean;
  };
  const surfaces: Surface[] = [];
  const placements = new Map<
    number,
    { position: THREE.Vector3; quaternion: THREE.Quaternion; distance: number }
  >();
  const grabs = new Map<THREE.Group, { id: number; offset: THREE.Matrix4 }>();
  const grabMatrix = new THREE.Matrix4();
  const textures = new Set<THREE.Texture>();
  // The library can hold thousands of items; index it once per change rather
  // than scanning it for every panel on every XR frame.
  let itemIndex = { items: [] as Item[], byId: new Map<string, Item>() };
  const itemById = (items: Item[], id: string | null | undefined) => {
    if (itemIndex.items !== items)
      itemIndex = { items, byId: new Map(items.map((m) => [m.id, m])) };
    return id ? itemIndex.byId.get(id) : undefined;
  };
  const disposeGroup = (group: THREE.Group) => {
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of materials) {
          if ('map' in m && m.map instanceof THREE.Texture) {
            m.map.dispose();
            textures.delete(m.map);
          }
          m.dispose();
        }
      }
    });
    group.clear();
  };
  function label(text: string, w = 768, h = 128, background = '#26333a') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
    ctx.font = '500 ' + Math.round(h * 0.32) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#edf4f7';
    let title = text;
    while (ctx.measureText(title).width > w - 40) title = title.slice(0, -2);
    ctx.fillText(title === text ? title : title + '…', w / 2, h / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    textures.add(texture);
    return texture;
  }
  function audioIcon(muted: boolean) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#172127';
    ctx.beginPath();
    ctx.arc(64, 64, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(26, 51);
    ctx.lineTo(43, 51);
    ctx.lineTo(62, 34);
    ctx.lineTo(62, 94);
    ctx.lineTo(43, 77);
    ctx.lineTo(26, 77);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    if (muted) {
      ctx.moveTo(80, 51);
      ctx.lineTo(103, 77);
      ctx.moveTo(103, 51);
      ctx.lineTo(80, 77);
    } else {
      ctx.arc(62, 64, 29, -0.7, 0.7);
      ctx.moveTo(62 + Math.cos(-0.7) * 44, 64 + Math.sin(-0.7) * 44);
      ctx.arc(62, 64, 44, -0.7, 0.7);
    }
    ctx.stroke();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.add(texture);
    return texture;
  }
  // Corner pin toggle: dim outline while the panel plays on, solid accent
  // while it holds (images stay, videos and GIFs loop).
  function pinIcon(pinned: boolean) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = pinned ? '#b8dc7e' : '#172127';
    ctx.beginPath();
    ctx.arc(64, 64, 62, 0, Math.PI * 2);
    ctx.fill();
    drawIcon(ctx, 'pin', 64, 66, 72, pinned ? '#18230f' : '#ffffff');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.add(texture);
    return texture;
  }
  function setPinIcon(mesh: THREE.Mesh, pinned: boolean) {
    const material = mesh.material as THREE.MeshBasicMaterial;
    if (material.map) {
      textures.delete(material.map);
      material.map.dispose();
    }
    material.map = pinIcon(pinned);
    material.transparent = true;
    material.opacity = pinned ? 0.95 : 0.55;
    material.needsUpdate = true;
  }
  function button(
    parent: THREE.Group,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    action: () => void,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        map: label(text, Math.round((256 * width) / height), 256),
        toneMapped: false,
      }),
    );
    mesh.position.set(x, y, 0.01);
    mesh.userData.action = action;
    parent.add(mesh);
    return mesh;
  }
  // Free-standing rounded controls: the dock and the wall pager.
  const pills: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  function pill(
    parent: THREE.Group,
    text: string,
    icon: IconName | undefined,
    x: number,
    y: number,
    width: number,
    height: number,
    action: () => void,
  ) {
    const canvas = document.createElement('canvas');
    paintPill(canvas, text, icon, width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.add(texture);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        toneMapped: false,
      }),
    );
    mesh.position.set(x, y, 0.01);
    mesh.userData.action = action;
    parent.add(mesh);
    pills.push(mesh);
    return mesh;
  }
  const forgetPills = (group: THREE.Group) => {
    for (let i = pills.length - 1; i >= 0; i--)
      if (pills[i].parent === group) pills.splice(i, 1);
  };
  const summon = pill(dock, 'Menu', 'menu', 0, 0, 0.3, 0.1, () => {
    if (menuOpen) menuOpen = false;
    else openMenu();
  });
  const positionRoot = () => {
    const pose = renderer.xr.getCamera();
    root.position.copy(pose.position);
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(
      pose.quaternion,
    );
    root.rotation.set(0, Math.atan2(-direction.x, -direction.z), 0);
  };

  // The menu is one canvas texture, repainted only when its content changes.
  // Hover feedback is a separate overlay, so pointing never re-uploads it.
  const MENU_DISTANCE = 1.2;
  const menuCanvas = document.createElement('canvas');
  // Size the canvas before the texture exists; texture storage is allocated once.
  menuCanvas.width = Math.round(MENU_WIDTH * PX_PER_M);
  menuCanvas.height = Math.round(MENU_HEIGHT * PX_PER_M);
  const menuTexture = new THREE.CanvasTexture(menuCanvas);
  menuTexture.colorSpace = THREE.SRGBColorSpace;
  menuTexture.minFilter = THREE.LinearMipmapLinearFilter;
  menuTexture.anisotropy = Math.min(
    8,
    renderer.capabilities.getMaxAnisotropy(),
  );
  textures.add(menuTexture);
  const menuMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(MENU_WIDTH, MENU_HEIGHT),
    new THREE.MeshBasicMaterial({
      map: menuTexture,
      transparent: true,
      toneMapped: false,
    }),
  );
  menuGroup.add(menuMesh);
  menuGroup.visible = false;
  let menuLayout: MenuLayout = { controls: [], texts: [], rules: [] },
    menuItems: unknown = null;
  function roundedRect(w: number, h: number, r: number) {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 + r, -h / 2);
    shape.lineTo(w / 2 - r, -h / 2);
    shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    shape.lineTo(w / 2, h / 2 - r);
    shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    shape.lineTo(-w / 2 + r, h / 2);
    shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    shape.lineTo(-w / 2, -h / 2 + r);
    shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    return shape;
  }
  // One hover overlay per controller: a light wash plus a ring that also shows
  // on accent-coloured (selected) controls.
  const hovers = [0, 1].map(() => {
    const group = new THREE.Group();
    const wash = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    const ring = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: '#eef7df',
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    // Transparent objects sort by origin distance; off-centre controls would
    // otherwise sort behind the menu and be painted over.
    wash.renderOrder = ring.renderOrder = 1;
    group.add(wash, ring);
    group.position.z = 0.003;
    group.visible = false;
    menuGroup.add(group);
    return { group, wash, ring, key: '' };
  });
  function showHover(index: number, control: Control | undefined) {
    const hover = hovers[index];
    hover.group.visible = !!control;
    if (!control) return;
    const key = [control.x, control.y, control.w, control.h].join(':');
    if (key === hover.key) return;
    hover.key = key;
    const r = 0.018,
      t = 0.004;
    hover.wash.geometry.dispose();
    hover.wash.geometry = new THREE.ShapeGeometry(
      roundedRect(control.w, control.h, r),
    );
    const outer = roundedRect(control.w + t * 2, control.h + t * 2, r + t);
    outer.holes.push(roundedRect(control.w, control.h, r));
    hover.ring.geometry.dispose();
    hover.ring.geometry = new THREE.ShapeGeometry(outer);
    hover.group.position.x = control.x;
    hover.group.position.y = control.y;
  }
  const menuPoint = new THREE.Vector3();
  function menuControl(intersection: THREE.Intersection | undefined) {
    if (!menuOpen || intersection?.object !== menuMesh) return undefined;
    menuPoint.copy(intersection.point);
    menuMesh.worldToLocal(menuPoint);
    return hitControl(menuLayout, menuPoint.x, menuPoint.y);
  }
  // Summoned menus appear straight ahead, then stay put in the world.
  function openMenu(section?: MenuSection) {
    if (section) menuSection = section;
    menuOpen = true;
    const pose = renderer.xr.getCamera();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
      pose.quaternion,
    );
    forward.y = 0;
    if (forward.lengthSq() < 1e-4) forward.set(0, 0, -1);
    forward.normalize();
    root.updateMatrixWorld(true);
    const target = pose.position
      .clone()
      .addScaledVector(forward, MENU_DISTANCE)
      .setY(pose.position.y - 0.08);
    menuGroup.position.copy(root.worldToLocal(target));
    menuGroup.rotation.set(
      0,
      Math.atan2(-forward.x, -forward.z) - root.rotation.y,
      0,
    );
  }
  function drawMenu() {
    menuGroup.visible = menuOpen;
    if (!menuOpen) return;
    const s = bridge.snapshot();
    const p = s.panels.find((p) => p.id === s.active) || s.panels[0];
    const showing = p?.media ? itemById(s.items, p.media)?.name : null;
    const signature = JSON.stringify([
      menuSection,
      libraryPage,
      s.active,
      s.playing,
      s.panels.map((v) => [
        v.id,
        v.stereo,
        v.pinned,
        v.seconds,
        v.sourceFolder,
        v.order,
        v.includeSubfolders,
        v.historyIndex,
      ]),
      showing,
      s.folder,
      s.folderStereo,
      s.folders.length,
      s.distance,
      s.zoom,
      s.layout,
      s.wallPage,
      s.wallPages,
      s.scrolling,
    ]);
    if (signature === menuSignature && menuItems === s.folderItems) return;
    menuSignature = signature;
    menuItems = s.folderItems;
    const panel = p;
    menuLayout = buildMenu(
      {
        section: menuSection,
        page: libraryPage,
        playing: s.playing,
        panels: s.panels,
        active: panel.id,
        showing: showing || null,
        folder: s.folder,
        folderName: bridge.folderName,
        entries: [
          ...childFolders(s.folders, s.folder, naturalCompare).map((path) => ({
            kind: 'folder' as const,
            path,
            name: path.split('/').pop() || path,
          })),
          ...(s.folder ? s.folderItems : []).map((m) => ({
            kind: m.video ? ('video' as const) : ('image' as const),
            id: m.id,
            name: m.name,
          })),
        ],
        fileCount: s.folder ? s.folderItems.length : 0,
        folderStereo: s.folderStereo,
        distance: s.distance,
        zoom: s.zoom,
        layout: s.layout,
        wallPage: s.wallPage,
        wallPages: s.wallPages,
        scrolling: s.scrolling,
      },
      {
        section: (section) => {
          menuSection = section;
        },
        close: () => {
          menuOpen = false;
        },
        play: bridge.play,
        exit: () => {
          void session.end();
        },
        page: (page) => {
          libraryPage = page;
        },
        open: (path) => {
          bridge.folder(path);
          libraryPage = 0;
        },
        show: (id) => {
          bridge.patch(panel.id, { media: id, cycle: panel.cycle + 1 });
          menuOpen = false;
        },
        folderFormat: (stereo) => bridge.folderFormat(s.folder, stereo),
        assign: () => {
          bridge.assign(panel.id, s.folder);
          menuOpen = false;
        },
        assignAll: () => {
          bridge.assignAll(s.folder);
          menuOpen = false;
        },
        select: bridge.select,
        add: bridge.add,
        remove: bridge.remove,
        previous: () => bridge.previous(panel.id),
        next: () => bridge.next(panel.id),
        patch: (patch) => bridge.patch(panel.id, patch),
        source: () => {
          if (panel.sourceFolder) bridge.folder(panel.sourceFolder);
          menuSection = 'library';
          libraryPage = 0;
        },
        view: bridge.view,
        arrangement: bridge.arrangement,
        recenter: positionRoot,
        wallPage: bridge.wallPage,
        scroll: bridge.scroll,
      },
    );
    paintMenu(menuCanvas, menuLayout, PX_PER_M);
    menuTexture.needsUpdate = true;
    for (const hover of hovers) hover.key = '';
  }

  function createPanels() {
    const s = bridge.snapshot();
    const signature = s.panels
      .map((p) => p.id + ':' + p.stereo + ':' + (p.generation || 0))
      .join(',');
    if (signature === panelSignature) return;
    panelSignature = signature;
    disposeGroup(mediaGroup);
    surfaces.length = 0;
    const span = Math.min(1.6, s.panels.length * 0.5),
      width = 2 * Math.tan(span / (s.panels.length * 2)) * 2.2 * 0.985;
    s.panels.forEach((p, i) => {
      const angle = ((i - (s.panels.length - 1) / 2) * span) / s.panels.length;
      const group = new THREE.Group();
      group.position.set(Math.sin(angle) * 2.2, 0, -Math.cos(angle) * 2.2);
      group.rotation.y = -angle;
      mediaGroup.add(group);
      const meshes: THREE.Mesh[] = [];
      for (let eye = 0; eye < (p.stereo === 'mono' ? 1 : 2); eye++) {
        const geometry = new THREE.PlaneGeometry(width, width / 1.5);
        const uv = geometry.attributes.uv;
        const crop = eyeUV(p.stereo, eye as 0 | 1);
        for (let n = 0; n < uv.count; n++)
          uv.setXY(
            n,
            crop.x + uv.getX(n) * crop.w,
            crop.y + uv.getY(n) * crop.h,
          );
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
        );
        if (p.stereo !== 'mono') mesh.layers.set(eye + 1);
        mesh.userData.action = () => {
          bridge.select(p.id);
          openMenu('panels');
        };
        group.add(mesh);
        meshes.push(mesh);
      }
      const audio = button(group, '', 0, 0, 0.075, 0.075, () => {
        const panel = bridge.snapshot().panels.find((v) => v.id === p.id);
        if (panel) {
          const video = document.querySelector(
            `[data-panel-id="${p.id}"] [data-current-media="true"] video`,
          ) as HTMLVideoElement | null;
          if (video) video.muted = panel.muted === false;
          bridge.patch(p.id, { muted: panel.muted === false });
        }
      });
      const audioMaterial = audio.material as THREE.MeshBasicMaterial;
      if (audioMaterial.map) {
        textures.delete(audioMaterial.map);
        audioMaterial.map.dispose();
      }
      audioMaterial.map = audioIcon(true);
      audioMaterial.transparent = true;
      audioMaterial.opacity = 0.55;
      audio.visible = false;
      const pin = button(group, '', 0, 0, 0.075, 0.075, () => {
        const panel = bridge.snapshot().panels.find((v) => v.id === p.id);
        if (panel) bridge.patch(p.id, { pinned: !panel.pinned });
      });
      setPinIcon(pin, false);
      pin.visible = false;
      surfaces.push({
        audio,
        audioLabel: 'Unmute',
        pin,
        pinned: false,
        group,
        source: null,
        texture: null,
        meshes,
        id: p.id,
        stereo: p.stereo,
        ratio: 1.5,
        key: '',
        label: null,
        angle: i - (s.panels.length - 1) / 2,
      });
    });
  }
  function syncMedia(time: number) {
    let newTexture: Record<string, unknown> | undefined,
      animatedUpload:
        | { panel: number; kind?: string; draw: number }
        | undefined;
    const settings = bridge.snapshot();
    let uploaded = false;
    const interval = loadSnapshot().frames ? 1000 / 15 : 1000 / 30;
    const animated = surfaces
      .filter(
        (s) =>
          time - (s.lastUpload ?? -Infinity) >= interval &&
          ((s.texture instanceof PacedVideoTexture && s.texture.pendingFrame) ||
            (s.source instanceof HTMLCanvasElement &&
              s.source.dataset.still !== 'true' &&
              s.frame !== s.source.dataset.frame)),
      )
      .sort(
        (a, b) => (a.lastUpload ?? -Infinity) - (b.lastUpload ?? -Infinity),
      )[0];
    for (const surface of surfaces) {
      const panel = settings.panels.find((p) => p.id === surface.id);
      const distance = panel?.distance ?? settings.distance;
      const panelWidth = (surface.meshes[0].geometry as THREE.PlaneGeometry)
        .parameters.width;
      const angle =
        (surface.angle *
          2 *
          Math.atan((panelWidth * settings.zoom) / (2 * settings.distance))) /
        0.985;
      surface.group.position.set(
        Math.sin(angle) * distance,
        0,
        -Math.cos(angle) * distance,
      );
      surface.group.rotation.y = -angle;
      const placement = placements.get(surface.id);
      if (placement) {
        // Preserve a hand-placed layout while keeping thumbstick depth control.
        placement.position.multiplyScalar(distance / placement.distance);
        placement.distance = distance;
        surface.group.position.copy(placement.position);
        surface.group.quaternion.copy(placement.quaternion);
      }
      surface.group.scale.setScalar(settings.zoom);
      surface.audio.visible = !!itemById(settings.items, panel?.media)?.video;
      const audioText = panel?.muted === false ? 'Mute' : 'Unmute';
      if (surface.audioLabel !== audioText) {
        const material = surface.audio.material as THREE.MeshBasicMaterial;
        if (material.map) {
          textures.delete(material.map);
          material.map.dispose();
        }
        material.map = audioIcon(audioText === 'Unmute');
        material.needsUpdate = true;
        surface.audioLabel = audioText;
      }
      const imageMesh = surface.meshes[0],
        geometry = imageMesh.geometry as THREE.PlaneGeometry;
      surface.audio.position.set(
        (geometry.parameters.width * imageMesh.scale.x) / 2 - 0.045,
        (geometry.parameters.height * imageMesh.scale.y) / 2 - 0.045,
        0.025,
      );
      surface.pin.visible = !!panel?.media;
      if (surface.pinned !== !!panel?.pinned) {
        surface.pinned = !!panel?.pinned;
        setPinIcon(surface.pin, surface.pinned);
      }
      surface.pin.position.set(
        -(geometry.parameters.width * imageMesh.scale.x) / 2 + 0.045,
        (geometry.parameters.height * imageMesh.scale.y) / 2 - 0.045,
        0.025,
      );

      const container = document.querySelector(
        `[data-panel-id="${surface.id}"] [data-current-media="true"]`,
      );
      let source = container?.querySelector(
        'video,img,canvas',
      ) as Surface['source'];
      if (
        source instanceof HTMLCanvasElement &&
        source.dataset.ready !== 'true'
      )
        source = null;
      const width =
        source instanceof HTMLVideoElement
          ? source.videoWidth
          : source instanceof HTMLImageElement
            ? source.naturalWidth
            : source?.width || 0;
      const height =
        source instanceof HTMLVideoElement
          ? source.videoHeight
          : source instanceof HTMLImageElement
            ? source.naturalHeight
            : source?.height || 0;
      const key = source ? source.tagName + ':' + width + ':' + height : '';
      if (
        source &&
        width &&
        height &&
        (source !== surface.source || key !== surface.key)
      ) {
        if (uploaded) continue;
        uploaded = true;
        const created = performance.now();
        surface.texture?.dispose();
        if (surface.texture) textures.delete(surface.texture);
        surface.source = source;
        surface.key = key;
        let texture: THREE.Texture;
        if (source instanceof HTMLVideoElement)
          texture = new PacedVideoTexture(
            source,
            renderer.capabilities.maxTextureSize,
          );
        else if (source instanceof HTMLCanvasElement)
          texture = new THREE.CanvasTexture(source);
        else {
          const resized = document.createElement('canvas');
          const scale = Math.min(
            1,
            Math.min(
              renderer.capabilities.maxTextureSize,
              surface.stereo.startsWith('sbs') ? 4096 : 2048,
            ) / Math.max(width, height),
          );
          resized.width = Math.max(1, Math.round(width * scale));
          resized.height = Math.max(1, Math.round(height * scale));
          resized
            .getContext('2d')!
            .drawImage(source, 0, 0, resized.width, resized.height);
          texture = new THREE.CanvasTexture(resized);
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter =
          source instanceof HTMLCanvasElement && source.dataset.still === 'true'
            ? THREE.LinearMipmapLinearFilter
            : THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps =
          source instanceof HTMLCanvasElement &&
          source.dataset.still === 'true';
        texture.anisotropy = Math.min(
          8,
          renderer.capabilities.getMaxAnisotropy(),
        );
        textures.add(texture);
        surface.texture = texture;
        if (texture instanceof PacedVideoTexture) texture.uploadFrame();
        newTexture = {
          panel: surface.id,
          kind: source.tagName.toLowerCase(),
          width,
          height,
          canvas:
            texture instanceof PacedVideoTexture
              ? !texture.isVideoTexture
              : true,
          mipmaps: texture.generateMipmaps,
          create: performance.now() - created,
        };
        surface.lastUpload = time;
        if (source instanceof HTMLCanvasElement)
          surface.frame = source.dataset.frame;
        const aspect = eyeAspect(width / height, surface.stereo);
        surface.ratio = aspect;
        for (const mesh of surface.meshes) {
          (mesh.material as THREE.MeshBasicMaterial).map = texture;
          (mesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
          const width = (mesh.geometry as THREE.PlaneGeometry).parameters.width;
          const scale = Math.min(1, 1.6 / (width / aspect));
          mesh.scale.set(scale, (1.5 / aspect) * scale, 1);
        }
      } else if (
        (!source || !width || !height) &&
        (!surface.source || container?.querySelector('[role="alert"]'))
      ) {
        const message =
          container?.querySelector('[role="alert"]')?.textContent ||
          'Panel ' + surface.id + ' · Loading…';
        if (surface.key !== message) {
          surface.texture?.dispose();
          if (surface.texture) textures.delete(surface.texture);
          surface.texture = label(message);
          surface.key = message;
          surface.source = null;
          for (const mesh of surface.meshes) {
            (mesh.material as THREE.MeshBasicMaterial).map = surface.texture;
            (mesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
          }
        }
      }
    }
    // New sources take precedence; otherwise update just one animated panel.
    const surface = animated;
    if (!uploaded && surface?.texture) {
      const started = performance.now();
      if (surface.source instanceof HTMLCanvasElement) {
        surface.frame = surface.source.dataset.frame;
        surface.texture.needsUpdate = true;
      } else if (surface.texture instanceof PacedVideoTexture) {
        surface.texture.uploadFrame();
      }
      animatedUpload = {
        panel: surface.id,
        kind: surface.source?.tagName.toLowerCase(),
        draw: performance.now() - started,
      };
      surface.lastUpload = time;
    }
    return { newTexture, animatedUpload };
  }

  let wallSignature = '',
    wallGeneration = 0,
    wallElapsed = 0,
    lastWallTime = 0;
  const wallTargets: THREE.Object3D[] = [];
  const pendingImages = new Set<HTMLImageElement>();
  function syncWall(time: number) {
    const state = bridge.snapshot(),
      active = state.layout === 'wall';
    mediaGroup.visible = !active;
    wallGroup.visible = active;
    if (!active) {
      if (wallSignature) {
        wallGeneration++;
        forgetPills(wallGroup);
        disposeGroup(wallGroup);
        wallTargets.length = 0;
        wallSignature = '';
        for (const image of pendingImages) image.src = '';
        pendingImages.clear();
      }
      lastWallTime = time;
      wallElapsed = 0;
      return;
    }
    const signature =
      state.wallItems.map((m) => m.id).join('|') + ':' + state.wallPage;
    if (signature !== wallSignature) {
      wallSignature = signature;
      wallElapsed = 0;
      wallGeneration++;
      const generation = wallGeneration;
      for (const image of pendingImages) image.src = '';
      pendingImages.clear();
      forgetPills(wallGroup);
      disposeGroup(wallGroup);
      wallTargets.length = 0;
      state.wallItems.slice(0, 12).forEach((item, index) => {
        const width = 0.62,
          height = 0.42;
        const mesh = button(
          wallGroup,
          item.video ? 'VIDEO: ' + item.name : item.name,
          ((index % 3) - 1) * 0.66,
          0.7 - Math.floor(index / 3) * 0.47,
          width,
          height,
          () => {
            const current = bridge.snapshot(),
              panel =
                current.panels.find((p) => p.id === current.active) ||
                current.panels[0];
            bridge.patch(panel.id, { media: item.id, cycle: panel.cycle + 1 });
            bridge.arrangement('row');
          },
        );
        wallTargets.push(mesh);
        if (item.video || /\.(gif|webp|avif)$/i.test(item.name)) return;
        const image = new Image();
        pendingImages.add(image);
        image.onload = () => {
          pendingImages.delete(image);
          if (cleaned || generation !== wallGeneration) return;
          const canvas = document.createElement('canvas');
          canvas.width = 768;
          canvas.height = 512;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#11191e';
          ctx.fillRect(0, 0, 768, 512);
          const scale = Math.min(
            768 / image.naturalWidth,
            460 / image.naturalHeight,
          );
          ctx.drawImage(
            image,
            (768 - image.naturalWidth * scale) / 2,
            (460 - image.naturalHeight * scale) / 2,
            image.naturalWidth * scale,
            image.naturalHeight * scale,
          );
          ctx.fillStyle = '#fff';
          ctx.font = '24px sans-serif';
          ctx.fillText(item.name.slice(0, 50), 12, 497);
          const texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = Math.min(
            8,
            renderer.capabilities.getMaxAnisotropy(),
          );
          const material = mesh.material as THREE.MeshBasicMaterial;
          if (material.map) {
            material.map.dispose();
            textures.delete(material.map);
          }
          material.map = texture;
          material.needsUpdate = true;
          textures.add(texture);
          image.src = '';
        };
        image.onerror = () => {
          pendingImages.delete(image);
        };
        image.src = item.url;
      });
      const previous = pill(
        wallGroup,
        'Previous',
        'chevron-left',
        -0.62,
        -1.3,
        0.4,
        0.1,
        () => bridge.wallPage(-1),
      );
      const next = pill(
        wallGroup,
        'Next',
        'chevron-right',
        0.62,
        -1.3,
        0.4,
        0.1,
        () => bridge.wallPage(1),
      );
      const menu = pill(wallGroup, 'Menu', 'menu', 0, -1.3, 0.4, 0.1, () =>
        openMenu('view'),
      );
      wallTargets.push(previous, next, menu);
    }
    if (state.scrolling && !menuOpen) {
      wallElapsed += Math.min(100, time - lastWallTime);
      if (wallElapsed >= 10000) {
        wallElapsed = 0;
        bridge.wallPage(1);
      }
    }
    lastWallTime = time;
    wallGroup.position.set(
      0,
      state.scrolling ? (wallElapsed / 10000) * 0.45 : 0,
      -Math.max(1.2, state.distance),
    );
  }
  const controllers = [
    renderer.xr.getController(0),
    renderer.xr.getController(1),
  ];
  function hit(controller: THREE.Group) {
    rotation.extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rotation);
    return raycaster.intersectObjects(
      menuOpen
        ? [menuMesh, summon]
        : bridge.snapshot().layout === 'wall'
          ? [summon, ...wallTargets]
          : [
              summon,
              ...surfaces.flatMap((s) => [
                ...s.meshes,
                ...(s.audio.visible ? [s.audio] : []),
                ...(s.pin.visible ? [s.pin] : []),
              ]),
            ],
      false,
    )[0];
  }
  for (const controller of controllers) {
    scene.add(controller);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(0, 0, -1),
      ]),
      new THREE.LineBasicMaterial({ color: '#bfdc93' }),
    );
    line.scale.z = 3;
    controller.add(line);
    controller.addEventListener('connected', (event) => {
      controller.userData.inputSource = event.data;
    });
    controller.addEventListener('disconnected', () => {
      grabs.delete(controller);
      controller.userData.inputSource = null;
    });

    let swipeStart: { id: number; yaw: number; pitch: number } | null = null;
    controller.addEventListener('selectstart', () => {
      if (grabs.has(controller)) return;
      const target = hit(controller)?.object;
      const surface =
        !menuOpen &&
        surfaces.find((s) => s.meshes.includes(target as THREE.Mesh));
      swipeStart = surface
        ? {
            id: surface.id,
            yaw: Math.atan2(
              raycaster.ray.direction.x,
              -raycaster.ray.direction.z,
            ),
            pitch: Math.asin(raycaster.ray.direction.y),
          }
        : null;
    });
    controller.addEventListener('select', () => {
      if (grabs.has(controller)) {
        swipeStart = null;
        return;
      }
      const intersection = hit(controller);
      const target = intersection?.object;
      const control = menuControl(intersection);
      const yaw = Math.atan2(
        raycaster.ray.direction.x,
        -raycaster.ray.direction.z,
      );
      const delta = swipeStart ? yaw - swipeStart.yaw : 0;
      if (
        swipeStart &&
        !menuOpen &&
        isHorizontalSwipe(
          Math.atan2(Math.sin(delta), Math.cos(delta)),
          Math.asin(raycaster.ray.direction.y) - swipeStart.pitch,
          0.12,
        )
      )
        bridge.next(swipeStart.id);
      else (control?.action ?? target?.userData.action)?.();
      swipeStart = null;
    });
    controller.addEventListener('squeezestart', () => {
      if (menuOpen || bridge.snapshot().layout === 'wall') return;
      const target = hit(controller)?.object;
      const surface = surfaces.find(
        (s) =>
          s.meshes.includes(target as THREE.Mesh) ||
          s.audio === target ||
          s.pin === target,
      );
      if (!surface || [...grabs.values()].some((g) => g.id === surface.id))
        return;
      swipeStart = null;
      scene.updateMatrixWorld(true);
      grabs.set(controller, {
        id: surface.id,
        offset: controller.matrixWorld
          .clone()
          .invert()
          .multiply(surface.group.matrixWorld),
      });
    });
    controller.addEventListener('squeezeend', () => {
      grabs.delete(controller);
    });
  }
  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    wallGeneration++;
    for (const image of pendingImages) image.src = '';
    pendingImages.clear();
    renderer.setAnimationLoop(null);
    stopTrace();
    setImmersiveClock(false);
    setLoadPressure({ frames: false, memory: false });
    disposeGroup(root);
    for (const c of controllers)
      c.traverse((o) => {
        if (o instanceof THREE.Line) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    for (const texture of textures) texture.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    bridge.ended();
  }
  session.addEventListener('end', cleanup, { once: true });
  const loadGuard = createLoadGuard();
  let lastMemorySample = -Infinity,
    estimatedBytes = 0;
  try {
    await renderer.xr.setSession(session);
    renderer.xr.setFoveation(0);
    setImmersiveClock(true);
    startTrace();
    let lastHeartbeat = 0;
    renderer.setAnimationLoop((time) => {
      const began = performance.now();
      root.visible = !concealed();
      if (time - lastMemorySample > 500) {
        lastMemorySample = time;
        estimatedBytes = 0;
        // Account approximately for canvas backing + GPU copies, and multiple
        // decoded video frames. Browser/driver overhead is not observable here.
        document
          .querySelectorAll('.buffered-panel canvas, .buffered-panel video')
          .forEach((node) => {
            if (node instanceof HTMLVideoElement)
              estimatedBytes += node.videoWidth * node.videoHeight * 4 * 4;
            else if (node instanceof HTMLCanvasElement)
              estimatedBytes += node.width * node.height * 4 * 2;
          });
      }
      if (time - lastHeartbeat > 5000) {
        lastHeartbeat = time;
        trace('state', {
          bytes: Math.round(estimatedBytes / 1048576),
          pressure: loadSnapshot(),
          videos: [
            ...document.querySelectorAll<HTMLVideoElement>(
              '.buffered-panel video',
            ),
          ].map((v) => ({
            panel: v.closest('[data-panel-id]')?.getAttribute('data-panel-id'),
            current: !!v.closest('[data-current-media="true"]'),
            size: v.videoWidth + 'x' + v.videoHeight,
            ready: v.readyState,
            paused: v.paused,
            preload: v.preload,
          })),
        });
      }
      const nextPressure = loadGuard.sample(time, estimatedBytes);
      if (
        (nextPressure.frames || nextPressure.memory) &&
        !(loadSnapshot().frames || loadSnapshot().memory)
      )
        trimMediaCache();
      setLoadPressure(nextPressure);
      if (!initialized) {
        positionRoot();
        initialized = true;
      }
      const setup = performance.now();
      driveMediaFrames(time);
      const clocks = performance.now();
      createPanels();
      const { newTexture, animatedUpload } =
        bridge.snapshot().layout !== 'wall' ? syncMedia(time) : {};
      const synced = performance.now();
      syncWall(time);
      drawMenu();
      scene.updateMatrixWorld(true);
      for (const [controller, grab] of grabs) {
        const surface = surfaces.find((s) => s.id === grab.id);
        if (!surface) {
          grabs.delete(controller);
          continue;
        }
        grabMatrix
          .copy(mediaGroup.matrixWorld)
          .invert()
          .multiply(controller.matrixWorld)
          .multiply(grab.offset);
        grabMatrix.decompose(
          surface.group.position,
          surface.group.quaternion,
          surface.group.scale,
        );
        const state = bridge.snapshot();
        placements.set(surface.id, {
          position: surface.group.position.clone(),
          quaternion: surface.group.quaternion.clone(),
          distance:
            state.panels.find((p) => p.id === surface.id)?.distance ??
            state.distance,
        });
        surface.group.updateMatrixWorld(true);
      }
      for (const p of pills) {
        p.material.color.set('#ffffff');
        p.scale.setScalar(1);
      }
      controllers.forEach((controller, index) => {
        if (grabs.has(controller)) return showHover(index, undefined);
        const intersection = hit(controller);
        const target = intersection?.object;
        const control = menuControl(intersection);
        showHover(index, control);
        const gamepad = (
          controller.userData.inputSource as XRInputSource | undefined
        )?.gamepad;
        const axes = gamepad?.axes;
        const x = axes?.[2] || 0,
          y = axes?.[3] || 0;
        if (Math.abs(x) < 0.25) controller.userData.stickHeld = false;
        const panel = surfaces.find(
          (s) =>
          s.meshes.includes(target as THREE.Mesh) ||
          s.audio === target ||
          s.pin === target,
        );
        const state = bridge.snapshot();
        if (
          Math.abs(x) > 0.65 &&
          Math.abs(x) > Math.abs(y) &&
          !controller.userData.stickHeld
        ) {
          controller.userData.stickHeld = true;
          // In the menu, the stick turns pages of the current list.
          if (menuOpen) {
            if (target === menuMesh) menuLayout.page?.(x > 0 ? 1 : -1);
          } else if (state.layout === 'wall') bridge.wallPage(x > 0 ? 1 : -1);
          else if (panel) {
            if (x > 0) bridge.next(panel.id);
            else bridge.previous(panel.id);
          }
        }
        if (
          !menuOpen &&
          Math.abs(y) > 0.4 &&
          Math.abs(y) > Math.abs(x) &&
          time - (controller.userData.lastDistanceChange || 0) > 100
        ) {
          controller.userData.lastDistanceChange = time;
          if (panel) {
            const current = state.panels.find((p) => p.id === panel.id);
            const distance = Math.max(
              0.7,
              Math.min(
                3,
                (current?.distance ?? state.distance) + Math.sign(y) * 0.08,
              ),
            );
            bridge.patch(panel.id, { distance });
          } else if (state.layout === 'wall')
            bridge.view({
              distance: Math.max(
                0.7,
                Math.min(3, state.distance + Math.sign(y) * 0.08),
              ),
            });
        }

        const hovered = pills.find((p) => p === target);
        if (hovered) {
          hovered.material.color.set('#d9efb4');
          hovered.scale.setScalar(1.05);
        }
      });
      const rendering = performance.now();
      renderer.render(scene, camera);
      const done = performance.now();
      if (newTexture)
        trace('texture', { ...newTexture, render: done - rendering });
      else if (
        animatedUpload &&
        (animatedUpload.draw > 4 || done - rendering > 8)
      )
        trace('upload', { ...animatedUpload, render: done - rendering });
      traceFrame(time, {
        lag: began - time,
        setup: setup - began,
        clocks: clocks - setup,
        sync: synced - clocks,
        input: rendering - synced,
        render: done - rendering,
        total: done - began,
      });
    });
  } catch (error) {
    cleanup();
    await session.end().catch(() => {});
    throw error;
  }
}
