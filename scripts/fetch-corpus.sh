#!/usr/bin/env bash
# Fetch the African reference corpus (PDFs) that is NOT redistributed in git.
#
# The manifests (data/**/manifest.json) are versioned; these public PDFs are
# not, because their publishers' terms are not ours to relicense. They come
# from the ITU AI Readiness reference repository, pinned to one commit so the
# corpus is reproducible:
#
#   1. a local copy in .itu/ITUAIReadiness-main/ is used when present;
#   2. otherwise each file is downloaded from GitHub at the pinned commit.
#
#   ./scripts/fetch-corpus.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="CrashingGuru/ITUAIReadiness"
COMMIT="84010da9e9c443afcceeccb86d1700a662223395"
REL="simulation/server/knowledge/InputDocs/AI_Strategies"
SRC="$ROOT/.itu/ITUAIReadiness-main/$REL"
RAW="https://raw.githubusercontent.com/$REPO/$COMMIT/$REL"
AFRICA="$ROOT/data/global/africa"

FILES=(
  African_Union_Continental_AI_Strategy_2024.pdf
  Africa_Declaration_AI_Kigali_2025.pdf
  Smart_Africa_AI_Blueprint_2021.pdf
  Windhoek_Statement_AI_Southern_Africa_2022.pdf
  Rwanda_National_AI_Policy_2023.pdf
  Nigeria_NITDA_AI_Transformation_Roadmap_2025.pdf
  Kenya_AI_Strategy_2025-2030.pdf
  Kenya_AI_Strategy_Implementation_Roadmap_2025-2030.pdf
  Zambia_AI_Strategy_2024_2026.pdf
  Egypt_AI_Strategy_2025_2030.pdf
)

mkdir -p "$AFRICA"
copied=0
failed=0
for f in "${FILES[@]}"; do
  if [[ -f "$AFRICA/$f" ]]; then
    continue
  elif [[ -f "$SRC/$f" ]]; then
    cp "$SRC/$f" "$AFRICA/"
    copied=$((copied + 1))
  elif curl -fsSL --retry 2 -o "$AFRICA/$f.part" "$RAW/$f"; then
    mv "$AFRICA/$f.part" "$AFRICA/$f"
    copied=$((copied + 1))
  else
    rm -f "$AFRICA/$f.part"
    echo "Could not fetch $f (see sourceUrl in data/global/africa/manifest.json)." >&2
    failed=$((failed + 1))
  fi
done

echo "Fetched $copied file(s) into data/global/africa/ ($REPO@${COMMIT:0:7})."
echo "Ingest with: ./scripts/seed.sh --country global --jurisdiction regional --doc-type strategy --dir data/global/africa"
[[ $failed -eq 0 ]]
