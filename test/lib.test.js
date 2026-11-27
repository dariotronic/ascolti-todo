// Test delle funzioni pure di www/lib.js: lettura dei link e classifica della ricerca.
// Si lanciano con `npm test` (Node 20 o più recente, nessuna dipendenza).
// Le pagine in fixtures/ sono estratti veri (solo i metadati) di Spotify, Apple Music, Deezer e Bandcamp:
// se un sito cambia il suo markup, rifai l'estratto e guarda quale test si rompe.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lib = require('../www/lib.js');

const page = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const album = (url, file) => lib.parseAlbumPage(url, page(file))?.album;

test('Spotify: pagina di un album', () => {
  const a = album('https://open.spotify.com/album/6GjwtEZcfenmOf6l18N7T7?nd=1', 'spotify-album.html');
  assert.equal(a.title, 'Kid A');
  assert.equal(a.artist, 'Radiohead');
  assert.equal(a.year, '2000');
  assert.equal(a.type, '');
  assert.match(a.cover, /^https:\/\/i\.scdn\.co\/image\//);
  assert.equal(a.sourceId, 'open.spotify.com/album/6GjwtEZcfenmOf6l18N7T7');
});

test('Spotify: pagina di un brano → il suo album', () => {
  const a = album('https://open.spotify.com/track/0xivCtzVVrdeq32s8EnOO6?nd=1', 'spotify-track.html');
  assert.equal(a.title, 'Kid A');
  assert.equal(a.artist, 'Radiohead');
  assert.equal(a.year, '2000');
});

test('Apple Music', () => {
  const a = album('https://music.apple.com/it/album/kid-a/1097862870', 'apple.html');
  assert.equal(a.title, 'Kid A');
  assert.equal(a.artist, 'Radiohead');
  assert.equal(a.year, '2000');
  assert.match(a.cover, /mzstatic\.com/);
});

test('Deezer', () => {
  const a = album('https://www.deezer.com/it/album/43197211', 'deezer.html');
  assert.equal(a.title, 'OK Computer OKNOTOK 1997 2017');
  assert.equal(a.artist, 'Radiohead');
  assert.equal(a.year, '1997');
});

test('Bandcamp (entità HTML nel titolo, anno da datePublished)', () => {
  const a = album('https://mortgarson.bandcamp.com/album/mother-earths-plantasia', 'bandcamp.html');
  assert.equal(a.title, 'Mother Earth\'s Plantasia');
  assert.equal(a.artist, 'Mort Garson');
  assert.equal(a.year, '2019');
});

test('Sito sconosciuto: solo il titolo della pagina, da cercare', () => {
  const html = '<html><head><title>Kid A - Radiohead | Un blog di musica</title></head></html>';
  assert.deepEqual(lib.parseAlbumPage('https://example.com/post/1', html), { query: 'Kid A - Radiohead' });
  const bot = '<html><head><title>Just a moment...</title></head></html>';
  assert.equal(lib.parseAlbumPage('https://example.com/x', bot), null);
});

test('Link: pulizia, identità e testo dall\'indirizzo', () => {
  assert.equal(lib.cleanSharedUrl('https://open.spotify.com/album/abc?si=XYZ'), 'https://open.spotify.com/album/abc?nd=1');
  assert.equal(lib.firstUrl('Ascolta questo! Https://open.spotify.com/album/abc?si=1 ciao'), 'https://open.spotify.com/album/abc?nd=1');
  assert.equal(lib.firstUrl('nessun link qui'), '');
  assert.equal(lib.canonicalLink('https://open.spotify.com/intl-it/album/abc?si=1'), 'open.spotify.com/album/abc');
  assert.equal(lib.canonicalLink('https://www.deezer.com/album/42/'), 'deezer.com/album/42');
  assert.equal(lib.queryFromUrl('https://x.bandcamp.com/album/mother-earths-plantasia'), 'mother earths plantasia');
  assert.equal(lib.queryFromUrl('https://www.deezer.com/album/43197211'), '');
});

test('decodeHtml', () => {
  assert.equal(lib.decodeHtml('Mother Earth&#39;s &amp; &quot;Plantasia&quot; &#x2014; caf&eacute;'), 'Mother Earth\'s & "Plantasia" — caf&eacute;');
});

test('sameAlbum ignora maiuscole, accenti e punteggiatura', () => {
  assert.ok(lib.sameAlbum({ title: 'Début', artist: 'Björk' }, { title: 'debut', artist: 'bjork' }));
  assert.ok(lib.sameAlbum({ title: 'OK Computer', artist: 'Radiohead' }, { title: 'OK Computer!', artist: 'Radiohead' }));
  assert.ok(!lib.sameAlbum({ title: 'OK Computer', artist: 'Radiohead' }, { title: 'OK Computer OKNOTOK', artist: 'Radiohead' }));
});

// Risultati finti, come arrivano dalle tre fonti (iTunes, Deezer, MusicBrainz)
const r = (source, title, artist, year = '', extra = {}) => ({ source, sourceId: title, title, artist, year, cover: source === 'musicbrainz' ? '' : `https://img/${source}/${title}`, type: '', ...extra });

test('Ricerca: l\'album cercato prima delle edizioni e dei singoli', () => {
  const lists = [
    [r('itunes', 'Kid A Mnesia', 'Radiohead', '2021'), r('itunes', 'Kid A', 'Radiohead', '2000'), r('itunes', 'Kid A', 'Radiohead', '2000', { type: 'single', sourceId: 'single' })],
    [r('deezer', 'Kid A (Live)', 'Radiohead'), r('deezer', 'Kid A', 'Radiohead')],
    [r('musicbrainz', 'Kid A', 'Radiohead', '2000')],
  ];
  const ranked = lib.rankResults(lists, 'kid a radiohead');
  assert.equal(ranked[0].title, 'Kid A');
  assert.equal(ranked[0].source, 'itunes');
  assert.equal(ranked[0].sources, 3);
  const titles = ranked.map((x) => x.title);
  assert.ok(titles.indexOf('Kid A (Live)') < titles.indexOf('Kid A Mnesia'), 'le edizioni prima degli album con parole in più');
  // Lo stesso album da tre fonti è un solo risultato
  assert.equal(titles.filter((t) => t === 'Kid A').length, 1);
});

test('Ricerca: l\'anno più vecchio e la copertina di riserva per MusicBrainz', () => {
  const lists = [
    [r('itunes', 'Abbey Road (Remastered 2009)', 'The Beatles', '2009')],
    [],
    [r('musicbrainz', 'Abbey Road', 'The Beatles', '1969'), r('musicbrainz', 'Abbey Road (Remastered 2009)', 'The Beatles', '1987')],
  ];
  const ranked = lib.rankResults(lists, 'abbey road');
  const original = ranked.find((x) => x.title === 'Abbey Road');
  assert.equal(original.year, '1969');
  assert.equal(original.coverAlt, 'https://img/itunes/Abbey Road (Remastered 2009)');
  const remaster = ranked.find((x) => x.title === 'Abbey Road (Remastered 2009)');
  assert.equal(remaster.year, '1987');
  assert.equal(ranked[0].title, 'Abbey Road');
});

test('Versioni', () => {
  assert.equal(lib.cmpVer('1.10.0', '1.9.3'), 1);
  assert.equal(lib.cmpVer('1.8.3', '1.8.3'), 0);
  assert.equal(lib.cmpVer('1.8', '1.8.1'), -1);
});

test('withTimeout', async () => {
  await assert.rejects(lib.withTimeout(new Promise(() => {}), 20), /TIMEOUT/);
  assert.equal(await lib.withTimeout(Promise.resolve(7), 1000), 7);
});

test('Generi: nomi di iTunes e Deezer raccolti in famiglie', () => {
  assert.equal(lib.normGenre('Alternativa'), 'Alternative');
  assert.equal(lib.normGenre('Alternative & Punk'), 'Alternative');
  assert.equal(lib.normGenre('Hip-Hop/Rap'), 'Hip-hop');
  assert.equal(lib.normGenre('Rap/Hip Hop'), 'Hip-hop');
  assert.equal(lib.normGenre('J-Pop'), 'Asiatica');
  assert.equal(lib.normGenre('Musica Asiatica'), 'Asiatica');
  assert.equal(lib.normGenre('Jungle/Drum’n’Bass'), 'Elettronica');
  assert.equal(lib.normGenre('MPB'), 'World');
  assert.equal(lib.normGenre('Pop/Rock'), 'Rock');
  assert.equal(lib.normGenre('Elettronica'), 'Elettronica');
  assert.equal(lib.normGenre('Electro'), 'Elettronica');
  assert.equal(lib.normGenre('R&B/Soul'), 'R&B e soul');
  assert.equal(lib.normGenre('Pop'), 'Pop');
  assert.equal(lib.normGenre('chanson'), 'Chanson');
  assert.equal(lib.normGenre(''), '');
});

test('Settimane di fila con almeno un ascolto', () => {
  const day = 864e5;
  const now = new Date(2026, 10, 27, 12).getTime(); // venerdì
  const at = (daysAgo) => now - daysAgo * day;
  // questa settimana, la scorsa e quella prima: 3 di fila; poi un buco; prima ancora 4 di fila
  const times = [at(1), at(8), at(15), at(36), at(43), at(50), at(57)];
  assert.deepEqual(lib.weekStreaks(times, now), { current: 3, best: 4 });
  // l'ultima è della settimana scorsa: la serie vale ancora (questa non è finita)
  assert.deepEqual(lib.weekStreaks([at(8), at(15)], now), { current: 2, best: 2 });
  // niente da due settimane: serie interrotta
  assert.deepEqual(lib.weekStreaks([at(20)], now), { current: 0, best: 1 });
  assert.deepEqual(lib.weekStreaks([], now), { current: 0, best: 0 });
});
