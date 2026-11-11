# Viewing Room

A WebXR image and video gallery viewer for Meta Quest, which also runs in a desktop browser. Pick a folder, then watch it as several floating panels in VR, each running its own slideshow. Stereo (side-by-side and top-bottom) images and videos work too.

It runs entirely on your own machine and local network. Nothing is uploaded, and no cloud service or Quest Developer Mode is needed.

## Features

- **Multiple panels.** Each panel has its own timing, order (name, modified date or stable shuffle), stereo format and pin. Images show for a set duration, videos play to the end, and GIFs play one full cycle.
- **Stereo formats.** 2D, SBS, SBS ½, TB and TB ½. The format is saved per folder in browser storage, and subfolders inherit it unless they set their own.
- **Coordinated playback.** "Play in all panels" gives each panel different files. Unseen files come first; after that, the files viewed longest ago are reused.
- **Thumbnail wall.** Shows up to 12 thumbnails at a time, with paging and optional slow scrolling. Selecting one opens it in a viewing panel.
- **One menu for desktop and VR.** Library / Panels / View sections. In VR the menu is a single canvas texture that is repainted only when its content changes.
- **Headset-friendly loading.** Successors preload with a shared queue, video upload size is limited (1920 × 1080 pixels in total), the app backs off when frames run long, and memory use is estimated.
- **Away reset.** If the headset stays off for 30 seconds or more, the viewer starts over when you put it back on.
- **Optional network shares** (off by default, see below).

## VR controls

- Point at a panel and push the thumbstick **right** for the next file or **left** to go back in history. **Up** brings the panel closer and **down** moves it away.
- Hold the **trigger** and sweep sideways to advance.
- **Select** a panel, or press Menu, to open the controls.
- Point at a panel and hold **grip** to move and rotate it. Release to leave it in place.
- The corner **pin** keeps the current file on screen; pinned videos and GIFs loop. The corner **speaker** mutes or unmutes a video.

On desktop, click a panel or press **M** for the menu.

## Requirements

- Node.js 22.13 or newer
- For the headset: a Quest (or another WebXR browser) on the same network as the computer running the server

## Quick start (desktop)

```sh
npm ci
npm run dev
```

Open the printed URL and choose **Open Folder → This device**. Files are read in the browser, and nothing is uploaded.

## Running for a Quest on your LAN

WebXR requires HTTPS, so the headset connects to a small HTTPS entry server (`server/entry.mjs`, port 8080), which proxies to the built app (port 8443).

1. Create a self-signed certificate (it goes in `work/`, which is git-ignored):

   ```sh
   mkdir -p work/tls
   openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
     -subj "/CN=viewing-room" \
     -addext "subjectAltName=IP:<your-computer-LAN-IP>,DNS:localhost" \
     -keyout work/tls/key.pem -out work/tls/cert.pem
   ```

2. Build the app and start the backend:

   ```sh
   npm run build
   npm run start:lan
   ```

3. In a second terminal, start the entry server with the address the headset will open:

   ```sh
   VIEWING_ROOM_ORIGIN=https://<your-computer-LAN-IP>:8080 npm run start:entry
   ```

4. In Quest Browser, open `https://<your-computer-LAN-IP>:8080`, accept the certificate warning once, and choose a folder.

### Entry server settings

| Variable | Default | Purpose |
|---|---|---|
| `VIEWING_ROOM_ORIGIN` | `https://localhost:8080` | Public address of the entry server, used for redirects and origin checks |
| `VIEWING_ROOM_PORT` | `8080` | Port the entry server listens on (HTTP requests are redirected to HTTPS) |
| `VIEWING_ROOM_BACKEND_PORT` | `8443` | Port of the app backend started by `npm run start:lan` |
| `VIEWING_ROOM_NETWORK_SHARES` | off | Set to `1` to enable network shares |
| `VIEWING_ROOM_SHARE_MOUNTS` | unset | Directory of mounted shares (see below) |

The entry server keeps its state in git-ignored `work/`: the session key, TLS files, saved share connections and VR diagnostics.

## Network shares (optional, off by default)

With `VIEWING_ROOM_NETWORK_SHARES=1`, **Open Folder** also lets you save connections to network shares (for example a NAS) and browse them from the headset. When this setting is off, the share routes return nothing and the UI hides the option.

There are two ways to reach a share:

- **Windows SMB.** Add a connection with a path such as `\\NAS\Photos`. Leave the credentials blank to use the computer's existing Windows access. A saved password is encrypted with Windows DPAPI for the current user (`server/smb-connect.ps1`) and is never sent to the browser.
- **Mounted folders (any OS).** Mount your shares yourself (SMB, NFS, SSHFS, …) as subfolders of one directory and set `VIEWING_ROOM_SHARE_MOUNTS` to that directory. A connection to `\\anything\Photos` then serves `<VIEWING_ROOM_SHARE_MOUNTS>/Photos`. Read-only mounts are recommended.

Browsing loads each folder only when you open it. Assigning a share folder to a panel scans its subtree, capped at 3,000 media files or 10,000 entries. Media streams on demand and supports HTTP range requests. Share requests require the entry server's session cookie and a matching origin, and paths cannot escape the share root.

## VR diagnostics

While in VR, the page posts performance traces every 10 seconds to the entry server. The server appends them to `work/perf/YYYY-MM-DD.jsonl` on your machine. The traces include slow frames, long tasks, texture uploads and video lifecycle events. Files are identified by short hashes, not names. Nothing leaves your network.

## Development

```sh
npx tsc --noEmit
node --experimental-strip-types --test tests/*.test.mjs
npm run build
npm run lint
```

The tests cover playback order and history, folder formats, preload queues, load pressure, swipe gestures, eye cropping, share listing, ranges and access boundaries, the VR menu layout and the away reset.

The app is built with React, three.js and [vinext](https://github.com/cloudflare/vinext) (a Vite-based Next.js-compatible framework) and is served locally by Wrangler. See [VR-DESIGN.md](VR-DESIGN.md) for the spatial interaction guidelines it follows.

Desktop checks cannot confirm VR comfort, frame pacing or memory use; testing those takes a real headset.

## License

[MIT](LICENSE)
