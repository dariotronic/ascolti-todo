#!/usr/bin/env bash
# Pubblica una nuova versione:  ./release.sh 1.0.1 "Cosa cambia"
# Avvia il workflow "Release" su GitHub, che compila, firma (chiave nei secret della repo),
# fa commit della versione, tag e Release con l'APK. Non serve la chiave su questo PC.
# Lo stesso si può fare dal sito: Actions → Release → Run workflow.
set -e
cd "$(dirname "$0")"
V="$1"; NOTES="${2:-}"
[[ "$V" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Uso: ./release.sh X.Y.Z \"note\""; exit 1; }
git diff --quiet && git diff --cached --quiet || { echo "Ci sono modifiche non committate: fai prima il commit."; exit 1; }

git push origin HEAD
gh workflow run release.yml -f version="$V" -f notes="$NOTES"
echo "Workflow avviato, attendo che parta…"
sleep 6
RUN=$(gh run list --workflow=release.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "$RUN" --exit-status
git pull --ff-only --quiet
echo "Pubblicata la versione $V: $(gh release view "v$V" --json url -q .url)"
