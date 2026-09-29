# Capability map

| Capability | Status | Evidence / boundary |
| --- | --- | --- |
| Separate project data | active | `init` writes only the selected project's hidden data directory; server fixes one project root. |
| Plain-language overview and three-phase progress | active | Nine editable, initially unreviewed checkpoints; verified count requires version, environment and evidence. |
| Local Git and Codex task discovery | active | Git read-only; Codex optional and project-scoped. Task activity does not change acceptance. |
| Live browser refresh | active | SSE while page connected; 10-second local collection, 2-second board-file check. |
| Browser editing and Codex request drafts | active | Atomic board save and editable copyable request; no automatic external send. |
| GitHub/CI/deployment remote status | not implemented | User may record evidence manually. No hidden claim of remote monitoring. |
| Direct message delivery to Codex | not implemented | No stable public thread-send API exposed to this local web app. |

No existing capability was removed in this new standalone repository. Existing project dashboards and product code remain separate.
