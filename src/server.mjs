import http from 'node:http';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readBoard, readRuntime, writeBoard } from './storage.mjs';
import { refresh } from './collect.mjs';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const staticRoutes = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']]
]);

function send(response, status, body, type = 'application/json; charset=utf-8') {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  response.writeHead(status, {
    'Content-Type': type, 'Content-Length': bytes.length, 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
  });
  response.end(bytes);
}

async function bodyJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 512 * 1024) throw new Error('request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function startServer(root, port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('port must be 1024–65535');
  const csrf = randomBytes(24).toString('hex');
  const clients = new Set();
  let timers = [], collecting = false, boardStamp = '', saving = Promise.resolve();
  const broadcast = (event, data = {}) => {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const response of clients) {
      if (!response.write(message)) { clients.delete(response); response.destroy(); }
    }
    if (!clients.size) stopTimers();
  };
  const collect = async () => {
    if (collecting) return;
    collecting = true;
    try { const result = await refresh(root); broadcast('runtime', { at: result.refreshedAt }); }
    catch { broadcast('collector-error', { message: '采集失败，上次快照保留。' }); }
    finally { collecting = false; }
  };
  const checkBoard = async () => {
    try {
      const info = await stat(path.join(root, '.progress-observatory', 'board.json'));
      const next = `${info.mtimeMs}:${info.size}`;
      if (boardStamp && next !== boardStamp) broadcast('board', { at: new Date().toISOString() });
      boardStamp = next;
    } catch { /* read endpoint reports the exact error */ }
  };
  function stopTimers() { for (const timer of timers) clearInterval(timer); timers = []; }
  function startTimers() {
    if (timers.length) return;
    void collect(); void checkBoard();
    timers = [setInterval(collect, 10000), setInterval(checkBoard, 2000), setInterval(() => broadcast('heartbeat'), 20000)];
  }

  const server = http.createServer(async (request, response) => {
    const expected = `127.0.0.1:${port}`;
    if (request.headers.host !== expected) { send(response, 403, { error: 'invalid host' }); return; }
    if (request.headers.origin && request.headers.origin !== `http://${expected}`) { send(response, 403, { error: 'invalid origin' }); return; }
    const pathname = new URL(request.url || '/', `http://${expected}`).pathname;
    try {
      if (request.method === 'GET' && pathname === '/api/events') {
        if (clients.size >= 12) { send(response, 503, { error: 'too many clients' }); return; }
        response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Content-Type-Options': 'nosniff' });
        response.write('retry: 3000\n\n');
        clients.add(response);
        response.on('close', () => { clients.delete(response); if (!clients.size) stopTimers(); });
        startTimers();
        return;
      }
      if (request.method === 'GET' && pathname === '/api/board') { send(response, 200, await readBoard(root)); return; }
      if (request.method === 'GET' && pathname === '/api/runtime') { send(response, 200, await readRuntime(root) || { stale: true, git: {}, codex: { tasks: [] } }); return; }
      if (request.method === 'GET' && pathname === '/api/boot') { send(response, 200, { csrf, projectPath: root, localSeconds: 10 }); return; }
      if (request.method === 'PUT' && pathname === '/api/board') {
        if (request.headers['x-board-csrf'] !== csrf || !request.headers['content-type']?.startsWith('application/json')) { send(response, 403, { error: 'invalid write request' }); return; }
        const input = await bodyJson(request);
        if (!input || !Number.isInteger(input.revision) || !input.board) { send(response, 400, { error: 'invalid board request' }); return; }
        const result = await (saving = saving.catch(() => {}).then(() => writeBoard(root, input?.board, input?.revision)));
        if (result.conflict) send(response, 409, { error: 'board changed; reload before saving', currentRevision: result.current.revision });
        else { send(response, 200, result.board); broadcast('board', { at: result.board.updatedAt }); }
        return;
      }
      if (request.method === 'GET' && staticRoutes.has(pathname)) {
        const [file, type] = staticRoutes.get(pathname);
        send(response, 200, await readFile(path.join(publicDir, file)), type);
        return;
      }
      send(response, 404, { error: 'not found' });
    } catch (error) {
      send(response, error instanceof SyntaxError || error.message === 'request too large' || error.code === 'BOARD_VALIDATION' ? 400 : 503, { error: error.message.slice(0, 240) });
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  await collect();
  process.stdout.write(`项目进度看板：http://127.0.0.1:${port}/\n项目数据：${root}/.progress-observatory/\nCtrl-C 关闭。\n`);
  const shutdown = () => { stopTimers(); for (const response of clients) response.end(); clients.clear(); server.close(); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
  return server;
}
