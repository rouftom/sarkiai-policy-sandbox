# Data and model sovereignty: analysis

> **Historical note.** Analysis written before the refactoring. The current
> distribution is local-only: every hosted provider mentioned below as an
> alternative has been removed from the code and the configuration.

> Answer to the remark: "their repository uses Ollama for fine-tuning, probably
> a data-sovereignty aspect. What about our case?"
> **Analysis document only: no implementation.**

## 1. Clarification: Ollama is not fine-tuning

Ollama is a **local inference server** (serving open-weight models), not a
fine-tuning tool. In the reference repository:

| Use | Technology | Role |
|-----|------------|------|
| Reasoning | `qwen2.5:14b` via **Ollama** | scoring and analysis of the 13 dimensions |
| Embeddings | `nomic-embed-text` via **Ollama** | vectorisation of the KB |
| KB | ChromaDB (local) | vector storage |
| Sessions | SQLite | state and audit |

Everything runs **offline, on the machine**. Fine-tuning is a **separate
capability**, outside the inference path. The reason for Ollama here is therefore
**sovereignty / data sovereignty**: no outbound call, and no data (health,
national strategies, etc.) leaves the infrastructure.

## 2. Why this is central for our case

- **Sensitive data**: health domain, patient records, inferred signals.
- **Regulatory context**: data protection (Cameroon), MINPOSTEL, and possibly
  national sovereignty.
- **"AI for Good" / Africa narrative**: a system that works **without dependence
  on foreign APIs** is a strong argument in front of the ITU jury.
- **ITU sandbox**: it may be partly isolated or air-gapped; depending on external
  APIs (Voyage, DeepSeek, Groq, etc.) can be blocking or disqualifying.

## 3. Our current position (internal audit)

| Component | Current technology | Data leaves? |
|-----------|--------------------|--------------|
| Vector store | **Qdrant** (self-hosted) | No ✅ |
| Ops (audit/CoT) | **MongoDB** (self-hosted) | No ✅ |
| OCR | **Tesseract** (local) | No ✅ |
| Chunking / ingestion | **Local Python** | No ✅ |
| **Embeddings** | **VoyageAI** (US API) | **Yes 🔴** |
| **Reasoning LLM** | **DeepSeek / Groq / OpenAI…** (API) | **Yes 🔴** |
| Transcription | Groq Whisper (API) | Yes 🟠 |

**Conclusion**: our storage and document processing are already sovereign; **the
models (embeddings and LLM) are what send data out.** That is exactly where the
question lies.

## 4. Sovereignty spectrum

| Level | Model | Egress | Quality | Cost | Operations |
|-------|-------|--------|---------|------|------------|
| 0 | Global public API (DeepSeek / OpenAI / Voyage) | Total | ★★★★★ | Pay per token | None |
| 1 | Regional or EU cloud API (Mistral, OVH, Scaleway) | Regional | ★★★★ | Paid | Low |
| 2 | **Self-hosted** open weights (Ollama / vLLM) | None | ★★★ | Infrastructure (GPU/RAM) | Medium |
| 3 | **Dedicated on-premise / air-gapped** open weights | None | ★★★ | Infrastructure | High |
| 4 | **Local fine-tuning** of open weights (LoRA/QLoRA) | None | ★★★★ | Infrastructure + time | High |

## 5. Options (without implementation)

### A. Local inference via Ollama (mirror of the ITU repository)
- LLM: `qwen3.5:9b` (multimodal text and image), `qwen2.5:14b`, `llama3.1:8b`, `gemma3:12b`, `mistral`.
- Embeddings: `nomic-embed-text`, **`bge-m3`** (multilingual, excellent in French, preferable for our FR/EN corpora).
- Pros: zero egress, free, offline, deployable in the sandbox. Cons: ~16 GB
  RAM, latency, quality below frontier models, operations.

### B. Scaled self-hosted serving
- **vLLM** / **TGI** / **llama.cpp** for multi-user throughput (GPU).
- Relevant if the demo must handle several simultaneous users.

### C. Managed sovereign inference
- Mistral (France/EU), OVHcloud AI, Scaleway, or an African regional cloud.
- Trade-off: quality close to the frontier, egress limited to a jurisdiction
  that is "acceptable", to be validated against the Cameroonian legal framework.

### D. Hybrid routing by sensitivity
- A **policy router**: sensitive data stays local; open data (global good
  practices) may go to the cloud.
- Consistent with our engine: sensitivity is already an attribute of the corpus
  (`country`, `docType`), and a classifier could assess it.

### E. Open-weight models (permissive licences)
- Qwen2.5, Llama 3.1/3.3, Mistral, Gemma, **Aya** (multilingual), BGE-M3.
- Sovereign embeddings: **bge-m3**, multilingual-e5, nomic, via Ollama or
  **TEI** (Text Embeddings Inference).

### F. Fine-tuning without exfiltration
- **LoRA/QLoRA** on self-hosted open weights (`unsloth`, `peft`), or through the
  ITU sandbox credits. The **dataset stays on-premise**; only the public initial
  weights and the adapted model move.

## 6. What would change for us (impact, not implemented)

| Component | Impact | Scope |
|-----------|--------|-------|
| `packages/agents/src/model.ts` | add a `local` provider (Ollama / OpenAI-compatible) | Small |
| `packages/retrieval` | embeddings abstraction (Voyage → local bge-m3) | Medium |
| `services/transcription` | local Whisper (`faster-whisper`) instead of an API | Medium |
| Docker | `ollama` service (+ models), as in the ITU repository | Small |
| **Unchanged** | Qdrant, Mongo, structure-aware ingestion, citations, audit, coordinator | — |

Our `model.ts` is already a **provider factory**: the hook point exists. That is an asset.

## 7. Recommendation (analysis)

1. **Sovereign by default**: adopt a `local` provider (Ollama, bge-m3 embeddings)
   as the default mode for the health domain, with cloud providers **optional**
   (switched by environment variable).
2. **Hybrid routing** (option D) to use the cloud only for non-sensitive content.
3. **Keep** Qdrant and Mongo self-hosted (already sovereign).
4. **Fine-tuning**: local LoRA/QLoRA or ITU sandbox credits, dataset on-premise.
5. **Jury narrative**: "runs entirely offline in the ITU sandbox; no health data
   leaves the infrastructure": a strong sovereignty argument, aligned with
   "AI for Good".

### Decision table

| Data sensitivity | Target | Choice |
|------------------|--------|--------|
| Health / PII | On-premise / ITU sandbox | Local (Ollama), bge-m3 embeddings |
| Global good practices (public) | Cloud allowed | API permitted |
| Mixed documents | Hybrid | Sensitivity router |

**In one sentence**: our architecture is already sovereign except at its two
ends (embeddings and LLM); moving to Ollama and bge-m3 is a **localised** change
(provider factory plus one Docker service), not a rewrite, and is probably **the
choice most aligned** with the ITU if the sandbox is isolated.

## 8. Decision applied (implemented)

Chosen option: **local-first, cloud entirely removed.**

| Element | Decision |
|---------|----------|
| LLM | **`qwen3.5:9b`** via Ollama (multimodal text and image, 6.6 GB); alternatives `qwen2.5:14b` / `qwen2.5:7b` via environment variables |
| Embeddings | **`bge-m3`** (Ollama): 1024-dim, multilingual, French |
| Rerank | **local TEI** (`BAAI/bge-reranker-v2-m3`), compose profile `rerank`; otherwise RRF |
| Transcription | **faster-whisper** local (profile `full` / `media`) |
| Cloud providers | **removed** (DeepSeek, Groq, OpenAI, Anthropic, Google, Voyage) |
| Fine-tuning | **unsloth** (local LoRA/QLoRA), see `docs/ROADMAP.md` |

Direct benefit on the evaluated metrics: **D10 `d10_m10` Data Sovereignty** and
**D11 `d11_m06` Edge Privacy** reach their maximum, since no data moves outside
the infrastructure.
