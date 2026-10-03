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
- `[x]` Hybrid retrieval + RRF + rerank package.
- `[x]` Agent registry, orchestrator, mandatory-citation prompt.
- `[x]` Progressive scenario engine.
- `[x]` Readiness gap engine (13 dimensions / 6 factors, Report 2.0).
- `[x]` Hash-chained audit + persisted CoT traces.

### Sprint 1 — the Cameroon health corpus
- `[ ]` Collect real CM corpus (health law, data-protection law, national AI/digital strategy, cyber strategy) → `data/country/cm/`.
- `[ ]` Collect global best-practice corpus (ITU/WHO) → `data/global/itu/`.
- `[ ]` Ingest + validate retrieval quality per dimension.
- `[ ]` Replace `data/samples/*` placeholders.

### Sprint 2 — scenario authoring & coordination
- `[ ]` Author 3 progressive scenarios (health breach, cross-border telehealth, AI triage failure) with asymmetric `visibleTo`.
- `[ ]` Implement the coordinator reconciliation step (joint situation report).
- `[ ]` Add the `onBeforeRelease` facilitator hook in the web console.

### Sprint 3 — auditability & evidence (in progress)
- `[x]` Export a run dossier (audit + CoT + reports + citations) — `packages/report`, `GET /v1/audit/dossier/:runId`.
- `[x]` Multi-agent coordinator + conflict visualization in the web console.
- `[ ]` Surface `verifyChain()` + trace viewer in the web app.

### Sprint 4 — report & demo
- `[ ]` Generate the ≤5-page technical report from `docs/` + a real run.
- `[ ]` Record the ≤7-minute demo video.
- `[ ]` Finalize README, license, and the public KB in the ITU AI for Good Lab.

### Sprint 5 — multi-country (post-shortlist)
- `[ ]` Add UAE (`data/country/ae/`) for the cross-national narrative.
- `[ ]` Validate the same engine on a second jurisdiction (no code change).

## Open gaps carried from the parent platform

These were identified in the reuse audit and are planned, not inherited:

1. `country` end-to-end — **done** in the ingestion schema + index + retrieval.
2. Legal/policy agent — **done** (mandates + prompt).
3. Citation policy inverted — **done** (citations mandatory).
4. OCR for scanned gazettes — **done** (service + fallback).
5. Planner vs. router — **in progress** (coordinator reconciliation).
6. CoT as a durable artifact — **done** (`cot_traces`).
