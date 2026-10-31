# SarkiAI Policy Sandbox

> Self-hosted, policy-grounded multi-agent engine for national AI governance.
> One engine, two lenses: **error-scenario simulation** and **ITU AI Readiness assessment**.
> Runs entirely on-premise: local models, local vectors, local storage, no hosted provider.

[![ITU AI for Good](https://img.shields.io/badge/ITU-AI%20for%20Good-0093DD?style=for-the-badge)](https://aiforgood.itu.int/)
[![Y.3172](https://img.shields.io/badge/ITU--T-Y.3172-0057A8?style=for-the-badge)](https://www.itu.int/rec/T-REC-Y.3172/en)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000?style=for-the-badge&logo=fastify)](https://fastify.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Docker](https://img.shields.io/badge/Docker-compose-2496ED?style=for-the-badge&logo=docker)](https://docs.docker.com/compose/)

---

## Why

The engine builds a **country-specific knowledge base** and **AI agents** (policy/legal adviser,
institutional participant, multi-agent coordination) that can run **progressive error-scenario
simulations**, with **audit logging and chain-of-thought tracing**, aligned to **ITU-T Y.3172** and the
**ITU AI Readiness Framework**.

This repo is the standalone monorepo for that system. The agent runtime uses the open-source AI SDK
against a local OpenAI-compatible endpoint.

- **Fully local:** Ollama `qwen3.5:9b` (multimodal, text + image), `bge-m3` embeddings, local OCR/Whisper — no outbound call. The assistant accepts **image attachments** (stored in MinIO, content-addressed) as untrusted context.
- **Local integrations:** Qdrant for vectors, MongoDB for operational records, MinIO for objects, console-only e-mail (log + outbox), local MCP servers for charts and Word documents.
- **Primary country:** Cameroon (MINPOSTEL-aligned), then multi-country (UAE → …).
- **Primary domain:** healthcare, with cross-domain spillover (data protection, telecom, cybersecurity).
- **Open by design:** permissive license so the knowledge base can be published in the ITU AI for Good Lab.

## One engine, two lenses

| Lens | Purpose | Reference |
|------|---------|-----------|
| `simulation` | Run a progressive, chunked error scenario across mandated agents; produce an audit trail + gap findings. | Scenario engine |
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
│  ├─ audit/          # immutable audit log + persisted CoT traces
│  ├─ report/         # run dossier: audit + CoT + reports + citations
│  ├─ ui/             # shared components (SarkiAI Compact charter)
│  ├─ theme/          # admin theme packs (fada, green, ocean, sunset, mono)
│  └─ storage/        # MinIO/S3 client (content-addressed attachments)
├─ services/          # local microservices
│  ├─ ingestion/      # structure-aware legal chunking + embeddings + Qdrant store
│  ├─ ocr/            # scanned gazette OCR (Tesseract)
│  ├─ transcription/  # optional media → timestamped transcript
│  ├─ mcp-charts/     # local MCP server: interactive charts
│  └─ mcp-docx/       # local MCP server: Word (.docx) generation
├─ data/              # knowledge base: country/cm, global/itu, global/africa (see data/KNOWLEDGE-BASE.md)
├─ deploy/
│  ├─ sandbox/        # self-hosted reference deployment (lab VM / institution server)
│  └─ mongo/init/     # local operational store seed (audit + CoT)
├─ docs/              # strategic note, mapping, architecture, data model, roadmap
└─ submission/        # AI for Good Sandbox Hackathon: technical report, judge Q&A, demo script
```

## Quick start

> **Local-only**: all models run locally via Ollama. No hosted-provider key,
> no outbound call. First run pulls ~9 GB (qwen3.5:9b) + ~2 GB (bge-m3).

### Everything at once

```bash
cp .env.example .env
docker compose up --build -d
make models                # pull qwen3.5:9b + bge-m3 into Ollama
```

Then:

- Web console → http://localhost:3000
- API + OpenAPI → http://localhost:8000/docs
- Ingestion service → http://localhost:8001/docs
- OCR service → http://localhost:8002/docs
- MCP charts → http://localhost:8010/mcp
- MCP Word documents → http://localhost:8011/mcp
- Qdrant dashboard → http://localhost:6333/dashboard
- Ollama (local models) → http://localhost:11434
- MinIO console (attachments) → http://localhost:9001
- MongoDB (audit + CoT) → `mongodb://localhost:27017`

Console e-mail writes the temporary password and approval links to the API log
and the in-console outbox; there is no SMTP and no delivery provider.

Optional local reranker (TEI):

```bash
docker compose --profile rerank up -d      # then set RERANK_URL=http://rerank:80 in .env
```

### Individual services

```bash
docker compose up ollama qdrant ingestion ocr   # knowledge-base plane only
docker compose up api web mcp-charts mcp-docx    # application plane only
docker compose up ollama qdrant ingestion        # just the KB ingest path
```

Or via the Makefile:

```bash
make up            # full stack
make models        # pull local LLM + embeddings
make up-kb         # ollama + qdrant + ingestion + ocr
make up-app        # api + web + MCP servers
make logs          # follow logs
make down          # stop
make check-provider # local models, embedding size, Qdrant
make seed-corpus   # ingest a country corpus from its manifest
make clean         # stop + remove volumes
```

### Dev mode (hot reload + bind mounts)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

## Submission

AI for Good Sandbox Hackathon 2026 (Cameroon, health and public governance):

- [`submission/TECHNICAL-REPORT.md`](submission/TECHNICAL-REPORT.md) (also [PDF](submission/TECHNICAL-REPORT.pdf) and [DOCX](submission/TECHNICAL-REPORT.docx)), 5 pages
- [`submission/JUDGE-QA.md`](submission/JUDGE-QA.md): questions the jury is likely to ask, and where to show the answer in the console
- [`submission/DEMO-SCRIPT.md`](submission/DEMO-SCRIPT.md): storyboard of the demo video

## Knowledge base

The Cameroonian corpus (laws, decrees, regulations, national strategies and
health policies) ships with the repository in [`data/country/cm/`](data/country/cm/),
limited to the documents we may redistribute: official texts and openly
licensed public-body publications. Press articles, authored
papers and documents with unconfirmed licences are listed but kept out. The
African reference corpus is fetched from the ITU AI Readiness reference
repository (`./scripts/fetch-corpus.sh`).

Contents, rights review and rebuild steps: [`data/KNOWLEDGE-BASE.md`](data/KNOWLEDGE-BASE.md).
`make check-kb` verifies what the repository publishes.

## Contributing

- Branch model and conventions: [`docs/RULES.md`](docs/RULES.md)
- Data model: [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md)
- Roadmap: [`docs/ROADMAP.md`](docs/ROADMAP.md)

## License

- **Code** — Apache-2.0 (see [`LICENSE`](LICENSE)).
- **Knowledge base / docs** — CC BY 4.0 (see [`LICENSE-CONTENT`](LICENSE-CONTENT)); source documents retain their own terms.
- **ITU reference files** (`dimensions.json` and three summaries) — MIT, see [`data/global/LICENSE-ITUAIReadiness`](data/global/LICENSE-ITUAIReadiness).

See [`docs/LICENSING.md`](docs/LICENSING.md) for the rationale and provenance.

---

<div align="center">

Made with ♥️ by [Djotta](https://djotta.com)

</div>
