// Serves the game on every local interface so phones and other computers
// on the same Wi-Fi can open it.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg'
};

function lanAddresses() {
  const ips = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const net of entries || []) {
      const v4 = net.family === 'IPv4' || net.family === 4;
      if (v4 && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

function fileFor(url) {
  const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const abs = path.resolve(ROOT, rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  return abs;
}

function handle(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' });
    res.end('Method not allowed');
    return;
  }

  let file;
  try {
    file = fileFor(req.url || '/');
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }
  if (!file) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': 'no-cache'
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(file).pipe(res);
  });
}

function announce(port) {
  console.log(`This computer:  http://localhost:${port}`);
  const ips = lanAddresses();
  if (ips.length === 0) {
    console.log('No other network address found. Connect to Wi-Fi, then restart.');
  }
  for (const ip of ips) {
    console.log(`Same Wi-Fi:     http://${ip}:${port}`);
  }
}

function listenFrom(port, triesLeft) {
  const target = http.createServer(handle);
  target.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && triesLeft > 1) {
      listenFrom(port + 1, triesLeft - 1);
      return;
    }
    console.error(err.code === 'EADDRINUSE'
      ? `Ports ${PORT}–${port} are in use.`
      : err.message);
    process.exit(1);
  });
  target.listen(port, HOST, () => announce(port));
}

listenFrom(PORT, 20);
