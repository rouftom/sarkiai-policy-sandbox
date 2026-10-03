# Note stratégique — SarkiAI Policy Sandbox

**Équipe Cameroun · ITU AI for Good Lab Hackathon (UAE)**
_Document de positionnement — destinataires : MINPOSTEL, ITU, mentors_

---

## 1. En une phrase

Un **moteur unique policy-grounded**, aligné **ITU-T Y.3172**, qui alimente une
base de connaissances nationale vectorisée et des **agents institutionnels
multi-rôles**, avec **deux modes commutables** — simulation de scénarios d'erreur
et évaluation ITU AI Readiness — et une **traçabilité complète** (audit chaîné +
chain-of-thought persisté).

## 2. Pourquoi c'est aligné sur le hackathon

| Exigence du hackathon | Réponse SarkiAI Policy Sandbox |
|-----------------------|-------------------------------|
| Base de connaissances nationale vectorisée | Ingestion **structure-aware** (TITRE/CHAPITRE/ARTICLE, FR/EN), embeddings Voyage, **Qdrant hybride** (dense + sparse BM25, fusion RRF), **scopée par pays** |
| Agents : conseiller politique/juridique, acteur institutionnel, coordination multi-agents | Registre de mandats (santé, DPA, régulateur télécom, cyber, coordinateur) + citations obligatoires |
| Scénarios d'erreur à **événements progressifs** | Moteur `scenarios` : libération par blocs (`releaseChunk`), information asymétrique par agent |
| Audit + chain-of-thought | Journal **chaîné par hash** (infalsifiable) + traces CoT persistées par étape |
| Alignement Y.3172 + AI Readiness Framework | Mapping couche-par-couche (voir `docs/ITU-Y3172-MAPPING.md`) |
| **Identification des écarts** (critère noté) | Moteur d'écarts **partagé par tous les modes** vs. corpus de bonnes pratiques mondiales |

## 3. Le choix stratégique : un moteur, deux lenses

Nous ne construisons **pas deux produits séparés**. Les modes `simulation`,
`readiness` et `hybride` sont des **profils d'orchestration déclaratifs** sur un
même socle. L'analyse d'écarts reste **toujours active**, afin de ne jamais
perdre le critère d'évaluation « policy/strategy/standards gap identification »,
quel que soit le mode démontré.

## 4. Périmètre du premier scénario (démonstration)

**Domaine : santé. Pays : Cameroun (CM) d'abord, puis multi-pays.**
Scénario : *fuite de données de santé dans un hôpital public*, révélé par blocs —
ministère de la Santé → autorité de protection des données → agence cyber →
coordinateur. Chaque agent a un mandat distinct, une information partielle, et
produit une évaluation indépendante citant les dispositions applicables.

## 5. Actifs et différenciation

- Réemploi d'un **moteur d'ingestion légal déjà éprouvé** (chunking FR/EN des
  TITRE/CHAPITRE/ARTICLE) — temps de mise sur pied réduit.
- **Souveraineté** : déployable intégralement dans la sandbox ITU, sans dépendance
  à un service propriétaire non publié.
- **Ouverture** : dépôt sous licence Apache-2.0 → la base de connaissances peut
  être publiée dans l'ITU AI for Good Lab, créditée à l'UAE.
- **Ancrage Cameroun/Afrique** : applicable à d'autres pays (UAE, puis multi-pays).

## 6. Équipe et conformité

- Équipe de **4 personnes** (3 participants + 1 mentor interne), avec une
  **femme lead** pour concourir au Prix spécial Femmes.
- Suivi MINPOSTEL + ITU, sessions de mentoring ITU.

---

## English abstract (for ITU)

**SarkiAI Policy Sandbox** is a single policy-grounded agent engine aligned with
**ITU-T Y.3172**. It ingests a country's legal/policy corpus into a
jurisdiction-scoped vector knowledge base (structure-aware chunking, Voyage
embeddings, Qdrant hybrid retrieval) and runs **mandated institutional agents**
(legal adviser, sector ministry, data-protection authority, telecom regulator,
cyber agency, coordinator). It exposes **two switchable lenses** — progressive
error-scenario simulation and **ITU AI Readiness** assessment — over one shared
core, with **gap analysis always on**, plus a **hash-chained audit log and
persisted chain-of-thought traces**. Initial scope: healthcare, Cameroon →
multi-country. Open-sourced (Apache-2.0) for publication in the ITU AI for Good
Lab.

**Keywords:** ITU-T Y.3172 · AI Readiness Framework · multi-agent · policy gap
analysis · auditability · Cameroon.
