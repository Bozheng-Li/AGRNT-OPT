# Agent-OPT repository guidance

This repository implements a quality-first, continuously expanding aggregator for agent skills, plugins, and MCP servers.

## Non-negotiable product rules

- Do not count a listing as integrated merely because its metadata was translated.
- Preserve the lifecycle states exactly: `discovered`, `qualified`, `translated`, `adapted`, `web-ready`, `verified`, `blocked`, and `deprecated`.
- Public catalog pages may only expose `web-ready` and `verified` entries.
- Every formally integrated entry needs a dedicated Web adaptation. Shared infrastructure is expected, but the workflow, inputs, settings, output presentation, help, examples, runtime state, and error feedback must fit the actual capability.
- Every runnable integration must receive real core, representative-scenario, failure-path, and Web end-to-end tests. Add permission and security tests when files, network, commands, secrets, or external accounts are involved.
- Never mark an integration `verified` when credentials, paid access, hardware, regional access, or an unavailable external service prevented the test. Record the blocking reason instead.
- Prefer evidence in this order: MCP or official structured API, official repository/documentation, official marketplace page, then trustworthy web research.
- Preserve original source text, Chinese translation, author, version, timestamps, license evidence, runtime requirements, and verification evidence.
- Quantity has no artificial ceiling, but quality gates must not be weakened to grow the catalog.

## Required checks

Run these before claiming a change is complete:

```powershell
npm run catalog:validate
npm run typecheck
npm run lint
npm test
npm run build
```

Run `npm run test:e2e` for any Web workflow or integration behavior change.

## Data and generated artifacts

- Curated, reviewable manifests live in `catalog/plugins/`.
- Source registry definitions live in `catalog/sources.json`.
- Raw sync snapshots and temporary runtime data live under `var/` and are not committed.
- Do not copy third-party implementation code into this repository unless its license explicitly allows it and attribution requirements are satisfied. Prefer adapters to upstream packages and remote services.

