#!/usr/bin/env bash
# Pubblica una nuova versione su GitHub:  ./release.sh 1.1.0 "Cosa cambia"
# Aggiorna la versione, compila l'APK, fa commit + tag e crea la release con l'APK allegata.
# L'app installata la trova da sola (controllo all'avvio, al massimo una volta l'ora).
set -e
cd "$(dirname "$0")"
V="$1"; NOTES="${2:-Versione $1}"
[[ "$V" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Uso: ./release.sh X.Y.Z \"note\""; exit 1; }
git rev-parse "v$V" >/dev/null 2>&1 && { echo "La versione v$V esiste già"; exit 1; }

npm version "$V" --no-git-tag-version --allow-same-version >/dev/null
./build.sh
git add -A
git diff --cached --quiet || git commit -m "Versione $V" -m "$NOTES"
git tag "v$V"
git push origin HEAD "v$V"
gh release create "v$V" "Ascolti.apk#Ascolti-$V.apk" --title "Ascolti $V" --notes "$NOTES"
echo "Pubblicata la versione $V"
