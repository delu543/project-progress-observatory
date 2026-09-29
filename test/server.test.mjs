import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { initialize } from '../src/storage.mjs';
import { startServer } from '../src/server.mjs';

async function freePort() {
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

test('the local API rejects cross-origin writes and stale revisions, then saves valid project data', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'progress-board-http-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  await initialize(root, 'HTTP test');
  const port = await freePort();
  const server = await startServer(root, port);
  t.after(async () => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${port}`;
  const [boot, board] = await Promise.all([fetch(`${base}/api/boot`).then((r) => r.json()), fetch(`${base}/api/board`).then((r) => r.json())]);
  const edit = structuredClone(board); edit.project.outcome = 'A real project result';
  const payload = JSON.stringify({ board: edit, revision: board.revision });
  const invalidHost = await new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port, path: '/api/board', headers: { Host: 'evil.example' } }, (response) => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject);
  });
  assert.equal(invalidHost, 403);
  const missingToken = await fetch(`${base}/api/board`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: payload });
  assert.equal(missingToken.status, 403);
  const crossOrigin = await fetch(`${base}/api/board`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Board-CSRF': boot.csrf, Origin: 'https://evil.example' }, body: payload });
  assert.equal(crossOrigin.status, 403);
  const headers = { 'Content-Type': 'application/json', 'X-Board-CSRF': boot.csrf };
  const saved = await fetch(`${base}/api/board`, { method: 'PUT', headers, body: payload });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).project.outcome, 'A real project result');
  assert.equal((await fetch(`${base}/api/board`, { method: 'PUT', headers, body: payload })).status, 409);
  const invalid = structuredClone(edit); invalid.checkpoints[0].status = 'local_verified';
  assert.equal((await fetch(`${base}/api/board`, { method: 'PUT', headers, body: JSON.stringify({ board: invalid, revision: 2 }) })).status, 400);
  assert.equal((await fetch(`${base}/api/board`, { method: 'PUT', headers, body: 'null' })).status, 400);
  const recovered = structuredClone(edit); recovered.project.summary = 'Still writable';
  assert.equal((await fetch(`${base}/api/board`, { method: 'PUT', headers, body: JSON.stringify({ board: recovered, revision: 2 }) })).status, 200);
});
