# Agent notes

This repository is a **local-only** product. There is no cloud provider, no
remote API key and no fallback to a hosted model. Before changing code:

- Models: Ollama only (`qwen3.5:9b` chat model + `bge-m3` embeddings).
  `packages/shared` fixes `ProviderMode = 'local'`.
- Retrieval: Qdrant only (dense bge-m3 + BM25 + RRF + optional local TEI).
- Operational data: MongoDB; objects: MinIO; e-mail: console log + outbox.
- Integrations: the two local MCP servers (`sarkiai_charts`, `sea_mcp_docx`).
- Validation on a machine without the stack: `bun run typecheck`, `bun test`,
  `python3 -m compileall services`, `docker compose config`.
- Do not run `docker compose up` or pull models as part of a code change.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
