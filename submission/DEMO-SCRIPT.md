# Demo video: script and storyboard (≤ 7 min)

**Format:** screen capture with English voice-over and English subtitles.
**Target length:** 6 min 40 s.
**Preparation:** `docker compose up --build -d`, `make models` and
`make seed-corpus COUNTRY=cm` already run; a scanned gazette page ready in
`apps/web/public/samples/`; one completed scenario run ready for the audit part.

> Never film a `.env` file, an approval token or any secret. The `local` badge
> and the logs are enough to prove sovereignty.

| Time | Screen | Voice-over (EN) |
|-----:|--------|-----------------|
| 0:00–0:30 | Title card: team name, "SarkiAI Policy Sandbox (Cameroon)", ITU badge | "Detecting a health-data leak is only half of the problem. The other half, how institutions respond, who is accountable, under which mandate and within which deadline, is where public systems fail." |
| 0:30–1:10 | Y.3172 diagram `SRC→C→PP→M→P→D→SINK` + the 13 ITU dimensions | "We propose a policy-grounded multi-agent engine, aligned with ITU-T Y.3172 and the AI Readiness Framework 2.0: 6 factors, 13 dimensions. Everything runs locally: no cloud provider, no data leaves the host." |
| 1:10–1:50 | Terminal: `docker compose ps` (12 services), then the console, `local` badge | "Twelve services: Ollama with qwen3.5:9b and bge-m3, Qdrant, MongoDB, MinIO, Tesseract, faster-whisper, two MCP servers. One `docker compose up`. The configuration exposes a single mode: local." |
| 1:50–2:35 | `make seed-corpus COUNTRY=cm`; then `Knowledge base`: list of documents with status and type | "The Cameroon corpus has 26 entries, 21 of them ingestible today. Five are marked `to_confirm`: we show what we do not have rather than inflating the corpus." |
| 2:35–3:05 | An open chunk: `TITRE > CHAPITRE > ARTICLE`, `articleNumber`, source | "Chunking is structure-aware: every passage keeps its legal breadcrumb. That is what makes a citation verifiable rather than merely plausible." |
| 3:05–4:20 | `Crisis scenarios` → *Health-data breach* → **Start this batch**, then **Release next batch** ×2; per-block reports, then the joint report | "Facts are revealed in blocks. Each institution sees only what its mandate allows: the ministry, the data protection authority and the cyber agency reason on partial information. The coordinator reconciles them and names the mandate conflict instead of smoothing it over." |
| 4:20–4:55 | Open a citation from an answer: dialog, full passage highlighted, neighbouring passages | "Every claim carries the article it rests on. The dialog loads the whole passage from the API, not the excerpt the answer had copied." |
| 4:55–5:35 | Ask a question, then `Audit trail`: `citation.rejected` event, number of attempts | "If the model invents a citation, the gate rejects it, names the faulty passage and asks for a new generation. The attempt is written to the audit trail: you can see the safeguard working instead of taking it on trust." |
| 5:35–6:15 | `Scanned gazette` → gazette panel: scan, OCR zone overlay, ingestion of a page, then the **impact** on open runs | "A page of the Official Gazette arrives as a scan. OCR works zone by zone, and the overlay shows exactly what was read: a bad cut is visible before the text becomes searchable. The panel then shows what the new provision changes for incidents already open." |
| 6:15–6:40 | Signed approval link, opened from `Notifications` (console outbox) | "Every action with a side effect goes through a named, signed, single-use approval. E-mail also stays local: links go to a console outbox, with no SMTP and no third-party relay." |
| 6:40–6:55 | `AI readiness`: 13-dimension composite + causal what-if | "The same engine scores the 13 dimensions from 0 to 5 and projects the effect of a policy decision on a fixed causal graph: the same inputs always give the same result." |
| 6:55–7:00 | Closing card: repository, licence, "Local · Auditable · ITU-aligned" | "Sovereign, auditable, ITU-aligned. The code and the corpus are public." |

## Screenshots to prepare

1. Title card (team name and solution name).
2. Y.3172 diagram and the 13 dimensions.
3. `docker compose ps` and the `local` badge.
4. List of documents with statuses (`present` / `to_confirm`).
5. A chunk showing `headingPath` and `articleNumber`.
6. Scenario: 3 blocks, then the joint report (mandate conflicts visible).
7. Citation dialog with highlighting.
8. Audit: `citation.rejected` and the attempt counter.
9. Gazette: OCR overlay and impact panel.
10. Signed approval and console outbox.
11. Readiness and what-if.
12. Closing card.

## Recording notes

- **Target length 6:40**, never more than 7:00. Cut waiting time for the model
  in editing, but keep one real-time wait on screen for credibility.
- English subtitles are produced from the English voice-over; review them before
  publication, do not rely on automatic translation.
- Avoid two traps: never show an endless loading state without explanation;
  never say "the AI decided". The system decides, the model drafts.
- Fallback without narration: same captures, title cards and royalty-free music.
- If a service is down on the day of recording, film the demo on the scenario
  alone (3:05–6:15): it is the core and fits in three minutes.
