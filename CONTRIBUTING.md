# Contributing

Short version: **read `AGENTS.md`, branch from `develop`, open a PR**.

## Setup

```bash
bun install
cp .env.example .env      # placeholders only
make up && make models    # Docker stack + local models
```

Open <http://localhost:3000> and complete the first-run screen. The stack is
local: Ollama, Qdrant, MongoDB, MinIO and the MCP sidecars run in containers in
this repository. No hosted provider is called at runtime.

## Workflow

- `main` is the release branch, `develop` is integration. Both are protected:
  **no direct push**. GitHub branch protection is the authoritative lock.
- Create `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `chore/<slug>` from
  `develop`, then open a PR into `develop`.
- Documentation and skills follow the same rule.
- Merges are **merge commits**: never squash.
- Promotion is `develop → main`.

## Invariants

Every change keeps these, whatever the feature:

- **The stack stays local.** No hosted model, no outbound request at runtime,
  no telemetry. A new dependency or a new network call is named in the PR body
  before it is added.
- **Every agent claim cites the corpus.** Changes to agents keep the citation
  validator as the last filter, and the answer says `INSUFFICIENT_EVIDENCE`
  when the corpus does not support a claim.
- **Every side effect goes through a human.** An agent proposes, an operator
  decides, and the decision lands in the audit chain.
- **Corpus rights are reviewed.** A document is published only when its manifest
  entry is `official-text` or `open-licence`; `make check-kb` enforces it.

## Checks

```bash
bun run typecheck
bun test packages apps
bun run build              # when apps/web or a published package changes
make check-kb              # when data/country or data/global changes
```

Add the commands you ran and their result to the PR body. A red check blocks
the merge. CI runs `bun run typecheck`, `bun test packages apps` and a
dependency audit on every push and pull request; it does not deploy.

The Python ingestion, OCR and transcription services have no runner in CI; run
their tests locally when you change them.

## Conventions

- English for code, comments, docs, commits and pull requests. The only French
  kept verbatim is the official title of a Cameroonian document.
- Conventional Commits with a scope: `feat(api): …`.
- Every user-visible string goes through `apps/web/src/lib/i18n.tsx`, in **both**
  locales.
- No em dashes in the submission documents under `submission/`.
- Never commit `.env*`, a key, a token, a private host or a corpus file outside
  the rights review. `.env.example` holds placeholders only.

## Where to look

| Need | File |
| --- | --- |
| Repository rules | `AGENTS.md` |
| Architecture | `docs/ARCHITECTURE.md` |
| Data model | `docs/DATA-MODEL.md` |
| Knowledge base | `data/KNOWLEDGE-BASE.md` |
| Corpus and rights | `docs/CORPUS-CM.md`, `docs/LICENSING.md` |
| Local-first design | `docs/LOCAL-FIRST-PLAN.md` |
| Sovereignty and models | `docs/SOVEREIGNTY-AND-MODELS.md` |
| Hardware sizing | `docs/HARDWARE-REQUIREMENTS.md` |
| Tests | `docs/TESTING.md` |
| Secrets | `docs/SECRETS.md` |
| Deployment | `deploy/` |
