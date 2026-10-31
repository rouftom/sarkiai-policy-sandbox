# Hardware requirements for deployment

The system is **local-first** (no cloud). The dimensioning resource is
**Ollama** (LLM and embeddings). Qdrant, MongoDB, MinIO, ingestion, the API and
the web app are lightweight. OCR, the reranker and transcription are
**optional** (compose profiles).

## 1. Cost of components

| Component | Disk | RAM/VRAM at runtime | CPU | Optional |
|-----------|------|---------------------|-----|----------|
| **Ollama: qwen3.5:9b** (Q4, multimodal) | **~6.6 GB** | **~8–10 GB** | yes | no (default LLM) |
| Ollama: qwen2.5:14b (Q4, text) | ~9 GB | ~11–16 GB | yes | alternative |
| Ollama: qwen2.5:7b (Q4) | ~5 GB | ~6–8 GB | yes | light alternative |
| **Ollama: bge-m3** (embeddings) | **~1.2 GB** | ~1–2 GB | yes | no |
| Qdrant (vector KB) | < 1 GB (our scale) | ~1–2 GB | no | no |
| MongoDB (audit + CoT) | < 1 GB | ~0.5–1 GB | no | no |
| MinIO (image attachments) | ~0.2 GB | ~0.5 GB | no | no |
| ingestion (FastAPI + PyMuPDF + fastembed) | ~0.5 GB | ~1–2 GB | yes | no |
| API (Bun/Fastify) | — | ~0.25–0.5 GB | no | no |
| Web (Next.js) | — | ~0.5–1 GB | no | no |
| OCR (Tesseract) | — | ~1–2 GB | yes (peaks) | yes (`ocr`) |
| Reranker TEI (bge-reranker-v2-m3) | ~2.3 GB | ~2–4 GB | yes | yes (`rerank` profile) |
| Transcription (faster-whisper large-v3) | ~3 GB | ~4–6 GB | yes (slow) | yes (`media` profile) |
| Docker images (ollama, qdrant, mongo, minio, python, node, tei) | ~7–9 GB | — | — | — |

## 2. Deployment profiles

### A. Minimal (economical demo, CPU)
- **CPU**: 4–8 vCPU · **RAM**: **16 GB** · **Disk**: **25 GB** SSD · **GPU**: none
- `qwen3.5:9b` (6.6 GB) + `bge-m3`, without reranker or transcription

### B. Recommended (full demo, CPU)
- **CPU**: 8–16 vCPU · **RAM**: **32 GB** · **Disk**: **40 GB** SSD · **GPU**: none
- `qwen3.5:9b` + `bge-m3`, optional TEI reranker; multimodal (text + image) enabled
- Text alternative: `OLLAMA_MODEL=qwen2.5:14b`

### C. Comfortable / production (GPU)
- **NVIDIA GPU**: **16–24 GB VRAM** (L4 or A10, 24 GB recommended)
- **CPU**: 8 vCPU · **RAM**: **32–64 GB** · **Disk**: **100 GB** NVMe
- `qwen3.5:9b` (or `qwen3.5:27b` with 32 GB+), fast inference, GPU reranker

### Apple Silicon (unified memory)
- **16 GB**: `qwen3.5:9b` runs comfortably
- **32 GB+**: `qwen3.5:27b` runs comfortably

> Cross-reference: the official ITU repository indicates **~16 GB RAM / ~15 GB disk**
> for `qwen2.5:14b`. Our default `qwen3.5:9b` is **lighter**.

## 3. Disk detail (profile B, first run)

| Item | Size |
|------|------|
| `qwen3.5:9b` | ~6.6 GB |
| `bge-m3` | ~1.2 GB |
| Docker images | ~7–9 GB |
| Build cache + Cameroon corpus | ~5–10 GB |
| **Total** | **~20–27 GB** (plan for 40 GB, as in the recommended profile) |

## 4. Reducing the footprint (environment variables)

| Goal | Setting |
|------|---------|
| Lighter LLM | `OLLAMA_MODEL=qwen2.5:7b` |
| Text LLM | `OLLAMA_MODEL=qwen2.5:14b` |
| No reranker | do not enable the `rerank` profile (`RERANK_URL=` empty) |
| No transcription | do not enable the `media` profile |
| Lighter Whisper | `WHISPER_MODEL=small` |

## 5. Relevant ITU dimensions

This hardware frugality is an **argument**: it supports **D13 Digital
Infrastructure** (compute and energy) and **D11 Edge Privacy** (edge deployment,
no egress), and shows that a sovereign solution can run without a GPU on
ordinary hardware.
