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
let settings = { theme: 'dark', view: 'list', cols: 2, sort: 'added', lastBackup: 0, backupSnooze: 0, musicApp: '' };
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
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
  dice: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1.1" fill="currentColor"/><circle cx="15" cy="15" r="1.1" fill="currentColor"/><circle cx="15" cy="9" r="1.1" fill="currentColor"/><circle cx="9" cy="15" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/></svg>',
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
  // Nella scelta della copertina un'immagine che non si carica non è una scelta valida: via la casella
  const tile = img.tagName === 'IMG' && img.closest('.cover-tile');
  if (tile) { tile.remove(); return; }
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

/* ---------- Filtro e ordinamento ---------- */
let filterText = '';
const collator = new Intl.Collator('it', { sensitivity: 'base', numeric: true });
// Per ordinare per artista si ignora l'articolo iniziale: "The Beatles" sta sotto la B
const artistKey = (a) => String(a.artist || '').replace(/^(the|il|lo|la|i|gli|le)\s+/i, '');
const yearOf = (a, missing) => (/^\d{4}$/.test(a.year) ? +a.year : missing);

function sortItems(items) {
  const byArtist = (a, b) => collator.compare(artistKey(a), artistKey(b)) || collator.compare(a.title, b.title);
  const sorts = {
    added: (a, b) => (tab === 'done' ? b.listenedAt - a.listenedAt : b.addedAt - a.addedAt),
    artist: byArtist,
    title: (a, b) => collator.compare(a.title, b.title) || byArtist(a, b),
    'year-asc': (a, b) => yearOf(a, 9999) - yearOf(b, 9999) || byArtist(a, b),   // senza anno: in fondo
    'year-desc': (a, b) => yearOf(b, -1) - yearOf(a, -1) || byArtist(a, b),
  };
  return items.sort(sorts[settings.sort] || sorts.added);
}

// Ogni parola scritta nel filtro deve comparire (anche solo l'inizio) in titolo, artista o anno
function matchesFilter(a) {
  const words = tokens(filterText);
  if (!words.length) return true;
  const hay = tokens(`${a.title} ${a.artist} ${a.year || ''}`);
  return words.every((w) => hay.some((t) => t.startsWith(w)));
}

/* ---------- Lista principale ---------- */
function render() {
  const todo = albums.filter((a) => !a.listenedAt);
  const done = albums.filter((a) => a.listenedAt);
  $('#count-todo').textContent = todo.length || '';
  $('#count-done').textContent = done.length || '';
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));

  const all = tab === 'todo' ? todo : done;
  const items = sortItems(all.filter(matchesFilter));
  $('#list-tools').hidden = all.length === 0;
  $('[data-act="random"]').hidden = tab !== 'todo' || items.length === 0;
  $('#sort').value = settings.sort || 'added';
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
      data-right="${tab === 'done' ? 'Da ascoltare' : 'Ascoltato'}"
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
  empty.textContent = all.length && filterText.trim()
    ? `Nessun album corrisponde a\n“${filterText.trim()}”.`
    : tab === 'todo'
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

function deleteOne(id) {
  const idx = albums.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const [removed] = albums.splice(idx, 1);
  saveAlbums(); render();
  toast('Album eliminato', () => { albums.splice(idx, 0, removed); saveAlbums(); render(); });
}

// Gesti nella vista a lista: verso destra segna come ascoltato (in "Ascoltati": lo rimette da ascoltare),
// verso sinistra elimina. Sempre con Annulla. Se il dito va prima in verticale, è il normale scorrimento.
(() => {
  const list = $('#list');
  let row = null, startX = 0, startY = 0, dx = 0, swiping = false, suppress = false;
  const reset = () => { row = null; swiping = false; dx = 0; };
  const snapBack = (r) => {
    r.classList.remove('swiping', 'swipe-armed');
    r.style.transition = 'transform .2s ease-out';
    r.style.transform = '';
    setTimeout(() => { r.style.transition = ''; delete r.dataset.swipe; }, 220);
  };
  list.addEventListener('pointerdown', (e) => {
    suppress = false;
    if (selecting || list.classList.contains('grid') || e.button > 0) return;
    // Anche partendo dal cerchio della spunta (verso sinistra viene naturale partire da lì):
    // un tocco senza trascinare continua a spuntare, un trascinamento è un gesto
    const r = e.target.closest('.row');
    if (!r) return;
    row = r; startX = e.clientX; startY = e.clientY; dx = 0; swiping = false;
  });
  list.addEventListener('pointermove', (e) => {
    if (!row) return;
    const mx = e.clientX - startX, my = e.clientY - startY;
    if (!swiping) {
      if (Math.abs(my) > 12 && Math.abs(my) > Math.abs(mx)) { reset(); return; }
      if (Math.abs(mx) < 12) return;
      swiping = true;
      row.classList.add('swiping');
      try { row.setPointerCapture(e.pointerId); } catch {}
    }
    dx = mx;
    row.style.transform = `translateX(${dx}px)`;
    row.dataset.swipe = dx > 0 ? 'right' : 'left';
    row.classList.toggle('swipe-armed', Math.abs(dx) > row.offsetWidth * 0.3);
  });
  list.addEventListener('pointerup', () => {
    if (!row) return;
    const r = row, d = dx, was = swiping;
    reset();
    if (!was) return;
    suppress = true; // il clic che segue non deve aprire la scheda
    if (Math.abs(d) > r.offsetWidth * 0.3) {
      r.classList.remove('swiping');
      r.style.transition = 'transform .18s ease-out';
      r.style.transform = `translateX(${d > 0 ? 110 : -110}%)`;
      const id = r.dataset.id;
      setTimeout(() => (d > 0 ? toggleListened(id) : deleteOne(id)), 170);
    } else snapBack(r);
  });
  list.addEventListener('pointercancel', () => { if (row && swiping) snapBack(row); reset(); });
  list.addEventListener('click', (e) => {
    if (suppress) { suppress = false; e.stopPropagation(); e.preventDefault(); }
  }, true);
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

/* ---------- App di musica preferita e copia ---------- */
// Indirizzi di ricerca web: Android li apre nell'app, se è installata, altrimenti nel browser
const MUSIC_APPS = {
  spotify: { name: 'Spotify', url: (q) => `https://open.spotify.com/search/${encodeURIComponent(q)}` },
  apple: { name: 'Apple Music', url: (q) => `https://music.apple.com/search?term=${encodeURIComponent(q)}` },
  youtube: { name: 'YouTube Music', url: (q) => `https://music.youtube.com/search?q=${encodeURIComponent(q)}` },
  deezer: { name: 'Deezer', url: (q) => `https://www.deezer.com/search/${encodeURIComponent(q)}` },
  tidal: { name: 'Tidal', url: (q) => `https://listen.tidal.com/search?q=${encodeURIComponent(q)}` },
  amazon: { name: 'Amazon Music', url: (q) => `https://music.amazon.com/search/${encodeURIComponent(q)}` },
  bandcamp: { name: 'Bandcamp', url: (q) => `https://bandcamp.com/search?q=${encodeURIComponent(q)}` },
  soundcloud: { name: 'SoundCloud', url: (q) => `https://soundcloud.com/search?q=${encodeURIComponent(q)}` },
};
// Testo da cercare: artista e titolo, come si scrive in qualsiasi barra di ricerca
const searchText = (a) => [a.artist, a.title].filter(Boolean).join(' ').trim();

async function copyAlbum(id) {
  const a = albums.find((x) => x.id === id);
  if (!a) return;
  const text = searchText(a);
  try {
    if (Plugins.Clipboard) await Plugins.Clipboard.write({ string: text });
    else await navigator.clipboard.writeText(text);
    toast(`Copiato: ${text}`);
  } catch {
    toast('Non riesco a copiare negli appunti');
  }
}

/* ---------- Dettaglio album ---------- */
// random = aperta dal dado "Cosa ascolto adesso?": in più c'è "Pesca un altro"
function openDetail(id, random = false) {
  const a = albums.find((x) => x.id === id);
  if (!a) return;
  const meta = [a.year, TYPE_NAME[a.type], a.listenedAt ? `ascoltato il ${fmtDate(a.listenedAt)}` : `aggiunto il ${fmtDate(a.addedAt)}`].filter(Boolean).join(' · ');
  const again = random && visibleIds.length > 1
    ? `<button data-act="random-again">${ICON.dice}Pesca un altro</button>` : '';
  // "Cerca su …" solo se nelle impostazioni hai scelto l'app di musica preferita
  const app = MUSIC_APPS[settings.musicApp];
  const listen = app
    ? `<a href="${esc(app.url(searchText(a)))}" target="_blank" rel="noopener">${ICON.search}Cerca su ${esc(app.name)}</a>` : '';
  $('#sheet').innerHTML = `
    ${random ? '<p class="sheet-kicker">Cosa ascolto adesso?</p>' : ''}
    <div class="head" data-title="${esc(a.title)}">
      ${coverHtml(a)}
      <div class="head-text">
        <h2>${esc(a.title)}</h2><div class="by">${esc(a.artist)}</div><div class="by">${esc(meta)}</div>
      </div>
      <button class="icon-btn copy-btn" data-act="copy-album" data-id="${esc(a.id)}" aria-label="Copia artista e titolo" title="Copia artista e titolo">${ICON.copy}</button>
    </div>
    <div class="actions">
      <button data-act="sheet-toggle" data-id="${esc(a.id)}">${a.listenedAt ? ICON.undo + 'Rimetti tra da ascoltare' : ICON.check + 'Segna come ascoltato'}</button>
      ${listen}
      ${again}
      <button data-act="edit" data-id="${esc(a.id)}">${ICON.edit}Modifica</button>
      <button class="danger" data-act="delete" data-id="${esc(a.id)}">${ICON.trash}<span>Elimina</span></button>
    </div>`;
  openLayer('sheet');
}

/* ---------- Cosa ascolto adesso? ---------- */
let lastRandom = null;
// Pesca tra gli album "Da ascoltare" visibili (se c'è un filtro, solo tra quelli), mai lo stesso di prima
function pickRandom() {
  const pool = visibleIds.length > 1 ? visibleIds.filter((id) => id !== lastRandom) : visibleIds;
  if (!pool.length) return;
  lastRandom = pool[Math.floor(Math.random() * pool.length)];
  openDetail(lastRandom, true);
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
      <div class="meta"><div class="title">${esc(r.title)}</div><div class="sub">${esc(subLine(r) + (r.source === 'link' ? ' · dal link' : ''))}</div></div>
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
    if (linkResult) {
      const same = (r) => tokens(r.title).join(" ") === tokens(linkResult.title).join(" ") && tokens(r.artist).join(" ") === tokens(linkResult.artist).join(" ");
      results = [linkResult, ...results.filter((r) => !same(r))];
    }
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

/* ---------- Aggiunta a mano e modifica ---------- */
// mode: 'add' (nuovo album) o 'edit' (album esistente, id); cover: copertina scelta nel modulo
const form = { mode: 'add', id: null, cover: '' };

function renderFormCover() {
  const f = $('#manual-form').elements;
  $('#form-cover').innerHTML = coverHtml({ title: f.title.value || '?', cover: form.cover });
  $('#form-cover').dataset.title = f.title.value || '?';
  $('#remove-cover').hidden = !form.cover;
}

function openForm(mode, album) {
  const f = $('#manual-form');
  f.reset();
  form.mode = mode;
  form.id = album?.id || null;
  form.cover = album?.cover || '';
  if (album) {
    f.elements.title.value = album.title || '';
    f.elements.artist.value = album.artist || '';
    f.elements.year.value = album.year || '';
  } else {
    f.elements.title.value = $('#q').value.trim(); // da "Non lo trovi?": parte da ciò che hai cercato
  }
  $('#form-title').textContent = mode === 'edit' ? 'Modifica album' : 'Aggiungi a mano';
  $('#form-submit').textContent = mode === 'edit' ? 'Salva' : 'Aggiungi';
  renderFormCover();
  openLayer('manual');
  if (mode === 'add') setTimeout(() => f.elements.title.focus(), 60);
}

function submitForm(e) {
  e.preventDefault();
  const f = e.target.elements;
  const data = {
    title: f.title.value.trim(),
    artist: f.artist.value.trim(),
    year: f.year.value.trim(),
    cover: form.cover,
  };
  if (form.mode === 'edit') {
    const a = albums.find((x) => x.id === form.id);
    if (a) { Object.assign(a, data); delete a.coverAlt; }
    saveAlbums();
    closeLayer(); render();
    toast('Album aggiornato');
    return;
  }
  const now = Date.now();
  albums.push({ id: `manual:${now}`, source: 'manual', sourceId: String(now), ...data, addedAt: now, listenedAt: null });
  saveAlbums();
  while (stack.length) closeLayer();
  tab = 'todo'; render();
  toast('Album aggiunto');
}

/* ---------- Scelta della copertina ---------- */
let coverSeq = 0;
let coverChoices = [];

function openCoverPicker() {
  const f = $('#manual-form').elements;
  $('#cq').value = `${f.title.value} ${f.artist.value}`.trim();
  openLayer('covers');
  searchCovers();
}

// Cerca su tutte le fonti e mostra solo le copertine, una per immagine
async function searchCovers() {
  const q = $('#cq').value.trim();
  const status = $('#covers-status');
  const grid = $('#cover-grid');
  const seq = ++coverSeq;
  if (q.length < 2) {
    grid.innerHTML = '';
    status.textContent = 'Scrivi titolo e artista per cercare la copertina.';
    return;
  }
  status.innerHTML = '<span class="spinner"></span>Cerco le copertine…';
  grid.innerHTML = '';
  const lists = ENGINES.map(() => []);
  let pending = ENGINES.length;
  const update = () => {
    if (seq !== coverSeq) return;
    const seen = new Set();
    coverChoices = rankResults(lists, q)
      .map((r) => ({ ...r, cover: r.cover || r.coverAlt }))
      .filter((r) => r.cover && !seen.has(r.cover) && seen.add(r.cover));
    grid.innerHTML = coverChoices.map((r, i) => `
      <button class="cover-tile" data-act="choose-cover" data-i="${i}" data-title="${esc(r.title)}">
        <div class="cover"><img loading="lazy" src="${esc(r.cover)}" alt=""></div>
        <span class="tile-title">${esc(r.title)}</span>
        <span class="tile-sub">${esc([r.artist, r.year].filter(Boolean).join(' · '))}</span>
      </button>`).join('');
    status.innerHTML = pending
      ? '<span class="spinner"></span>Cerco le copertine…'
      : coverChoices.length ? 'Tocca la copertina che vuoi usare.' : 'Nessuna copertina trovata: prova a cambiare la ricerca.';
  };
  await Promise.all(ENGINES.map(async (engine, i) => {
    try { lists[i] = await engine(q); } catch {}
    pending--;
    update();
  }));
}

function chooseCover(i) {
  const r = coverChoices[i];
  if (!r) return;
  form.cover = r.cover;
  // Completa i campi rimasti vuoti con i dati dell'album scelto
  const f = $('#manual-form').elements;
  if (!f.title.value.trim()) f.title.value = r.title || '';
  if (!f.artist.value.trim()) f.artist.value = r.artist || '';
  if (!f.year.value.trim() && /^\d{4}$/.test(r.year || '')) f.year.value = r.year;
  closeLayer();
  renderFormCover();
}

/* ---------- Backup su file ---------- */
const MONTH = 30 * 24 * 60 * 60 * 1000;

function backupFileName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `ascolti-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

// how: 'documents' (cartella Documenti/Ascolti) o 'share' (menu Condividi). Nel browser scarica il file.
async function saveBackup(how) {
  const status = $('#backup-status');
  const text = JSON.stringify({ app: 'ascolti', format: 1, exportedAt: new Date().toISOString(), albums }, null, 1);
  const name = backupFileName();
  const { Filesystem, Share } = Plugins;
  try {
    if (!Filesystem) {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      status.textContent = 'Backup scaricato.';
    } else if (how === 'share') {
      const { uri } = await Filesystem.writeFile({ path: `backup/${name}`, data: text, directory: 'CACHE', encoding: 'utf8', recursive: true });
      try {
        await Share.share({ title: 'Backup di Ascolti', files: [uri], dialogTitle: 'Dove vuoi salvare il backup?' });
      } catch (e) {
        if (/cancel/i.test(String(e?.message || e))) { status.textContent = ''; return; } // menu chiuso senza scegliere
        throw e;
      }
      status.textContent = 'Backup condiviso.';
    } else {
      // Fino ad Android 10 scrivere in Documenti richiede il permesso della memoria
      try {
        const perm = await Filesystem.checkPermissions();
        if (perm.publicStorage !== 'granted' && (await Filesystem.requestPermissions()).publicStorage !== 'granted') {
          status.textContent = 'Senza il permesso della memoria non posso salvare in Documenti: usa «Condividi…».';
          return;
        }
      } catch {}
      await Filesystem.writeFile({ path: `Ascolti/${name}`, data: text, directory: 'DOCUMENTS', encoding: 'utf8', recursive: true });
      status.textContent = `Salvato in Documenti/Ascolti/${name}`;
    }
    settings.lastBackup = Date.now();
    saveSettings();
    renderBackupInfo();
  } catch (e) {
    status.textContent = how === 'share'
      ? `Non riesco a condividere il backup (${e?.message || e}).`
      : 'Non riesco a scrivere in Documenti: usa «Condividi…» e scegli dove salvarlo.';
  }
}

// Accetta i backup di questa versione ({ albums: [...] }) e quelli vecchi (solo la lista)
function restoreFromText(text) {
  let data;
  try { data = JSON.parse(text); } catch { toast('Il file non è un backup di Ascolti'); return; }
  const list = Array.isArray(data) ? data : Array.isArray(data?.albums) ? data.albums : null;
  if (!list) { toast('Il file non è un backup di Ascolti'); return; }
  const ids = new Set(albums.map((a) => a.id));
  const valid = list.filter((a) => a && typeof a.id === 'string' && typeof a.title === 'string');
  const fresh = valid.filter((a) => !ids.has(a.id));
  albums.push(...fresh);
  saveAlbums(); render(); renderBackupBanner();
  const skipped = valid.length - fresh.length;
  const restored = fresh.length === 1 ? 'Ripristinato 1 album' : `Ripristinati ${fresh.length} album`;
  toast(restored + (skipped ? ` (${skipped} già ${skipped === 1 ? 'presente' : 'presenti'})` : ''));
}

$('#restore-file').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  e.target.value = ''; // così si può scegliere di nuovo lo stesso file
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => restoreFromText(String(reader.result || ''));
  reader.onerror = () => toast('Non riesco a leggere il file');
  reader.readAsText(file);
});

function renderBackupInfo() {
  $('#backup-info').textContent = (settings.lastBackup
    ? `Ultimo backup: ${fmtDate(settings.lastBackup)}.`
    : 'Non hai ancora fatto un backup.') + ' La lista sta solo su questo telefono: tienine una copia.';
  renderBackupBanner();
}

// Promemoria in cima alla lista se l'ultimo backup (o il primo album, se non l'hai mai fatto) ha più di un mese
function renderBackupBanner() {
  const first = albums.reduce((m, a) => Math.min(m, a.addedAt || Infinity), Infinity);
  const since = settings.lastBackup || first;
  const due = albums.length > 0 && Number.isFinite(since) && Date.now() - since > MONTH
    && Date.now() > (settings.backupSnooze || 0);
  $('#backup-banner').hidden = !due;
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

// App di musica preferita: le voci vengono dallo stesso elenco usato per "Cerca su …"
$('#music-app').innerHTML = '<option value="">Nessuna</option>'
  + Object.entries(MUSIC_APPS).map(([k, app]) => `<option value="${k}">${esc(app.name)}</option>`).join('');
$('#music-app').addEventListener('change', (e) => {
  settings.musicApp = e.target.value; saveSettings();
  toast(e.target.value ? `Cercherai su ${MUSIC_APPS[e.target.value].name}` : 'Nessuna app di musica');
});

$('#view-switch').addEventListener('change', (e) => {
  settings.view = e.target.checked ? 'grid' : 'list';
  saveSettings(); applyView();
});

/* ---------- "Condividi → Ascolti" da altre app ---------- */
// Album letto dal link condiviso: compare in cima ai risultati della ricerca
let linkResult = null;

const decodeHtml = (s) => {
  const t = document.createElement('textarea');
  t.innerHTML = String(s || '');
  return t.value;
};

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

// Da una pagina di Spotify, Apple Music, Deezer, Bandcamp (o un sito qualsiasi) ricava titolo, artista, anno e copertina
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
    // Album: "Kid A - Album by Radiohead | Spotify" + "Radiohead · album · 2000 · 11 songs"
    // Brano: "Lost in the Fire" + "Gesaffelstein, The Weeknd · Hyperion · Song · 2019" → si prende l'album
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

// Testo condiviso: se contiene un link prova a leggerlo, altrimenti lo usa come ricerca
// I link condivisi da Spotify hanno "?si=…": da telefono rimandano all'app invece che alla pagina.
// "nd=1" (no deeplink) è il parametro che Spotify stesso usa per restare sulla pagina web.
const BROWSER_UA = 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

function cleanSharedUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.hostname.endsWith('spotify.com')) return `${u.origin}${u.pathname}?nd=1`;
    return u.href;
  } catch { return raw; }
}

// Identità stabile di un link: senza "?si=…", "intl-it" e simili, così lo stesso album copiato due volte è riconosciuto
function canonicalLink(raw) {
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/^\/intl-[a-z]{2}(-[a-z]{2})?\//i, '/').replace(/\/$/, '');
    return `${u.hostname.replace(/^www\./, '')}${path}`;
  } catch { return raw; }
}

// Legge un link e ne ricava l'album ({ album }) o almeno un testo da cercare ({ query }); null se non c'è niente
async function readLink(url) {
  let parsed = null;
  try {
    // Come un normale Chrome per Android: i siti musicali rispondono con la pagina completa di metadati
    // (alla WebView dell'app, Spotify risponde con la pagina che apre la sua app)
    const r = await fetch(url, { headers: { Accept: 'text/html', 'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8', 'User-Agent': BROWSER_UA } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    // Il sito si riconosce dal link, non dall'indirizzo finale dopo eventuali reindirizzamenti
    parsed = parseAlbumPage(url, await r.text());
  } catch {}
  if (parsed?.album) return parsed;
  const query = parsed?.query || queryFromUrl(url);
  return query ? { query } : null;
}

const firstUrl = (text) => {
  // /i: alcune tastiere mettono la maiuscola ("Https://…")
  const found = (String(text || '').match(/https?:\/\/[^\s<>"']+/i) || [])[0];
  return found ? cleanSharedUrl(found) : '';
};

// Mostra la ricerca: album del link (se riconosciuto) in cima, poi i risultati per titolo e artista
function showLinkSearch(read, url) {
  linkResult = read?.album || null;
  const query = linkResult ? `${linkResult.title} ${linkResult.artist}` : read?.query || '';
  if (query) {
    $('#q').value = query.trim(); syncClear(); renderPasteButton();
    runSearch();
  } else {
    $('#status').textContent = url
      ? 'Non riesco a riconoscere l’album da questo link: scrivi qui sopra titolo o artista.'
      : '';
    setTimeout(() => $('#q').focus(), 60);
  }
}

// "Condividi → Ascolti" da un'altra app: apre la ricerca con l'album del link in cima
async function handleShared(text) {
  if (!text) return;
  const url = firstUrl(text);
  while (stack.length) closeLayer();
  exitSelection();
  openLayer('search');
  linkResult = null;
  results = []; renderResults(); renderPasteButton();
  if (!url) {
    $('#q').value = String(text).trim().slice(0, 120); syncClear();
    runSearch();
    return;
  }
  $('#q').value = ''; syncClear();
  $('#status').innerHTML = '<span class="spinner"></span>Leggo il link…';
  showLinkSearch(await readLink(url), url);
}

/* ---------- Aggiungi dal link copiato (appunti) ---------- */
async function readClipboard() {
  try {
    if (Plugins.Clipboard) return (await Plugins.Clipboard.read()).value || '';
    return await navigator.clipboard.readText();
  } catch { return ''; }
}

const sameAlbum = (a, b) => tokens(a.title).join(' ') === tokens(b.title).join(' ')
  && tokens(a.artist).join(' ') === tokens(b.artist).join(' ');

// Legge il link negli appunti e, se riconosce l'album, lo aggiunge subito a "Da ascoltare" (con Annulla).
// Se il link non basta, apre la ricerca già compilata.
async function pasteLink() {
  const status = $('#status');
  const url = firstUrl(await readClipboard());
  if (!url) {
    toast('Negli appunti non c’è un link: copialo e riprova');
    return;
  }
  status.innerHTML = '<span class="spinner"></span>Leggo il link copiato…';
  $('#paste-link').disabled = true;
  const read = await readLink(url);
  $('#paste-link').disabled = false;
  status.textContent = '';
  const album = read?.album;
  if (!album) { showLinkSearch(read, url); return; }

  const id = `link:${album.sourceId}`;
  const existing = albums.find((a) => a.id === id || sameAlbum(a, album));
  if (existing) {
    toast(existing.listenedAt ? `«${existing.title}» è già tra gli ascoltati` : `«${existing.title}» è già in lista`);
    return;
  }
  const a = { id, ...album, addedAt: Date.now(), listenedAt: null };
  albums.push(a);
  saveAlbums();
  while (stack.length) closeLayer();
  tab = 'todo'; render();
  toast(`Aggiunto: ${a.title}${a.artist ? ` · ${a.artist}` : ''}`, () => {
    albums = albums.filter((x) => x.id !== id); saveAlbums(); render();
  });
}

// Il pulsante compare solo a ricerca vuota, per non mescolarsi ai risultati
function renderPasteButton() {
  $('#paste-row').hidden = !!$('#q').value.trim();
}

const ShareReceiver = Plugins.ShareReceiver || null;
async function consumeShared() {
  if (!ShareReceiver) return;
  try {
    const { text } = await ShareReceiver.consume();
    if (text) handleShared(text);
  } catch {}
}
if (ShareReceiver) ShareReceiver.addListener('shared', ({ text }) => handleShared(text));

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
      openLayer('search'); renderResults(); syncClear(); renderPasteButton();
      setTimeout(() => $('#q').focus(), 60);
      break;
    case 'add': addResult(+el.dataset.i, el); break;
    case 'clear-search': // "x": svuota testo e risultati, la tastiera resta aperta per una nuova ricerca
      clearTimeout(searchTimer); searchSeq++;
      $('#q').value = ''; syncClear(); linkResult = null; renderPasteButton();
      results = []; renderResults(); $('#status').textContent = '';
      $('#q').focus();
      break;
    case 'open-manual': openForm('add'); break;
    case 'edit': { // dalla scheda dell'album: si chiude la scheda e si apre il modulo
      const a = albums.find((x) => x.id === id);
      closeLayer();
      if (a) openForm('edit', a);
      break;
    }
    case 'pick-cover': openCoverPicker(); break;
    case 'random': pickRandom(); break;
    case 'paste-link': pasteLink(); break;
    case 'copy-album': copyAlbum(id); break;
    case 'random-again': closeLayer(); pickRandom(); break;
    case 'choose-cover': chooseCover(+el.dataset.i); break;
    case 'remove-cover': form.cover = ''; renderFormCover(); break;
    case 'clear-filter':
      filterText = ''; $('#filter').value = ''; $('#filter-clear').hidden = true; render();
      break;
    case 'backup-docs': saveBackup('documents'); break;
    case 'backup-share': saveBackup('share'); break;
    case 'backup-later': // il promemoria torna tra una settimana
      settings.backupSnooze = Date.now() + 7 * 24 * 60 * 60 * 1000; saveSettings(); renderBackupBanner();
      break;
    case 'backup-open':
      $('[data-act="open-settings"]').click();
      setTimeout(() => $('#backup-section').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      break;
    case 'open-settings':
      $('#backup-status').textContent = '';
      renderBackupInfo();
      $('#music-app').value = settings.musicApp || '';
      $('#app-version').textContent = appVersion ? `Versione installata: ${appVersion}` : 'Versione non disponibile nel browser.';
      $('#upd-status').textContent = '';
      openLayer('settings');
      break;
    case 'check-update': manualUpdateCheck(); break;
    case 'upd-download': downloadUpdate(); break;
    case 'upd-install': installUpdate(); break;
  }
});

// Filtro della lista: si aggiorna mentre scrivi
$('#filter').addEventListener('input', (e) => {
  filterText = e.target.value;
  $('#filter-clear').hidden = !filterText;
  render();
});
$('#filter').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
$('#sort').addEventListener('change', (e) => {
  settings.sort = e.target.value; saveSettings(); render(); window.scrollTo(0, 0);
});

// Ricerca della copertina: stessa logica della ricerca degli album
let coverTimer;
$('#cq').addEventListener('input', () => { clearTimeout(coverTimer); coverTimer = setTimeout(searchCovers, 450); });
$('#cq').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { clearTimeout(coverTimer); searchCovers(); e.target.blur(); }
});
// Il titolo scritto aggiorna l'iniziale della copertina segnaposto
$('#manual-form').elements.title.addEventListener('input', () => { if (!form.cover) renderFormCover(); });

const syncClear = () => { $('#q-clear').hidden = !$('#q').value; };
$('#q').addEventListener('input', () => {
  syncClear(); renderPasteButton();
  linkResult = null;
  clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 450);
});
$('#q').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { clearTimeout(searchTimer); runSearch(); e.target.blur(); }
});

$('#manual-form').addEventListener('submit', submitForm);

// Tasto indietro di Android: chiude prima gli overlay
if (Plugins.App) {
  Plugins.App.addListener('backButton', () => {
    if (!closeLayer() && !exitSelection()) Plugins.App.minimizeApp();
  });
  // Anche quando l'app torna in primo piano (sempre con il limite orario)
  Plugins.App.addListener('resume', () => {
    resumePendingInstall().catch(() => {});
    consumeShared();
    if (upd.phase !== 'downloading') checkUpdate().catch(() => {});
  });
}

load().then(async () => {
  applyTheme();
  applyView();
  render();
  renderBackupBanner();
  consumeShared();
  if (Plugins.App) {
    try { appVersion = (await Plugins.App.getInfo()).version; } catch {}
    checkUpdate().catch(() => {});
  }
});
