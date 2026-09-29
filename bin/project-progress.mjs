#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { initialize, projectRoot, readBoard } from '../src/storage.mjs';
import { refresh } from '../src/collect.mjs';
import { startServer } from '../src/server.mjs';

function option(name, fallback) { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; }
function usage() { process.stdout.write('Usage: project-progress <init|serve|refresh|doctor> --project PATH [--port 4180]\n'); }
async function projectName(root) {
  try { const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')); return pkg.name || path.basename(root); }
  catch { return path.basename(root); }
}

try {
  const command = process.argv[2];
  if (!['init', 'serve', 'refresh', 'doctor'].includes(command)) { usage(); process.exitCode = 2; }
  else {
    const root = await projectRoot(option('--project', process.cwd()));
    if (command === 'init') {
      const board = await initialize(root, option('--name', await projectName(root)));
      process.stdout.write(`已为 ${board.project.name} 建立独立数据：${root}/.progress-observatory/board.json\n`);
    } else if (command === 'doctor') {
      const board = await readBoard(root);
      process.stdout.write(`项目 ${board.project.name} · ${board.checkpoints.length} 项检查点 · 数据有效\n`);
    } else if (command === 'refresh') {
      await readBoard(root);
      const result = await refresh(root);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      await readBoard(root);
      const port = Number(option('--port', 4180));
      await startServer(root, port);
    }
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
