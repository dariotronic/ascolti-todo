# Ascolti

Una lista minimale degli album che vuoi ascoltare. Li cerchi, li aggiungi e li spunti man mano che li ascolti.

Per ogni album l'app tiene solo **copertina, titolo, artista e anno**. Dove ascoltarlo lo scegli tu: Ascolti non si collega a Spotify né ad altri servizi di streaming e non ti chiede nessun account.

## Cosa fa

- **Due liste**: *Da ascoltare* e *Ascoltati*. Tocca il cerchio accanto a un album per spuntarlo, e se sbagli tocca *Annulla*.
- **Ricerca**: tocca **+** e scrivi album o artista. I risultati arrivano dal catalogo di Apple (iTunes); se lì non c'è nulla, da Deezer e poi da MusicBrainz, che ha anche le uscite più rare. Se non lo trovi, puoi **aggiungerlo a mano**.
- **Scheda dell'album**: tocca un album per vederlo in grande, rimetterlo tra quelli da ascoltare o eliminarlo.
- **Tema scuro o chiaro**, dalle Impostazioni (i tre puntini in alto).
- **Backup** della lista, da tenere dove vuoi.
- **Aggiornamenti** direttamente dall'app.

## Installazione

Ascolti non è sul Play Store: si installa scaricando il file dell'app (un APK) da questa pagina. Serve **Android 7 o più recente**.

1. **Sul telefono**, apri la pagina **[dell'ultima versione](https://github.com/dariotronic/ascolti-todo/releases/latest)** e tocca il file **`Ascolti.apk`** in fondo, sotto *Assets*.
2. Quando il download è finito, tocca la notifica o apri il file dai *Download*.
3. La prima volta Android ti chiede di **consentire l'installazione di app da questa origine** (il browser, per esempio Chrome): tocca *Impostazioni*, attiva *Consenti da questa origine* e torna indietro.
4. Tocca **Installa**.
5. Probabilmente comparirà **Google Play Protect** (vedi sotto). Se decidi di procedere, tocca *Altri dettagli* → **Installa comunque**.
6. Apri **Ascolti** e tocca **+** per aggiungere il primo album.

### L'avviso di Play Protect

Play Protect controlla le app che non arrivano dal Play Store. Con Ascolti può mostrare *"App non riconosciuta"* oppure *"App dannosa bloccata"*.

Il secondo avviso spaventa, quindi ecco perché compare, per quanto ne sappiamo: Google non lo spiega. Ascolti sa **scaricare e installare i propri aggiornamenti** senza passare dal Play Store, e i controlli automatici di Google trattano con sospetto le app installate a mano che fanno questo. L'app può installare **solo una versione più nuova di sé stessa**, firmata con la stessa chiave e presa da questa pagina.

Non legge contatti, foto, posizione o altri dati del telefono. **Il codice è tutto pubblico, qui.** Detto questo, la scelta è tua: se l'avviso ti mette a disagio, non installarla.

### Aggiornamenti

Quando apri l'app, Ascolti controlla se c'è una versione nuova, al massimo una volta l'ora. Se c'è, in cima alla lista compare **"Nuova versione disponibile · Aggiorna"**. Tocca *Aggiorna*: l'app la scarica, mostra l'avanzamento e apre l'installazione, senza perdere i dati.

- La prima volta Android ti chiede di **consentire ad Ascolti di installare app**: attiva l'opzione e torna indietro, l'installazione riparte da sola.
- Anche qui può comparire Play Protect: *Altri dettagli* → *Installa comunque*.
- Puoi controllare anche a mano da *Impostazioni → Controlla aggiornamenti*.

### Backup e cambio di telefono

I dati stanno **solo sul telefono**: se disinstalli l'app o ne cancelli i dati, la lista si perde. Per salvarla:

1. *Impostazioni → Backup → **Esporta***: nel riquadro compare la tua lista come testo. Copiala e salvala dove vuoi, per esempio in una nota o mandandola a te stesso su Telegram.
2. Per ripristinarla, anche su un altro telefono: incolla quel testo nello stesso riquadro e tocca **Importa**. Gli album già presenti non vengono duplicati.

### Privacy

- Niente account, niente pubblicità, niente statistiche d'uso.
- La lista resta sul telefono.
- Quando cerchi, il testo che scrivi viene inviato ad Apple (iTunes), Deezer o MusicBrainz per trovare gli album; da lì arrivano anche le copertine.
- Per gli aggiornamenti l'app legge l'elenco delle versioni da GitHub.

### Riconoscimenti

Dati degli album da [iTunes Search](https://performance-partners.apple.com/search-api), [Deezer](https://developers.deezer.com/api), [MusicBrainz](https://musicbrainz.org) e [Cover Art Archive](https://coverartarchive.org). Caratteri [Spectral](https://fonts.google.com/specimen/Spectral) e [Montserrat](https://fonts.google.com/specimen/Montserrat) (licenza SIL Open Font).

Made with 🪗 by [@dariotronic](https://www.instagram.com/dariotronic/).

---

# Per chi sviluppa

App [Capacitor 8](https://capacitorjs.com) con HTML, CSS e JS senza framework e senza bundler, in `www/`. Pacchetto Android `it.dariotronic.ascolti`.

## Struttura

- `www/`: l'app (`index.html`, `style.css`, `app.js`, caratteri in `fonts/`). Per vederla basta aprire `index.html` nel browser; lì i dati finiscono in `localStorage`.
- `android/`: il progetto Android generato da Capacitor.
  - [`ApkUpdaterPlugin.java`](android/app/src/main/java/it/dariotronic/ascolti/ApkUpdaterPlugin.java): il plugin nativo degli aggiornamenti.
  - `build.gradle` ricava `versionName`/`versionCode` da `package.json` (1.2.3 → 10203).
- `.github/workflows/release.yml`: compila, firma e pubblica le release.
- `build.sh` / `release.sh`: compilazione locale e avvio del workflow di release.

## Aggiornamenti dentro l'app

All'avvio (e al ritorno in primo piano, al massimo una volta l'ora) l'app legge l'ultima release di questa repo. Il plugin può installare **solo una versione più nuova di Ascolti stessa**:

- scarica solo dalle release di `dariotronic/ascolti-todo` (file `.apk`, al massimo 100 MB);
- confronta l'impronta SHA-256 dichiarata da GitHub;
- prima di installare controlla nome del pacchetto, versione e firma;
- installa solo file della propria cartella degli aggiornamenti, e il FileProvider espone solo quella.

## Pubblicare una nuova versione

La release si compila e si firma su GitHub Actions ([`release.yml`](.github/workflows/release.yml)), con la chiave salvata nei secret della repo: non serve un PC in particolare.

- **Dal sito**: *Actions* → *Release* → *Run workflow*, scrivi versione (es. `1.1.1`) e note.
- **Da Git Bash**, dopo aver fatto commit delle modifiche:

  ```bash
  ./release.sh 1.1.1 "Cosa cambia"
  ```

Il workflow:
1. aggiorna la versione in `package.json`;
2. compila;
3. verifica che l'APK sia firmata con la chiave di Ascolti;
4. fa commit e tag `vX.Y.Z`;
5. crea la release con `Ascolti.apk` allegata.

Con *Solo prova* compila e verifica senza pubblicare.

Secret della repo: `KEYSTORE_BASE64` (il file `.jks` in base64), `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.

## Compilare in locale

Servono JDK 21 e Android SDK (platform 36). Poi `./build.sh` produce `Ascolti.apk`, firmata se sul PC c'è la chiave (vedi sotto).

Per installarla via USB: `adb install -r Ascolti.apk`.

## Firma

Le release sono firmate con una chiave dedicata, **tenuta fuori dalla repo**: `ascolti-todo-release.jks` più `keystore.properties` con le password. Gradle la cerca in `~/.keystores/ascolti-todo/keystore.properties`, oppure nel percorso indicato dalla variabile `ASCOLTI_KEYSTORE_PROPS`.

La stessa chiave è nei secret della repo per il workflow, ma da lì **non si può rileggere**: tienine una copia di sicurezza. Senza la stessa chiave gli aggiornamenti non si installano sopra l'app esistente.
