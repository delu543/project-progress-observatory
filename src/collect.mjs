import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRuntime, writeRuntime } from './storage.mjs';

const scanner = fileURLToPath(new URL('./codex-scan.py', import.meta.url));
const codexHome = process.env.CODEX_HOME || path.join(homedir(), '.codex');
let scanCache = {};

async function run(command, args, input = '', timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'ignore'] });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('timeout')); }, timeoutMs);
    child.on('error', reject);
    child.stdout.on('data', (chunk) => { output += chunk; if (output.length > 1024 * 1024) child.kill(); });
    child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve(output.trim()) : reject(new Error(`${command} exited ${code}`)); });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

export async function collectGit(root, previous = null) {
  try {
    const [head, branch, porcelain, remote] = await Promise.all([
      run('git', ['-C', root, 'rev-parse', 'HEAD']),
      run('git', ['-C', root, 'branch', '--show-current']),
      run('git', ['-C', root, 'status', '--porcelain=v1', '--untracked-files=normal']),
      run('git', ['-C', root, 'remote', 'get-url', 'origin']).catch(() => '')
    ]);
    return { head, branch: branch || '(detached)', changedFiles: porcelain ? porcelain.split('\n').length : 0, remoteConfigured: Boolean(remote), lastSuccessAt: new Date().toISOString(), stale: false, source: '本机 Git；不自动访问远端' };
  } catch {
    return { ...(previous || {}), stale: true, error: 'Git 采集暂不可用；保留上次数据。' };
  }
}

export async function collectCodex(root, previous = null) {
  const db = path.join(codexHome, 'state_5.sqlite');
  const sessionsRoot = path.join(codexHome, 'sessions');
  try {
    await access(db); await access(sessionsRoot);
    const result = JSON.parse(await run('python3', [scanner], JSON.stringify({ config: { database: db, roots: [root], sessionsRoot }, previous: scanCache }), 10000));
    if (result.stale) throw new Error('stale');
    scanCache = result.cache;
    delete result.cache;
    return result;
  } catch {
    return { ...(previous || { tasks: [] }), stale: true, error: '本机 Codex 索引不可用；任务活动不参与进度计数。' };
  }
}

export async function refresh(root) {
  const old = await readRuntime(root);
  const [git, codex] = await Promise.all([collectGit(root, old?.git), collectCodex(root, old?.codex)]);
  const runtime = { schemaVersion: 1, projectPath: root, refreshedAt: new Date().toISOString(), git, codex };
  await writeRuntime(root, runtime);
  return runtime;
}
