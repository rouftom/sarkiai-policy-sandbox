# Alignement ITU — analyse des ressources officielles

Analyse des ressources téléchargées dans `.iut/` (exclu de git et du déploiement)
et comparaison avec le repo `sarkiai-policy-sandbox`.

## 1. Sources analysées

| Source | Contenu |
|--------|---------|
| `T-REC-Y.3172-201906-I!!PDF-E.pdf` | Recommandation ITU-T Y.3172 — pipeline ML |
| `T-AI4G-AI4GOOD-2025-6-PDF-E.pdf` | **ITU AI Readiness Framework, Report 2.0 (jan. 2026)** |
| `AI-for-Good-Sandbox-Hackathon-submission-template.docx` | Modèle de rapport (exemple « smart pen ») |
| `ITUAIReadiness-main/` | **Code de référence** : simulation readiness (6 agents, 13 dimensions, what-if causal, ChromaDB/Ollama) |
| `ITUAIReadiness-main/simulation/data/framework/dimensions.json` | **Définition canonique : 6 facteurs, 13 dimensions, 100+ métriques** |

## 2. Ce que le framework impose réellement

### 2.1 Six facteurs, treize dimensions

Le framework officiel (Report 2.0) définit **6 facteurs** :
`data`, `research`, `deployment`, `standards`, `opensource`, `sandbox` —
et **13 dimensions** :

| # | Dimension | `short_name` | Facteurs |
|---|-----------|--------------|----------|
| 1 | Data/Model Marketplace | `data_marketplace` | data, opensource |
| 2 | Generated Content Marketplace | `generated_content` | data, opensource |
| 3 | Cross-Domain Correlation Analysis | `cross_domain` | data, standards |
| 4 | Contextualization and Regional Impact | `contextualization` | data, research, deployment |
| 5 | Level of Integration of AI in Workflows | `ai_integration` | standards |
| 6 | Human Interface | `human_interface` | standards, deployment |
| 7 | Strategy Alignment | `strategy_alignment` | standards |
| 8 | Collaboration with AI | `collaboration` | opensource, standards |
| 9 | Impacts of Humans in AI Integration | `human_impact` | sandbox |
| 10 | AI & Policies | `ai_policies` | sandbox, deployment |
| 11 | AI for Inclusion | `ai_inclusion` | sandbox |
| 12 | Granular Priorities | `granular_priorities` | deployment |
| 13 | Digital Infrastructure | `digital_infrastructure` | deployment |

### 2.2 Pipeline Y.3172 — symboles normatifs

Y.3172 définit des **nœuds** nommés, pas des « étapes » génériques :

`SRC` → `C` (Collector) → `PP` (Preprocessor) → `M` (Model) → `P` (Policy) →
`D` (Distributor) → `SINK`, orchestrés par le **MLFO** (ML Function Orchestrator),
avec le **ML sandbox** comme environnement de validation.

### 2.3 Livrable attendu (template de soumission)

Le modèle exige une structure précise :

1. Introduction
2. Description du cas d'usage (problème + lacunes des solutions existantes)
3. **Table de mapping par nœud Y.3172** : `SRC/C/PP/M/P/D/SINK` × composant du
   cas d'usage × dimension Readiness 2.0 × documents de politique applicables
4. **Scénarios d'erreur** séquencés (dont des scénarios *controversés*)
5. **Lacunes de politique et de standards** issues du mapping

## 3. Alignement actuel

| Exigence ITU | Notre état | Alignement |
|--------------|-----------|------------|
| KB nationale vectorisée | Ingestion structure-aware + Qdrant hybride | ✅ |
| Scénarios d'erreur progressifs | `ScenarioEngine.release()` par ticks | ✅ |
| Coordination multi-agents + conflits | `MultiAgentCoordinator` | ✅ |
| Audit + chain-of-thought | Audit chaîné + `cot_traces` + dossier de run | ✅ |
| Deux modes (application / readiness) | Lenses `simulation`/`readiness`/`hybrid` | ✅ |
| **13 dimensions / 6 facteurs** | ❌ **8 dimensions (perspectives de la page web)** | 🔴 |
| **Nœuds Y.3172 (SRC/C/PP/M/P/D/SINK)** | ❌ génériques (« collecte/traitement/modèle/app ») | 🔴 |
| **Corpus KB de référence (~60 docs, dont africains)** | Manifests seulement, corpus vide | 🔴 |
| **Scoring 0–5 + composite pondéré** | Lacunes qualitatives uniquement | 🟠 |
| **What-if / graphe causal (interdépendances)** | Absent | 🟠 |
| Agents « facteurs » (6 du repo de référence) | Agents institutionnels (notre force) | 🟡 (complémentaire) |
| Template de soumission (rapport 5 p.) | `docs/` riche mais pas au format | 🟠 |

## 4. Divergences et écarts

### 🔴 Critiques

1. **Taxonomie des dimensions.** Nous avons encodé 8 « perspectives » issues de
   la page web, alors que la notation s'appuie sur les **13 dimensions / 6
   facteurs** du Report 2.0. Toute analyse d'écart doit s'indexer sur les 13.
2. **Vocabulaire Y.3172.** Le mapping doit être *par nœud* (`SRC/C/PP/M/P/D/SINK`),
   pas générique. Le `D` (Distributor) et le `SINK` sont absents chez nous.
3. **Corpus.** Le repo de référence fournit ~60 documents triés (stratégies
   nationales, dont **AU Continental AI Strategy 2024, Kigali 2025, Smart Africa,
   Kenya, Rwanda, Nigeria, Zambie** + standards ITU + cas d'usage). C'est la
   référence d'écart idéale — nous ne l'exploitons pas.

### 🟠 Importantes

4. **Scoring.** Le repo de référence note en **0–5 (maturité)** avec indices
   composites pondérés + évidences + recommandations + confiance. Nous ne
   produisons que des écarts textuels.
5. **What-if causal.** `causal_graph.py` propage les changements entre dimensions
   (ex. `D13 → D5 → D6`). Absent chez nous.
6. **Format de soumission.** Le template impose un rapport structuré ; nous
   devons produire les 5 pages au bon format.

### 🟡 Complémentarités (pas des problèmes)

7. **Agents.** Le repo de référence a 6 agents « facteurs » (dataset, opensource,
   sandbox, research, deployment, standards). Nos 6 agents sont **institutionnels**
   (juridique, ministère, DPA, régulateur, cyber, coordinateur) — c'est ce que le
   hackathon demande en plus (conseiller juridique, acteur institutionnel,
   coordination). Les deux taxonomies sont **complémentaires**.
8. **Stack.** Référence = Ollama + ChromaDB + SQLite (local, ~16 GB RAM) ; nous =
   Qdrant + Voyage + providers (portable, sandbox). Le hackathon autorise les
   crédits cloud ; à confirmer sur l'endpoint réel de la sandbox.

## 5. Actions recommandées (priorisées)

| # | Action | Priorité | Effort |
|---|--------|----------|--------|
| 1 | Realigner la taxonomie sur **13 dimensions / 6 facteurs** (types, moteur readiness, manifests) | P0 | M |
| 2 | Remplacer le mapping Y.3172 par le **mapping par nœud SRC/C/PP/M/P/D/SINK** | P0 | S |
| 3 | Vendre `dimensions.json` + le corpus africain du repo de référence dans `data/global/` | P0 | S |
| 4 | Ajouter le **scoring 0–5 + composite pondéré** au moteur readiness | P1 | M |
| 5 | Ajouter le **graphe causal / what-if** | P1 | M |
| 6 | Produire le **rapport 5 p. au format du template** (+ table de mapping santé) | P0 | M |
| 7 | Vérifier l'endpoint sandbox ITU (Qdrant/Mongo vs Ollama/Chroma) | P1 | S |

## 6. Recommandation stratégique

**Ne pas forker le repo de référence** (Python/Ollama/ChromaDB, lourd), mais :

1. **Adopter sa référence normative** (`dimensions.json`, 13 dimensions) comme
   source de vérité — c'est le « contrat » de notation.
2. **Réutiliser son corpus** (documents publics, dont africains) comme corpus
   `global` pour le moteur d'écarts.
3. **Conserver notre moteur** (Qdrant, agents institutionnels, scénarios
   progressifs, audit) et le positionner comme la **couche policy-grounded** qui
   *étend* la readiness à la simulation institutionnelle.
4. **Ajouter** le scoring 0–5 et le what-if causal pour cocher toutes les cases.

Positionnement final : *« La simulation de readiness de l'ITU, augmentée d'agents
institutionnels policy-grounded, de scénarios d'erreur progressifs et d'une
auditabilité complète — sur le même framework 6/13. »*
