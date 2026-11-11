import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createNasHandler} from './nas.mjs';

import path from 'node:path';

// Set VIEWING_ROOM_ORIGIN to the address the headset opens, e.g. https://<this computer's LAN IP>:8080.
const origin = process.env.VIEWING_ROOM_ORIGIN || 'https://localhost:8080';
const originHost = new URL(origin).host;
const port = Number(process.env.VIEWING_ROOM_PORT) || 8080;
const backendPort = Number(process.env.VIEWING_ROOM_BACKEND_PORT) || 8443;
// Network shares are off unless explicitly enabled.
const sharesEnabled = /^(1|true|on|yes)$/i.test(process.env.VIEWING_ROOM_NETWORK_SHARES || '');
// Optional: serve shares from local mounts instead of Windows SMB. A share \\host\name maps to
// <VIEWING_ROOM_SHARE_MOUNTS>/<name>.
const shareMounts = process.env.VIEWING_ROOM_SHARE_MOUNTS;
const workDir = new URL('../work/', import.meta.url);
fs.mkdirSync(workDir, {recursive: true});
const tokenFile=new URL('session.key',workDir);
let token;try{token=fs.readFileSync(tokenFile,'utf8').trim();}catch{token=randomBytes(32).toString('hex');fs.writeFileSync(tokenFile,token,{mode:0o600});}
const authenticated = req => req.headers.cookie?.split(';').some(c => c.trim() === 'viewing-room=' + token);
const shares = sharesEnabled ? createNasHandler({configFile:new URL('share-connections.json',workDir),origin,authenticate:authenticated,
  connectShare: shareMounts ? async () => ({encrypted:null}) : undefined,
  resolveRoot: shareMounts ? root => {
    const name = /^\\\\[^\\]+\\([^\\/]+)$/.exec(root)?.[1];
    if (!name || name === '.' || name === '..') throw Error('This share is not mounted on the server.');
    return path.join(shareMounts, name);
  } : undefined}) : null;
// With shares disabled the app sees an empty, disabled connection list.
async function nas(req, res) {
  if (shares) return shares(req, res);
  if (!req.url?.startsWith('/__nas/')) return false;
  const disabled = req.method === 'GET' && req.url.split('?')[0] === '/__nas/connections';
  res.writeHead(disabled ? 200 : 404, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
  res.end(JSON.stringify(disabled ? {connections: [], enabled: false} : {error: 'Network shares are disabled on this server.'}));
  return true;
}
const cert = fs.readFileSync(new URL('../work/tls/cert.pem', import.meta.url));
const key = fs.readFileSync(new URL('../work/tls/key.pem', import.meta.url));
const backend = new https.Agent({ca: cert, keepAlive: true, maxSockets: 32});
const hopHeaders = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade'];
function endToEndHeaders(headers) {
  const clean = {...headers};
  const connectionNames = String(clean.connection || '').split(',').map(name => name.trim().toLowerCase());
  for (const name of [...hopHeaders, ...connectionNames]) delete clean[name];
  return clean;
}

const plain = http.createServer((req, res) => {
  const path = req.url?.startsWith('/') ? req.url : '/';
  res.writeHead(307, {
    Location: origin + path,
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
  });
  res.end('Opening Viewing Room over HTTPS.');
});

// Headset diagnostics from lib/vr-trace.ts, one JSON line per batch.
const perfDir = new URL('perf/', workDir);
function recordPerf(req, res) {
  if (!authenticated(req)) {
    res.writeHead(403).end();
    return;
  }
  const chunks = [];
  let size = 0;
  req.on('data', chunk => {
    size += chunk.length;
    if (size > 4 * 1024 * 1024) req.destroy();
    else chunks.push(chunk);
  });
  req.on('end', () => {
    try {
      const batch = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      fs.mkdirSync(perfDir, {recursive: true});
      fs.appendFileSync(new URL(new Date().toISOString().slice(0, 10) + '.jsonl', perfDir),
        JSON.stringify({received: Date.now(), ...batch}) + '\n');
      res.writeHead(204).end();
    } catch {
      res.writeHead(400).end();
    }
  });
}

const secure = https.createServer({key, cert}, async (req, res) => {
  if (req.method === 'POST' && req.url === '/__perf') return recordPerf(req, res);
  if(await nas(req,res))return;
  if(req.url==='/'||req.url?.startsWith('/?'))res.setHeader('Set-Cookie','viewing-room='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict');
  const headers = endToEndHeaders(req.headers);
  headers.host = originHost;
  headers['x-forwarded-proto'] = 'https';
  headers['x-forwarded-host'] = originHost;
  const upstream = https.request({
    hostname: '127.0.0.1', port: backendPort, servername: 'localhost',
    method: req.method, path: req.url, headers, agent: backend,
  }, response => {
    const responseHeaders = endToEndHeaders(response.headers);
    if (typeof responseHeaders.location === 'string') {
      responseHeaders.location = responseHeaders.location.replace(/^https:\/\/[^/]+:8443(?=\/|$)/, origin);
    }
    res.writeHead(response.statusCode || 502, responseHeaders);
    response.on('error', error => res.destroy(error));
    response.pipe(res);
  });
  upstream.setTimeout(120_000, () => upstream.destroy(new Error('Backend timeout')));
  upstream.on('error', error => {
    console.error('Viewing Room backend error:', error.code || error.message);
    if (!res.headersSent) {
      res.writeHead(502, {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'});
      res.end('Viewing Room server is temporarily unavailable.');
    } else res.destroy(error);
  });
  req.on('aborted', () => upstream.destroy());
  req.on('error', error => upstream.destroy(error));
  res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
  req.pipe(upstream);
});
secure.on('tlsClientError', error => console.error('TLS handshake:', error.code));

const entry = net.createServer(socket => {
  socket.setTimeout(15_000, () => socket.destroy());
  socket.on('error', () => {});
  socket.once('data', chunk => {
    socket.pause();
    socket.setTimeout(0);
    socket.unshift(chunk);
    if (chunk[0] === 22) secure.emit('connection', socket);
    else {
      plain.emit('connection', socket);
      socket.resume();
    }
  });
});
entry.listen(port, '0.0.0.0', () => console.log(`Viewing Room entry: ${origin} (HTTP also supported)`));
entry.on('error', error => { console.error(error); process.exitCode = 1; });
