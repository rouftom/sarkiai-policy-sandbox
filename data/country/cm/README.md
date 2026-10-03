# Corpus Cameroun (CM)

Base de connaissances nationale pour le domaine **santé** (puis multi-domaine).

## Contenu présent (copié localement)

| Fichier | Type | Domaine |
|---------|------|---------|
| `penal_code_2016.pdf` | law | fondements juridiques |
| `normes_standards_sr_pf_sante.pdf` | guidance | santé |
| `cameroon_id_cr_ecosystem_diagnostic.txt` | report | services publics / identité |

Les payloads (PDF/TXT) sont **exclus de git** (cf. `.gitignore`) ; seul
`manifest.json` est versionné. Voir la checklist `status: to_confirm` pour les
instruments à collecter (loi protection des données, stratégie IA, politique
e-santé…).

> L'ingestion ne lit que **PDF et TXT** : les `.docx`/`.pptx` doivent être
> convertis en `.txt` au préalable (ex. `unzip -p X.docx word/document.xml`
> puis suppression des balises).

## Ingest

```bash
./scripts/seed.sh --country cm --doc-type law      --dir data/country/cm
./scripts/seed.sh --country cm --doc-type guidance --dir data/country/cm
./scripts/seed.sh --country cm --doc-type report   --dir data/country/cm
```

(le `docType` est passé par lot ; ajuster selon le fichier, ou utiliser l'API
`/v1/kb/ingest` avec le `docType` exact par document.)

## Règle de qualité

Ne jamais ingérer une entrée `to_confirm` sans confirmation (numéro, version en
vigueur, URL officielle). Voir `docs/CORPUS-CM.md`.
