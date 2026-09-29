# Security model

- Run the server on a trusted local machine. It listens only on `127.0.0.1` and expects the exact loopback `Host`.
- The server serves four fixed static paths and three fixed read endpoints. It cannot read arbitrary paths from the URL.
- `PUT /api/board` accepts only JSON, a same-origin request, a process-local anti-CSRF token and the current revision. It validates the board before atomically replacing its own file.
- The generated `.progress-observatory` directory ignores its records by default. Do not remove that rule without reviewing private paths, notes and task summaries.
- Codex scanning is optional. It opens the Codex SQLite index read-only, restricts task working directories to the chosen project, and reads at most 512 KiB per matched task per scan. Summaries are truncated and redact common credential patterns. This is defense in depth, not a guarantee that arbitrary user-authored assistant text contains no secrets; review before sharing a screenshot or export.
- There is no cloud relay, telemetry, login, external model call, Git push, deployment command or project business-code write.
- A reverse proxy or remote tunnel would change the security boundary and needs authentication and a separate review.
