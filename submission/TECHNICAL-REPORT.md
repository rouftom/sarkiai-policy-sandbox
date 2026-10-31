---
title: "AI for Good Sandbox Hackathon: Technical Report"
subtitle: "Team [Team name]: SarkiAI Policy Sandbox (Cameroon)"
---

**Team leader:** Muller Roufaou · **Team members:** [_names_]\
**Contact:** muller.roufaou@djotta.com · **Country:** Cameroon (CM)\
**Github:** https://github.com/rouftom/sarkiai-policy-sandbox\
**Domain:** public governance & health data\
**Alignment:** ITU-T Y.3172 · ITU Readiness 2.0 (6 factors, 13 dimensions)

---

## 1. Introduction

AI is increasingly used to analyse anomalies, but detecting one is only half the
problem. The other half (**how institutions respond**, who is accountable, under
which mandate, within which deadline) is where public systems fail: slowly, ad
hoc, and with uncertain legal footing.

We propose **SarkiAI Policy Sandbox**: a policy-grounded multi-agent engine
that ingests a country's legal corpus into a jurisdiction-scoped knowledge base,
runs **mandated institutional agents** with partial information, executes
**progressive error scenarios** in sequenced blocks, and produces **auditable**
joint reports with a hash-chained log and persisted traces. It scores the **13
ITU readiness dimensions** on 0–5, projects causal what-if effects, and carries
scanned gazette pages through OCR into an impact analysis on open incidents.

**Sovereignty is architectural, not a setting.** Generation (`qwen3.5:9b`) and
embeddings (`bge-m3`, 1024-d) run on-premise in Ollama; no request leaves the
host, and there is no cloud fallback to disable.

---

## 2. Description of the use case

**The case.** Institutional response to a **health-data breach** in a public
hospital connected to a national e-health platform. Then, in the same engine
and corpus, the **exposure of minors' records** on a national learning platform.

**The problem.** Detection is mature; the response is not. Notification duties are
split across the health ministry, the data-protection authority and the cyber
agency. No actor holds the full picture, the law is silent on several hand-offs,
and the outcome depends on who read which document first.

**Gaps in existing solutions.** Notification duties are not allocated across
sectors, so each authority waits for another. Decisions are not machine-readably
audited, so accountability cannot be reconstructed. The tension between the duty
to notify and the duty to preserve continuity of service is unresolved by any
instrument we found. Generic assistants answer with fluent prose and no traceable
basis, and cannot refuse cleanly when the corpus is silent. Cloud inference on
this material is a sovereignty risk we consider unacceptable.

**How the system answers.** Agents are grounded in national provisions with
**article-level citations verified against the retrieved text**: an invented quote
is rejected and generation retried with a directive naming the passage. Mandate
conflicts are surfaced, not smoothed over. Every step lands in a tamper-evident
audit trail and a persisted trace, exportable as a run dossier. Local inference
removes the sovereignty risk by construction, not by policy.

---

## 3. Mapping with ITU-T Y.3172 and Readiness 2.0

Each Y.3172 node maps onto a component of the deployment, carries a requirement,
and is scored against the Readiness 2.0 dimensions it serves.

| Node | Implemented as · requirement | Dimension(s) |
|:---------|:-----------------------------------------------------------|:----------------------------|
| `SRC` | logs, EHR extracts, telemetry, gazettes · coverage, retention, access control | 1 Marketplace · 13 Infrastructure |
| `C` | chunker (FR/EN), OCR, transcription · fidelity to the published text; no pseudo-law from a bad scan | 5 Workflows · 13 Infrastructure |
| `PP` | normalisation, jurisdiction tagging, de-identification · purpose limitation, per-chunk provenance | 1 Marketplace · 6 Human Interface |
| `M` | local generation + hybrid retrieval (`bge-m3` + BM25, RRF, optional rerank) · no external inference | 5 Workflows · 3 Cross-Domain Correlation |
| `P` | citation gate, routing, approvals, scoring · a legal basis per claim; human validation before any side effect | 10 AI & Policies · 7 Strategy Alignment |
| `D` | API, console, signed approval links, console outbox · alignment across institutions | 7 Strategy Alignment · 8 Collaboration |
| `SINK` | agents, officials, joint report, dossier · oversight, inclusion | 9 Impacts of Humans · 6 Human Interface · 11 Inclusion |

Anchoring documents: the 2024 data-protection law and the CEMAC directive (`PP`,
`P`), cybersecurity law 2010/012 (`C`, `P`), the communications law and the ART
compendium (`SRC`), SND30 and PSNSN (`D`, `SINK`). **Sovereignty cuts across all
nodes**: generation, embeddings and reranking run on the deployment host, so
patient data never leaves national infrastructure (dimensions 10 and 11). The
compose file contains no external inference service, and the provider
configuration exposes one mode, `local`.

### 3.1 Knowledge base

**Cameroon: 26 manifest entries, 21 ingestible today**: the 2024 data-protection
law, cybersecurity law 2010/012, communications and e-commerce laws, penal code,
the MINPOSTEL compendium 2023, the ART compendium 2018 (486 pp.), SND30, the
national digital strategy, the digital-health plan (PSNSN 2026-2030), two decrees
and the CEMAC users-rights directive. Five entries have no text: the constitution, the
1996 framework law, the DPA and ANTIC mandates, and the cyber strategy, all
`to_confirm`. They stay listed, not dropped.

Each chunk carries `country`, `jurisdiction`, `docType`, `pillar`,
`headingPath` and `articleNumber`. Eight documents carry an OCR caveat (six with
no text layer, one partial, one non-Unicode font) and go through local Tesseract
with a zone overlay, so an operator sees the exact crop the text came from.

**Ten regional instruments are ingested** for comparison: AU Continental AI
Strategy 2024, Kigali Declaration 2025, Windhoek Statement, Smart Africa
blueprint, and the strategies of Kenya (with roadmap), Rwanda, Egypt, Zambia and
Nigeria. **Six international references are catalogued but not loaded**: ITU-T
Y.3172, the ITU Readiness Framework, WHO, UNESCO, Malabo, OECD: so the system
cannot quote them; they frame the gaps, nothing more. The ITU taxonomy (6
factors, 13 dimensions, 111 metrics) is shipped as
`data/global/itu/dimensions.json` and mirrored in the scoring engine.

---

## 4. What is deterministic, and what is the model

| Step | Mechanism | Arguable? |
|:-----------------|:--------------------------------------------------|:-------------------------|
| Retrieval | Qdrant dense + BM25, RRF, optional rerank | no: arithmetic over vectors |
| Citation extraction | quotes matched against the retrieved corpus | no: exact substring match |
| Citation gate | `validateCitations`: absent quote → rejection, retry with a named directive | no: a loop, not a suggestion |
| Readiness score | weighted composite; causal propagation over a fixed graph | no: arithmetic |
| Scenario sequencing | tick release, per-agent visibility sets | no: declared in the record |
| Audit | hash chain, end-to-end re-verification | no: cryptographic |
| Approval | signed token, single use, expiry, bound to one action | no: signature check |
| Drafting, deciding when to search, ranking impact | `qwen3.5:9b`, on-demand retrieval | **yes**: hence gated, cited, logged |

**The model writes; the system decides what may be written.** The console shows
rejected quotes when a retry happened and the audit records the attempt count, so
the gate can be observed rather than trusted.

---

## 5. Error scenarios

Facts are released in blocks; each institution sees only its block, then the
coordinator reconciles the independent assessments.

**A: health-data breach.** Tick 0: anomalous access on the e-health platform
(ministry, cyber agency). Tick 1: possible exfiltration of patient records
(+ DPA). Tick 2: media pressure and a notification deadline. Output: the **mandate
conflict** between the DPA's notification duty and the ministry's
continuity-of-care duty, the open questions, and the gaps: each with its
article, or an explicit statement that none was found.

**B: minors' records, same corpus, different domain.** Tick 0: a school reports
that the learning platform shows pupils from other schools. Tick 1: ~40,000 pupil
records (names, birth dates, results) reachable for days, some pupils under 13.
Tick 2: parents demand notification within 72 hours; the ministry must decide
whether to suspend the platform. Awkward on purpose: two ministries and a
regulator share the decision, the subjects are minors, and the service cannot
simply be switched off. The engine must name the provisions that apply and say
plainly where the corpus is silent, instead of inventing a 72-hour rule.

**C: a gazette that changes open cases.** A scanned page of the Official Gazette
is analysed zone by zone, OCR'd and ingested as one document. The panel asks what
the new provision changes for open runs: severity, deadlines, runs untouched. The
provision is analysed, not trusted; the zones stay visible so a wrong cut is
caught before the text becomes retrievable.

**When the corpus is silent, we say so.** If the model invents a passage, the
gate rejects it and forces a retry; if retries are exhausted, the answer is shown
marked `validation.ok = false`, with lower confidence and a gap written to the
audit: never presented as established fact. Returning a named
`INSUFFICIENT_EVIDENCE` verdict instead of an uncited answer is our next step:
the refusal mechanics exist, the verdict still needs exposing in the interface.

---

## 6. Policy gaps and standards gaps

Each gap is a text we searched for and did not find, with the action it implies.

| # | Type | Gap | Dim. | Recommendation |
|:--|:-------------|:-------------------------------|:--------|:----------------------------|
| 1 | Law | notification duties not allocated across sectors | 10, 7 | designate a lead authority and an escalation path |
| 2 | Standard | no machine-readable traceability of automated decisions | 5, 6 | require an audit artefact (hash chain + citations) per decision |
| 3 | Policy | no guardrail on secondary use of inferred health signals | 10, 9 | prohibit advertising use; require consent and purpose limitation |
| 4 | Standard | health interoperability formats not binding | 1, 3 | make compliant formats and metadata mandatory |
| 5 | Policy | consent and purpose limitation for minors' data unaddressed | 6, 11 | align with UNESCO and WHO guidance |
| 6 | Infrastructure | no redundancy requirement for critical e-health services | 13 | availability requirements for AI-assisted public services |
| 7 | Policy | no rule on liability when an official follows an AI recommendation and harm follows | 10, 9 | allocate liability, require a **named** approver, logged |

Gap 7 is the one we can act on without waiting for the law: the approval flow is
signed and nominative, so every decision carries a name.

---

## 7. Architecture, Sovereignty, Auditability

```
SRC → C → PP → M → P → D → SINK      (MLFO coordinator; the deployment is the ML sandbox)
```

One `docker compose up`, no hosted dependency: `ollama` (`qwen3.5:9b`, `bge-m3`),
`rerank` (TEI, optional), `qdrant`, `mongodb` (audit, approvals, outbox),
`minio` (content-addressed attachments and page images), `ingestion`, `ocr`
(Tesseract), `transcription` (faster-whisper), `mcp-charts` and `mcp-docx`, `api`
(Fastify, 81 routes), `web` (Next.js, 26 screens, 19 in-console, FR/EN). Twelve
long-running services plus a one-shot MinIO bucket init.

- **Local by construction**: one inference mode, `local`; the console badge says
  so because the configuration accepts nothing else.
- **Sovereign auth**: scrypt passwords, TOTP with single-use recovery codes,
  local reset, sign-up closed by default; no identity provider.
- **E-mail without a provider**: notifications and approval links go to a console
  outbox and the operator log; no SMTP, no relay.
- **Untrusted context, verifiable record**: up to three images per question,
  content-addressed, treated as data never instructions; hash-chained log,
  persisted traces, every citation, exportable with chain verification.

---

## 8. Evaluation-criteria alignment

| Criterion | How the solution addresses it |
|:-------------------------|:--------------------------------------------------------------|
| Knowledge-base quality | 26 entries / 21 ingestible, gazettes through local OCR with zone provenance, `TITRE/CHAPITRE/ARTICLE` tagging, ITU taxonomy, 10 regional strategies |
| Agent capability | mandated agents with partial information, citation-mandatory prompts, on-demand search, coordinator reconciliation, conflict detection |
| Gap identification | seven gaps across the 13 dimensions, each with a recommendation to the regulator |
| Auditability | deterministic citation gate, hash-chained log, traces, dossier export, chain re-verification, named approvals |
| ITU alignment | node-by-node Y.3172 mapping (MLFO, sandbox); Readiness 2.0 (6 factors, 13 dimensions); 0–5 scoring with causal what-if |

Clickable evidence per dimension: **10 AI & Policies** (citations, rejected
quotes, gap table) · **11 Inclusion** (bilingual console, local-only inference,
OCR and voice) · **13 Infrastructure** (the self-hosted stack, offline once models
are pulled) · **7 Strategy Alignment** (scoring against SND30 and PSNSN) ·
**6 Human Interface** (citation dialog, OCR overlay, signed approvals) ·
**5 Workflows** (ticks, approvals, notifications and audit in one flow).

**Reproducibility.** TypeScript/Python monorepo: 18 packages, 81 API routes, 26
screens. Validation for this submission: `typecheck` 38/38, `test` 228 tests in
44 files with 0 failure, production console build 20/20, `docker compose config`
on all three stacks. Unit tests run without infrastructure; integration tests
are environment-gated.

---

## 9. Honest limits

- **Corpus coverage is partial.** Eight documents carry an OCR caveat (numbers
  flagged per document); five entries have no text at all (all `to_confirm`);
  six international references are catalogued but never loaded, so the system
  cannot quote Y.3172, WHO, UNESCO or the OECD principles.
- **The reasoning is a 9B local model**: bounded, slower than a hosted model, and
  its prose quality is not the claim; being gated, cited and logged is.
- **Not legal advice, not a production gate.** A real deployment needs the
  authority's own sign-off on the corpus.
- **The readiness scores are our model of judgement**, built on ITU dimensions
  and metrics, not an official ITU assessment.
- **No live integration with ministries**: inputs are the corpus, the scenario
  record, and what an operator uploads.

---

## 10. From sandbox to deployment

Three concrete steps, in order: source the five `to_confirm` instruments and run
OCR on the eight documents that need it, so the corpus claim is complete rather
than honest-but-partial; expose the `INSUFFICIENT_EVIDENCE` verdict in the
console and the dossier; and harden the approval path: mandatory reason, no
self-approval, and an action type with no approval route at all, because some
things are not ours to authorise. Each is a bounded change to code we already
run, not a redesign.

---

## 11. Team and submission

| Role | Member |
|:--------------------|:------------------------------------------------------------|
| Team leader | Muller Roufaou |
| Members | [_names, max 4_] |
| Mentor | [_name if applicable_] |

Repository: https://github.com/rouftom/sarkiai-policy-sandbox · Knowledge base:
`data/country/cm/` and `data/global/` · Demo video: [_link_].

**Licence.** Code Apache-2.0; knowledge base and documentation CC BY 4.0. No API
keys in the repository, at any commit.
