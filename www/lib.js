'use strict';
/* Funzioni pure, senza DOM né plugin: le usa app.js (caricato dopo questo file)
   e le provano i test in test/ con `npm test`. In fondo, l'export per Node. */

/* ---------- Testo ---------- */
// Parole minuscole senza accenti né punteggiatura: "Björk – Début!" → ["bjork", "debut"]
function tokens(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter(Boolean);
}

// Lo stesso album, scritto in qualsiasi modo: stesse parole nel titolo e nell'artista
const sameAlbum = (a, b) => tokens(a.title).join(' ') === tokens(b.title).join(' ')
  && tokens(a.artist).join(' ') === tokens(b.artist).join(' ');

/* ---------- Unione e ordinamento dei risultati di ricerca ---------- */
// Parole che indicano un'edizione dello stesso album: pesano meno delle parole "estranee"
const QUALIFIERS = new Set(['live', 'remaster', 'remastered', 'deluxe', 'edition', 'version', 'anniversary', 'expanded',
  'bonus', 'mono', 'stereo', 'reissue', 'edizione', 'remix', 'remixes', 'ep', 'single', 'track', 'tracks']);
const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'il', 'lo', 'la', 'i', 'gli', 'le', 'di', 'e']);

// Titolo "di base", senza indicazioni di edizione: "Abbey Road (Remastered 2009)" → "abbey road"
const baseTitle = (title) => tokens(title).filter((t) => !QUALIFIERS.has(t) && !/^\d+$/.test(t)).join(' ');

// Lo stesso album da più fonti diventa un solo risultato: copertina dalla fonte più affidabile
// (le liste arrivano in ordine iTunes, Deezer, MusicBrainz) e l'anno più vecchio, cioè quello dell'uscita originale.
// Per ogni album conta anche quante fonti lo conoscono (edizioni comprese): è un buon indizio di quello "giusto".
function mergeResults(lists) {
  const byKey = new Map();
  const groups = new Map(); // titolo di base + artista → { fonti, copertina di riserva }
  lists.forEach((list, engineIdx) => list.forEach((r, pos) => {
    const artist = tokens(r.artist).join(' ');
    const groupKey = baseTitle(r.title) + '|' + artist;
    const group = groups.get(groupKey) || { sources: new Set(), cover: '' };
    group.sources.add(engineIdx);
    if (!group.cover && r.cover && r.source !== 'musicbrainz') group.cover = r.cover;
    groups.set(groupKey, group);

    const key = tokens(r.title).join(' ') + '|' + artist;
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, { ...r, engineIdx, pos, groupKey }); return; }
    if (!prev.cover && r.cover) prev.cover = r.cover;
    if (r.year && (!prev.year || r.year < prev.year)) prev.year = r.year;
    prev.pos = Math.min(prev.pos, pos);
  }));
  return [...byKey.values()].map((r) => {
    const group = groups.get(r.groupKey);
    const { groupKey, ...rest } = r;
    // Le copertine di MusicBrainz a volte mancano: di riserva quella di un'altra edizione dello stesso album
    const coverAlt = r.source === 'musicbrainz' && group.cover && group.cover !== r.cover ? group.cover : '';
    return { ...rest, sources: group.sources.size, ...(coverAlt ? { coverAlt } : {}) };
  });
}

// Quanto un risultato corrisponde a ciò che è stato cercato
function relevance(r, Q) {
  const T = tokens(r.title), A = tokens(r.artist);
  const matches = (t, qt) => t === qt || (qt.length >= 3 && t.startsWith(qt));
  const inQuery = (t) => Q.some((qt) => matches(t, qt));
  const covered = Q.filter((qt) => T.some((t) => matches(t, qt)) || A.some((t) => matches(t, qt))).length / Q.length;
  const extra = T.filter((t) => !inQuery(t) && !STOPWORDS.has(t));
  const extraQualifiers = extra.filter((t) => QUALIFIERS.has(t) || /^\d+$/.test(t)).length;
  const extraWords = extra.length - extraQualifiers;

  let score = 4 * covered;                                    // quante parole cercate ci sono
  if (T.some(inQuery) && extraWords === 0) score += 2;       // il titolo è proprio quello cercato
  if (A.some(inQuery)) {                                      // l'artista è tra le parole cercate…
    score += 0.5;
    score -= 0.2 * A.filter((t) => !inQuery(t) && !STOPWORDS.has(t)).length; // …ma con altre parole nel nome
  }
  score += 0.4 * Math.min((r.sources || 1) - 1, 2);           // conosciuto da più fonti
  score -= 0.6 * Math.min(extraWords, 5);                     // parole nel titolo che non hai scritto
  score -= 0.3 * Math.min(extraQualifiers, 3);                // "Live", "Remastered", "2016"…
  if (r.type) score -= 0.5;                                   // singoli ed EP dopo gli album
  return score - r.pos * 0.01;                                // a parità, l'ordine delle fonti
}

function rankResults(lists, q) {
  const Q = [...new Set(tokens(q))];
  return mergeResults(lists)
    .map((r) => ({ r, s: Q.length ? relevance(r, Q) : -r.pos }))
    .sort((a, b) => b.s - a.s || a.r.engineIdx - b.r.engineIdx)
    .map((x) => x.r)
    .slice(0, 60);
}

/* ---------- Lettura dei link (Spotify, Apple Music, Deezer, Bandcamp) ---------- */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeHtml(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? m;
    const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    try { return String.fromCodePoint(code); } catch { return m; }
  });
}

function metaFrom(html) {
  const get = (name) => {
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, 'i');
    const m = html.match(re1) || html.match(re2);
    return m ? decodeHtml(m[1]).trim() : '';
  };
  const title = decodeHtml((html.match(/<title[^>]*>([^<]*)/i) || [])[1] || '').trim();
  return { get, title };
}

const yearIn = (s) => (String(s || '').match(/\b(19|20)\d{2}\b/) || [])[0] || '';

// Identità stabile di un link: senza "?si=…", "intl-it" e simili, così lo stesso album copiato due volte è riconosciuto
function canonicalLink(raw) {
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/^\/intl-[a-z]{2}(-[a-z]{2})?\//i, '/').replace(/\/$/, '');
    return `${u.hostname.replace(/^www\./, '')}${path}`;
  } catch { return raw; }
}

// Da una pagina di Spotify, Apple Music, Deezer, Bandcamp (o un sito qualsiasi) ricava titolo, artista, anno e copertina.
// Restituisce { album }, oppure { query } (testo da cercare) per i siti che non conosce, oppure null.
function parseAlbumPage(url, html) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  const { get, title: pageTitle } = metaFrom(html);
  const ogTitle = get('og:title');
  const desc = get('og:description');
  const cover = get('og:image');
  const release = yearIn(get('music:release_date'));
  let title = '', artist = '', year = release, type = '';
  // "Album", "Singolo"/"Single", "EP" nella descrizione (Spotify, Apple Music, Deezer)
  const typeIn = (s) => (/\b(singolo|single)\b/i.test(s) ? 'single' : /\bEP\b/.test(s) ? 'ep' : '');

  if (host.endsWith('spotify.com')) {
    // Album: "Ascolta Kid A - Album di Radiohead | Spotify" + "Radiohead · Album · 2000 · 11 brani"
    // Brano: "In Limbo" + "Radiohead · Kid A · Brano · 2000" → si prende l'album
    const parts = desc.split(' · ');
    if (/\/track\//.test(url) && parts.length >= 3) {
      artist = parts[0]; title = parts[1];
    } else {
      artist = parts[0] || '';
      type = typeIn(parts[1] || '');
      title = ogTitle.replace(/^(Listen to|Ascolta|Escucha|Écouter|Hör dir)\s+/i, '')
        .replace(/\s+-\s+(Album|EP|Single|Singolo|Compilation).*$/i, '').replace(/\s*\|\s*Spotify$/i, '');
    }
    year = year || yearIn(desc);
  } else if (host.endsWith('music.apple.com')) {
    // "Kid A di Radiohead su Apple Music" (cambia con la lingua: by/on, von/auf…)
    const m = ogTitle.match(/^(.*)\s+(?:di|by|von|de|par)\s+(.*?)\s+(?:su|on|auf|en|sur)\s+Apple Music$/i);
    if (m) { title = m[1]; artist = m[2]; } else title = ogTitle;
    year = year || yearIn(desc);
    type = typeIn(desc);
  } else if (host.endsWith('deezer.com')) {
    // "Kid A" + "Radiohead - album - 2000 - 11 canzoni"
    title = ogTitle;
    artist = desc.split(' - ')[0] || '';
    year = year || yearIn(desc);
    type = typeIn(desc);
  } else if (host.endsWith('bandcamp.com')) {
    // "Mother Earth's Plantasia, by Mort Garson"
    const m = ogTitle.match(/^(.*),\s+by\s+(.*)$/);
    if (m) { title = m[1]; artist = m[2]; } else title = ogTitle;
    year = year || yearIn((html.match(/"datePublished"\s*:\s*"([^"]+)"/) || [])[1]
      || (html.match(/released\s+[A-Za-z]+\s+\d{1,2},\s+(\d{4})/) || [])[1]);
  } else {
    // Sito qualsiasi: il titolo della pagina (senza il nome del sito) serve solo come testo da cercare
    const query = (ogTitle || pageTitle).replace(/\s*[|–—-]\s*[^|–—-]+$/, '').trim();
    return query && !/challenge|just a moment|access denied/i.test(query) ? { query } : null;
  }
  title = title.trim(); artist = artist.trim();
  if (!title) return null;
  return { album: { source: 'link', sourceId: canonicalLink(url), title, artist, year, cover, type } };
}

// Se la pagina non si legge (per esempio un controllo anti-bot), qualcosa si ricava dall'indirizzo:
// ".../album/mother-earths-plantasia" → "mother earths plantasia"
function queryFromUrl(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const i = parts.findIndex((p) => /^(album|release|record)s?$/i.test(p));
    const slug = i >= 0 ? parts[i + 1] : '';
    return slug && !/^\d+$/.test(slug) ? decodeURIComponent(slug).replace(/[-_+]+/g, ' ').trim() : '';
  } catch { return ''; }
}

// I link condivisi da Spotify hanno "?si=…": da telefono rimandano all'app invece che alla pagina.
// "nd=1" (no deeplink) è il parametro che Spotify stesso usa per restare sulla pagina web.
function cleanSharedUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.hostname.endsWith('spotify.com')) return `${u.origin}${u.pathname}?nd=1`;
    return u.href;
  } catch { return raw; }
}

// Il primo link in un testo condiviso o copiato (/i: alcune tastiere mettono la maiuscola, "Https://…")
const firstUrl = (text) => {
  const found = (String(text || '').match(/https?:\/\/[^\s<>"']+/i) || [])[0];
  return found ? cleanSharedUrl(found) : '';
};

/* ---------- Statistiche ---------- */
// I generi arrivano con nomi diversi da iTunes (in italiano) e Deezer: si raccolgono in poche famiglie.
// L'ordine conta: "J-Pop" prima di "Pop", "Alternative & Punk" va in Alternative, "Pop/Rock" in Rock.
const GENRES = [
  [/alternativ|indie/, 'Alternative'], [/hip.?hop|\brap\b/, 'Hip-hop'], [/r&b|r'n'b|soul|funk/, 'R&B e soul'],
  [/j-?pop|j-?rock|k-?pop|c-?pop|anime|city pop|kayokyoku|giappon|japan|asiat|asian/, 'Asiatica'],
  [/elettron|electro|dance|techno|house|edm|jungle|drum|bass|breakbeat|garage|trance/, 'Elettronica'], [/jazz/, 'Jazz'], [/classic/, 'Classica'],
  [/colonn|soundtrack|film|giochi|games/, 'Colonne sonore'], [/metal/, 'Metal'], [/punk/, 'Punk'], [/rock/, 'Rock'],
  [/cantautor|singer/, 'Cantautori'], [/reggae|dub/, 'Reggae'], [/blues/, 'Blues'], [/country/, 'Country'], [/folk/, 'Folk'],
  [/world|mondo|latin|brasil|\bmpb\b|bossa|samba|africa/, 'World'], [/new age|ambient|easy listening|lounge/, 'Ambient e lounge'], [/pop/, 'Pop'],
];
function normGenre(g) {
  const s = String(g || '').trim();
  if (!s) return '';
  const hit = GENRES.find(([re]) => re.test(s.toLowerCase()));
  return hit ? hit[1] : s.charAt(0).toUpperCase() + s.slice(1);
}

// Settimane di fila (da lunedì a domenica) con almeno un ascolto: quella in corso (che vale anche se
// l'ultimo ascolto è della settimana scorsa: questa non è ancora finita) e la più lunga di sempre
function weekStreaks(times, now = Date.now()) {
  const weekOf = (t) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return Math.round(d.getTime() / (7 * 864e5));
  };
  const weeks = [...new Set(times.map(weekOf))].sort((a, b) => a - b);
  let best = 0, run = 0, prev = null;
  for (const w of weeks) {
    run = prev !== null && w === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = w;
  }
  const has = new Set(weeks);
  let w = has.has(weekOf(now)) ? weekOf(now) : weekOf(now) - 1;
  let current = 0;
  while (has.has(w)) { current++; w--; }
  return { current, best };
}

/* ---------- Varie ---------- */
// Confronto di versioni "1.10.0" > "1.9.3"
const cmpVer = (a, b) => {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return Math.sign(d); }
  return 0;
};

// Una richiesta che non risponde non deve lasciare "Cerco…" per sempre
function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('TIMEOUT')), ms); }),
  ]).finally(() => clearTimeout(timer));
}

if (typeof module === 'object' && module.exports) {
  module.exports = {
    tokens, sameAlbum, baseTitle, mergeResults, relevance, rankResults, decodeHtml, metaFrom, yearIn,
    canonicalLink, parseAlbumPage, queryFromUrl, cleanSharedUrl, firstUrl, cmpVer, withTimeout, normGenre, weekStreaks,
  };
}
