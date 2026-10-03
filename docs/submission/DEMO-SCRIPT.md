# Demo video — script & storyboard (≤ 7 min)

**Format :** capture d'écran + voix off (FR), sous-titres EN.
**Prérequis d'enregistrement :** machine avec les prérequis (32 Go RAM ou GPU),
`docker compose up --build -d` + `make models` + `./scripts/seed.sh` déjà lancés.
**Plan B sans narration :** cartons-titres + musique + sous-titres.

| Temps | Scène (écran) | Voix off (FR) |
|------:|---------------|---------------|
| 0:00–0:40 | Slide titre + logo | « Détecter une fuite de données de santé n'est que la moitié du problème. L'autre moitié — **comment les institutions répondent** — est lente, ad hoc et juridiquement incertaine. Voici SarkiAI Policy Sandbox. » |
| 0:40–1:30 | Slide architecture Y.3172 (`SRC→C→PP→M→P→D→SINK`) + mention 13 dimensions | « Un moteur policy-grounded, aligné ITU-T Y.3172 et le AI Readiness Framework 2.0 (6 facteurs, 13 dimensions). **Entièrement local** : aucun fournisseur cloud, aucune donnée ne sort. » |
| 1:30–2:30 | Terminal : `docker compose up` puis `make models` ; dashboard Qdrant | « Toute la pile tourne en local : Ollama (`qwen3.5:9b` + `bge-m3`), Qdrant, MongoDB, MinIO. Un seul `docker compose up`. » |
| 2:30–3:15 | Ingestion : `./scripts/seed.sh` ; logs chunking ; capture d'un chunk avec `headingPath`/`articleNumber` | « La base de connaissances Cameroun est ingérée avec un découpage **structure-aware** : TITRE, CHAPITRE, ARTICLE. 21 documents — lois données/cyber/télécom, SND30, PSNSN santé numérique — plus les bonnes pratiques mondiales. » |
| 3:15–4:45 | UI : **console santé**. Cliquer **Mode facilitateur** → **Libérer l'événement suivant** (3 fois) ; les rapports par tick s'affichent, **Accords / Conflits de mandats / Questions ouvertes** | « Les événements sont révélés par blocs. Chaque institution ne voit qu'une **information partielle**. Ministère, autorité de protection des données, agence cyber produisent des évaluations indépendantes ; le coordinateur **réconcilie** et détecte les **conflits de mandats**. » |
| 4:45–5:30 | UI : carte **Readiness** → 13 dimensions notées /5, composite ; panneau **What-if causal** (D13 +1 → D5 → D6) | « Le même moteur note les 13 dimensions de 0 à 5 et projette l'effet d'une décision de politique publique via un **graphe causal**. » |
| 5:30–6:15 | UI : **AuditPanel** (badge « chaîne intègre », traces CoT par agent) ; télécharger le **dossier (MD)** | « Tout est auditable : journal **chaîné par hash**, traces de raisonnement persistées, citations. Le dossier de run est exportable et vérifiable. » |
| 6:15–6:45 | UI : poser une question avec **image attachée** (extrait photographié) | « On peut joindre une image : le modèle multimodal local la lit comme **contexte non fiable** — jamais une source juridique — les citations viennent toujours de la base. » |
| 6:45–7:00 | Slide finale : repo, équipe, « Local · Souverain · Auditable » | « Souverain, auditable, aligned ITU. Merci. » |

## Captures à préparer
1. Slide titre (nom équipe / solution).
2. Schéma Y.3172 + 13 dimensions.
3. Terminal : compose + `make models` (accéléré).
4. Chunk KB (headingPath visible).
5. Console santé — mode facilitateur, 3 ticks, conflits surlignés.
6. Readiness 13 dims + what-if.
7. AuditPanel + dossier MD.
8. Question multimodale avec image.
9. Slide finale.

## Notes
- Durée cible **6:30–7:00** ; sous-titres EN obligatoires (audience ITU).
- Éviter de montrer des secrets (`.env`) ; flouter le terminal si nécessaire.
- Le recueil de captures se fait sur une machine avec les prérequis physiques
  (cf. `docs/HARDWARE-REQUIREMENTS.md`).
