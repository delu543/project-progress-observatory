import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createBoard, progress, validateBoard } from '../src/model.mjs';
import { initialize, readBoard, writeBoard } from '../src/storage.mjs';

test('each project gets distinct private board data and cannot overwrite another project', async (t) => {
  const first = await mkdtemp(path.join(tmpdir(), 'progress-board-a-'));
  const second = await mkdtemp(path.join(tmpdir(), 'progress-board-b-'));
  t.after(async () => { await rm(first, { recursive: true, force: true }); await rm(second, { recursive: true, force: true }); });
  const a = await initialize(first, 'Alpha');
  const b = await initialize(second, 'Beta');
  assert.notEqual(a.project.id, b.project.id);
  assert.equal((await readBoard(first)).project.name, 'Alpha');
  assert.equal((await readBoard(second)).project.name, 'Beta');
  await assert.rejects(initialize(first, 'Replacement'), { code: 'EEXIST' });
  const edit = structuredClone(a); edit.project.name = 'Alpha changed';
  assert.equal((await writeBoard(first, edit, a.revision)).board.project.name, 'Alpha changed');
  assert.equal((await readBoard(second)).project.name, 'Beta');
  assert.equal((await writeBoard(first, edit, a.revision)).conflict, true);
});

test('a checkpoint needs evidence, version, environment and the current clean commit to count', () => {
  const board = createBoard('Example', '/example');
  const item = board.checkpoints[0];
  item.status = 'local_verified';
  assert.match(validateBoard(board, '/example').join(' '), /requires evidence/);
  item.evidence = ['targeted test passed']; item.verifiedVersion = 'abc123'; item.verifiedEnvironment = 'local';
  assert.deepEqual(validateBoard(board, '/example'), []);
  const clean = { git: { head: 'abc1230000', changedFiles: 0, stale: false } };
  assert.equal(progress(board, clean).verified, 1);
  assert.equal(progress(board, { git: { ...clean.git, changedFiles: 1 } }).verified, 0);
  assert.equal(progress(board, { git: { ...clean.git, head: 'def4560000' } }).rows[0].needsReview, true);
  assert.equal(progress(board, { git: { ...clean.git, stale: true } }).verified, 0);
});
