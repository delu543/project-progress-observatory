import { randomUUID } from 'node:crypto';

export const phases = [
  { id: 'upstream', title: '上游 · 目标与方案', description: '明确用户结果、范围、风险与依赖。' },
  { id: 'midstream', title: '中游 · 开发实现', description: '完成必要实现并保留可恢复的工作状态。' },
  { id: 'downstream', title: '下游 · 开发验收', description: '核对版本、测试证据与交付边界。' }
];

const initial = [
  ['U01', 'upstream', '明确项目目标', '记录用户真正要得到的结果与验收条件。'],
  ['U02', 'upstream', '核对现状和风险', '盘点现有代码、资料与尚未验证的判断。'],
  ['U03', 'upstream', '确定实施边界', '明确负责人、依赖、版本和不可突破的约束。'],
  ['M01', 'midstream', '实现核心路径', '让关键用户流程具备可运行实现。'],
  ['M02', 'midstream', '处理已确认问题', '沿根因修复阻断流程的缺陷。'],
  ['M03', 'midstream', '维护恢复与数据边界', '核对故障恢复、权限和数据一致性。'],
  ['D01', 'downstream', '完成定向回归', '用与变更相关的测试核对实现。'],
  ['D02', 'downstream', '验证真实使用路径', '在目标环境检查用户能否实际完成任务。'],
  ['D03', 'downstream', '固定交付版本', '将代码、部署与验收证据对应到同一版本。']
];

export function createBoard(name, projectPath) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    project: { id: randomUUID(), name, path: projectPath, summary: '', outcome: '' },
    revision: 1,
    updatedAt: now,
    phases,
    checkpoints: initial.map(([id, phase, title, outcome]) => ({
      id, phase, title, outcome, status: 'unreviewed', owner: '', next: '',
      evidence: [], verifiedVersion: '', verifiedEnvironment: '', updatedAt: now
    })),
    issues: [],
    taskMappings: {},
    notes: ''
  };
}

const clean = (value, max = 4000) => typeof value === 'string' && value.length <= max;
const required = (value, max) => clean(value, max) && value.trim().length > 0;
const statuses = new Set(['unreviewed', 'planned', 'doing', 'blocked', 'local_verified', 'real_verified', 'delivered']);
export function validateBoard(board, projectPath) {
  const errors = [];
  if (!board || typeof board !== 'object' || Array.isArray(board)) return ['board must be an object'];
  if (board.schemaVersion !== 1) errors.push('unsupported schemaVersion');
  if (!Number.isInteger(board.revision) || board.revision < 1) errors.push('invalid revision');
  if (!board.project || !required(board.project.name, 120) || !clean(board.project.summary) || !clean(board.project.outcome)) errors.push('invalid project');
  if (board.project?.path !== projectPath) errors.push('project path does not match this server');
  if (!Array.isArray(board.phases) || board.phases.length !== 3 || board.phases.some((phase, i) => phase.id !== phases[i].id)) errors.push('phases must retain three fixed layers');
  if (!Array.isArray(board.checkpoints) || board.checkpoints.length > 100) errors.push('invalid checkpoints');
  else {
    const ids = new Set();
    for (const item of board.checkpoints) {
      if (!item || !required(item.id, 40) || !/^[A-Za-z0-9_-]+$/.test(item.id) || ids.has(item.id)) errors.push('duplicate or invalid checkpoint id');
      ids.add(item?.id);
      if (!phases.some((phase) => phase.id === item.phase) || !required(item.title, 160) || !required(item.outcome, 4000) || !statuses.has(item.status) || !clean(item.owner, 160) || !clean(item.next) || !clean(item.verifiedVersion, 200) || !clean(item.verifiedEnvironment, 200)) errors.push(`invalid checkpoint ${item.id}`);
      if (!Array.isArray(item.evidence) || item.evidence.length > 20 || item.evidence.some((e) => !clean(e, 1000))) errors.push(`invalid evidence ${item.id}`);
      if (['local_verified', 'real_verified', 'delivered'].includes(item.status) && (!item.evidence.length || !item.verifiedVersion || !item.verifiedEnvironment)) errors.push(`verified checkpoint ${item.id} requires evidence, version and environment`);
    }
  }
  if (!Array.isArray(board.issues) || board.issues.length > 200) errors.push('invalid issues');
  else {
    const ids = new Set();
    for (const item of board.issues) {
      if (!item || !required(item.id, 40) || !/^[A-Za-z0-9_-]+$/.test(item.id) || ids.has(item.id) || !required(item.title, 160) || !clean(item.impact) || !clean(item.next) || !clean(item.evidence, 4000) || !['open', 'doing', 'resolved', 'unverified'].includes(item.status)) errors.push('invalid issue');
      ids.add(item?.id);
    }
  }
  if (!board.taskMappings || typeof board.taskMappings !== 'object' || Array.isArray(board.taskMappings)) errors.push('invalid taskMappings');
  else for (const [id, map] of Object.entries(board.taskMappings)) if (!/^[0-9a-f-]{20,64}$/i.test(id) || !map || !clean(map.role, 160) || !phases.some((phase) => phase.id === map.phase)) errors.push('invalid task mapping');
  if (!clean(board.notes, 10000)) errors.push('invalid notes');
  return errors;
}

export function progress(board, runtime) {
  const head = runtime?.git?.head;
  const rows = board.checkpoints.map((item) => {
    const versionMatches = item.verifiedVersion && head && head.startsWith(item.verifiedVersion);
    const verified = ['local_verified', 'real_verified', 'delivered'].includes(item.status) && item.evidence.length > 0 && Boolean(versionMatches) && runtime?.git?.changedFiles === 0 && !runtime?.git?.stale;
    return { ...item, verified: Boolean(verified), needsReview: ['local_verified', 'real_verified', 'delivered'].includes(item.status) && !verified };
  });
  const counts = Object.fromEntries(phases.map((phase) => [phase.id, { total: rows.filter((row) => row.phase === phase.id).length, verified: rows.filter((row) => row.phase === phase.id && row.verified).length }]));
  return { rows, counts, total: rows.length, verified: rows.filter((row) => row.verified).length };
}
