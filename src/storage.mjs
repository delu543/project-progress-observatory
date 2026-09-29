import { readFile, writeFile, mkdir, rename, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createBoard, validateBoard } from './model.mjs';

export const DATA_DIR = '.progress-observatory';
export async function projectRoot(input) { return realpath(path.resolve(input)); }
export function boardPath(root) { return path.join(root, DATA_DIR, 'board.json'); }
export function runtimePath(root) { return path.join(root, DATA_DIR, 'runtime.json'); }

export async function readBoard(root) {
  const board = JSON.parse(await readFile(boardPath(root), 'utf8'));
  const errors = validateBoard(board, root);
  if (errors.length) throw new Error(`Invalid board: ${errors.join('; ')}`);
  return board;
}

export async function initialize(root, name) {
  const dir = path.join(root, DATA_DIR);
  await mkdir(dir, { recursive: true });
  const board = createBoard(name, root);
  const handle = await open(boardPath(root), 'wx', 0o600);
  try { await handle.writeFile(`${JSON.stringify(board, null, 2)}\n`); }
  finally { await handle.close(); }
  await writeFile(path.join(dir, '.gitignore'), '*\n', { flag: 'wx' }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
  return board;
}

export async function writeBoard(root, board, expectedRevision) {
  const current = await readBoard(root);
  if (current.revision !== expectedRevision) return { conflict: true, current };
  if (!board || typeof board !== 'object' || Array.isArray(board) || !board.project) {
    const error = new Error('invalid board object'); error.code = 'BOARD_VALIDATION'; throw error;
  }
  const candidate = structuredClone(board);
  candidate.project.id = current.project.id;
  candidate.project.path = root;
  candidate.revision = current.revision + 1;
  candidate.updatedAt = new Date().toISOString();
  const errors = validateBoard(candidate, root);
  if (errors.length) { const error = new Error(errors.join('; ')); error.code = 'BOARD_VALIDATION'; throw error; }
  const temporary = `${boardPath(root)}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(candidate, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await rename(temporary, boardPath(root));
  return { conflict: false, board: candidate };
}

export async function readRuntime(root) {
  try { return JSON.parse(await readFile(runtimePath(root), 'utf8')); }
  catch { return null; }
}

export async function writeRuntime(root, runtime) {
  const temporary = `${runtimePath(root)}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(runtime, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, runtimePath(root));
}
