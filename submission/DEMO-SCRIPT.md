# Vidéo de démo: script et storyboard (≤ 7 min)

**Format :** capture d'écran + voix off FR, sous-titres EN obligatoires.
**Cible :** 6 min 40.
**Préparation :** `docker compose up --build -d`, `make models`,
`make seed-corpus COUNTRY=cm` déjà exécutés ; une page de gazette scannée prête
dans `apps/web/public/samples/` ; un run de scénario déjà terminé pour la partie audit.

> Ne jamais filmer un `.env`, un token d'approbation ou un secret. Le badge
> `local` et les journaux suffisent à prouver la souveraineté.

| Temps | Écran | Voix off (FR) |
|------:|-------|---------------|
| 0:00–0:30 | Carton titre : nom de l'équipe, « SarkiAI Policy Sandbox (Cameroun) », badge ITU | « Détecter une fuite de données de santé n'est que la moitié du problème. L'autre moitié, comment les institutions répondent, qui est responsable, sous quel mandat, dans quel délai, c'est là que les systèmes publics échouent. » |
| 0:30–1:10 | Schéma Y.3172 `SRC→C→PP→M→P→D→SINK` + les 13 dimensions ITU | « Nous proposons un moteur policy-grounded multi-agents, aligné sur ITU-T Y.3172 et le AI Readiness Framework 2.0 : 6 facteurs, 13 dimensions. Tout tourne en local, aucun fournisseur cloud, aucune donnée ne sort de l'hôte. » |
| 1:10–1:50 | Terminal : `docker compose ps` (12 services), puis la console → badge `local` | « Douze services : Ollama avec qwen3.5:9b et bge-m3, Qdrant, MongoDB, MinIO, Tesseract, faster-whisper, deux serveurs MCP. Un seul `docker compose up`. La configuration n'expose qu'un mode : local. » |
| 1:50–2:35 | `make seed-corpus COUNTRY=cm` ; puis `Knowledge base` : liste des documents avec statut et type | « Le corpus Cameroun compte 26 entrées, dont 21 ingérables aujourd'hui. Cinq sont marquées `to_confirm` : nous préférons afficher ce que nous n'avons pas plutôt que de gonfler le corpus. » |
| 2:35–3:05 | Un chunk ouvert : `TITRE > CHAPITRE > ARTICLE`, `articleNumber`, source | « Le découpage est structure-aware : chaque passage garde son fil d'Ariane juridique. C'est ce qui rend une citation vérifiable au lieu d'être plausible. » |
| 3:05–4:20 | `Crisis scenarios` → *Health-data breach* → **Start this batch**, puis **Release next batch** ×2 ; rapports par bloc, puis rapport joint | « Les faits sont révélés par blocs. Chaque institution ne voit que ce à quoi son mandat lui donne droit : le ministère, l'autorité de protection des données et l'agence cyber raisonnent sur des informations partielles. Le coordinateur réconcilie, et nomme le conflit de mandats au lieu de le lisser. » |
| 4:20–4:55 | Ouvrir une citation dans une réponse : dialogue, passage complet surligné, passages voisins | « Chaque affirmation porte l'article sur lequel elle repose. La fenêtre charge le passage entier depuis l'API, pas l'extrait que la réponse avait copié. » |
| 4:55–5:35 | Poser une question, puis `Audit trail` : événement `citation.rejected`, nombre de tentatives | « Si le modèle invente une citation, la porte la rejette, nomme le passage fautif et relance la génération. La tentative est écrite dans l'audit : on voit le garde-fou travailler, on ne le croit pas sur parole. » |
| 5:35–6:15 | `Scanned gazette` → panneau gazette : scan, overlay des zones OCR, ingestion d'une page, puis **impact** sur les runs ouverts | « Une page du Journal officiel arrive scannée. L'OCR travaille zone par zone, et l'overlay montre exactement ce qui a été lu : une mauvaise découpe se voit avant que le texte devienne interrogeable. Le panneau demande ensuite ce que la nouvelle disposition change pour les incidents déjà ouverts. » |
| 6:15–6:40 | Lien d'approbation signé, ouvert depuis `Notifications` (outbox console) | « Toute action à effet de bord passe par une approbation nominative, signée, à usage unique. Et l'e-mail reste local : les liens partent dans une outbox console, sans SMTP ni relais tiers. » |
| 6:40–6:55 | `AI readiness` : composite 13 dimensions + what-if causal | « Le même moteur note les 13 dimensions de 0 à 5 et projette l'effet d'une décision de politique publique sur un graphe causal fixe : les mêmes entrées donnent le même résultat. » |
| 6:55–7:00 | Carton final : repo, licence, « Local · Auditable · Aligné ITU » | « Souverain, auditable, aligné ITU. Le code et le corpus sont publics. » |

## Captures à préparer

1. Carton titre (nom d'équipe + nom de solution).
2. Schéma Y.3172 + 13 dimensions.
3. `docker compose ps` + badge `local`.
4. Liste des documents avec statuts (`present` / `to_confirm`).
5. Un chunk avec `headingPath` et `articleNumber`.
6. Scénario : 3 blocs, puis rapport joint (conflits de mandats visibles).
7. Dialogue de citation avec surlignage.
8. Audit : `citation.rejected` + compteur de tentatives.
9. Gazette : overlay OCR + panneau d'impact.
10. Approbation signée + outbox console.
11. Readiness + what-if.
12. Carton final.

## Notes de tournage

- **Durée cible 6:40**, jamais plus de 7:00. Couper l'attente du modèle au montage,
  mais laisser voir le temps réel sur une étape (crédibilité).
- Sous-titres EN à partir de la voix off FR, pas de traduction automatique non relue.
- Éviter deux pièges : ne pas montrer un chargement infini sans explication ;
  ne pas commenter « l'IA a décidé », c'est le système qui décide, le modèle rédige.
- Plan B sans narration : mêmes captures, cartons-titres, musique libre de droits.
- Si un service manque le jour du tournage, filmer la démo sur le scénario seul
  (3:05–6:15) : c'est le cœur et cela tient en 3 minutes.
