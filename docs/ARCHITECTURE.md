# Architecture

```text
Official APIs / MCP registries / repositories / approved market pages
                              │
                    Source connectors
                              │
                 Raw snapshots under var/
                              │
      Normalize → deduplicate → license/security/value gates
                              │
                Curated plugin manifests
                              │
           Runtime adapter + Web adapter registry
                              │
          Shared GPT-style shell with dedicated workflows
                              │
       Core / scenario / error / security / Web E2E evidence
```

## Design decisions

- Curated manifests are source-controlled JSON so provenance and review history remain inspectable.
- Raw marketplace snapshots are generated under `var/`; they can be large and are reproducible from connectors.
- Runtime adapters call upstream MCP packages or services rather than copying their implementation.
- The Web application is shared, while each plugin registers a dedicated workspace component.
- Verification is stored as evidence, not inferred from lifecycle state or marketplace popularity.
- Connectors are incremental. The official MCP Registry connector uses `updated_since` and cursor pagination and can synchronize the complete registry without a hard-coded catalog ceiling.
- Large connector runs checkpoint every page atomically under `var/`; incomplete full-sync runs never masquerade as finalized candidate snapshots.
- Ranking changes investigation order only. It cannot promote an entry beyond `discovered` or bypass translation, licensing, runtime, Web, or test evidence.

## Lifecycle boundary

```text
discovered → qualified → translated → adapted → web-ready → verified
                  └──────────── blocked / deprecated ────────────┘
```

Lifecycle names are stored exactly as defined above. Public catalog loading filters out every state except `web-ready` and `verified`.

## Current runtime boundaries

- Filesystem operations resolve every client path against a project-owned sandbox.
- Network fetches accept only public HTTP(S) targets after DNS and address validation.
- Git launches a fixed Python module against `var/runtime/git-sandbox`; repository paths are adapter-injected, file paths are sandbox-relative, and revision/ref inputs reject option-like or malformed values.
- SQLite launches a fixed console entry point against `var/runtime/sqlite/sandbox.db`; the adapter enforces one statement, per-tool command allowlists, and blocks database attachment, unsafe maintenance commands, and extension loading.
- defluff launches a fixed console entry point with its working directory and user-home environment redirected to `var/runtime/defluff`; machine-wide overlays are inaccessible and Web writes are forced to the project scope.
- Agentic Mermaid launches a fixed Node entry point with process memory, Code Mode time, artifact size, artifact path, and temporary-directory limits. The transitive parser is pinned to audited 1.2.0, and Web Code Mode inherits upstream node:vm restrictions while remaining explicitly distinct from OS isolation.
- Blueprint Chart launches a fixed Node entry point with a 256 MiB old-space cap, bounded schemas for all eleven tools, fixed official editor/docs origins, and a project-owned render sandbox. Save paths must be relative, match the requested format, remain lexically contained, and avoid existing symlink components; export links encode source locally and do not upload it during tool execution.
- oxidize-pdf launches the fixed virtual-environment executable with all twelve inputs bounded and a fixed project workspace. Uploads require a PDF signature and stay below 8 MiB; the upstream runtime enforces resolved-path containment, PDF extensions, 16 MiB files, 500 pages, 2 MiB responses/sessions, four sessions, and a five-minute TTL. Agent-OPT keeps one serialized stdio connection per PDF workspace so create/add/save state survives separate Web requests, then closes it after two idle minutes. A no-store file route serves only real contained PDFs for preview and download.
- BumpGuard launches project Python through a fixed stdin-safe bootstrap and pins the project-local .NET 8 SDK. Strict ecosystem-specific package/version schemas prevent command, option, URL, and traversal injection; code and output are bounded; host paths are redacted; per-tool deadlines cover bounded downloads and static analysis. Home, temporary, pip, Maven, NuGet, Roslyn, and .NET CLI caches stay under `var/runtime/bumpguard`; symlink roots are rejected, telemetry/build servers are disabled, and Web callers cannot choose executables, environment variables, proxies, caches, or endpoints. PyPI is fixed by the adapter while upstream code fixes Maven Central and nuget.org.
- Time, memory, and sequential-thinking adapters launch fixed upstream packages with bounded schemas and no client-controlled command line.

## Implemented slices

1. Official MCP Registry resumable full-sync and incremental connector.
2. OpenAI and Anthropic structured marketplace and official skill-repository connectors.
3. Standard manifest, lifecycle, public-visibility, evidence, and quality validators.
4. MCP stdio adapter runtime with twelve verified upstream integrations, including serialized persistent connections for stateful upstream sessions and long-running bounded calls for multi-ecosystem static analysis.
5. Twelve dedicated Web workspaces: filesystem, memory, sequential thinking, time, fetch, Git, SQLite, deterministic prose linting, Agentic Mermaid visualization, Blueprint Chart data visualization, oxidize-pdf document workflows, and BumpGuard dependency compatibility analysis.
6. Unit, real runtime, error-path, security, API, smoke, and Playwright browser verification.
7. Candidate ranking for investigation priority without automatic lifecycle promotion.
