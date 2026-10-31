# Knowledge base

The knowledge base gives the agents their legal ground: every claim an agent
makes must quote a passage of it. It holds the national corpus of Cameroon
(laws, regulations, strategies, health policies) and a reference corpus of
international and African instruments used by the readiness gap engine.

Each corpus is described by a manifest, which is the source of truth for
titles, issuing authority, document type, ITU readiness dimensions (`pillar`),
provenance (`sourceUrl`) and publication rights (`rights`):

| Corpus | Manifest | Documents |
|--------|----------|-----------|
| Cameroon (national and CEMAC) | [`country/cm/manifest.json`](country/cm/manifest.json) | 21 collected, 5 instruments still to source |
| International references | [`global/itu/manifest.json`](global/itu/manifest.json) | 6, link-only |
| African references | [`global/africa/manifest.json`](global/africa/manifest.json) | 10, fetched from the ITU reference repository |
| ITU AI Readiness dimensions | [`global/itu/dimensions.json`](global/itu/dimensions.json) | 13 dimensions, 6 factors |

## What this repository publishes

We publish a document only when we may redistribute it. Each Cameroonian entry
carries one of three rights values:

| `rights` | Meaning | Published here |
|----------|---------|:--------------:|
| `official-text` | Law, decree, regulation, strategy, plan or report issued by a public authority | yes |
| `open-licence` | Publication of a public body released under an open licence (e.g. CC BY) | yes, with the attribution the licence requires |
| `quotation-only` | Press article, authored paper or research deposit without a confirmed open licence | no |
| `to-confirm` | Public document whose reuse terms are not stated or not yet checked | no |

Official texts and public-body publications are published unchanged, with
their issuing authority, for information and transparency. Most legal systems leave official legislative
and administrative texts outside copyright or free to reproduce; the Berne
Convention (Art. 2(4)) leaves that choice to each State. These documents keep
their own terms and are **not** relicensed under CC BY 4.0.

Documents that are not published can still be ingested locally by whoever
holds a copy. The agents then only quote short, attributed passages, each
linked to its source.

### Published: Cameroonian documents (18)

| File | Document | Authority |
|------|----------|-----------|
| `loi_2024_protection_donnees_personnelles.pdf` | Loi relative à la protection des données à caractère personnel (23 décembre 2024) | Présidence de la République / Parlement |
| `loi_2010_012_cybersecurite_cybercriminalite.pdf` | Loi n° 2010/012 relative à la cybersécurité et à la cybercriminalité | Assemblée Nationale |
| `loi_2010_021_commerce_electronique.pdf` | Loi n° 2010/021 régissant le commerce électronique | Assemblée Nationale |
| `loi_2013_013_communications_electroniques.pdf` | Loi régissant les communications électroniques | Assemblée Nationale |
| `penal_code_2016.pdf` | Code pénal (loi n° 2016/007) | République du Cameroun |
| `decret_2023_interconnexion.pdf` | Décret sur l'interconnexion et l'accès aux réseaux (2023) | Primature / ART |
| `decret_certification_electronique.pdf` | Décret relatif à la certification électronique | Primature / MINPOSTEL |
| `cemac_protection_droits_utilisateurs.pdf` | Directive CEMAC sur la protection des droits des utilisateurs | CEMAC |
| `art_recueil_textes_2018.pdf` | Recueil des textes du secteur des communications électroniques (2018) | ART |
| `compendium_textes_poste_telecom_tic_2023.pdf` | Compendium des textes Postes, Télécommunications et TIC (2023) | MINPOSTEL |
| `plan_strategique_cameroun_numerique_2020.pdf` | Plan stratégique Cameroun Numérique 2020 | MINPOSTEL |
| `snd30_complet_2020_2030.pdf` | Stratégie Nationale de Développement 2020-2030 (SND30) | MINEPAT |
| `resume_snd30.pdf` | SND30, résumé | MINEPAT |
| `psnsn_sante_numerique_2026_2030.pdf` | Plan Stratégique National de Santé Numérique 2026-2030 | Ministère de la Santé Publique |
| `normes_standards_sr_pf_sante.pdf` | Normes et standards en santé de la reproduction et planification familiale | Ministère de la Santé Publique |
| `compact_national_sante_2023.pdf` | Compact national entre le Gouvernement du Cameroun et les partenaires au développement (santé / CSU, 2023) | Ministère de la Santé Publique |
| `art_observatoire_marche_telecom_2016.pdf` | Observatoire annuel 2016 du marché des communications électroniques | ART |
| `cameroon_id_cr_ecosystem_diagnostic.txt` | Etude diagnostique du système d'ID au Cameroun, French edition of the ID4D Diagnostic of ID Systems in Cameroon (2023), text conversion | World Bank, ID4D (CC BY 3.0 IGO) |

The ID4D diagnostic is © World Bank, licensed under CC BY 3.0 IGO
(https://creativecommons.org/licenses/by/3.0/igo/). Cite the English original:
World Bank. 2023. Identification for Development (ID4D): Diagnostic of ID Systems
in Cameroon. Washington, DC: World Bank
(https://documents.worldbank.org/en/publication/documents-reports/documentdetail/099012324023052410).
Our copy is a plain-text conversion of the French edition; the content is
unchanged.

### Not published: Cameroonian documents kept local (3)

| Document | `rights` | Reason |
|----------|----------|--------|
| Press article on the national AI strategy | `quotation-only` | Press content, all rights reserved. The official strategy document is still to be obtained. |
| « Le système de santé camerounais » (J. P. Beyeme Ondoua) | `quotation-only` | Authored article, all rights reserved. |
| Stratégie d'adoption de l'IA dans les Collectivités Territoriales Décentralisées ([HAL](https://hal.science/hal-05411779v1)) | `quotation-only` | Research deposit; reuse licence not confirmed. Readers can get it from HAL. |

### Not published: reference corpora

- **International references** (ITU-T Y.3172, ITU AI Readiness Framework, WHO,
  UNESCO, OECD, Malabo Convention): link-only. Each manifest entry points to the
  official publication.
- **African references** (AU Continental AI Strategy, Smart Africa Blueprint,
  Kigali Declaration, Windhoek Statement, national strategies of Rwanda,
  Nigeria, Kenya, Zambia and Egypt): fetched with `scripts/fetch-corpus.sh`
  from the ITU AI Readiness reference repository, pinned to commit
  `84010da9e9c443afcceeccb86d1700a662223395`.

### Third-party files reproduced under the MIT License

`global/itu/dimensions.json`, `global/itu/EU_AI_Act_summary.txt`,
`global/itu/ITU_AI4G_Sandbox_summary.txt` and
`global/africa/Kenya_AI_Strategy_2025_2030_summary.txt` are copied unchanged
from the [ITU AI Readiness reference repository](https://github.com/CrashingGuru/ITUAIReadiness).
Their notice is in [`global/LICENSE-ITUAIReadiness`](global/LICENSE-ITUAIReadiness).

The files in `samples/` are fictional placeholders written for the pipeline
tests. They are not law.

## Known limits

- Seven scanned documents need OCR (`needsOcr: true`), so some passages may
  carry recognition errors. Each citation names the source file and the
  article, so any passage can be checked against the original.
- The number of the 2024 data protection law and the reference of the
  electronic communications law are still to be confirmed (see `note`).
- Six published documents do not record their download URL yet
  (`sourceUrl` empty); `make check-kb` lists them.
- Entries with `status: to_confirm` are never ingested until checked: a
  factual error in the base would reach the agents' answers.

## Rebuild the knowledge base

```bash
make up-kb                      # Ollama, Qdrant, ingestion, OCR
make models                     # pull qwen3.5:9b and bge-m3
make seed-corpus                # Cameroon corpus, from its manifest
./scripts/fetch-corpus.sh       # African reference corpus
./scripts/seed.sh --country global --jurisdiction regional --doc-type strategy --dir data/global/africa
```

`make check-kb` verifies, before each commit, that only publishable documents
(`official-text`, `open-licence`) are published and that every published file is declared in a manifest.

## Licence

Manifests, this description and the documentation we wrote are under CC BY 4.0
([`LICENSE-CONTENT`](../LICENSE-CONTENT)). Source documents keep their own terms.

If you hold rights in a document published here and object to its presence,
contact Djotta through [djotta.com](https://djotta.com): we will remove it.
