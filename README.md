# Project Progress Observatory / 项目进度观测台

A local, project-scoped development dashboard. It shows product outcomes, upstream/midstream/downstream checkpoints, Git state, and optional Codex task activity. **Activity never becomes an accepted checkpoint automatically.**

一个可在任意本地项目中使用的轻量看板。每个项目保存自己的目标和验收记录；页面实时刷新本机 Git 与可识别的 Codex 任务活动，开发验收仍需填写版本、环境和证据。

## 运行要求 / Requirements

- Node.js 20 or newer. No `npm install` is needed.
- Git is recommended for version-aware progress.
- Optional: Python 3.9+ and a local Codex desktop/CLI index for task discovery. Without them, manual checkpoints and Git views still work.

## 三步启动 / Quick start

```bash
git clone https://github.com/delu543/project-progress-observatory.git
node project-progress-observatory/bin/project-progress.mjs init --project /absolute/path/to/your-project
node project-progress-observatory/bin/project-progress.mjs serve --project /absolute/path/to/your-project --port 4180
```

Open `http://127.0.0.1:4180/`. Use `Ctrl-C` in the terminal to stop it. To check the data file without opening a page:

```bash
node project-progress-observatory/bin/project-progress.mjs doctor --project /absolute/path/to/your-project
node project-progress-observatory/bin/project-progress.mjs refresh --project /absolute/path/to/your-project
```

`init` creates only `<project>/.progress-observatory/board.json` and a `.gitignore` inside that directory. It refuses to overwrite an existing board. The local data file starts with nine **unreviewed** checkpoints as editable prompts, not demonstration progress. Open **项目设置** to describe the user outcome, then edit checkpoints with owners, next actions and evidence. The board never writes to your project's business code or database.

For two projects, run `init` in each and start two servers on different ports. Each server reads and writes only its selected project data directory; its Codex scan is scoped to tasks whose working directory is inside that project. The board program repository contains no user's project data.

## What the board does

- **Product view:** plain-language outcome, next work, issues, and three development layers.
- **Evidence-aware progress:** checkpoints count only when their status is verified, they include evidence/version/environment, the current Git commit matches, and the working tree is clean. Old evidence remains visible as needing review. This conservative rule can undercount unaffected work; it avoids implying a new candidate was tested when it was not.
- **Live local refresh:** while a visible browser page is connected, the server checks Git and local Codex tasks about every 10 seconds and pushes changes with Server-Sent Events. It notices `board.json` edits about every 2 seconds. Closing the page stops periodic collection; reopening refreshes. `refresh` works manually without the server.
- **Codex tasks:** optional read-only discovery of user-visible local tasks. A new task appears as unclassified until you map it to a phase. Recent assistant progress is a status hint, not proof that a task is currently executing or that acceptance passed.
- **Useful requests:** each checkpoint, issue, or task can generate an editable Codex instruction containing project goal, version, evidence and desired result. Copy it into the relevant Codex conversation. The public web app does not have a reliable API for sending directly to an existing Codex thread; it never claims a copied message was delivered.
- **Local editing:** project description, checkpoints, issues and task mappings are edited in the browser. Saves are atomic and reject stale revisions. The data remains editable as JSON.

## Data and privacy

The server binds only `127.0.0.1`, checks the `Host` and write origin, serves only fixed routes, and writes only the selected project's board/runtime files. Browser edits require a session token and matching revision. It has no arbitrary command execution, file browser, account, telemetry, or third-party API call. Git collection does not fetch or push. The optional Codex scanner reads its local SQLite index in read-only mode and a bounded section of matching session logs; it displays a short sanitized assistant progress summary, not raw prompts, reasoning, or tool output. Do not expose the local port through a proxy without adding authentication.

The generated data directory is ignored by its own `.gitignore`, so local paths and private notes are not accidentally committed. If you deliberately share a board, review and redact it first.

## Technical approach and reuse

The implementation uses Node's built-in HTTP server and browser `EventSource`, following [Node HTTP documentation](https://nodejs.org/api/http.html) and [MDN's SSE guide](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events). Periodic polling is used instead of relying on filesystem watch events, whose portability is limited in [Node's file-system documentation](https://nodejs.org/api/fs.html). We reviewed larger self-hosted dashboards such as [Dashy](https://github.com/lissy93/dashy) and local file-based task tools such as [Pillar](https://github.com/nqn/pillar); their complete accounts/widgets/task systems are outside this tool's project-scoped job, so no third-party code was copied.

## Development

```bash
npm test
npm run check
```

See [capability map](docs/CAPABILITY_MAP.md) and [security notes](docs/SECURITY.md). Source is MIT licensed.

### Known limits

The program does not infer a project's product goal, acceptance, deployment state, or test success from a commit. The user supplies those facts. Codex task discovery depends on the local Codex index format and task working directory; if unsupported, the board marks the source stale and continues. Remote GitHub, CI, and deployment verification are intentionally absent in v1; their status should be recorded with evidence rather than guessed from local Git.
