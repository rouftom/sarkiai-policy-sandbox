---
title: "AI for Good Sandbox Hackathon — Technical Report"
subtitle: "Team [Team Name] — SarkiAI Policy Sandbox"
---

**Team leader:** [name] · **Team members:** [names] · **Contact:** [email] · **Github:** [repo URL]

**Domain:** Healthcare · **Country:** Cameroon (CM) · **Alignment:** ITU-T Y.3172 + ITU AI Readiness Framework Report 2.0

---

## 1. Introduction

AI is increasingly used to analyse anomalies, but detecting an anomaly is only the
first half of the problem. The second half — **how institutions respond**, who is
accountable, under which mandate, within which legal deadline — is where public
systems fail: it is slow, ad hoc, and legally uncertain.

We propose **SarkiAI Policy Sandbox**, a *policy-grounded multi-agent engine* that
(a) ingests a country's legal and policy corpus into a jurisdiction-scoped,
vectorised knowledge base, (b) runs **mandated institutional agents** that each
operate under a distinct legal mandate and partial information, (c) executes
**progressive error scenarios** where events are released in sequenced blocks,
and (d) produces **auditable** joint situation reports with hash-chained logs and
persisted chain-of-thought traces.

The solution is designed **local-first and sovereign**: all language and embedding
models run on-premise (Ollama: `qwen3.5:9b` + `bge-m3`); no data leaves the
infrastructure. This directly raises the ITU Readiness dimensions **D10 AI &
Policies** (`d10_m10` Data Sovereignty) and **D11 AI for Inclusion** (`d11_m06`
Edge Privacy). The architecture is mapped node-by-node to **ITU-T Y.3172**
(`SRC → C → PP → M → P → D → SINK`) and to the **AI Readiness Framework 2.0**
(6 factors, 13 dimensions).

## 2. Description of the use case

**Use case.** AI-assisted detection of, and institutional response to, a
**health-data breach** in a public hospital connected to a national e-health
platform.

**The problem.** Technical detection of a breach is mature, but the *institutional
response* is not: notification duties are split across the health ministry, the
data-protection authority, the telecom regulator and the national cyber agency;
no single actor has the full picture; and the law is silent on several
cross-sector hand-offs. The result is delay, duplicated or contradictory action,
and weak accountability.

**Gaps in existing solutions.** (1) Responsibilities for notification are not
clearly assigned across sectors. (2) Decisions are not machine-readably audited,
so accountability cannot be reconstructed. (3) The tension between the
data-protection duty to notify and the ministry's duty to preserve continuity of
care is unresolved. (4) Cloud-based AI creates a sovereignty/privacy risk for
sensitive health data.

**How the solution addresses these gaps.** The engine grounds every agent in the
applicable national provisions (with mandatory article-level citations), detects
**conflicts between institutional mandates**, resolves them through a coordination
protocol, and records every step in a tamper-evident audit trail and a persisted
reasoning trace. Because it runs entirely on-premise, it removes the
sovereignty/privacy risk by construction.

## 3. Use case requirements

Each node of the pipeline carries requirements, each anchored to a policy
document in the knowledge base (see §4):

| Node | Component | Requirements |
|------|-----------|--------------|
| `SRC` | e-health access logs, EHR, network telemetry | Minimum volume/coverage for valid inference; defined retention; access control |
| `C` | Security telemetry collector (hospital + operator) | Reliability and availability; lawful interception safeguards |
| `PP` | Normalisation, pseudonymisation, de-identification | Purpose limitation; de-identification before cross-sector sharing |
| `M` | Anomaly / exfiltration detection model | Model provenance and metadata; benchmarking; privacy guardrails |
| `P` | Policy rules: notification duty, mandate routing, guardrails | Legal basis; human-in-the-loop; overriding conditions |
| `D` | Ministry dashboard + DPA case management | Strategy alignment across institutions; energy/availability |
| `SINK` | Institutional agents + officials; public statement | Human oversight; inclusion; inter-institutional collaboration |

**Cross-cutting requirement — sovereignty.** Inference and embeddings must run
locally so that patient data never leaves the national infrastructure (D10, D11).

## 4. Mapping with ITU-T Y.3172 Readiness 2.0 and domain-specific policies

| Node | Use-case component | Readiness 2.0 dimension(s) | Applicable policy documents (KB) |
|------|--------------------|----------------------------|----------------------------------|
| `SRC` | e-health logs, EHR, telemetry | D1 Data/Model Marketplace · D13 Digital Infrastructure | National health framework law (CM); electronic communications law |
| `C` | Security telemetry collector | D13 Digital Infrastructure | Cybersecurity law (CM) |
| `PP` | Normalisation & de-identification | D1 Data/Model Marketplace · D6 Human Interface | Data-protection law (CM); Malabo Convention 2014 |
| `M` | Anomaly / exfiltration model | D5 Integration of AI in Workflows · D3 Cross-Domain | Benchmarking/privacy standards; ITU-T Y.3172 |
| `P` | Notification duty, mandate routing, guardrails | D10 AI & Policies · D7 Strategy Alignment | Data-protection law; cybersecurity law; authority mandates (DPA, ANTIC) |
| `D` | Ministry dashboard + DPA case management | D7 Strategy Alignment · D8 Collaboration with AI | Institutional mandates; NDS30 |
| `SINK` | Institutional agents + officials | D9 Impacts of Humans · D6 Human Interface · D11 AI for Inclusion | e-health policy; WHO ethics guidance |

Global best-practice references (for gap analysis): ITU AI Readiness Report 2.0,
ITU-T Y.3172, WHO *Ethics and governance of AI for health*, UNESCO AI Ethics,
AU Continental AI Strategy 2024, Kigali Declaration 2025.

## 5. Error scenarios

The engine releases events in **sequenced blocks**, with different agents receiving
different information (information asymmetry); after each block the agents produce
independent assessments that the coordinator reconciles.

### Scenario A — Health-data breach (baseline)

| Tick | Event | Seen by |
|------|-------|---------|
| 0 | Anomalous access detected on the e-health platform | health ministry, cyber agency |
| 1 | Possible exfiltration of patient records to an external host | + data-protection authority |
| 2 | Media pressure; a notification deadline is at stake | DPA, ministry, coordinator |

**Expected output.** A joint situation report highlighting the **mandate
conflict** between the DPA's notification duty and the ministry's continuity-of-care
duty, open questions, and prioritized gaps.

### Scenario B — Controversial: misuse of an inferred signal

| Tick | Event | Seen by |
|------|-------|---------|
| 0 | The system infers vulnerability signals (absence, pathology) | health ministry, DPA |
| 1 | Targeted advertisements exploit these **inferred** signals | DPA, cyber agency, coordinator |
| 2 | Ethical escalation: sanction, compliance, remediation | DPA, ministry, coordinator |

This escalates from a consumer-protection issue to a **data-privacy and ethics
breach**. The knowledge-base policies must trigger stronger guardrails:
prohibiting the use of inferred health signals for advertising, enforcing consent
and purpose limitation, and referring the matter to the national AI ethics
oversight. The engine surfaces this as a mandate conflict and cites the relevant
provisions and global best practice.

## 6. Policy gaps and standards gaps

| # | Type | Gap | Dimension(s) | Global best practice |
|---|------|-----|--------------|----------------------|
| 1 | Law | Notification responsibilities not allocated across sectors | D10, D7 | Single lead authority + documented escalation (Y.3172) |
| 2 | Standard | No machine-readable traceability of automated decisions | D5, D6 | Audit + source attribution (AI Readiness Framework) |
| 3 | Policy | Insufficient guardrails on inferred signals (advertising) | D10, D9 | Prohibit secondary use of health data (WHO) |
| 4 | Standard | Non-binding health interoperability formats | D1, D3 | Standards-compliant formats & metadata |
| 5 | Policy | Consent & purpose limitation for children's data | D6, D11 | UNESCO AI Ethics; WHO |
| 6 | Infrastructure | Network/energy redundancy for critical health services | D13 | Availability requirements (AI Readiness Framework) |

## 7. Architecture and ITU-T Y.3172 alignment

The system implements the Y.3172 pipeline as named nodes and is orchestrated by an
ML function orchestrator (MLFO), with the ITU sandbox as the ML sandbox for
validation/fine-tuning:

```
SRC → C → PP → M → P → D → SINK      (orchestrated by MLFO; validated in ML sandbox)
```

- **Collector (C)** and **Preprocessor (PP)**: a FastAPI ingestion service performs
  structure-aware legal chunking (TITRE/CHAPITRE/ARTICLE, FR/EN), OCR fallback for
  scanned gazettes, and **local `bge-m3` embeddings**.
- **Model (M)**: hybrid retrieval (dense + BM25 sparse, RRF fusion, optional local
  TEI reranker) and **local `qwen3.5:9b`** agents.
- **Policy (P)**: citation-mandatory prompts, a gap engine and declarative
  workflow profiles (simulation / readiness / hybrid).
- **Distributor (D)** and **SINK**: a Fastify API + Next.js console; institutional
  agents produce a reconciled joint situation report.
- **Management & security**: hash-chained audit log, persisted chain-of-thought
  traces, service-to-service authentication.
- **ML sandbox**: sandbox deployment with local models; optional LoRA/QLoRA
  fine-tuning (unsloth) with the dataset kept on-premise.

## 8. Sovereignty, privacy and readiness scoring

All models are **local** (Ollama), so no health data is transmitted to external
providers — a direct, verifiable answer to **D10 `d10_m10` Data Sovereignty** and
**D11 `d11_m06` Edge Privacy**. The engine also scores each of the **13 dimensions
on a 0–5 maturity scale** (weighted composite) and projects **causal what-if**
effects across interdependent dimensions, so the same artifact supports both the
error-scenario exercise and a structured readiness assessment.

## 9. Team

| Role | Member |
|------|--------|
| Team leader | [name] |
| Members | [names] |
| Internal mentor | [name] |

_Solution repository, knowledge base and a demo video are provided as submission
materials._
