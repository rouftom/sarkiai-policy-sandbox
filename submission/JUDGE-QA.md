# Fiche réponses juges: SarkiAI Policy Sandbox

Neuf questions probables. Pour chacune : **pourquoi le juge la pose**, **la
réponse à dire (EN)**, **ce qu'on clique**, **ce qu'on montre**.

Règle de conduite : on ne promet jamais plus que ce que le code fait. Si on ne
sait pas, on dit « this is not implemented yet », c'est ce qui rend le reste
crédible.

---

## 1. « Montrez le cœur du système en direct, pas les slides. »

**Pourquoi :** ils veulent voir un système vivant, pas une vidéo.

**Réponse (EN) :**
> I'll run the health-data breach scenario. The scenario is released in batches,
> and each institution only sees the batch it is entitled to see. The ministry,
> the data-protection authority and the cyber agency produce independent
> assessments; the coordinator reconciles them and names the mandate conflicts
> instead of smoothing them over. Every claim carries the article it rests on.

**À cliquer :** `Crisis scenarios` → *Health-data breach in a public hospital* →
**Start this batch**, puis **Release next batch** (3 fois).

**À montrer :** les trois rapports par bloc, puis le rapport joint :
*agreements*, *mandate conflicts*, *open questions*. Ouvrir une citation :
la fenêtre charge le passage complet, pas l'extrait.

---

## 2. « Le raisonnement, c'est juste un LLM qui invente ? »

**Pourquoi :** c'est la question qui tue tous les projets « RAG + agents ».

**Réponse (EN) :**
> No. The model writes, but the system decides what may be written. Retrieval is
> arithmetic over vectors; the citation gate is exact substring matching; the
> readiness score and the audit chain are deterministic. The model's only job is
> drafting and deciding when to search, and everything it produces is gated,
> cited and logged. Remove the model and the scoring, the audit and the approvals
> still work, you lose the prose, not the decision record.

**À cliquer :** aucune manipulation nécessaire ; montrer le tableau §4 du rapport.

**À montrer :** `packages/citations/src/index.ts` (`validateCitations`),
`packages/agents/src/orchestrator.ts` (la boucle de retry), et le badge de
validation sous une réponse.

---

## 3. « Comment prouvez-vous qu'une citation n'est pas fabriquée ? »

**Pourquoi :** une citation inventée dans un rapport juridique est une faute
grave ; ils testent la robustesse.

**Réponse (EN) :**
> Every quote in an answer is matched against the retrieved chunk text. A quote
> that is not there is rejected, the model is asked again with a directive that
> names the rejected passage, and the attempt is written into the audit trail.
> The console shows when a retry happened, so you can see the gate working
> instead of trusting it. If the retries are exhausted, the answer is returned
> flagged `validation.ok = false`, with lower confidence and a recorded gap, it
> is never presented as established fact.

**À cliquer :** poser une question qui force une citation, ouvrir la citation
(bouton dans la réponse), puis `Audit trail` → l'événement `citation.rejected` /
`agent.assessment` avec le nombre de tentatives.

**À montrer :** le dialogue de citation qui surligne le passage dans le document
entier, et l'entrée d'audit correspondante.

---

## 4. « Et quand la loi ne dit rien ? »

**Pourquoi :** c'est le cas réel ; un système qui invente est disqualifiant.

**Réponse (EN) :**
> The corpus runs out, and we say so. If no retrieved passage supports a claim,
> the gate refuses the quote, and after the retry budget the answer comes back
> unvalidated, with a gap record and a lower confidence. We also refuse to
> pretend we hold texts we do not: five Cameroon entries are listed as `to_confirm`,
> so the system cannot quote them; six international references are also
> catalogued but not loaded. Those absences are the gap analysis.

**À cliquer :** `Knowledge base` → filtre `status: to_confirm` ; puis une question
hors corpus (par ex. sur un texte non ingéré).

**À montrer :** la liste des documents à confirmer et la réponse marquée non
validée. **Ne pas dire** que le verdict `INSUFFICIENT_EVIDENCE` est déjà livré :
il est spécifié, pas encore exposé dans l'UI.

---

## 5. « Est-ce vraiment souverain ? Prouvez qu'aucun appel ne sort. »

**Pourquoi :** c'est notre différenciateur ; ils vérifient qu'il est réel.

**Réponse (EN) :**
> Everything runs in the compose file: `qwen3.5:9b` and `bge-m3` on Ollama,
> Qdrant, MongoDB, MinIO, Tesseract, faster-whisper, and two local MCP servers.
> The provider configuration exposes exactly one mode, `local`, there is no
> cloud key to revoke and no fallback that silently reaches the internet. Even
> e-mail stays local: approval links and notifications go to a console outbox,
> with no SMTP and no third-party relay.

**À cliquer :** `docker-compose.yml` (aucun service externe), le badge
`local` dans la console, `Notifications` (outbox).

**À montrer :** `provider-badge`, la page `Notifications`, et `.env.example`
où `OLLAMA_BASE_URL` pointe sur le service interne. Flouter les secrets.

---

## 6. « En quoi c'est différent de ChatGPT avec mes PDF ? »

**Pourquoi :** c'est le concurrent implicite de tout projet RAG.

**Réponse (EN) :**
> A chat with PDFs answers one question at a time. Here the unit is an
> institution with a mandate and partial information: agents do not see the same
> facts, so the system can find the conflict between the DPA's notification duty
> and the ministry's continuity-of-care duty. On top of that: a signed,
> nominative approval before any side effect, a hash-chained audit log with
> end-to-end verification, an exportable run dossier, and a 0–5 readiness score
> over the 13 ITU dimensions with causal what-if. A chatbot does not have a
> mandate, a signature, or an audit chain.

**À cliquer :** `AI readiness` → composite + what-if ; lien d'approbation signé
(ouvert depuis `Notifications`) ; `Audit trail` → vérification de chaîne ; export du dossier.

**À montrer :** le graphe causal, puis l'écran d'approbation publique, puis le
badge « chaîne intègre ».

---

## 7. « Votre score de readiness, c'est officiel ? »

**Pourquoi :** ils connaissent le framework ITU et testeront la rigueur.

**Réponse (EN) :**
> It is our model of judgement, built on the ITU framework, 6 factors, 13
> dimensions, 111 metrics, not an official ITU assessment. The scores are a
> weighted composite computed in code, and the causal projection runs over a
> fixed graph, so the same inputs give the same result. What is official is the
> taxonomy; what we add is a reproducible way to score a country against it and
> to project the effect of a policy decision.

**À cliquer :** `AI readiness` → une dimension → les preuves ; puis le panneau
what-if.

**À montrer :** la définition des dimensions dans
`data/global/itu/dimensions.json` et le calcul dans `packages/readiness/`.
**Ne pas dire** « officiel ITU ».

---

## 8. « Vos gaps, vous les inventez ? »

**Pourquoi :** « gap analysis » est souvent une liste d'opinions.

**Réponse (EN) :**
> Each gap is a text we searched for and did not find, with the action it implies
> for the regulator. Seven are documented, each tied to dimensions and to a
> recommendation, designate a lead authority, require a machine-readable audit
> artefact, prohibit secondary use of inferred health signals. Separately, we
> report the state of the corpus instead of hiding it: ten regional strategies
> are ingested, six international references are catalogued with their URLs, and
> five Cameroon entries have no text in the system, all still to source.

**À cliquer :** `Knowledge base` → `status` ; la table des gaps dans le rapport §6.

**À montrer :** le lien mécanique entre un document absent et un gap nommé.

---

## 9. « C'est un avis juridique ? Vous déploieriez ça en production demain ? »

**Pourquoi :** ils cherchent à voir si l'équipe surestime son produit.

**Réponse (EN) :**
> No, and no. It is a sandbox for institutional response, not legal advice and
> not a production gate. A real deployment needs the authority's own sign-off on
> the corpus, a validation of the OCR on the scanned instruments, and an
> operator training path. What is production-shaped already: the audit chain,
> the signed approvals, the citation gate, and the local-only deployment. What is
> not: seven of the Cameroon documents still need sourcing, and the reasoning
> model is a 9B local model, bounded, slower, and not the claim.

**À cliquer :** `Audit trail` (ce qui est déjà solide) et `Knowledge base` (ce qui manque).

**À montrer :** la section « Honest limits » du rapport. C'est un point fort,
pas un aveu.

---

## Fiche chiffres: à ne pas improvviser

| Élément | Valeur exacte |
|---|---|
| Services compose | 12 longue durée + 1 job d'init MinIO |
| Routes API | 81 |
| Écrans web | 26 (dont 19 dans la console) |
| Packages du monorepo | 18 |
| Tests | 228 tests, 44 fichiers, 0 échec |
| Validation build | `typecheck` 38/38, build web 20/20 |
| Corpus Cameroun | 26 entrées au manifeste, **21 ingérables**, 5 `to_confirm` |
| Réserves OCR | 8 documents (6 sans couche texte, 1 partielle, 1 police non-Unicode) |
| Corpus régional ingéré | 10 instruments (UA, Kigali, Windhoek, Smart Africa, Kenya ×2, Rwanda, Égypte, Zambie, Nigéria) |
| Références internationales | 6 cataloguées, **non chargées** (Y.3172, ITU Readiness, WHO, UNESCO, Malabo, OCDE) |
| Dimensions ITU | 6 facteurs, 13 dimensions, 111 métriques |
| Modèles | `qwen3.5:9b`, `bge-m3` (1024 d), locaux |

## Trois phrases à ne jamais dire

1. « Tout est déterministe. » → *Le raisonnement est un LLM ; ce qui est
   déterministe, c'est la récupération, la validation des citations, le score,
   l'audit et les approbations.*
2. « 29 documents ingérés. » → *26 entrées au manifeste, 21 ingérables, 5 sans texte.*
3. « C'est un outil juridique. » → *C'est un bac à sable de réponse
   institutionnelle ; l'autorité signe son corpus avant tout usage réel.*
