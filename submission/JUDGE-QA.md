# Judge Q&A: SarkiAI Policy Sandbox

Nine likely questions. For each one: **why the judge asks it**, **the answer to
give**, **what to click**, **what to show**.

Rule of conduct: never claim more than the code does. If we do not know, we say
"this is not implemented yet". That is what makes the rest credible.

---

## 1. "Show me the core of the system live, not the slides."

**Why:** they want to see a living system, not a video.

**Answer:**
> I'll run the health-data breach scenario. The scenario is released in batches,
> and each institution only sees the batch it is entitled to see. The ministry,
> the data-protection authority and the cyber agency produce independent
> assessments; the coordinator reconciles them and names the mandate conflicts
> instead of smoothing them over. Every claim carries the article it rests on.

**To click:** `Crisis scenarios` → *Health-data breach in a public hospital* →
**Start this batch**, then **Release next batch** (3 times).

**To show:** the three per-block reports, then the joint report: *agreements*,
*mandate conflicts*, *open questions*. Open a citation: the dialog loads the full
passage, not the excerpt.

---

## 2. "Is the reasoning just an LLM making things up?"

**Why:** this is the question that kills every "RAG + agents" project.

**Answer:**
> No. The model writes, but the system decides what may be written. Retrieval is
> arithmetic over vectors; the citation gate is exact substring matching; the
> readiness score and the audit chain are deterministic. The model's only job is
> drafting and deciding when to search, and everything it produces is gated,
> cited and logged. Remove the model and the scoring, the audit and the approvals
> still work: you lose the prose, not the decision record.

**To click:** nothing special; show the determinism table in §4 of the report.

**To show:** `packages/citations/src/index.ts` (`validateCitations`),
`packages/agents/src/orchestrator.ts` (the retry loop), and the validation badge
under an answer.

---

## 3. "How do you prove a citation is not fabricated?"

**Why:** an invented citation in a legal report is a serious fault; they are
testing robustness.

**Answer:**
> Every quote in an answer is matched against the retrieved chunk text. A quote
> that is not there is rejected, the model is asked again with a directive that
> names the rejected passage, and the attempt is written into the audit trail.
> The console shows when a retry happened, so you can see the gate working
> instead of trusting it. If the retries are exhausted, the answer is returned
> flagged `validation.ok = false`, with lower confidence and a recorded gap. It
> is never presented as established fact.

**To click:** ask a question that forces a citation, open the citation (button in
the answer), then `Audit trail` → the `citation.rejected` / `agent.assessment`
event with the number of attempts.

**To show:** the citation dialog highlighting the passage in the full document,
and the matching audit entry.

---

## 4. "And when the law says nothing?"

**Why:** this is the real case; a system that invents is disqualifying.

**Answer:**
> The corpus runs out, and we say so. If no retrieved passage supports a claim,
> the gate refuses the quote, and after the retry budget the answer comes back
> unvalidated, with a gap record and a lower confidence. We also refuse to
> pretend we hold texts we do not: five Cameroon entries are listed as `to_confirm`,
> so the system cannot quote them; six international references are also
> catalogued but not loaded. Those absences are the gap analysis.

**To click:** `Knowledge base` → filter on `status: to_confirm`; then ask a
question outside the corpus (for example on a text that was not ingested).

**To show:** the list of documents to confirm, and the answer marked as not
validated. **Do not say** that the `INSUFFICIENT_EVIDENCE` verdict is already
delivered: it is specified, not yet exposed in the UI.

---

## 5. "Is it really sovereign? Prove that no call leaves the host."

**Why:** this is our differentiator; they check that it is real.

**Answer:**
> Everything runs in the compose file: `qwen3.5:9b` and `bge-m3` on Ollama,
> Qdrant, MongoDB, MinIO, Tesseract, faster-whisper, and two local MCP servers.
> The provider configuration exposes exactly one mode, `local`: there is no
> cloud key to revoke and no fallback that silently reaches the internet. Even
> e-mail stays local: approval links and notifications go to a console outbox,
> with no SMTP and no third-party relay.

**To click:** `docker-compose.yml` (no external service), the `local` badge in
the console, `Notifications` (outbox).

**To show:** `provider-badge`, the `Notifications` page, and `.env.example`, where
`OLLAMA_BASE_URL` points to the internal service. Blur any secrets.

---

## 6. "How is this different from ChatGPT with my PDFs?"

**Why:** it is the implicit competitor of every RAG project.

**Answer:**
> A chat with PDFs answers one question at a time. Here the unit is an
> institution with a mandate and partial information: agents do not see the same
> facts, so the system can find the conflict between the DPA's notification duty
> and the ministry's continuity-of-care duty. On top of that: a signed,
> nominative approval before any side effect, a hash-chained audit log with
> end-to-end verification, an exportable run dossier, and a 0–5 readiness score
> over the 13 ITU dimensions with causal what-if. A chatbot does not have a
> mandate, a signature, or an audit chain.

**To click:** `AI readiness` → composite and what-if; the signed approval link
(opened from `Notifications`); `Audit trail` → chain verification; dossier export.

**To show:** the causal graph, then the public approval screen, then the
"chain intact" badge.

---

## 7. "Is your readiness score official?"

**Why:** they know the ITU framework and will test the rigour.

**Answer:**
> It is our model of judgement, built on the ITU framework, 6 factors, 13
> dimensions, 111 metrics, not an official ITU assessment. The scores are a
> weighted composite computed in code, and the causal projection runs over a
> fixed graph, so the same inputs give the same result. What is official is the
> taxonomy; what we add is a reproducible way to score a country against it and
> to project the effect of a policy decision.

**To click:** `AI readiness` → one dimension → the evidence; then the what-if
panel.

**To show:** the dimension definitions in `data/global/itu/dimensions.json` and
the computation in `packages/readiness/`. **Do not say** "official ITU".

---

## 8. "Are your gaps invented?"

**Why:** "gap analysis" is often a list of opinions.

**Answer:**
> Each gap is a text we searched for and did not find, with the action it implies
> for the regulator. Eight are documented, each tied to dimensions and to a
> recommendation: designate a lead authority, require a machine-readable audit
> artefact, prohibit secondary use of inferred health signals, and others.
> Separately, we report the state of the corpus instead of hiding it: ten regional
> strategies are ingested, six international references are catalogued with their
> URLs, and five Cameroon entries have no text in the system, all still to source.

**To click:** `Knowledge base` → `status`; the gap table in §6 of the report.

**To show:** the direct link between a missing document and a named gap.

---

## 9. "Is this legal advice? Would you deploy it in production tomorrow?"

**Why:** they are checking whether the team overstates its product.

**Answer:**
> No, and no. It is a sandbox for institutional response, not legal advice and
> not a production gate. A real deployment needs the authority's own sign-off on
> the corpus, a validation of the OCR on the scanned instruments, and an
> operator training path. What is production-shaped already: the audit chain,
> the signed approvals, the citation gate, and the local-only deployment. What is
> not: five Cameroon entries still need sourcing, the OCR of several scanned
> texts is pending, and the reasoning model is a 9B local model, bounded, slower,
> and not the claim.

**To click:** `Audit trail` (what is already solid) and `Knowledge base` (what is
missing).

**To show:** the limits section of the report, if it is kept in the final
version. It is a strength, not a confession.

---

## Figures sheet: do not improvise

| Item | Exact value |
|---|---|
| Compose services | 12 long-running + 1 MinIO init job |
| API routes | 81 |
| Web screens | 26 (19 inside the console) |
| Monorepo packages | 18 |
| Tests | 228 tests, 44 files, 0 failures |
| Build validation | `typecheck` 38/38, web build 20/20 |
| Cameroon corpus | 26 manifest entries, **21 ingestible**, 5 `to_confirm` |
| OCR caveats | 8 documents (6 with no text layer, 1 partial, 1 non-Unicode font) |
| Regional corpus ingested | 10 instruments (AU, Kigali, Windhoek, Smart Africa, Kenya ×2, Rwanda, Egypt, Zambia, Nigeria) |
| International references | 6 catalogued, **not loaded** (Y.3172, ITU Readiness, WHO, UNESCO, Malabo, OECD) |
| ITU dimensions | 6 factors, 13 dimensions, 111 metrics |
| Models | `qwen3.5:9b`, `bge-m3` (1024-d), local |

## Three sentences never to say

1. "Everything is deterministic." → *The reasoning is an LLM; what is
   deterministic is retrieval, citation validation, the score, the audit and the
   approvals.*
2. "29 documents ingested." → *26 manifest entries, 21 ingestible, 5 without text.*
3. "This is a legal tool." → *It is a sandbox for institutional response; the
   authority signs its own corpus before any real use.*
