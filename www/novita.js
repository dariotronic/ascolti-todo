'use strict';
// Novità di ogni versione, in un markdown semplice (## titoli, - elenchi, **grassetto**, *corsivo*).
// Le usa l'app (pannello "Novità" al primo avvio dopo un aggiornamento) e release.sh, che le pubblica come
// testo della release su GitHub: da lì le legge l'avviso "Nuova versione disponibile" delle versioni successive.
const NOVITA = {
  '2.0.0': `
Ascolti si rinnova: nuove funzioni in ogni schermata, statistiche, l'elenco dei brani e un modo nuovo di muoversi tra i pannelli.

## Aggiungere album
- Tocca un risultato della ricerca per vedere l'**anteprima**: copertina grande, numero di brani, durata, genere ed elenco dei brani.
- Quando apri la ricerca trovi le **ricerche recenti**.
- Se un album è **già in lista**, anche trovato su un'altra fonte, l'app te lo dice invece di aggiungerlo una seconda volta. Vale anche per i link, l'aggiunta a mano e il ripristino del backup.
- Anche l'aggiunta dalla ricerca ha il suo **Annulla**.

## La lista
- **Preferiti**: il cuore nella scheda degli album ascoltati, e il filtro dei preferiti negli Ascoltati.
- Il dado c'è anche negli Ascoltati: **Cosa riascolto?**
- Ogni lista ricorda il **suo ordinamento**.
- Il filtro cerca anche nelle note.
- Nella **selezione multipla** puoi segnare come ascoltati (o rimettere da ascoltare) più album insieme, non solo eliminarli.
- Gli avvisi con Annulla si mettono **in colonna**, fino a tre, ognuno con il suo Annulla.
- Chiudendo un pannello ritrovi la lista **nel punto in cui l'avevi lasciata**.

## La scheda dell'album
- **Note**: perché l'avevi aggiunto, chi te l'ha consigliato.
- **Brani**: numero, durata ed elenco dei brani, che si apre dentro la scheda.
- **Preferito** e **Copia** in una fila sotto la copertina, il genere accanto all'anno.
- **Elimina** subito, con Annulla.

## Modifica
- Si apre come un pannello che si allunga dalla scheda; **Annulla** e la freccia indietro riportano alla scheda.
- **Data di ascolto** modificabile, per chi spunta in ritardo.
- **Elenco dei brani** da correggere o scrivere: titolo e durata, che si sceglie girando una **ghiera** (ogni giro è un minuto).
- Se hai cambiato l'elenco, l'icona di **ripristino** rimette quello ufficiale.
- **Genere** da un menu, con la possibilità di aggiungerne uno nuovo.

## Statistiche
Le trovi in *Impostazioni → Statistiche*:
- **Tempo** di musica ascoltata e ancora da ascoltare, con paragoni che cambiano ogni volta ("Come guardare 9,6 volte *Il Signore degli Anelli*").
- **Ascoltati per mese**, in album o in ore.
- **Il ritmo della lista**: quanti album aggiungi e quanti ne ascolti, e quando la svuoterai.
- Quanto aspettano gli album **prima dell'ascolto**, e quelli **in attesa da più tempo**.
- Il **più lungo** e il **più corto**, i **decenni**, i **generi**, le **settimane di fila** con almeno un ascolto, il **giorno** in cui ascolti di più, gli **artisti** più presenti.
- Gli album **senza durata** si possono completare a mano.

## Aspetto e gesti
- I pannelli si chiudono anche **trascinandoli verso il basso**.
- **Animazioni** nel passaggio da una vista all'altra.
- Tema **Sistema**, che segue il tema scuro del telefono.
- **Quattro dimensioni del testo**; l'intestazione si adatta anche ai caratteri più grandi.

## Dietro le quinte
- Le **copertine** sono salvate sul telefono: si vedono anche senza rete.
- Lista e impostazioni entrano nel **backup automatico** di Android, quando è attivo. Il backup su file resta il modo più sicuro.
- Se una fonte non risponde, la ricerca **non resta bloccata**.
- Se un salvataggio non riesce, l'app **te lo dice**.
- E da ora, a ogni aggiornamento, le **novità** come queste.
`.trim(),
};

if (typeof module === 'object' && module.exports) module.exports = NOVITA;
