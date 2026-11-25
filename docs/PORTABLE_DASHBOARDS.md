# The portable dashboards page

`projects-dashboards-portable.tgz` (a release asset) is the Projects dashboards as a folder of static files. Unpack it on
any static host, or serve it locally (`python3 -m http.server -d <folder>`), and open `index.html`. It needs no server of
its own and fetches nothing from another site.

## Two ways to use it

**Connect to a Projects deployment.** Enter the deployment's address and an access token. All thirteen dashboards your
account may see are shown, with the same numbers, drill-downs, filters and saved views as in the deployment's own UI.

* The address must be `https://` (plain `http://` is accepted for this machine only).
* The token is a bearer the deployment's administrator issues (a viewer identity). It is kept in the tab's session storage
  (gone when the tab closes), sent only in the `Authorization` header of requests to that address, never placed in a URL.
  No cookie is sent or kept.
* The deployment must allow the page: its administrator sets `PROJECTS_CORS_ORIGINS` to the page's origin. With the
  installer stack that is three lines in `.env` (`PROJECTS_CORS_ORIGINS`, `PROJECTS_VIEWER_TOKENS`,
  `PROJECTS_VIEWER_LIMITS`; see `deploy/apps/.env.example` in agentic-os). Needs kernel 0.4.15 or later behind the
  sign-in gate.
* Actions on connected products, Sidekick and "Track in Today" are not on this page; it says so and points to the
  deployment's own UI.

**Work in this browser.** The dashboards kernel runs in the page (WebAssembly Python, about 13 MB on first start, kept by
the browser cache afterwards). Four dashboards work:

| Dashboard | In this browser |
|---|---|
| QA and release readiness | from JUnit files you add ("Add test results") |
| Portfolio health | from the same results |
| Missions and workflows | shown, with nothing to read |
| Infrastructure and deployments | shown, with nothing to inspect |

What you add stays in this browser (IndexedDB) and survives a reload. The same rules apply as on a server: a skipped test
is blocked or unsupported, never passed; a platform you declare and do not report shows as not executed.

**Not available in this browser**; the dashboards view lists each with why and what to do: Security and remediation, Revenue and
sales, Financial health, Market and conversion, Customer support, Suppliers and procurement, Marketing and social, AI
usage and cost, Knowledge and data quality. They read your applications with each application's credential, and a
credential in a web page belongs to everyone who can open the page. Connect to a deployment that holds those
connections instead.

## Building it

`npm run build:portable` writes `dist-portable/` and the archive, and prints the archive's sha256. Inputs are pinned:
Pyodide by npm version, its two packages (pyyaml, sqlite3) by the sha256 in Pyodide's lock file, the dashboards kernel
archive (`dashboards-kernel.zip`, a release asset of agentic-os) by the sha256 in `portable.lock.json`. The archive is
written deterministically (sorted entries, no timestamps): the same inputs built with the same Node and Vite give the
same sha256. The published digest is the one in the release's `SHA256SUMS`. `portable-manifest.json` in the folder lists every file with its
sha256.

A static host should send `Content-Type: application/wasm` for `.wasm` and `text/javascript` for `.mjs` (most do).
