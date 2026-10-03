# Checklist de soumission — ITU AI for Good Lab Hackathon (UAE)

## À compléter (champs placeholder)
- [ ] Nom d'équipe + nom de solution (en-tête du rapport)
- [ ] Team leader (`[name]`)
- [ ] Membres (`[names]`) — max 4 personnes ; **femme leader** pour le prix spécial
- [ ] Contact (`[email]`)
- [ ] URL du repo GitHub (à créer/publier)
- [ ] Mentor interne (`[name]`) si 3 participants

## Matériels de soumission (deadline : 10 nov. 2026)
- [x] **Rapport technique ≤ 5 pages** — `docs/submission/TECHNICAL-REPORT.md` + `.docx`
- [ ] **Dépôt GitHub** public (code + KB structure)
- [x] **Base de connaissances** : `data/country/cm/` (21 docs, manifeste) + `data/global/`
- [ ] **Vidéo démo ≤ 7 min** (requise après 1er tour pour les équipes présélectionnées)

## Avant soumission
- [ ] Lancer l'ingestion réelle (`make models` + `./scripts/seed.sh`) sur une machine avec les prérequis
- [ ] OCR des 7 documents scannés
- [ ] Compléter les instruments manquants (constitution, loi-cadre santé 96/03, décret DPA, mandat ANTIC, doc officiel stratégie IA, stratégie cyber) — cf. `cm-corpus-tools/TARGETS.md`
- [ ] Vérifier la licence Apache-2.0 et l'absence de secrets (`git status`, `.env` ignoré)
- [ ] Enregistrement équipe (deadline 21 oct. 2026) + confirmation au MINPOSTEL/ITU

## Rappels
- Alignement : ITU-T Y.3172 + AI Readiness Framework 2.0 (6 facteurs / 13 dimensions).
- Souveraineté : tout local (Ollama qwen3.5:9b + bge-m3), aucun fournisseur cloud.
- Auditable : dossier de run (audit chaîné + CoT + citations).
