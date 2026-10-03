# SarkiAI Policy Sandbox

> Policy-grounded, multi-agent AI engine for the **ITU AI for Good Lab Hackathon (UAE)**.
> One engine, two lenses: **error-scenario simulation** and **ITU AI Readiness assessment**.

[![ITU AI for Good](https://img.shields.io/badge/ITU-AI%20for%20Good-0093DD?style=for-the-badge)](https://aiforgood.itu.int/)
[![Y.3172](https://img.shields.io/badge/ITU--T-Y.3172-0057A8?style=for-the-badge)](https://www.itu.int/rec/T-REC-Y.3172/en)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000?style=for-the-badge&logo=fastify)](https://fastify.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Docker](https://img.shields.io/badge/Docker-compose-2496ED?style=for-the-badge&logo=docker)](https://docs.docker.com/compose/)

---

## Why

The ITU AI for Good Lab hackathon asks teams to build a **country-specific knowledge base** and
**AI agents** (policy/legal adviser, institutional participant, multi-agent coordination) that can run
**progressive error-scenario simulations**, with **audit logging and chain-of-thought tracing**, aligned
to **ITU-T Y.3172** and the **ITU AI Readiness Framework**.

This repo is the standalone monorepo for that system. It is **not** built on our proprietary
`agentic-ui-harness` (IP-protected, unpatented) — the hackathon scope is backend orchestration, so we
reimplement the agent runtime with the public Vercel AI SDK.

- **Primary country:** Cameroon (MINPOSTEL-aligned), then multi-country (UAE → …).
- **Primary domain:** healthcare, with cross-domain spillover (data protection, telecom, cybersecurity).
- **Open by design:** permissive license so the knowledge base can be published in the ITU AI for Good Lab.

## One engine, two lenses

| Lens | Purpose | Reference |
|------|---------|-----------|
| `simulation` | Run a progressive, chunked error scenario across mandated agents; produce an audit trail + gap findings. | Hackathon §5 |
| `readiness` | Assess a country corpus against the ITU AI Readiness dimensions; produce a gap report. | ITU AI Readiness Framework |
| `hybrid` | Simulation that emits the readiness / gap report as a by-product. | Both |

The lens is a **declarative workflow profile** (`packages/shared`), never a duplicated code path.
Gap analysis is a **shared service** consumed by every lens, so no evaluation criterion is lost.

## Architecture (Y.3172 pipeline)

```
 data sources ──▶ data collection ──▶ data processing ──▶ ML model ──▶ ML application ──▶ management & security
     │                  │                   │               │                │                    │
 data/country      services/           services/        packages/kb       packages/agents     packages/audit
 data/global      ingestion           ingestion+ocr     packages/         packages/scenarios  (audit + CoT trace)
                  (fetch/load)        (chunk+embed)     retrieval         packages/readiness
                                                                          packages/citations
```

See [`docs/ITU-Y3172-MAPPING.md`](docs/ITU-Y3172-MAPPING.md) for the file-by-file mapping.

## Repository layout

```
sarkiai-policy-sandbox/
├─ apps/
│  ├─ api/            # Fastify: agent orchestration, SSE streaming, REST/OpenAPI
│  └─ web/            # Next.js: lens selector, simulation console, readiness report
├─ packages/          # TypeScript workspace packages (@sps/*)
│  ├─ shared/         # types, workflow profiles, config, jurisdiction model
│  ├─ kb/             # ingestion client + knowledge-base domain logic
│  ├─ retrieval/      # hybrid RAG (Qdrant dense + sparse BM25, RRF + rerank)
│  ├─ citations/      # article/section source attribution
│  ├─ agents/         # roles, mandates, orchestrator (AI SDK ToolLoopAgent)
│  ├─ scenarios/      # progressive event engine (chunked release)
│  ├─ readiness/      # gap engine + ITU readiness dimensions
│  └─ audit/          # immutable audit log + persisted CoT traces
├─ services/          # Python microservices
│  ├─ ingestion/      # structure-aware legal chunking + embeddings + Qdrant store
│  ├─ ocr/            # scanned gazette OCR (Tesseract)
│  └─ transcription/  # optional media → timestamped transcript
├─ data/              # corpora: country/cm, country/ae, global/itu (git-ignored payloads)
├─ deploy/
│  ├─ sandbox/        # ITU AI for Good Lab deployment
│  └─ mongo/init/     # local operational store seed (audit + CoT)
└─ docs/              # strategic note, mapping, architecture, data model, roadmap
```

## Quick start

### Everything at once

```bash
cp .env.example .env      # fill VOYAGE_API_KEY and one LLM provider key
docker compose up --build
```

Then:

- Web console → http://localhost:3000
- API + OpenAPI → http://localhost:8000/docs
- Ingestion service → http://localhost:8001/docs
- OCR service → http://localhost:8002/docs
- Qdrant dashboard → http://localhost:6333/dashboard
- MongoDB (audit + CoT) → `mongodb://localhost:27017`

### Individual services

```bash
docker compose up mongo ingestion ocr     # knowledge-base plane only
docker compose up api web                 # application plane only
docker compose up mongo ingestion         # just the KB ingest path
```

Or via the Makefile:

```bash
make up            # full stack
make up-kb         # mongo + ingestion + ocr
make up-app        # api + web
make logs          # follow logs
make down          # stop
make clean         # stop + remove volumes
```

### Dev mode (hot reload + bind mounts)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

## Contributing

- Branch model and conventions: [`docs/RULES.md`](docs/RULES.md)
- Data model: [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md)
- Roadmap: [`docs/ROADMAP.md`](docs/ROADMAP.md)

## License

Apache-2.0 — see [`LICENSE`](LICENSE). The knowledge base content retains the terms of its sources.
