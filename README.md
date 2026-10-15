# redevops-projects

[![License: AGPL-3.0 + Commons Clause](https://img.shields.io/badge/License-AGPL--3.0%20%2B%20Commons%20Clause-blue.svg)](LICENSE.md) [![NVIDIA Inception](https://img.shields.io/badge/NVIDIA-Inception%20Program%20Member-76B900.svg)](https://www.nvidia.com/en-us/startups/)

> **🚀 NVIDIA Inception Program Member** — ReDevOps is a member of the NVIDIA Inception Program, supporting startups advancing AI and accelerated computing. Membership provides access to NVIDIA technology, technical resources, and the startup ecosystem. It does not imply product endorsement by NVIDIA.

**What it does.** The React front-end shell for ReDevOps **Projects**, a workspace over the Runtime stack (Missions, Workflows,
Attention, Discovery, Apps, Activity) with a context-aware Sidekick panel. Today it is P1 of a P1-P10 build order: app shell,
Sidekick panel, and a Projects API client; most sections are titled placeholders.

**Who it's for.** Contributors building the Projects UI, and anyone reading how the UI is meant to sit on the agentic-os Projects API.
It is **not** where Projects runs today.

**Maturity: alpha / reference.** `package.json` version 0.1.0 (`"private": true`), no tags or releases. See [STATUS.md](STATUS.md).

**Where Projects runs today.** The working Projects capability is served by
[`agentic-os`](https://github.com/redevops-io/agentic-os), in
[`agentic_os/projects_api.py`](https://github.com/redevops-io/agentic-os/blob/main/agentic_os/projects_api.py) ("Projects UI + API, one origin").
A hosted reference is listed in that repo's README: <https://demo.redevops.io/projects> (a public demo; this repo makes no claim about its behaviour).
This repository's `HttpDataClient` talks to that Projects API; the default `MockDataClient` needs no backend.
Status: **active** (last commit 2026-10-13; 29 commits between 2026-07-15 and 2026-10-15 per the GitHub API).
Questions and bug reports: GitHub Issues ([CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md)).

**3-minute example** (commands match the `package.json` scripts):

```bash
npm install
npm run dev          # standalone with the mock client
npm test             # vitest
```

**Evidence.** The vitest suite (`src/**/*.test.tsx`) and `npm run typecheck`; no benchmark or performance numbers are claimed.
Not run for this documentation change.

**Limitations.** The status text below ("P1") is the maintainers' stated status; `src/views/` also contains views and tests for sections it calls placeholders (Missions, Workflows, Attention, Discovery, Apps, Activity), whose depth was not assessed, so the P1 label may be out of date (to be confirmed). P2-P10 are not built per that text; no live backend is bundled; the UI only reflects what the agentic-os Projects API exposes.
The Sidekick here is the conversational Projects interface, not the `sidekick` coding-agent orchestrator repo.

**Projects** — the persistent human workspace over the ReDevOps Runtime stack. Missions,
Workflows, Attention, Discovery, connected Apps and Activity in one place, with a
context-aware **Sidekick** (the conversational interface). Projects renders Runtime truth;
Sidekick proposes and the Runtime commits.

> Projects = state interface · Sidekick = intent interface. The nav is organised by
> **user concepts, not Runtime names** (Runtime-aware, not Runtime-shaped).

## Status — P1 (shell + data seam)

This is P1 of the build order: the app shell (grouped nav rail, project selector, topbar
`Ask Sidekick ⌘K`), a **context-aware Sidekick** panel, and the **Projects API client** with
its projection contracts. Overview is wired end-to-end from the client; the other sections
are titled placeholders that port from the prototype next (P2–P8).

```
P1  shell · project selector · sidebar · context Sidekick · Projects API client   ← this
P2  Mission projections + detail
P3  Attention projection (cross-runtime queue)
P4  Apps — ProviderSetupGuide · SetupState · credential broker · verify
P5  Workflows — list/detail · logical steps · runs · policy/schedule
P6  Discovery — findings · evidence · cross-links to Missions/workflows
P7  Overview — compose real projections
P8  Activity — cross-runtime event projection
P9  killer demo — WhatsApp → HubSpot → Slack → Stripe through the real UI
P10 package into the Projects + Sidekick install
```

## The data seam

Every view depends only on `DataClient` (`src/data/client.ts`) — never on Runtime
internals — so the backend can evolve without a frontend rewrite:

- **`MockDataClient`** serves sample projections; the app runs standalone with no backend.
- **`HttpDataClient`** talks to the agentic-os **Projects API** (`/api/projects/:id/...`),
  a thin read/action surface over `go_live`, `ProviderSetupGuide`/`verify_setup`, and the
  Mission/Attention/Discovery projections. Set `VITE_PROJECTS_API` to switch to it.

Projection contracts (`src/data/types.ts`) mirror the UI-navigation doc: `ProjectOverview`,
`MissionSummary`, `WorkflowSummary`, `AttentionItem`, `DiscoveryFinding`, `AppCapability`,
`ActivityEvent` — each carrying `source_runtime` + `source_refs` (+ `advanced_refs`) for
drill-down — and the Sidekick `SidekickContext` (`projectId · section · objectRef · tabRef`).

## Develop

```bash
npm install
npm run dev        # standalone with the mock client
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + vite build

# point at a live Projects API:
VITE_PROJECTS_API=http://localhost:8000 npm run dev
```

Licensed AGPL-3.0-or-later with the Commons Clause. See [LICENSE.md](LICENSE.md).
