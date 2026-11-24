'use strict';

/* ---------- Piattaforma e archiviazione ---------- */
const Cap = window.Capacitor;
const NATIVE = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
const Plugins = NATIVE ? Cap.Plugins : {};

const store = {
  async get(key) {
    if (Plugins.Preferences) return (await Plugins.Preferences.get({ key })).value;
    return localStorage.getItem(key);
  },
  async set(key, value) {
    if (Plugins.Preferences) return Plugins.Preferences.set({ key, value });
    localStorage.setItem(key, value);
  },
};

const K_ALBUMS = 'albums.v1';
const K_SETTINGS = 'settings.v1';

let albums = [];
let settings = { theme: 'dark', view: 'list', cols: 2 };
let tab = 'todo';

async function load() {
  try { albums = JSON.parse((await store.get(K_ALBUMS)) || '[]'); } catch { albums = []; }
  try { Object.assign(settings, JSON.parse((await store.get(K_SETTINGS)) || '{}')); } catch {}
  // Le versioni precedenti salvavano chiavi Spotify e fonte di ricerca: non servono più, si cancellano
  if ('spotifyId' in settings || 'spotifySecret' in settings || 'source' in settings) {
    delete settings.spotifyId; delete settings.spotifySecret; delete settings.source;
    await saveSettings();
  }
}
const saveAlbums = () => store.set(K_ALBUMS, JSON.stringify(albums));
const saveSettings = () => store.set(K_SETTINGS, JSON.stringify(settings));

/* ---------- Utilità ---------- */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TYPE_NAME = { single: 'Singolo', ep: 'EP', compilation: 'Raccolta', live: 'Live' };

const ICON = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/></svg>',
};

function coverHtml(a) {
  const initial = esc((a.title || '?').trim().charAt(0).toUpperCase());
  const src = a.cover || a.coverAlt;
  const alt = a.cover && a.coverAlt ? ` data-alt="${esc(a.coverAlt)}"` : '';
  return `<div class="cover">${src ? `<img loading="lazy" src="${esc(src)}"${alt} alt="">` : initial}</div>`;
}
// Copertina mancante (404): prima quella di riserva, se c'è, poi l'iniziale
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName === 'IMG' && img.dataset.alt) {
    img.src = img.dataset.alt;
    delete img.dataset.alt;
    return;
  }
  if (img.tagName === 'IMG' && img.parentElement?.classList.contains('cover')) {
    const box = img.parentElement;
    img.remove();
    box.textContent = (box.closest('[data-title]')?.dataset.title || '?').charAt(0).toUpperCase();
  }
}, true);

function subLine(a) {
  return [a.artist, a.year, TYPE_NAME[a.type]].filter(Boolean).join(' · ');
}
const fmtDate = (ts) => new Date(ts).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });

/* ---------- Lista principale ---------- */
function render() {
  const todo = albums.filter((a) => !a.listenedAt).sort((a, b) => b.addedAt - a.addedAt);
  const done = albums.filter((a) => a.listenedAt).sort((a, b) => b.listenedAt - a.listenedAt);
  $('#count-todo').textContent = todo.length || '';
  $('#count-done').textContent = done.length || '';
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));

  const items = tab === 'todo' ? todo : done;
  visibleIds = items.map((a) => a.id);
  $('#list').innerHTML = items.map((a) => {
    const picked = selected.has(a.id);
    // In selezione il tocco sceglie la riga; altrimenti apre la scheda e il cerchio spunta l'ascolto
    const action = selecting
      ? `<span class="check pick ${picked ? 'on' : ''}" aria-hidden="true"><i>${ICON.check}</i></span>`
      : `<button class="check ${a.listenedAt ? 'on' : ''}" data-act="toggle" data-id="${esc(a.id)}"
        aria-label="${a.listenedAt ? 'Segna da ascoltare' : 'Segna come ascoltato'}"><i>${ICON.check}</i></button>`;
    return `
    <li class="row ${picked ? 'picked' : ''}" data-act="${selecting ? 'select' : 'detail'}" data-id="${esc(a.id)}" data-title="${esc(a.title)}"
      ${selecting ? `role="checkbox" aria-checked="${picked}"` : ''}>
      ${coverHtml(a)}
      <div class="meta">
        <div class="title">${esc(a.title)}</div>
        <div class="sub">${esc(tab === 'done' ? `${a.artist} · ${fmtDate(a.listenedAt)}` : subLine(a))}</div>
      </div>
      ${action}
    </li>`;
  }).join('');

  $('#select-bar').hidden = !selecting;
  $('#top-bar').hidden = selecting;
  $('.fab').hidden = selecting;
  $('#select-count').textContent = selected.size === 1 ? '1 selezionato' : `${selected.size} selezionati`;
  $('[data-act="select-delete"]').disabled = selected.size === 0;
  $('[data-act="select-all"]').textContent = selected.size === visibleIds.length && visibleIds.length ? 'Nessuno' : 'Tutti';

  const empty = $('#empty');
  empty.hidden = items.length > 0;
  empty.textContent = tab === 'todo'
    ? (albums.length ? 'Hai ascoltato tutto.\nAggiungi qualcosa di nuovo.' : 'Nessun album in lista.\nTocca + per aggiungerne uno.')
    : 'Gli album che spunti finiranno qui.';
}

/* ---------- Selezione multipla ---------- */
let selecting = false;
const selected = new Set();
let visibleIds = [];

function startSelection(id) {
  selecting = true;
  selected.clear();
  if (id) selected.add(id);
  navigator.vibrate?.(15);
  render();
}
function exitSelection() {
  if (!selecting) return false;
  selecting = false;
  selected.clear();
  render();
  return true;
}
function togglePick(id) {
  if (selected.has(id)) selected.delete(id); else selected.add(id);
  render();
}
function pickAll() {
  if (selected.size === visibleIds.length) selected.clear();
  else visibleIds.forEach((id) => selected.add(id));
  render();
}
function deleteSelected() {
  if (!selected.size) return;
  const removed = albums.filter((a) => selected.has(a.id));
  albums = albums.filter((a) => !selected.has(a.id));
  saveAlbums();
  exitSelection();
  toast(removed.length === 1 ? 'Album eliminato' : `${removed.length} album eliminati`, () => {
    albums.push(...removed); saveAlbums(); render();
  });
}

// Tieni premuto un album per iniziare la selezione
(() => {
  let timer = null, startX = 0, startY = 0;
  let suppressClick = false;
  const cancel = () => { clearTimeout(timer); timer = null; };
  const list = $('#list');
  list.addEventListener('pointerdown', (e) => {
    suppressClick = false;
    const row = e.target.closest('.row');
    if (!row || selecting || e.target.closest('[data-act="toggle"]')) return;
    startX = e.clientX; startY = e.clientY;
    cancel();
    timer = setTimeout(() => { timer = null; suppressClick = true; startSelection(row.dataset.id); }, 450);
  });
  list.addEventListener('pointermove', (e) => {
    if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > 10) cancel();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => list.addEventListener(t, cancel));
  window.addEventListener('scroll', cancel, { passive: true });
  // Il clic che segue la pressione lunga non deve deselezionare la riga appena scelta
  list.addEventListener('click', (e) => {
    if (suppressClick) { suppressClick = false; e.stopPropagation(); e.preventDefault(); }
  }, true);
  list.addEventListener('contextmenu', (e) => e.preventDefault());
})();

function toggleListened(id, rowEl) {
  const a = albums.find((x) => x.id === id);
  if (!a) return;
  const prev = a.listenedAt;
  const apply = () => {
    a.listenedAt = prev ? null : Date.now();
    saveAlbums(); render();
    toast(prev ? 'Rimesso in lista' : 'Segnato come ascoltato', () => {
      a.listenedAt = prev; saveAlbums(); render();
    });
  };
  if (rowEl) {
    rowEl.querySelector('.check').classList.toggle('on', !prev);
    setTimeout(() => rowEl.classList.add('leaving'), 180);
    setTimeout(apply, 480);
  } else apply();
}

/* ---------- Overlay (ricerca, impostazioni, dettaglio) ---------- */
const stack = [];
function openLayer(id) {
  $('#' + id).hidden = false;
  if (id === 'sheet') $('#sheet-backdrop').hidden = false;
  stack.push(id);
  document.body.classList.add('locked');
}
function closeLayer() {
  const id = stack.pop();
  if (!id) return false;
  $('#' + id).hidden = true;
  if (id === 'sheet') $('#sheet-backdrop').hidden = true;
  if (!stack.length) document.body.classList.remove('locked');
  if (id === 'search' || id === 'manual') render();
  return true;
}

/* ---------- Dettaglio album ---------- */
function openDetail(id) {
  const a = albums.find((x) => x.id === id);
  if (!a) return;
  const meta = [a.year, TYPE_NAME[a.type], a.listenedAt ? `ascoltato il ${fmtDate(a.listenedAt)}` : `aggiunto il ${fmtDate(a.addedAt)}`].filter(Boolean).join(' · ');
  $('#sheet').innerHTML = `
    <div class="head" data-title="${esc(a.title)}">
      ${coverHtml(a)}
      <div><h2>${esc(a.title)}</h2><div class="by">${esc(a.artist)}</div><div class="by">${esc(meta)}</div></div>
    </div>
    <div class="actions">
      <button data-act="sheet-toggle" data-id="${esc(a.id)}">${a.listenedAt ? ICON.undo + 'Rimetti tra da ascoltare' : ICON.check + 'Segna come ascoltato'}</button>
      <button class="danger" data-act="delete" data-id="${esc(a.id)}">${ICON.trash}<span>Elimina</span></button>
    </div>`;
  openLayer('sheet');
}

function deleteAlbum(id, btn) {
  if (!btn.dataset.confirm) {
    btn.dataset.confirm = '1';
    btn.querySelector('span').textContent = 'Tocca di nuovo per eliminare';
    return;
  }
  const idx = albums.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const [removed] = albums.splice(idx, 1);
  saveAlbums(); closeLayer(); render();
  toast('Album eliminato', () => { albums.splice(idx, 0, removed); saveAlbums(); render(); });
}

/* ---------- Toast con annulla ---------- */
let toastTimer;
function toast(text, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(text)}</span>${undo ? '<button>Annulla</button>' : ''}`;
  el.hidden = false;
  if (undo) el.querySelector('button').onclick = () => { el.hidden = true; undo(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

/* ---------- Motori di ricerca (senza chiavi) ---------- */
const UA = 'Ascolti/1.0 (app personale)';

async function getJson(url, opts = {}) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Fonti interrogate tutte insieme a ogni ricerca (ordine = priorità per copertina e risultati a pari merito)
const ENGINES = [
  // iTunes Search di Apple: titolo, artista, anno e copertina in una sola richiesta
  async function itunes(q) {
    const j = await getJson(`https://itunes.apple.com/search?entity=album&country=IT&limit=25&term=${encodeURIComponent(q)}`);
    return (j.results || []).filter((r) => r.collectionId).map((r) => {
      let title = r.collectionName || '';
      let type = '';
      const m = title.match(/\s+-\s+(Single|EP)$/i);
      if (m) { type = m[1].toLowerCase() === 'ep' ? 'ep' : 'single'; title = title.slice(0, m.index); }
      return {
        source: 'itunes', sourceId: String(r.collectionId), title,
        artist: r.artistName || '', year: (r.releaseDate || '').slice(0, 4),
        cover: (r.artworkUrl100 || '').replace('100x100bb', '600x600bb'), type,
      };
    });
  },
  async function deezer(q) {
    const j = await getJson(`https://api.deezer.com/search/album?limit=25&q=${encodeURIComponent(q)}`);
    if (j.error) throw new Error(j.error.message);
    return (j.data || []).map((a) => ({
      source: 'deezer', sourceId: String(a.id), title: a.title,
      artist: a.artist?.name || '', year: '',
      cover: a.cover_big || a.cover_medium || '',
      type: a.record_type === 'album' ? '' : a.record_type,
    }));
  },
  async function musicbrainz(q) {
    const url = `https://musicbrainz.org/ws/2/release-group?fmt=json&limit=25&query=${encodeURIComponent(q)}`;
    const opts = { headers: { 'User-Agent': UA, Accept: 'application/json' } };
    let j;
    try {
      j = await getJson(url, opts);
    } catch (e) {
      // MusicBrainz accetta una richiesta al secondo: se dice "troppe richieste" (503) riprova una volta
      if (!/HTTP 503/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 1200));
      j = await getJson(url, opts);
    }
    return (j['release-groups'] || []).map((g) => ({
      source: 'musicbrainz', sourceId: g.id, title: g.title,
      artist: (g['artist-credit'] || []).map((c) => (c.name || c.artist?.name || '') + (c.joinphrase || '')).join(''),
      year: (g['first-release-date'] || '').slice(0, 4),
      cover: `https://coverartarchive.org/release-group/${g.id}/front-250`,
      type: ({ Single: 'single', EP: 'ep' })[g['primary-type']] || '',
    }));
  },
];

// Deezer non restituisce l'anno nella ricerca: lo recupera dopo l'aggiunta
async function enrichDeezerYear(a) {
  try {
    const j = await getJson(`https://api.deezer.com/album/${a.sourceId}`);
    if (j.release_date) { a.year = j.release_date.slice(0, 4); saveAlbums(); render(); }
  } catch {}
}

/* ---------- Unione e ordinamento dei risultati ---------- */
// Parole che indicano un'edizione dello stesso album: pesano meno delle parole "estranee"
const QUALIFIERS = new Set(['live', 'remaster', 'remastered', 'deluxe', 'edition', 'version', 'anniversary', 'expanded',
  'bonus', 'mono', 'stereo', 'reissue', 'edizione', 'remix', 'remixes', 'ep', 'single', 'track', 'tracks']);
const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'il', 'lo', 'la', 'i', 'gli', 'le', 'di', 'e']);

function tokens(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter(Boolean);
}

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

/* ---------- Schermata di ricerca ---------- */

let results = [];
let searchSeq = 0;
let searchTimer;

const keyOf = (r) => `${r.source}:${r.sourceId}`;

function renderResults() {
  $('#results').innerHTML = results.map((r, i) => {
    const added = albums.some((a) => a.id === keyOf(r));
    return `
    <li class="row" data-title="${esc(r.title)}">
      ${coverHtml(r)}
      <div class="meta"><div class="title">${esc(r.title)}</div><div class="sub">${esc(subLine(r))}</div></div>
      <button class="add ${added ? 'on' : ''}" data-act="add" data-i="${i}" aria-label="${added ? 'Già in lista' : 'Aggiungi'}"><i>${added ? ICON.check : ICON.plus}</i></button>
    </li>`;
  }).join('');
}

// Interroga tutte le fonti insieme e aggiorna la lista man mano che rispondono
async function runSearch() {
  const q = $('#q').value.trim();
  const status = $('#status');
  const seq = ++searchSeq;
  if (q.length < 2) { results = []; renderResults(); status.textContent = ''; return; }

  status.innerHTML = '<span class="spinner"></span>Cerco…';
  const lists = ENGINES.map(() => []);
  let pending = ENGINES.length, failures = 0;
  const update = () => {
    if (seq !== searchSeq) return;
    results = rankResults(lists, q);
    renderResults();
    if (pending) status.innerHTML = '<span class="spinner"></span>Cerco…';
    else status.textContent = results.length ? ''
      : failures === ENGINES.length ? 'Ricerca non riuscita. Controlla la connessione.' : 'Nessun risultato.';
  };
  await Promise.all(ENGINES.map(async (engine, i) => {
    try { lists[i] = await engine(q); } catch { failures++; }
    pending--;
    update();
  }));
}

function addResult(i, btn) {
  const r = results[i];
  if (!r) return;
  const id = keyOf(r);
  const existing = albums.findIndex((a) => a.id === id);
  if (existing >= 0) {
    albums.splice(existing, 1);
    btn.classList.remove('on'); btn.innerHTML = `<i>${ICON.plus}</i>`;
  } else {
    const { engineIdx, pos, sources, ...data } = r; // campi solo per l'ordinamento
    const a = { id, ...data, addedAt: Date.now(), listenedAt: null };
    albums.push(a);
    btn.classList.add('on'); btn.innerHTML = `<i>${ICON.check}</i>`;
    if (a.source === 'deezer' && !a.year) enrichDeezerYear(a);
  }
  saveAlbums();
}

/* ---------- Impostazioni ---------- */
function importBackup() {
  try {
    const data = JSON.parse($('#backup').value);
    if (!Array.isArray(data)) throw new Error();
    const ids = new Set(albums.map((a) => a.id));
    const fresh = data.filter((a) => a && a.id && a.title && !ids.has(a.id));
    albums.push(...fresh);
    saveAlbums(); render();
    toast(`Importati ${fresh.length} album`);
  } catch { toast('Backup non valido'); }
}

/* ---------- Aggiornamenti (release GitHub) ---------- */
const REPO = 'dariotronic/ascolti-todo';
const K_UPDATE = 'update.v1';
const CHECK_EVERY = 60 * 60 * 1000; // controllo automatico al massimo una volta l'ora
let appVersion = '';

const cmpVer = (a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return Math.sign(d); }
  return 0;
};
const isNewer = (latest) => !!(latest && appVersion && cmpVer(latest.version, appVersion) > 0);

// Plugin nativo (ApkUpdaterPlugin.java): scarica l'APK e apre l'installazione
// (senza bundler si usa il proxy Capacitor.Plugins: registerPlugin non è disponibile)
const Updater = Plugins.ApkUpdater || null;

// Stato: available → downloading → ready (→ installazione di sistema) | error
const upd = { latest: null, phase: 'idle', progress: 0, needsPermission: false, path: '', error: '' };

function updateHtml() {
  const v = esc(upd.latest.version);
  switch (upd.phase) {
    case 'downloading': {
      const known = upd.progress >= 0;
      const pct = known ? Math.round(upd.progress * 100) : 0;
      return `<div class="upd-row"><span>Scarico la versione ${v}…</span><span class="pct">${known ? pct + '%' : ''}</span></div>
        <div class="bar ${known ? '' : 'indeterminate'}"><i style="width:${pct}%"></i></div>`;
    }
    case 'ready':
      return `<div class="upd-row"><span>Versione ${v} pronta</span><button data-act="upd-install">Installa</button></div>
        ${upd.needsPermission ? '<p class="upd-hint">Consenti ad Ascolti di installare app, poi torna qui: l’installazione riparte da sola.</p>' : ''}`;
    case 'error':
      return `<div class="upd-row"><span>Aggiornamento non riuscito</span><button data-act="upd-download">Riprova</button></div>
        ${upd.error ? `<p class="upd-hint">${esc(upd.error)}</p>` : ''}`;
    default:
      return `<div class="upd-row"><span>Nuova versione ${v} disponibile</span><button data-act="upd-download">Aggiorna</button></div>`;
  }
}

function renderUpdate() {
  const show = isNewer(upd.latest);
  const html = show ? updateHtml() : '';
  for (const el of [$('#update-banner'), $('#upd-panel')]) {
    el.hidden = !show;
    el.innerHTML = html;
  }
}

function setLatest(latest) {
  if (latest?.version !== upd.latest?.version) { upd.phase = 'idle'; upd.needsPermission = false; }
  upd.latest = latest;
  renderUpdate();
}

async function downloadUpdate() {
  if (!Updater || !upd.latest || upd.phase === 'downloading') return;
  upd.phase = 'downloading'; upd.progress = 0; upd.error = ''; renderUpdate();
  const sub = await Updater.addListener('progress', (p) => { upd.progress = p.progress; renderUpdate(); });
  try {
    // Il plugin accetta solo APK delle release di Ascolti, ne verifica impronta, versione e firma
    const { url, version, sha256 } = upd.latest;
    const r = await Updater.download({ url, version, sha256: sha256 || '' });
    upd.path = r.path;
    upd.phase = 'ready'; renderUpdate();
    await installUpdate();
  } catch (e) {
    upd.phase = 'error'; upd.error = e.message || ''; renderUpdate();
  } finally {
    sub.remove();
  }
}

async function installUpdate() {
  try {
    const r = await Updater.install({ path: upd.path || '' });
    upd.needsPermission = !!r.needsPermission;
  } catch (e) {
    upd.phase = 'error'; upd.error = e.message || '';
  }
  renderUpdate();
}

// Al ritorno dalle impostazioni di sistema: se il permesso ora c'è, installa
async function resumePendingInstall() {
  if (upd.phase !== 'ready' || !upd.needsPermission || !Updater) return;
  const { value } = await Updater.canInstall();
  if (value) installUpdate();
}

// force = true ignora il limite orario (pulsante nelle impostazioni)
async function checkUpdate(force = false) {
  let state = {};
  try { state = JSON.parse((await store.get(K_UPDATE)) || '{}'); } catch {}
  if (!force && state.lastCheck && Date.now() - state.lastCheck < CHECK_EVERY) {
    setLatest(state.latest);
    return state.latest;
  }
  let latest = null;
  try {
    const j = await getJson(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': UA },
    });
    const apk = (j.assets || []).find((a) => a.name.endsWith('.apk'));
    // Impronta che GitHub calcola per ogni file allegato ("sha256:…"): il plugin la confronta col download
    const digest = String(apk?.digest || '');
    if (apk) latest = {
      version: String(j.tag_name).replace(/^v/, ''),
      url: apk.browser_download_url,
      sha256: /^sha256:[0-9a-f]{64}$/i.test(digest) ? digest.slice(7).toLowerCase() : '',
    };
  } catch (e) {
    if (!/HTTP 404/.test(e.message)) throw e; // 404 = nessuna release pubblicata
  }
  await store.set(K_UPDATE, JSON.stringify({ lastCheck: Date.now(), latest }));
  setLatest(latest);
  return latest;
}

async function manualUpdateCheck() {
  const st = $('#upd-status');
  st.innerHTML = '<span class="spinner"></span>Controllo…';
  try {
    const latest = await checkUpdate(true);
    st.textContent = isNewer(latest) ? '' : 'Hai già l’ultima versione.';
  } catch (e) {
    st.textContent = `Controllo non riuscito (${e.message}).`;
  }
}

/* ---------- Tema ---------- */
function applyTheme() {
  const theme = settings.theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('theme', theme); // letto in <head> per evitare il lampo all'avvio
  $('#theme-switch').checked = theme === 'dark';
  // Icone della barra di stato: chiare su tema scuro, scure su tema chiaro
  try { Plugins.SystemBars?.setStyle({ style: theme === 'dark' ? 'DARK' : 'LIGHT' })?.catch?.(() => {}); } catch {}
}

$('#theme-switch').addEventListener('change', (e) => {
  settings.theme = e.target.checked ? 'dark' : 'light';
  saveSettings(); applyTheme();
});

/* ---------- Vista: lista o schede ---------- */
function applyView() {
  const grid = settings.view === 'grid';
  const cols = settings.cols === 3 ? 3 : 2;
  const list = $('#list');
  list.classList.toggle('grid', grid);
  list.classList.toggle('cols-3', grid && cols === 3);
  $('#view-switch').checked = grid;
  $('#cols-row').hidden = !grid;
  document.querySelectorAll('[data-act="cols"]').forEach((b) => {
    const on = +b.dataset.cols === cols;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on);
  });
}

$('#view-switch').addEventListener('change', (e) => {
  settings.view = e.target.checked ? 'grid' : 'list';
  saveSettings(); applyView();
});

/* ---------- Eventi ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act, id } = el.dataset;
  switch (act) {
    case 'tab': tab = el.dataset.tab; selecting = false; selected.clear(); render(); window.scrollTo(0, 0); break;
    case 'select': togglePick(id); break;
    case 'select-exit': exitSelection(); break;
    case 'select-all': pickAll(); break;
    case 'select-delete': deleteSelected(); break;
    case 'cols': settings.cols = +el.dataset.cols; saveSettings(); applyView(); break;
    case 'toggle': e.stopPropagation(); toggleListened(id, el.closest('.row')); break;
    case 'detail': openDetail(id); break;
    case 'sheet-toggle': closeLayer(); toggleListened(id); break;
    case 'delete': deleteAlbum(id, el); break;
    case 'close': closeLayer(); break;
    case 'open-search':
      openLayer('search'); renderResults(); syncClear();
      setTimeout(() => $('#q').focus(), 60);
      break;
    case 'add': addResult(+el.dataset.i, el); break;
    case 'clear-search': // "x": svuota testo e risultati, la tastiera resta aperta per una nuova ricerca
      clearTimeout(searchTimer); searchSeq++;
      $('#q').value = ''; syncClear();
      results = []; renderResults(); $('#status').textContent = '';
      $('#q').focus();
      break;
    case 'open-manual': {
      const f = $('#manual-form'); f.reset();
      f.elements.title.value = $('#q').value.trim();
      openLayer('manual'); setTimeout(() => f.elements.title.focus(), 60);
      break;
    }
    case 'open-settings':
      $('#backup').value = '';
      $('#app-version').textContent = appVersion ? `Versione installata: ${appVersion}` : 'Versione non disponibile nel browser.';
      $('#upd-status').textContent = '';
      openLayer('settings');
      break;
    case 'check-update': manualUpdateCheck(); break;
    case 'upd-download': downloadUpdate(); break;
    case 'upd-install': installUpdate(); break;
    case 'export': $('#backup').value = JSON.stringify(albums); $('#backup').select(); break;
    case 'import': importBackup(); break;
  }
});

const syncClear = () => { $('#q-clear').hidden = !$('#q').value; };
$('#q').addEventListener('input', () => {
  syncClear();
  clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 450);
});
$('#q').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { clearTimeout(searchTimer); runSearch(); e.target.blur(); }
});

$('#manual-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const now = Date.now();
  albums.push({
    id: `manual:${now}`, source: 'manual', sourceId: String(now),
    title: f.elements.title.value.trim(), artist: f.elements.artist.value.trim(), year: f.elements.year.value.trim(),
    cover: '', url: '', addedAt: now, listenedAt: null,
  });
  saveAlbums();
  while (stack.length) closeLayer();
  tab = 'todo'; render();
  toast('Album aggiunto');
});

// Tasto indietro di Android: chiude prima gli overlay
if (Plugins.App) {
  Plugins.App.addListener('backButton', () => {
    if (!closeLayer() && !exitSelection()) Plugins.App.minimizeApp();
  });
  // Anche quando l'app torna in primo piano (sempre con il limite orario)
  Plugins.App.addListener('resume', () => {
    resumePendingInstall().catch(() => {});
    if (upd.phase !== 'downloading') checkUpdate().catch(() => {});
  });
}

load().then(async () => {
  applyTheme();
  applyView();
  render();
  if (Plugins.App) {
    try { appVersion = (await Plugins.App.getInfo()).version; } catch {}
    checkUpdate().catch(() => {});
  }
});
