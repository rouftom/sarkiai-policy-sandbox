# Cameroon corpus (CM): collection and ingestion

Goal: build the national knowledge base scoped to `country=cm`, then the global
reference (`country=global`) used by the gap engine.

## 1. Machine-readable checklist

- National corpus: [`data/country/cm/manifest.json`](../data/country/cm/manifest.json)
- Global good practices: [`data/global/itu/manifest.json`](../data/global/itu/manifest.json)

Each entry has a `status`:

| `status` | Meaning |
|----------|---------|
| `verified` | public instrument whose number and title are reliable |
| `to_confirm` | **to be checked before ingestion** (number, version in force, official URL) |

> ⚠️ Golden rule: a factual error in the KB propagates into the agents' answers.
> Never ingest a text marked `to_confirm` without confirmation.

## 2. Official sources to prefer

| Issuer | Role |
|--------|------|
| Prime Minister's Office / Presidency | constitution, decrees, founding texts |
| National Assembly | laws |
| MINPOSTEL | digital strategy, telecoms, AI |
| Ministry of Public Health | health framework law, e-health |
| ANTIC | cybersecurity, technical mandates |
| ART | electronic communications |
| Data protection authority | data protection |
| SND30 / MINEPAT | development strategy |
| OAPI / AU | intellectual property, regional treaties |

## 3. Categories → ITU dimensions

| Category (`docType`) | Mainly informed dimensions |
|----------------------|----------------------------|
| `law` | ai_policies, human_interface |
| `strategy` | contextualization, digital_infrastructure |
| `regulation` | ai_policies, human_interface |
| `policy` | cross_domain, ai_integration |
| `treaty` | data_marketplace, human_interface |
| `guidance` / `standard` (global) | all: reference for gaps |

## 4. Ingestion procedure

```bash
# 1. place the files (PDF/TXT) in data/country/cm/
cp /path/to/law.pdf data/country/cm/

# 2. ingest (Qdrant + local bge-m3): chunking extracts TITRE/CHAPITRE/ARTICLE
./scripts/seed.sh --country cm --doc-type law --dir data/country/cm

# 3. global corpus
./scripts/seed.sh --country global --jurisdiction international --doc-type guidance --dir data/global/itu
```

The ingestion service switches automatically to OCR (`services/ocr`) for scanned
PDFs (gazettes).

## 5. Quality control (before submission)

1. **Coverage**: each ITU dimension has at least one national provision and at
   least one global reference.
2. **Retrieval**: `POST /v1/agents/ask` on 5–10 reference questions; the
   citations point to the right article.
3. **Gaps**: `POST /v1/readiness/report`; check that each gap cites a national
   source **and** a global good practice.
4. **Asymmetry**: the health scenario releases events in blocks, and each agent
   sees only what concerns it.

## 6. Ethics and legality

- Check the reuse rights of texts before publication in the ITU AI for Good Lab
  (laws and decrees are generally public).
- Do not ingest personal data (the corpus is regulatory, not nominative).
- Always cite the issuer and the original URL.
