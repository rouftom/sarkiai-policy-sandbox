# "Local-first" plan (data and model sovereignty, D10/D11): VALIDATED AND IMPLEMENTED

> **Historical note.** This document describes the migration that led to the
> current distribution. The hosted providers listed as "dependencies to remove"
> have all been deleted: only the local stack remains.

> Locked decisions: LLM **qwen3.5:9b** (multimodal text and image, 6.6 GB) · embeddings
> **bge-m3** (1024-dim, multilingual, French) · reranker **local TEI** ·
> transcription **local faster-whisper** · **total removal** of cloud
> providers · fine-tuning **unsloth** (documented).
>
> ✅ Implemented: local provider, local embeddings, `ollama` service, optional
> TEI reranker, local transcription, cloud purge, documentation.

## 1. Principle

All reasoning, embeddings and transcription run **locally** (Ollama, open-weight
models). **No data leaves the infrastructure**: this aligns directly with the ITU
metrics **`d10_m10` Data Sovereignty** (D10) and **`d11_m06` Edge Privacy** (D11),
and with offline operation in the ITU sandbox.

## 2. Inventory of cloud dependencies to remove

| Location | Current dependency | Local replacement |
|----------|--------------------|-------------------|
| `packages/agents/src/model.ts` | `@ai-sdk/deepseek` + deepseek / groq / openai / anthropic / google providers | `@ai-sdk/openai-compatible` → Ollama `/v1` |
| `packages/agents/package.json` | `@ai-sdk/deepseek` | `@ai-sdk/openai-compatible` |
| `apps/api/package.json` | `@ai-sdk/deepseek` | (removed) |
| `packages/retrieval/src/index.ts` | Voyage embed + Voyage rerank (`api.voyageai.com`) | Ollama `/v1/embeddings` (bge-m3) + RRF (optional local rerank) |
| `services/ingestion/.../embeddings.py` | `voyageai` SDK | Ollama HTTP client (bge-m3) |
| `services/ingestion/requirements.txt` / `pyproject.toml` | `voyageai` | (removed); `httpx` already present |
| `services/transcription/app/*` | Groq Whisper API | **faster-whisper** local (CTranslate2) |
| `apps/api/src/config.ts` | `VOYAGE_API_KEY`, `DEEPSEEK_API_KEY`, `DEFAULT_LLM_PROVIDER` | `OLLAMA_*`, `EMBEDDING_*` |
| `apps/api/src/engine.ts` | `voyageApiKey` | Ollama configuration |
| `docker-compose.yml` (+ sandbox) | Voyage / DeepSeek / Groq environment variables | `ollama` service + Ollama environment variables |
| `.env.example` (+ sandbox) | cloud keys | local Ollama variables |
| Docs | mentions of Voyage / DeepSeek | updated |

## 3. Target local architecture

```
                    ┌──────────────────────────┐
   browser ────────▶│  apps/web (Next.js)      │
                    └────────────┬─────────────┘
                                 │ REST + SSE
                    ┌────────────▼─────────────┐
                    │  apps/api (Fastify)      │
                    └───┬───────────┬──────────┘
                        │           │
        Qdrant (vectors)│           │ Mongo (audit/CoT)
                        │           │
              ┌─────────▼───┐   ┌───▼────────────────┐
              │  Ollama     │   │ services/ingestion │
              │  • qwen3.5  │◀──│  bge-m3 embeddings │
              │  • bge-m3   │   └────────────────────┘
              └─────────────┘   ┌────────────────────┐
                                │ services/ocr (loc.)│
                                └────────────────────┘
                                ┌────────────────────┐
                                │ transcription      │
                                │ faster-whisper loc.│
                                └────────────────────┘
   (optional) TEI reranker bge-reranker-v2-m3: `rerank` profile
```

No outbound call. `ollama` is the **only** model provider.

## 4. Model choices

| Role | Model | Rationale |
|------|-------|-----------|
| Reasoning LLM | **`qwen3.5:9b`** (Ollama) | multimodal (text and image); 201 languages; 256K context; ~6.6 GB disk, ~8–10 GB RAM |
| Light LLM (option) | `qwen2.5:7b` via `OLLAMA_MODEL` | portability to a sandbox without GPU |
| Embeddings | **`bge-m3`** (Ollama) | multilingual (excellent in French); **1024 dense, the same as our Qdrant dimension** (no schema change) |
| Sparse (hybrid) | BM25 (Qdrant, server side) | unchanged |
| Rerank (option) | `BAAI/bge-reranker-v2-m3` via local **TEI** | replaces Voyage rerank-2; otherwise plain RRF |
| Transcription (option) | `faster-whisper` (`large-v3` / `small`) | replaces Groq Whisper |

**Good news**: `bge-m3` is **1024-dimensional**, exactly our current Qdrant
configuration, so **no vector migration** is needed.

## 5. Target context and environment

```env
# Local models (sovereignty, the default)
LLM_PROVIDER=local
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=qwen3.5:9b
EMBEDDING_PROVIDER=local
EMBEDDING_MODEL=bge-m3
EMBEDDING_DIMENSION=1024
# Optional local rerank (TEI)
RERANK_URL=            # e.g. http://rerank:80; empty => RRF only
# Optional local transcription
WHISPER_MODEL=large-v3
```

## 6. Docker

- New **`ollama`** service (`ollama/ollama`), `ollama-data` volume, optional NVIDIA GPU (as in the ITU repository).
- New **`make models`** target → `ollama pull qwen3.5:9b` + `ollama pull bge-m3`.
- **`rerank`** service (TEI) under the `rerank` profile (optional).
- `transcription` moves to faster-whisper (`media` / `full` profile).
- `depends_on`: `ingestion` and `api` wait for `ollama` to be healthy.

## 7. Fine-tuning (documented, outside the initial implementation)

A **100% local** chain, with the dataset never exported:

1. **Dataset export**: pairs (KB context + question → cited answer) from Mongo
   (`cot_traces`, `joint_reports`, readiness outputs).
2. **LoRA/QLoRA training**: `peft` + `trl` (or `unsloth`) on the open-weight `qwen3.5` (Apache-2.0).
3. **Conversion**: merge the LoRA, then `llama.cpp` → **GGUF**.
4. **Deployment**: `ollama create sps-qwen`, then `OLLAMA_MODEL=sps-qwen`.
5. **ITU sandbox alternative**: train **inside** the sandbox with the credits,
   without moving the dataset out.

Documented in `docs/ROADMAP.md` and the README; no code until it is required.

## 8. Impact and risks

| Risk | Mitigation |
|------|------------|
| ~10 GB RAM for the 9B model | `OLLAMA_MODEL=qwen2.5:7b` (environment variable); prerequisites documented |
| First pull of ~5–9 GB | `make models` documented; persistent volume |
| `generateObject` less reliable locally | Ollama JSON mode + retry + fallback; to be tested |
| Quality below frontier models | acceptable for the demo; fine-tuning possible |
| Cloud rerank removed | RRF is already strong; local TEI optional |

## 9. ITU dimensions reinforced

- **D10 `d10_m10` Data Sovereignty**: data possession and movement policies → **checked** (no data moves outside the infrastructure).
- **D11 `d11_m06` Edge Privacy**: autonomous edge with no leakage → **checked** (local inference).
- Explicit surfacing of these two metrics in the readiness engine (evidence and score).

## 10. Validation questions

1. **Default LLM**: `qwen3.5:9b` (quality, 16 GB RAM), with `qwen2.5:7b` as an environment option. OK?
2. **Embeddings**: `bge-m3` (1024, French), confirmed?
3. **Rerank**: remove Voyage and provide an **optional local TEI reranker** (otherwise RRF), OK, or RRF only without TEI?
4. **Transcription**: move to **local faster-whisper** (optional profile), OK?
5. **Scope**: remove **all** cloud providers (including `OPENAI` / `ANTHROPIC` / `GOOGLE` from the `.env.example` files), confirmed?
