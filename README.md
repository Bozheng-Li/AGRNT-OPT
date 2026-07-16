# Agent-OPT

Agent-OPT is a quality-first aggregation and Web adaptation platform for useful Agent skills, plugins, and MCP servers. It combines evidence-backed discovery, Chinese localization, curation, runtime adaptation, dedicated GPT-style Web experiences, and real verification.

The platform deliberately distinguishes discovery and translation from working integration. Only entries in `web-ready` or `verified` state appear in the public catalog.

## Current verified Web integrations

Thirteen upstream capabilities currently have dedicated Web workflows and real runtime evidence:

1. Filesystem Workbench
2. Knowledge Memory
3. Sequential Thinking Studio
4. Timezone Converter
5. Web Content Reader
6. Git Sandbox Studio
7. SQLite Workbench
8. Deterministic Prose Defluffer
9. Agentic Mermaid Diagram Studio
10. Blueprint Chart Data Visualization Studio
11. oxidize-pdf Document Workbench
12. BumpGuard Dependency Compatibility Lab
13. Svelte Development Studio

Each workspace has capability-specific inputs, output handling, help, runtime feedback, and browser coverage. Git, SQLite, defluff, Agentic Mermaid, Blueprint Chart, oxidize-pdf, and BumpGuard write only to project-owned sandboxes; clients cannot choose host repository, database, overlay, artifact, temporary, registry-cache, executable, editor-origin, public-render, or additional PDF filesystem roots. BumpGuard's network access is restricted to exact package artifacts from PyPI, Maven Central, and nuget.org. Svelte Development Studio analyzes source text only and bounds documentation network access to svelte.dev.

## Discovery coverage

The raw discovery layer is intentionally much larger than the public catalog:

- 2,428 structured marketplace listings from the official OpenAI Codex plugin source and Anthropic's reviewed community directory.
- 620 path-addressed skill candidates from official OpenAI and Anthropic repositories, with source text, repository SHA, license evidence, and duplicate keys retained under `var/`.
- A completed official MCP Registry full sync containing 51,937 version records across 520 atomic page snapshots and 16,765 latest server candidates.
- A 250-entry qualification review queue that requires a local runnable package, rejects declared credentials and high-risk/test-only flags, limits each publisher to two entries, and collapses high-confidence package/remote duplicates. Every queued item remains `discovered` pending primary-source license and usefulness review.

These records remain `discovered` until they pass provenance, license, security, usefulness, translation, adaptation, dedicated Web, and verification gates. Counts in `var/` are discovery coverage, not integrated-product counts.

## Live Web (GitHub-friendly deploy)

This project is a real Next.js + MCP runtime (Node child processes, Python MCP servers, sandboxes). It is **not** a static site, so plain GitHub Pages cannot host the runnable plugin center.

### Fastest public URL: Render one-click

1. Open the repository on GitHub: <https://github.com/Bozheng-Li/AGRNT-OPT>
2. Click the button below (or open Render and choose **New → Blueprint** with this repo):

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Bozheng-Li/AGRNT-OPT)

3. After the Docker build finishes, open the assigned `https://….onrender.com` URL.
4. That homepage is the **plugin center**. Click **打开 Web** on any card to use that plugin workspace.

`render.yaml` is already in the repo (Docker web service + persistent `/app/var/runtime` disk). Free tier machines may cold-start slowly; first plugin invoke after idle can take longer.

### Local full stack with Docker Compose

With Docker Desktop running:

```powershell
docker compose up --build
```

Then open `http://localhost:3000` for the full catalog and every verified Web workspace.

### GitHub Container Registry image

Pushes to `master`/`main` build and publish `ghcr.io/bozheng-li/agrnt-opt` via `.github/workflows/docker-publish.yml`. After the first successful workflow:

```powershell
docker run --rm -p 3000:3000 -e DOTNET_ROOT=/opt/dotnet ghcr.io/bozheng-li/agrnt-opt:latest
```

## Local development

```powershell
npm install
pip install -r requirements-mcp.txt
npm run runtime:setup:bumpguard
npm run catalog:validate
npm run dev
```

Open `http://localhost:3000`.
## Main workflows

```powershell
# Pull an incremental snapshot from the official MCP Registry.
npm run sync:official-mcp

# Resume a bounded full-sync batch from its saved cursor.
npm run sync:official-mcp -- --max-pages 100

# Validate curated manifests and quality gates.
npm run catalog:validate

# Show lifecycle and verification coverage.
npm run catalog:report

# Run automated verification.
npm test
npm run test:e2e
```

Before claiming an implementation change complete, run:

```powershell
npm run catalog:validate
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e # for Web workflow or integration behavior changes
```

See [the product charter](docs/PRODUCT_CHARTER.md), [architecture](docs/ARCHITECTURE.md), and [quality gates](docs/QUALITY_GATES.md).
