# redevops-projects

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

Licensed AGPL-3.0-or-later.
