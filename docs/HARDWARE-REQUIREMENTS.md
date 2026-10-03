# Exigences matérielles de déploiement

Le système est **local-first** (aucun cloud) : la ressource dimensionnante est
**Ollama** (LLM + embeddings). Qdrant, MongoDB, l'ingestion, l'API et le web sont
légers. L'OCR, le reranker et la transcription sont **optionnels** (profils
compose).

## 1. Coût des composants

| Composant | Disque | RAM/VRAM à chaud | CPU | Optionnel |
|-----------|--------|------------------|-----|-----------|
| **Ollama — qwen2.5:14b** (Q4) | **~9 Go** | **~11–16 Go** | oui (lent) | non (LLM par défaut) |
| Ollama — qwen2.5:7b (Q4) | ~5 Go | ~6–8 Go | oui | alternative |
| **Ollama — bge-m3** (embeddings) | **~1,2 Go** | ~1–2 Go | oui | non |
| Qdrant (KB vectorielle) | < 1 Go (notre échelle) | ~1–2 Go | non | non |
| MongoDB (audit + CoT) | < 1 Go | ~0,5–1 Go | non | non |
| ingestion (FastAPI + PyMuPDF + fastembed) | ~0,5 Go | ~1–2 Go | oui | non |
| API (Bun/Fastify) | — | ~0,25–0,5 Go | non | non |
| Web (Next.js) | — | ~0,5–1 Go | non | non |
| OCR (Tesseract) | — | ~1–2 Go | oui (pic) | oui (`ocr`) |
| Reranker TEI (bge-reranker-v2-m3) | ~2,3 Go | ~2–4 Go | oui | oui (profil `rerank`) |
| Transcription (faster-whisper large-v3) | ~3 Go | ~4–6 Go | oui (lent) | oui (profil `media`) |
| Images Docker (ollama, qdrant, mongo, python, node, tei) | ~6–8 Go | — | — | — |

## 2. Profils de déploiement

### A. Minimal (démo économique, CPU, LLM 7B)
- **CPU** : 4–8 cœurs · **RAM** : **16 Go** · **Disque** : **25 Go** SSD · **GPU** : aucun
- `OLLAMA_MODEL=qwen2.5:7b`, sans rerank ni transcription
- LLM lent (~2–5 tok/s) mais fonctionnel ; OK pour validation/démo courte

### B. Recommandé (démo complète, CPU, LLM 14B)
- **CPU** : 8–16 cœurs · **RAM** : **32 Go** · **Disque** : **40 Go** SSD · **GPU** : aucun
- `qwen2.5:14b` + `bge-m3`, rerank TEI optionnel
- LLM CPU lent (14B ≈ 1–3 tok/s) : prévoir de la patience sur les 13 dimensions

### C. Confortable / production (GPU)
- **GPU NVIDIA** : **16–24 Go VRAM** (RTX 4060 Ti/4070 Ti 16 Go, 4080, 4090 24 Go, L4/A10 24 Go)
- **CPU** : 8+ cœurs · **RAM** : **32–64 Go** · **Disque** : **100 Go** NVMe
- Inférence rapide, reranker TEI en GPU possible, multi-utilisateurs

### Apple Silicon (unified memory)
- **16 Go** : `qwen2.5:7b` confortable, `14b` juste
- **32 Go+** : `qwen2.5:14b` confortable

> Référence croisée : le repo ITU officiel indique lui-même **~16 Go RAM
> minimum** et **~15 Go disque** pour `qwen2.5:14b` — cohérent avec ce tableau.

## 3. Détail disque (profil B, premier lancement)

| Poste | Taille |
|-------|--------|
| `qwen2.5:14b` | ~9 Go |
| `bge-m3` | ~1,2 Go |
| Images Docker | ~6–8 Go |
| Build cache + corpus CM | ~5–10 Go |
| **Total** | **~25–30 Go** (prévoir 40 Go) |

## 4. Réduire l'empreinte (variables env)

| Objectif | Réglage |
|----------|---------|
| LLM plus léger | `OLLAMA_MODEL=qwen2.5:7b` |
| Pas de rerank | ne pas activer le profil `rerank` (`RERANK_URL=` vide) |
| Pas de transcription | ne pas activer le profil `media` |
| Pas d'OCR | ne pas démarrer le service `ocr` si aucun scan |
| Whisper léger | `WHISPER_MODEL=small` |

## 5. Dimensions ITU concernées

Cette sobriété matérielle est un **argument** : elle alimente **D13 Digital
Infrastructure** (compute/énergie) et **D11 Edge Privacy** (déploiement en
bordure, sans egress), et démontre qu'une solution souveraine peut tourner sans
GPU sur du matériel courant.
