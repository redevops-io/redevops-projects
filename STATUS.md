# Status

| | |
|---|---|
| Maturity | alpha / reference: all 12 sections implemented in code (P1-P8 views present); P9/P10 partial |
| Version | 0.1.0 in `package.json` (`private: true`); no tags or releases |
| Last git activity | 2026-10-13 (`git log -1 --format=%cs`; clone is shallow) |
| Activity | active: 29 commits between 2026-07-15 and 2026-10-15 (GitHub API) |
| Licence file | `LICENSE.md` ("SEE LICENSE IN LICENSE.md" in `package.json`) |

## Where Projects runs today

The Projects API is owned and served by `agentic-os` (`agentic_os/projects_api.py`, "Projects UI + API"); a hosted reference is listed in the agentic-os README at <https://demo.redevops.io/projects>. This repo is the UI source (built and vendored into agentic-os).

## Supported

- App shell (nav rail, project selector, topbar), context-aware Sidekick panel, `DataClient` seam with `MockDataClient` (standalone) and `HttpDataClient` (`VITE_PROJECTS_API`), Overview wired from the client.
- `npm install`, `npm run dev`, `npm test`, `npm run typecheck`, `npm run build`.

## Not supported / not established

- Depth of P2-P8 views (Missions, Attention, Apps, Workflows, Discovery, Overview, Activity) against the original spec: not assessed; test suite not re-run for this change.
- `/deployment-inspection` and `/social-intelligence` are called by `HttpDataClient` but not served by agentic-os `projects_api.py` (checked 2026-10-21).
- No bundled backend; behaviour of the hosted demo is not verified here.

## Known issues

- Single source of truth: this repo owns the UI source; `agentic-os/agentic_os/projects_ui/` is a stale vendored build (2026-09-09) and should not be edited. The API is owned by agentic-os.
- Before this change the README did not say that the product capability lives in agentic-os.
- Licence: see `LICENSE.md`.
