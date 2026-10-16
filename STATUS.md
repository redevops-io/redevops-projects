# Status

| | |
|---|---|
| Maturity | alpha / reference: P1 UI shell (of P1-P10) |
| Version | 0.1.0 in `package.json` (`private: true`); no tags or releases |
| Last git activity | 2026-10-13 (`git log -1 --format=%cs`; clone is shallow) |
| Activity | active: 29 commits between 2026-07-15 and 2026-10-15 (GitHub API) |
| Licence file | `LICENSE.md` ("SEE LICENSE IN LICENSE.md" in `package.json`) |

## Where Projects runs today

The Projects capability is served by `agentic-os` (`agentic_os/projects_api.py`, "Projects UI + API"); a hosted reference is listed in the agentic-os README at <https://demo.redevops.io/projects>. This repo is the separate front-end shell.

## Supported

- App shell (nav rail, project selector, topbar), context-aware Sidekick panel, `DataClient` seam with `MockDataClient` (standalone) and `HttpDataClient` (`VITE_PROJECTS_API`), Overview wired from the client.
- `npm install`, `npm run dev`, `npm test`, `npm run typecheck`, `npm run build`.

## Not supported / not established

- P2-P10 (Mission projections, Attention, Apps, Workflows, Discovery, Overview composition, Activity, the end-to-end demo, packaging) are not done per the README.
- No bundled backend; behaviour of the hosted demo is not verified here.

## Known issues

- The README's "P1" status text may lag the code: `src/views/` has views and tests for Missions, Workflows, Attention, Discovery, Apps, Activity and others; their completeness was not assessed (to be confirmed by maintainers).
- Before this change the README did not say that the product capability lives in agentic-os.
- Licence: see `LICENSE.md`.
