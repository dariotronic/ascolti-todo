# Ascolti

Lista personale di album da ascoltare. Capacitor 8 con HTML, CSS e JS senza framework, in `www/`.

- **Ricerca**: Spotify (se configuri le chiavi nelle impostazioni), altrimenti o in mancanza di risultati Deezer, poi MusicBrainz. Si può anche aggiungere un album a mano.
- **Dati**: salvati sul telefono (Capacitor Preferences). Esporta/Importa nelle impostazioni per il backup.
- **Aggiornamenti**: all'avvio (e al ritorno in primo piano, al massimo una volta l'ora) l'app legge l'ultima release di questa repo. Se è più recente mostra un avviso: "Aggiorna" scarica l'APK dentro l'app con barra di avanzamento e apre l'installazione di sistema (plugin nativo `ApkUpdaterPlugin.java`). La prima volta Android chiede di consentire ad Ascolti l'installazione di app. Nelle impostazioni c'è anche "Controlla aggiornamenti".
  Il plugin può installare **solo una versione più nuova di Ascolti stessa**: scarica solo dalle release di `dariotronic/ascolti-todo` (file `.apk`, max 100 MB), confronta l'impronta SHA-256 dichiarata da GitHub e, prima di installare, controlla nome del pacchetto (`it.dariotronic.ascolti`), versione e firma.
- **Tema**: scuro predefinito, interruttore nelle impostazioni.

## Pubblicare una nuova versione
Da Git Bash:

```bash
./release.sh 1.1.0 "Cosa cambia"
```

Lo script aggiorna la versione in `package.json` (da cui Gradle ricava `versionName`/`versionCode`), compila, fa commit e tag `v1.1.0`, e crea la release GitHub con l'APK allegata.

Per compilare senza pubblicare: `./build.sh` → `Ascolti.apk` (firmata con la chiave di release).

Strumenti usati: JDK 21 in `%LOCALAPPDATA%\Android\jdk-21`, SDK in `%LOCALAPPDATA%\Android\Sdk`, `gh` autenticato.

## Firma
Le release sono firmate con una chiave dedicata, **tenuta fuori dalla repo** in
`%USERPROFILE%\.keystores\ascolti-todo\`: `ascolti-todo-release.jks` più `keystore.properties` con le password.
Gradle la legge da lì, oppure dal percorso indicato nella variabile `ASCOLTI_KEYSTORE_PROPS`.

**Fai una copia di sicurezza di quella cartella**, per esempio in un password manager o su un disco esterno.
Senza la stessa chiave gli aggiornamenti non si installano sopra l'app esistente: bisognerebbe disinstallarla,
perdendo i dati salvo backup (Impostazioni → Esporta).

## Installare a mano
- Via USB: `"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb" install -r Ascolti.apk`
- Oppure scarica l'APK dalla pagina Releases e aprila sul telefono.

Se Play Protect mostra "App non riconosciuta", tocca *Altri dettagli* → *Installa comunque*: succede con le app che non arrivano dal Play Store.
