#!/usr/bin/env bash
# Compila l'APK firmata con la chiave di release  →  ./build.sh   (da Git Bash)
set -e
cd "$(dirname "$0")"
export JAVA_HOME="$LOCALAPPDATA/Android/jdk-21"
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
KS="${ASCOLTI_KEYSTORE_PROPS:-$USERPROFILE/.keystores/ascolti-todo/keystore.properties}"
[ -f "$KS" ] || { echo "Chiave di firma non trovata: $KS"; exit 1; }
npx cap sync android
(cd android && ./gradlew assembleRelease --console=plain -q)
cp android/app/build/outputs/apk/release/app-release.apk Ascolti.apk
echo "Fatto: Ascolti.apk"
