# Self-hosted reference deployment

This compose file runs the whole product on one host: models, vectors,
operational records, attachments, OCR, transcription and the two MCP servers.
It is the recommended shape for an institution server or a lab VM behind a
reverse proxy. Nothing is managed and no request leaves the network.

## 1. Configure

```bash
cp deploy/sandbox/.env.sandbox.example deploy/sandbox/.env.sandbox
# fill SERVICE_API_KEY, MCP_API_KEY, SESSION_SECRET / APPROVAL_SECRET,
# S3_ACCESS_KEY / S3_SECRET_KEY, and the public origins.
```

Generate secrets with `openssl rand -hex 32`. The two Python services and the
API share `SERVICE_API_KEY`; the console proxy and the API share `MCP_API_KEY`.

## 2. Run

```bash
docker compose --env-file deploy/sandbox/.env.sandbox \
  -f deploy/sandbox/docker-compose.sandbox.yml up -d --build
```

Add the local reranker and transcription when the host has the capacity:

```bash
docker compose --env-file deploy/sandbox/.env.sandbox \
  -f deploy/sandbox/docker-compose.sandbox.yml --profile rerank --profile media up -d
```

`api` and `web` are only exposed on the compose network: put a TLS reverse
proxy in front of them and route `WEB_PUBLIC_URL` / `NEXT_PUBLIC_API_URL` to it.

## 3. Pull the models (once)

```bash
docker compose --env-file deploy/sandbox/.env.sandbox \
  -f deploy/sandbox/docker-compose.sandbox.yml exec ollama ollama pull qwen3.5:9b
docker compose --env-file deploy/sandbox/.env.sandbox \
  -f deploy/sandbox/docker-compose.sandbox.yml exec ollama ollama pull bge-m3
```

`bun scripts/check-provider.ts` verifies the two models, the embedding
dimension and the Qdrant collection.

## 4. Seed the knowledge base

The ingestion service creates the Qdrant collection and its payload indexes on
startup. Then ingest a country corpus from the manifest:

```bash
INGESTION_URL=http://localhost:8001 bun scripts/seed-corpus.ts --country cm
```

Scanned instruments fall back to the local Tesseract service inside ingestion.
`bun scripts/check-gazette.ts` checks that service before a scanned run.

## Health checks

- `GET /health` on api, ingestion, ocr, transcription, mcp-charts and mcp-docx
- `GET /v1/audit/chain` verifies the tamper-evident audit log
- `bun scripts/check-provider.ts` — Ollama models, embedding dimension, Qdrant
- `bun scripts/check-gazette.ts` — OCR service and ingestion hand-off
