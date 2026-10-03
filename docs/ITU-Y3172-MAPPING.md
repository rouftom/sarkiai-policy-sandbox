# ITU-T Y.3172 mapping — file by file

ITU-T Y.3172 defines an architectural framework for machine learning in future
networks: an **ML pipeline** (data sources → data collection → data processing →
ML model → ML application) operating under **management, orchestration and
security**, with an **ML sandbox** for validation.

This document maps every stage to a concrete file in this repo so evaluators can
verify the architecture instead of taking it on faith.

## At a glance

| Y.3172 stage | Repo module | Key files |
|--------------|-------------|-----------|
| Data sources | `data/`, `services/transcription` | `data/country/**`, `data/global/**`, `services/transcription/app/main.py` |
| Data collection | `services/ingestion`, `packages/kb` | `services/ingestion/src/rag_ingestion/api/routes.py`, `packages/kb/src/index.ts` |
| Data processing | `services/ingestion`, `services/ocr` | `services/ingestion/src/rag_ingestion/services/chunker.py`, `.../embeddings.py`, `.../qdrant_store.py`, `services/ocr/app/ocr.py` |
| ML model | `packages/retrieval`, `packages/agents/src/model.ts` | `packages/retrieval/src/index.ts`, `packages/agents/src/model.ts` |
| ML application | `packages/agents`, `packages/scenarios`, `packages/readiness`, `packages/citations` | see below |
| Management & orchestration | `packages/shared/src/workflows.ts`, `apps/api/src/engine.ts` | workflow profiles, engine composition |
| Security | `packages/audit` | `packages/audit/src/index.ts` |
| ML sandbox | `deploy/sandbox/` | `deploy/sandbox/docker-compose.sandbox.yml` |
| Data model / taxonomy | `packages/shared/src/types.ts` | `Taxonomy`, `KbChunk`, `Gap`, `AuditRecord`, `CoTTrace` |

## 1. Data sources

| Concern | File |
|---------|------|
| Country corpora placement (CM first, then AE) | `data/country/cm/`, `data/country/ae/` |
| Global best-practice corpus | `data/global/itu/` |
| Illustrative seed documents | `data/samples/*.txt` |
| Media-derived sources (briefings, hearings) | `services/transcription/app/main.py` |

## 2. Data collection

| Concern | File | Notes |
|---------|------|-------|
| HTTP ingest API (text + file) | `services/ingestion/src/rag_ingestion/api/routes.py` | `POST /v1/ingest/text`, `POST /v1/ingest/file` |
| Request schemas + jurisdiction taxonomy | `services/ingestion/src/rag_ingestion/api/schemas.py` | `IngestTaxonomy` |
| Typed client used by the API app | `packages/kb/src/index.ts` | `IngestionClient` |
| Corpus seed utility | `scripts/seed.sh` | bulk ingest |

## 3. Data processing

| Concern | File | Notes |
|---------|------|-------|
| Structure-aware chunking (FR/EN legal headings) | `services/ingestion/src/rag_ingestion/services/chunker.py` | `StructureAwareChunker` → `headingPath`, `articleNumber` |
| Embeddings (VoyageAI voyage-4, 1024-d) | `services/ingestion/src/rag_ingestion/services/embeddings.py` | `EmbeddingService` |
| Vector persistence in Qdrant (dense + sparse) + payload indexes + dedup | `services/ingestion/src/rag_ingestion/services/qdrant_store.py` | collection payload filters include `country` |
| OCR fallback for scanned gazettes | `services/ocr/app/ocr.py` | Tesseract `fra+eng` |
| Runtime config (ports, models, thresholds) | `services/ingestion/src/rag_ingestion/config.py` | pydantic-settings |

## 4. ML model

| Concern | File | Notes |
|---------|------|-------|
| Hybrid retrieval: query embedding → Qdrant dense + sparse BM25 → RRF → rerank | `packages/retrieval/src/index.ts` | `PolicyRetriever`, `rrf()` |
| LLM provider abstraction (DeepSeek default) | `packages/agents/src/model.ts` | `createModel()` |
| Model fine-tuning (sandbox credits, out-of-band) | `deploy/sandbox/README.md` §4 | point at tuned endpoint via env |

## 5. ML application

| Concern | File | Notes |
|---------|------|-------|
| Mandated agent run (retrieve → ground → generate → trace) | `packages/agents/src/orchestrator.ts` | `PolicyOrchestrator.runAgent` |
| Grounded system prompt + mandatory-citation directive | `packages/agents/src/prompt.ts` | `buildSystemPrompt`, `citationDirective` |
| Progressive, chunked error-scenario engine | `packages/scenarios/src/index.ts` | `ScenarioEngine.release()` (async generator) |
| ITU Readiness gap engine (8 dimensions) | `packages/readiness/src/index.ts` | `ReadinessEngine.assess`, `renderReadinessMarkdown` |
| Source attribution / citation formatting | `packages/citations/src/index.ts` | `citationFromChunk`, `hasGroundedCitation` |
| Institutional mandates registry | `packages/shared/src/agents.ts` | `INSTITUTIONS`, `institutionsForDomain` |

## 6. Management & orchestration

| Concern | File | Notes |
|---------|------|-------|
| Declarative lens profiles (simulation / readiness / hybrid) | `packages/shared/src/workflows.ts` | `WORKFLOW_PROFILES`, `getWorkflowProfile` |
| Composition of packages per lens | `apps/api/src/engine.ts` | `createEngine`, `createScenario` |
| HTTP surface | `apps/api/src/routes/index.ts` | `/v1/agents/ask`, `/v1/scenarios/:id/release`, `/v1/readiness/report`, `/v1/audit/*` |
| UI lens selector + readiness console | `apps/web/src/app/page.tsx`, `apps/web/src/components/lens-selector.tsx` | both lenses visible |

## 7. Security

| Concern | File | Notes |
|---------|------|-------|
| Hash-chained, tamper-evident audit log | `packages/audit/src/index.ts` | `logAction`, `verifyChain` |
| Persisted chain-of-thought traces | `packages/audit/src/index.ts` | `traceStep`, `getTrace` |
| Service-to-service auth | `services/*/app/main.py`, `services/ingestion/.../routes.py` | `X-API-Key` / `SERVICE_API_KEY` |
| SSRF-safe transcription (stateless, RAM-only) | `services/transcription/app/main.py` | size cap, no disk |
| Secret hygiene | `.gitignore`, `.env.example` | real env never committed |

## 8. ML sandbox

| Concern | File | Notes |
|---------|------|-------|
| Sandbox deployment topology | `deploy/sandbox/docker-compose.sandbox.yml` | Qdrant KB + external Mongo (ops), registry images |
| Sandbox variables | `deploy/sandbox/.env.sandbox.example` | `MONGODB_URI`, keys, registry |
| Fine-tuning path | `deploy/sandbox/README.md` | uses Lab cloud credits |

## 9. AI Readiness Framework perspectives

| Perspective (hackathon §Requirements) | Where it is reflected |
|---------------------------------------|-----------------------|
| Open data & open-source management | Apache-2.0 `LICENSE`; KB publication; `data/global/itu` |
| Generative AI content ecosystem | `packages/agents` + `packages/readiness` |
| Contextualization & regional focus | `country`/`jurisdiction` taxonomy end-to-end |
| Domain & cross-domain integration | `Domain` type; `INSTITUTIONS` cross-domain mandates |
| Human interaction & supervision | lens selector, scenario `onBeforeRelease` hook, approvals seam |
| Policy & implementation opportunity | `ReadinessEngine` gap engine |
| AI for social inclusion | domain coverage (health, education, public services, agriculture) |
| Digital infrastructure & energy | readiness dimension `digital_infrastructure_energy`; OTT/telecom expertise |

## 10. Hackathon §5 — progressive scenario events

`packages/scenarios/src/index.ts` implements the requirement literally:
`ScenarioEvent.releaseChunk` groups events into ticks, `ScenarioEngine.release()`
yields one batch at a time, and `visibleTo` encodes **information asymmetry** so
each institutional agent receives a different, incomplete picture.

## 11. Hackathon §6 — audit & chain-of-thought

`packages/audit/src/index.ts` stores two artifacts:
1. `audit_logs` — hash-chained records (`prevHash` → `hash`) for `verifyChain()`.
2. `cot_traces` — one document per reasoning step, queryable by `runId`.
`apps/api/src/routes/index.ts` exposes `GET /v1/audit/chain` and
`GET /v1/audit/trace/:runId` for reviewer inspection.
