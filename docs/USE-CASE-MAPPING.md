# Use case mapping — Health data breach (Cameroon)

Artefact au format du **template de soumission ITU** : mapping par **nœud du
pipeline Y.3172** (`SRC/C/PP/M/P/D/SINK`), scénarios d'erreur progressifs, et
lacunes de politique/standards. Domaine : **santé**, pays : **CM**.

> Mapping aligné sur l'**ITU AI Readiness Framework, Report 2.0** (6 facteurs / 13
> dimensions, cf. `data/global/itu/dimensions.json`) et sur une architecture
> conforme à **ITU-T Y.3172**.

## 1. Use case

**Détection assistée et réponse institutionnelle à une fuite de données de santé.**
Un système d'IA détecte une anomalie d'accès sur la plateforme e-santé ; la
réponse (notification, coordination inter-institutions, communication publique)
est simulée par des agents institutionnels policy-grounded.

## 2. Mapping par nœud Y.3172

| Nœud | Composant du cas d'usage | Dimension Readiness 2.0 | Documents de politique applicables (KB) |
|------|--------------------------|-------------------------|-----------------------------------------|
| **SRC** | Journaux d'accès e-santé, dossiers patients (EHR), télémétrie réseau | D1 Data/Model Marketplace, D13 Digital Infrastructure | Loi santé 96/03 ; loi communications 2010/013 |
| **C** (Collector) | Collecteur de télémétrie de sécurité (hôpital + opérateur) | D13 Digital Infrastructure | Loi cybersécurité 2010/012 |
| **PP** (Preprocessor) | Normalisation, dé-identification, pseudonymisation | D1 Data/Model Marketplace, D6 Human Interface | Loi protection des données (à confirmer) ; Malabo 2014 |
| **M** (Model) | Modèle de détection d'anomalie / d'exfiltration | D5 AI Integration, D3 Cross-Domain | Guidance/benchmarking standards ; Y.3172 |
| **P** (Policy) | Règles : devoir de notification, répartition des mandats, garde-fous | D10 AI & Policies, D7 Strategy Alignment | Loi protection des données ; loi cybersécurité ; décrets de mandats (DPA, ANTIC) |
| **D** (Distributor) | Tableau de bord ministère + gestion de dossier DPA | D7 Strategy Alignment, D8 Collaboration | Mandats institutionnels ; SND30 |
| **SINK** | Agents institutionnels + officiels : rapport conjoint, communication publique | D9 Human Impact, D6 Human Interface, D11 AI for Inclusion | Politique e-santé (à confirmer) ; WHO ethics |

> Chaque nœud est associé à des **exigences** (volume de données, transfert,
> dé-identification, revue humaine) mappées aux documents de politique — voir
> `docs/ITU-Y3172-MAPPING.md` §11 pour l'implémentation technique.

## 3. Scénarios d'erreur (progressifs)

Les scénarios sont libérés par **blocs** (information asymétrique) via
`ScenarioEngine` — information incomplète, répartie différemment selon les agents.

### Scénario A — Fuite de données de santé (`health-data-breach`)

| Tick | Événement | Vu par |
|------|-----------|--------|
| 0 | Accès anormal détecté sur la plateforme e-santé | ministère santé, cyber-agence |
| 1 | Exfiltration possible de dossiers patients vers un hôte externe | + autorité protection données |
| 2 | Pression médiatique ; délai de notification en jeu | DPA, ministère, coordinateur |

**Sortie attendue** : rapport conjoint, **conflits de mandats** (ex. devoir de
notification de la DPA vs impératif de continuité des soins du ministère),
questions ouvertes, écarts.

### Scénario B — Controversé : usage détourné d'un signal inféré

| Tick | Événement | Vu par |
|------|-----------|--------|
| 0 | Le système infère des signaux de vulnérabilité (indisponibilité, pathologies) | ministère santé, DPA |
| 1 | Des publicités ciblées exploitent ces signaux inférés | DPA, cyber-agence, coordinateur |
| 2 | Escalade éthique : sanction, conformité, réparation | DPA, ministère, coordinateur |

**But** : montrer que les garde-fous de la KB se déclenchent — interdiction
d'usage des signaux inférés à des fins publicitaires, consentement et limitation
de finalité pour les données, saisine de l'organe national d'éthique de l'IA.

## 4. Lacunes de politique et de standards (issues du mapping)

| # | Type | Lacune | Dimension(s) | Bonne pratique mondiale |
|---|------|--------|--------------|-------------------------|
| 1 | Loi | Responsabilités de notification non réparties entre secteurs | D10, D7 | Lead authority unique + escalade documentée (ITU Y.3172) |
| 2 | Standards | Absence de standard de traçabilité machine-readable des décisions | D5, D6 | Audit + attribution de source (AI Readiness Framework) |
| 3 | Politique | Garde-fous insuffisants sur les signaux inférés (advertising) | D10, D9 | Interdiction d'usage secondaire des données de santé (WHO) |
| 4 | Standards | Formats d'interopérabilité santé non contraignants | D1, D3 | Formats standards-compliant, métadonnées |
| 5 | Politique | Consentement/limitation de finalité pour données d'enfants | D6, D11 | UNESCO AI Ethics ; WHO |
| 6 | Infra | Redondance réseau/énergie pour services de santé critiques | D13 | Exigences de disponibilité (AI Readiness Framework) |

## 5. Comment le proto-système couvre ces lacunes

- **Lacune 1** → `MultiAgentCoordinator` détecte les conflits de mandats et
  produit un rapport conjoint avec escalade.
- **Lacune 2** → `packages/audit` (journal chaîné + CoT) + `packages/report`
  (dossier de run auditable).
- **Lacune 3** → agent juridique à citation obligatoire (`packages/agents`),
  refus des usages non fondés.
- **Lacune 4** → ingestion structure-aware + invariants de format.
- **Lacune 5** → dimensions D6/D11 dans le moteur readiness.
- **Lacune 6** → dimension D13 + expertise infra (OTT/télécom).
