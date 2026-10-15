# Contributing

Issues and pull requests are welcome: <https://github.com/redevops-io/redevops-projects/issues>.

```bash
npm install
npm test            # vitest
npm run typecheck   # tsc --noEmit
npm run build       # typecheck + vite build
```

- Views depend only on `DataClient` (`src/data/client.ts`), never on Runtime internals. Add projection types in `src/data/types.ts`.
- Backend behaviour belongs to the agentic-os Projects API, not this repo.
- Never commit credentials; CI runs a secret scan (`.github/workflows/secret-scan.yml`).
- Contributions are accepted under the repository's licence terms (`LICENSE.md`). Whether a contributor agreement is required: contact to be confirmed.

Security reports: see [SECURITY.md](SECURITY.md).
