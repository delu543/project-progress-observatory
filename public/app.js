const state = { board: null, runtime: null, csrf: '', view: 'overview', query: '', stream: null };
const $ = (selector) => document.querySelector(selector);
const make = (tag, className = '', value) => { const e = document.createElement(tag); if (className) e.className = className; if (value !== undefined) e.textContent = String(value); return e; };
const statuses = { unreviewed: '待核实', planned: '已规划', doing: '开发中', blocked: '受阻', local_verified: '本地已验', real_verified: '真实环境已验', delivered: '已交付' };
const issueStatuses = { open: '待处理', doing: '处理中', resolved: '已处理', unverified: '待验证' };
const short = (s) => s ? String(s).slice(0, 10) : '未知';
const formatTime = (s) => s ? new Date(s).toLocaleString('zh-CN') : '尚未采集';
const match = (...text) => !state.query || text.join(' ').toLowerCase().includes(state.query.toLowerCase());
const add = (parent, ...children) => { children.forEach((child) => child && parent.append(child)); return parent; };
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); setTimeout(() => $('#toast').classList.remove('visible'), 2600); }
function tag(label, tone = '') { return make('span', `tag ${tone}`, label); }
function button(label, action, className = 'pill-button') { const e = make('button', className, label); e.type = 'button'; e.addEventListener('click', action); return e; }
function section(title, subtitle) { const wrapper = make('section'); const heading = make('div', 'section-title'); const left = make('div'); add(left, make('h2', '', title), make('p', '', subtitle)); heading.append(left); wrapper.append(heading); return { wrapper, heading }; }
function card() { return make('article', 'card'); }
function progressData() {
  const head = state.runtime?.git?.head;
  const dirty = state.runtime?.git?.changedFiles > 0;
  const rows = state.board.checkpoints.map((item) => {
    const checked = ['local_verified', 'real_verified', 'delivered'].includes(item.status);
    const verified = checked && item.evidence.length > 0 && Boolean(head?.startsWith(item.verifiedVersion)) && !dirty && !state.runtime?.git?.stale;
    return { ...item, verified, needsReview: checked && !verified };
  });
  return { rows, total: rows.length, verified: rows.filter((item) => item.verified).length };
}
function phaseStats(rows, id) { const all = rows.filter((x) => x.phase === id); return { total: all.length, verified: all.filter((x) => x.verified).length }; }
function phaseCard(phase, rows) {
  const count = phaseStats(rows, phase.id); const box = card();
  add(box, make('span', 'eyebrow', phase.id), make('h3', '', phase.title), make('p', '', phase.description));
  const track = make('div', 'progress-track'); const fill = make('div', 'progress-fill'); fill.style.width = `${count.total ? count.verified / count.total * 100 : 0}%`; track.append(fill); box.append(track);
  add(box, make('div', 'stat-line', `${count.verified} / ${count.total} 项已核验 · 仅当前干净版本计数`));
  return box;
}
function versionCard() {
  const box = card(); const git = state.runtime?.git || {};
  add(box, make('span', 'eyebrow', 'CURRENT CODE'), make('h3', '', git.stale ? 'Git 状态待核实' : git.branch || '未发现分支'), make('p', '', `当前提交 ${short(git.head)} · ${git.changedFiles ?? '未知'} 个本地改动`), tag(git.stale ? '采集异常' : git.changedFiles ? '工作中快照' : '干净固定版本', git.stale || git.changedFiles ? 'warn' : 'good'));
  return box;
}
function taskCard(task) {
  const mapping = state.board.taskMappings[task.id]; const box = card();
  add(box, tag(mapping?.phase ? state.board.phases.find((p) => p.id === mapping.phase)?.title : '待归类', mapping ? '' : 'warn'), make('h3', '', task.title || '未命名任务'), make('p', '', task.summary || '尚无公开进展说明'), make('div', 'meta', `${task.activity} · ${formatTime(task.eventAt)}`));
  const actions = make('div', 'actions'); actions.style.marginTop = '13px'; add(actions, button('关联阶段', () => editMapping(task)), button('生成 Codex 要求', () => compose({ title: task.title, outcome: mapping?.role || '核实任务职责与阶段', next: '报告当前进展、版本与证据。', id: task.id }))); box.append(actions);
  return box;
}
function checkpointCard(item) {
  const box = card(); box.classList.add('step');
  const left = make('div'); add(left, tag(item.needsReview ? '旧证据待复核' : item.verified ? '当前版本已核验' : statuses[item.status], item.needsReview || item.status === 'blocked' ? 'warn' : item.verified ? 'good' : 'dim'), make('h3', '', `${item.id} · ${item.title}`));
  const right = make('div', 'actions'); add(right, button('编辑', () => editCheckpoint(item)), button('给 Codex 的要求', () => compose(item)));
  add(box, left, right);
  const detail = make('div', 'detail'); add(detail, make('div', '', item.outcome || '尚未填写用户结果'), make('div', '', `负责：${item.owner || '待指定'} · 下一步：${item.next || '待明确'}`));
  if (item.evidence.length) detail.append(make('div', '', `证据：${item.evidence.join('；')}`));
  if (item.verifiedVersion) detail.append(make('div', '', `证据版本 ${short(item.verifiedVersion)} · ${item.verifiedEnvironment || '环境待补'}`));
  box.append(detail); return box;
}
function renderOverview(root) {
  const board = state.board, p = progressData(); const hero = make('section', 'hero'); const intro = make('div');
  add(intro, make('span', 'eyebrow', 'PRODUCT + DEVELOPMENT'), make('h2', '', board.project.name), make('p', '', board.project.outcome || '请在「项目设置」写下这个项目最终要让用户得到什么。检查点和任务会围绕这一结果展示。'));
  const metric = make('div', 'hero-metric'); add(metric, make('strong', '', `${p.verified}/${p.total}`), make('span', '', '当前版本已核验的开发检查点')); add(hero, intro, metric); root.append(hero);
  const s = section('开发走到哪里', '上游、中游、下游分开看；工作中的代码不会自动算完成。'); const grid = make('div', 'grid'); board.phases.forEach((phase) => grid.append(phaseCard(phase, p.rows))); s.wrapper.append(grid); root.append(s.wrapper);
  const work = section('当前版本与任务', 'Git 是自动采集；任务活动来自本机 Codex 只读索引，不能代替验收。'); const workGrid = make('div', 'grid'); workGrid.append(versionCard());
  const tasks = state.runtime?.codex?.tasks || []; tasks.filter((task) => match(task.title, task.summary)).slice(0, 2).forEach((task) => workGrid.append(taskCard(task))); work.wrapper.append(workGrid); root.append(work.wrapper);
  const next = section('接下来先做什么', '优先看明确的下一步与待处理问题。'); const list = make('div', 'grid two');
  const items = p.rows.filter((item) => !item.verified && match(item.title, item.next)).slice(0, 4); items.forEach((item) => list.append(checkpointCard(item))); if (!items.length) list.append(make('div', 'empty', '暂无符合搜索条件的检查点。')); next.wrapper.append(list); root.append(next.wrapper);
  if (board.issues.length) { const problems = section('需要处理的问题', '问题状态与开发进度独立记录。'); const wrap = make('div', 'grid two'); board.issues.filter((x) => x.status !== 'resolved').slice(0, 2).forEach((issue) => wrap.append(issueCard(issue))); problems.wrapper.append(wrap); root.append(problems.wrapper); }
}
function renderStages(root) {
  const p = progressData(); const intro = section('分层开发验收', '已完成、当前、下一步、负责人和证据都落在具体检查点。'); intro.heading.append(button('＋ 新增检查点', () => editCheckpoint(null), 'primary')); root.append(intro.wrapper);
  for (const phase of state.board.phases) {
    const part = section(phase.title, phase.description); const count = phaseStats(p.rows, phase.id); part.heading.append(tag(`${count.verified} / ${count.total} 当前版已核验`)); const list = make('div', 'step-list');
    const items = p.rows.filter((item) => item.phase === phase.id && match(item.title, item.outcome, item.next, item.owner)); items.forEach((item) => list.append(checkpointCard(item)));
    if (!items.length) list.append(make('div', 'empty', '本阶段暂无匹配检查点。')); part.wrapper.append(list); root.append(part.wrapper);
  }
}
function renderTasks(root) {
  const tasks = state.runtime?.codex?.tasks || []; const s = section('Codex 项目任务', '自动发现工作目录在本项目内的可见任务；新窗口先待归类。');
  s.heading.append(tag(state.runtime?.codex?.stale ? '采集不可用，保留上次结果' : `${tasks.length} 个任务`, state.runtime?.codex?.stale ? 'warn' : ''));
  const grid = make('div', 'grid two'); tasks.filter((task) => match(task.title, task.summary, state.board.taskMappings[task.id]?.role)).forEach((task) => grid.append(taskCard(task))); if (!grid.children.length) grid.append(make('div', 'empty', '暂无当前项目 Codex 任务。项目未使用 Codex 时，可继续手动维护检查点。')); s.wrapper.append(grid); root.append(s.wrapper);
  root.append(make('p', 'muted', '只读本机 Codex 索引与近期公开进展；日志可能滞后，不能据此断言任务仍在运行。'));
}
function issueCard(issue) {
  const box = card(); add(box, tag(issueStatuses[issue.status], issue.status === 'open' ? 'warn' : ''), make('h3', '', `${issue.id} · ${issue.title}`), make('p', '', issue.impact || '玩家或用户影响待补'), make('p', '', `下一步：${issue.next || '待明确'}`));
  const actions = make('div', 'actions'); add(actions, button('编辑问题', () => editIssue(issue)), button('给 Codex 的要求', () => compose({ ...issue, outcome: issue.impact, evidence: [issue.evidence] }))); box.append(actions); return box;
}
function renderIssues(root) { const s = section('问题与要求', '记录用户影响、证据和下一步；可直接生成可编辑的 Codex 要求。'); s.heading.append(button('＋ 记录问题', () => editIssue(null), 'primary')); const grid = make('div', 'grid two'); state.board.issues.filter((i) => match(i.title, i.impact, i.next, i.evidence)).forEach((issue) => grid.append(issueCard(issue))); if (!grid.children.length) grid.append(make('div', 'empty', '尚未记录问题。未知不等于没有问题；从证据明确的事项开始添加。')); s.wrapper.append(grid); root.append(s.wrapper); }
function renderSettings(root) { const s = section('这个面板属于谁', '目标和记录保存在当前项目，程序仓库不收集项目数据。'); const box = card(); add(box, make('span', 'eyebrow', 'LOCAL PROJECT'), make('h3', '', state.board.project.name), make('p', '', state.board.project.path), make('p', '', state.board.project.summary || '尚未填写项目介绍。'), make('p', '', `用户结果：${state.board.project.outcome || '待填写'}`), button('编辑项目说明', editProject)); s.wrapper.append(box); root.append(s.wrapper); const info = section('数据与安全边界', '每个项目由自己的 board.json 隔离。'); const details = card(); add(details, make('p', '', '实时刷新仅在页面连接到本机服务时运行。Git 和 Codex 状态是自动观测；目标、问题和验收结论由项目成员填写。'), make('p', '', '面板只绑定 127.0.0.1，不读取任意路径，也不自动向 Codex 发送消息。项目数据目录默认被自身的 .gitignore 排除。')); info.wrapper.append(details); root.append(info.wrapper); }
function render() {
  if (!state.board) return;
  $('#project-side').textContent = state.board.project.name;
  const titles = { overview: '项目进度', stages: '开发阶段', tasks: 'Codex 任务', issues: '问题与要求', settings: '项目设置' }; $('#title').textContent = titles[state.view];
  $('#synced').textContent = `最近采集 ${formatTime(state.runtime?.refreshedAt)}`;
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
  const root = $('#view'); root.replaceChildren(); ({ overview: renderOverview, stages: renderStages, tasks: renderTasks, issues: renderIssues, settings: renderSettings })[state.view](root);
}
async function load() {
  try {
    const [boot, board, runtime] = await Promise.all(['/api/boot', '/api/board', '/api/runtime'].map(async (url) => { const response = await fetch(url); if (!response.ok) throw new Error(`${url}: ${response.status}`); return response.json(); }));
    state.csrf = boot.csrf; state.board = board; state.runtime = runtime; render();
  } catch (error) { $('#view').replaceChildren(make('div', 'empty', `看板暂不可读：${error.message}`)); }
}
async function save(mutator) {
  const candidate = structuredClone(state.board); mutator(candidate);
  const response = await fetch('/api/board', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Board-CSRF': state.csrf }, body: JSON.stringify({ board: candidate, revision: state.board.revision }) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || '保存失败'); state.board = result; render(); toast('已保存到当前项目');
}
function field(label, name, value = '', kind = 'input', options = []) {
  const wrapper = make('label'); wrapper.append(make('span', '', label)); let input;
  if (kind === 'select') { input = make('select'); options.forEach(([id, text]) => { const option = make('option', '', text); option.value = id; input.append(option); }); input.value = value; }
  else { input = make(kind === 'textarea' ? 'textarea' : 'input'); input.value = value; }
  input.name = name; wrapper.append(input); $('#dialog-fields').append(wrapper); return input;
}
function openEditor(kind, title, build, submit) {
  $('#dialog-kind').textContent = kind; $('#dialog-title').textContent = title; $('#dialog-error').textContent = ''; $('#dialog-fields').replaceChildren(); build();
  $('#edit-form').onsubmit = async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.target)); try { await submit(values); $('#editor').close(); } catch (error) { $('#dialog-error').textContent = error.message; } };
  $('#editor').showModal();
}
function editCheckpoint(item) {
  const isNew = !item;
  openEditor('开发检查点', isNew ? '新增检查点' : `编辑 ${item.id}`, () => {
    if (isNew) field('唯一编号（如 U04）', 'id', 'C' + String(state.board.checkpoints.length + 1).padStart(2, '0'));
    field('所属阶段', 'phase', item?.phase || 'upstream', 'select', state.board.phases.map((p) => [p.id, p.title]));
    field('名称', 'title', item?.title || ''); field('用户可见的结果 / 验收条件', 'outcome', item?.outcome || '', 'textarea');
    field('状态', 'status', item?.status || 'unreviewed', 'select', Object.entries(statuses));
    field('负责方', 'owner', item?.owner || ''); field('下一步', 'next', item?.next || '', 'textarea');
    field('证据（一行一条）', 'evidence', item?.evidence.join('\n') || '', 'textarea');
    field('验证时的 Git 提交（短 SHA 或完整 SHA）', 'verifiedVersion', item?.verifiedVersion || '');
    field('验证环境', 'verifiedEnvironment', item?.verifiedEnvironment || '');
  }, async (v) => {
    const id = isNew ? v.id.trim() : item.id; if (!id || (isNew && state.board.checkpoints.some((x) => x.id === id))) throw new Error('检查点编号为空或重复');
    const updated = { id, phase: v.phase, title: v.title.trim(), outcome: v.outcome.trim(), status: v.status, owner: v.owner.trim(), next: v.next.trim(), evidence: v.evidence.split('\n').map((x) => x.trim()).filter(Boolean), verifiedVersion: v.verifiedVersion.trim(), verifiedEnvironment: v.verifiedEnvironment.trim(), updatedAt: new Date().toISOString() };
    await save((board) => { if (isNew) board.checkpoints.push(updated); else board.checkpoints[board.checkpoints.findIndex((x) => x.id === id)] = updated; });
  });
}
function editIssue(item) {
  const isNew = !item;
  openEditor('问题记录', isNew ? '记录一个真实问题' : `编辑 ${item.id}`, () => {
    if (isNew) field('唯一编号（如 I01）', 'id', 'I' + String(state.board.issues.length + 1).padStart(2, '0'));
    field('问题标题', 'title', item?.title || ''); field('用户影响', 'impact', item?.impact || '', 'textarea'); field('证据与版本', 'evidence', item?.evidence || '', 'textarea'); field('下一步', 'next', item?.next || '', 'textarea'); field('状态', 'status', item?.status || 'unverified', 'select', Object.entries(issueStatuses));
  }, async (v) => {
    const id = isNew ? v.id.trim() : item.id; if (!id || (isNew && state.board.issues.some((x) => x.id === id))) throw new Error('问题编号为空或重复');
    const updated = { id, title: v.title.trim(), impact: v.impact.trim(), evidence: v.evidence.trim(), next: v.next.trim(), status: v.status, updatedAt: new Date().toISOString() };
    await save((board) => { if (isNew) board.issues.push(updated); else board.issues[board.issues.findIndex((x) => x.id === id)] = updated; });
  });
}
function editMapping(task) {
  const previous = state.board.taskMappings[task.id];
  openEditor('Codex 任务关联', task.title || task.id, () => { field('所属阶段', 'phase', previous?.phase || 'midstream', 'select', state.board.phases.map((p) => [p.id, p.title])); field('负责的内容', 'role', previous?.role || '', 'textarea'); }, async (v) => save((board) => { board.taskMappings[task.id] = { phase: v.phase, role: v.role.trim() }; }));
}
function editProject() { openEditor('项目说明', '项目目标', () => { field('项目名称', 'name', state.board.project.name); field('项目介绍', 'summary', state.board.project.summary, 'textarea'); field('用户最终得到什么', 'outcome', state.board.project.outcome, 'textarea'); field('备注', 'notes', state.board.notes, 'textarea'); }, async (v) => save((board) => { board.project.name = v.name.trim(); board.project.summary = v.summary.trim(); board.project.outcome = v.outcome.trim(); board.notes = v.notes.trim(); })); }
function compose(item) {
  const git = state.runtime?.git || {}; const evidence = Array.isArray(item.evidence) ? item.evidence.filter(Boolean).join('；') : (item.evidence || '待补');
  $('#request-text').value = `请在当前项目中处理以下事项。\n\n项目：${state.board.project.name}\n项目目标：${state.board.project.outcome || '待确认'}\n事项：${item.id || ''} ${item.title || ''}\n预期用户结果：${item.outcome || item.impact || '待确认'}\n当前状态：${statuses[item.status] || issueStatuses[item.status] || '待核实'}\n下一步：${item.next || '先核实根因和当前版本'}\n证据：${evidence || '待补'}\n本地版本：${git.head || '未知'}（${git.changedFiles ?? '未知'} 个改动）\n\n请先核对最新代码和适用范围，复用已有成果；说明拟改动、验证方法、实际结果和未验证项。不要把日志活动或旧版本测试当成当前验收通过。`;
  $('#composer').showModal();
}
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.view; render(); window.scrollTo(0, 0); }));
$('#search').addEventListener('input', (e) => { state.query = e.target.value.trim(); render(); });
$('#reload').addEventListener('click', load);
$('#close-dialog').addEventListener('click', () => $('#editor').close()); $('#cancel-dialog').addEventListener('click', () => $('#editor').close());
$('#close-composer').addEventListener('click', () => $('#composer').close());
$('#copy-request').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#request-text').value); toast('已复制；请在目标 Codex 对话中粘贴发送'); } catch { toast('复制失败，请手动选择文本'); } });
function connect() {
  if (document.hidden || state.stream || !window.EventSource) return;
  state.stream = new EventSource('/api/events');
  state.stream.onopen = () => { $('#connection').textContent = '自动更新中'; $('#connection-dot').classList.add('live'); };
  state.stream.onerror = () => { $('#connection').textContent = '连接中断，正在重连'; $('#connection-dot').classList.remove('live'); };
  state.stream.addEventListener('board', load); state.stream.addEventListener('runtime', load);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { state.stream?.close(); state.stream = null; $('#connection').textContent = '页面未显示，采集暂停'; $('#connection-dot').classList.remove('live'); } else { load(); connect(); } });
await load(); connect();
