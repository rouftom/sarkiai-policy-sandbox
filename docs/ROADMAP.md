# Roadmap

## Hackathon timeline

| Date | Milestone |
|------|-----------|
| 3 Oct 2026 | First ITU mentoring session |
| **21 Oct 2026** | **Registration deadline** |
| **10 Nov 2026** | **Submission:** technical report (≤5 pp.), GitHub repo, KB, demo video |
| 11–18 Nov 2026 | First-round evaluation |
| 18 Nov 2026 | Shortlisted teams announced |
| 8 Dec 2026 | Final evaluation, on-site at GITEX Global, Dubai |
| 10 Dec 2026 | Award ceremony |

## Sprints (from scaffold to submission)

### Sprint 0 — foundations (done)
- `[x]` Monorepo, Docker all-in-one + individual, lens profiles.
- `[x]` Jurisdiction-aware ingestion (adapted, `country`/`jurisdiction`).
- `[x]` Hybrid retrieval + RRF + local TEI rerank (optional).
- `[x]` Agent registry, orchestrator, mandatory-citation prompt.
- `[x]` Progressive scenario engine.
- `[x]` Readiness gap engine (13 dimensions / 6 factors, Report 2.0).
- `[x]` 0–5 maturity scoring + weighted composite (`packages/readiness/src/scoring.ts`).
- `[x]` Causal what-if propagation across dimensions (`packages/readiness/src/causal.ts`).
- `[x]` African/regional reference corpus (`data/global/africa/`, `scripts/fetch-corpus.sh`).
- `[x]` Hash-chained audit + persisted CoT traces.
- `[x]` **Local-first / sovereign**: Ollama (qwen3.5:9b) + local bge-m3 embeddings; **all cloud providers removed**; local faster-whisper. See `docs/LOCAL-FIRST-PLAN.md`, `docs/SOVEREIGNTY-AND-MODELS.md`.
- `[x]` **Admin design system** replicated in `@sps/theme` (packs fada/green/ocean/sunset/mono, fada default) — assistant uses SarkiAI Compact.
- `[x]` **MinIO** local object bucket (`sps-attachments`) for assistant image attachments.
- `[x]` **SOPS + age** secrets workflow (`docs/SECRETS.md`, `scripts/gen-age-key.sh`).
- `[x]` **Multimodal assistant**: local vision model (`qwen3.5:9b`), image attachments stored in MinIO (content-addressed), untrusted-context guardrails, audit hash. `POST /v1/agents/ask` + `attachments[]`.

### Sprint 1 — the Cameroon health corpus
- `[ ]` Collect real CM corpus (health law, data-protection law, national AI/digital strategy, cyber strategy) → `data/country/cm/`.
- `[ ]` Collect global best-practice corpus (ITU/WHO) → `data/global/itu/`.
- `[ ]` Ingest + validate retrieval quality per dimension.
- `[ ]` Replace `data/samples/*` placeholders.

### Sprint 2 — scenario authoring & coordination
- `[ ]` Author 3 progressive scenarios (health breach, cross-border telehealth, AI triage failure) with asymmetric `visibleTo`.
- `[x]` Coordinator reconciliation step (joint situation report) — `packages/agents/src/coordinator.ts`.
- `[x]` `onBeforeRelease` facilitator hook: `POST /v1/scenarios/start` + `/:runId/next` + "Mode facilitateur" in the console.

### Sprint 3 — auditability & evidence
- `[x]` Export a run dossier (audit + CoT + reports + citations) — `packages/report`, `GET /v1/audit/dossier/:runId`.
- `[x]` Multi-agent coordinator + conflict visualization in the web console.
- `[x]` Surface `verifyChain()` + chain-of-thought trace viewer in the web app (`AuditPanel`).
- `[x]` Readiness 0–5 scoring + causal what-if in the web console.

### Sprint 4 — report & demo
- `[ ]` Generate the ≤5-page technical report from `docs/` + a real run.
- `[ ]` Record the ≤7-minute demo video.
- `[ ]` Finalize README, license, and the public KB in the ITU AI for Good Lab.

### Sprint 5 — multi-country & fine-tuning (post-shortlist)
- `[ ]` Add UAE (`data/country/ae/`) for the cross-national narrative.
- `[ ]` Validate the same engine on a second jurisdiction (no code change).
- `[ ]` **Fine-tuning local (unsloth)**: export (KB context → cited answer) pairs from Mongo (`cot_traces`, `joint_reports`, readiness) → train a LoRA/QLoRA on `qwen2.5` with [unsloth](https://github.com/unslothai/unsloth) → merge + convert to GGUF → `ollama create sps-qwen` → `OLLAMA_MODEL=sps-qwen`. The dataset never leaves the infrastructure (or train inside the ITU sandbox with its credits).

## Open gaps carried from the parent platform

These were identified in the reuse audit and are planned, not inherited:

1. `country` end-to-end — **done** in the ingestion schema + index + retrieval.
2. Legal/policy agent — **done** (mandates + prompt).
3. Citation policy inverted — **done** (citations mandatory).
4. OCR for scanned gazettes — **done** (service + fallback).
5. Planner vs. router — **in progress** (coordinator reconciliation).
6. CoT as a durable artifact — **done** (`cot_traces`).
