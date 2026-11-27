'use strict';
// Le funzioni pure (ricerca, lettura dei link, versioni) sono in lib.js, caricato prima di questo file.

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
const K_SEARCHES = 'searches.v1';

let albums = [];
let settings = {
  theme: 'dark', fontScale: 1, view: 'list', cols: 2, sortTodo: 'added', sortDone: 'added',
  lastBackup: 0, backupSnooze: 0, musicApp: '',
};
let recentSearches = [];
let tab = 'todo';

async function load() {
  try { albums = JSON.parse((await store.get(K_ALBUMS)) || '[]'); } catch { albums = []; }
  try { Object.assign(settings, JSON.parse((await store.get(K_SETTINGS)) || '{}')); } catch {}
  try { recentSearches = JSON.parse((await store.get(K_SEARCHES)) || '[]').filter((s) => typeof s === 'string'); } catch {}
  let changed = false;
  // Le versioni precedenti salvavano chiavi Spotify e fonte di ricerca: non servono più, si cancellano
  if ('spotifyId' in settings || 'spotifySecret' in settings || 'source' in settings) {
    delete settings.spotifyId; delete settings.spotifySecret; delete settings.source;
    changed = true;
  }
  // Fino alla 1.8 c'era un solo ordinamento per le due liste: ora ognuna ha il suo
  if ('sort' in settings) {
    settings.sortTodo = settings.sortDone = settings.sort;
    delete settings.sort;
    changed = true;
  }
  if (changed) await saveSettings();
  let fixed = false;
  for (const a of albums) {
    // Versione di prova: numero di brani e minuti scritti a mano senza elenco dei brani. Ora contano solo
    // gli elenchi (a.tracks): i numeri si ricercano, il genere scritto a mano resta tale.
    if (a.infoManual) {
      delete a.infoManual;
      if (a.genre) a.genreManual = true;
      if (!a.tracks) { delete a.trackCount; delete a.durationMs; delete a.infoTried; }
      fixed = true;
    }
    // Generi trovati in automatico: riportati alle famiglie attuali
    if (a.genre && !a.genreManual && normGenre(a.genre) !== a.genre) { a.genre = normGenre(a.genre); fixed = true; }
  }
  if (fixed) await saveAlbums();
}

// Un salvataggio non riuscito non deve passare inosservato (al massimo un avviso ogni 10 secondi)
let saveWarnedAt = 0;
function saveFailed(e) {
  console.error('Salvataggio non riuscito', e);
  if (Date.now() - saveWarnedAt < 10000) return;
  saveWarnedAt = Date.now();
  toast('Non riesco a salvare le modifiche: fai un backup');
}
const saveAlbums = () => Promise.resolve().then(() => store.set(K_ALBUMS, JSON.stringify(albums))).catch(saveFailed);
const saveSettings = () => Promise.resolve().then(() => store.set(K_SETTINGS, JSON.stringify(settings))).catch(saveFailed);

/* ---------- Utilità ---------- */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TYPE_NAME = { single: 'Singolo', ep: 'EP', compilation: 'Raccolta', live: 'Live' };
const SOURCE_NAME = { itunes: 'iTunes', deezer: 'Deezer', musicbrainz: 'MusicBrainz', link: 'dal link' };
const DAY = 24 * 60 * 60 * 1000;

const ICON = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
  dice: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1.1" fill="currentColor"/><circle cx="15" cy="15" r="1.1" fill="currentColor"/><circle cx="15" cy="9" r="1.1" fill="currentColor"/><circle cx="9" cy="15" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 19.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 6.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M5 5h14v10l-4 4H5z"/><path d="M15 19v-4h4M8.5 9.5h7M8.5 12.5h4"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.8"/></svg>',
  tracks: '<svg viewBox="0 0 24 24"><path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r=".9" fill="currentColor"/><circle cx="4.8" cy="12" r=".9" fill="currentColor"/><circle cx="4.8" cy="17.5" r=".9" fill="currentColor"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>',
};

/* ---------- Copertine ---------- */
// Prima la copia salvata sul telefono (vedi "Copertine salvate"), poi quella in rete, poi quella di riserva:
// se un'immagine non si carica si passa alla successiva (data-alts), alla fine resta l'iniziale del titolo.
function coverSources(a) {
  const list = [localCover(a), a.cover, a.coverAlt].filter(Boolean);
  return [...new Set(list)];
}
function coverHtml(a) {
  const initial = esc((a.title || '?').trim().charAt(0).toUpperCase());
  const [src, ...alts] = coverSources(a);
  const alt = alts.length ? ` data-alts="${esc(alts.join(' '))}"` : '';
  return `<div class="cover">${src ? `<img loading="lazy" src="${esc(src)}"${alt} alt="">` : initial}</div>`;
}
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName !== 'IMG') return;
  const alts = (img.dataset.alts || '').split(' ').filter(Boolean);
  if (alts.length) {
    img.src = alts.shift();
    if (alts.length) img.dataset.alts = alts.join(' '); else delete img.dataset.alts;
    return;
  }
  // Nella scelta della copertina un'immagine che non si carica non è una scelta valida: via la casella
  const tile = img.closest('.cover-tile');
  if (tile) { tile.remove(); return; }
  if (img.parentElement?.classList.contains('cover')) {
    const box = img.parentElement;
    img.remove();
    box.textContent = (box.closest('[data-title]')?.dataset.title || '?').charAt(0).toUpperCase();
  }
}, true);

function subLine(a) {
  return [a.artist, a.year, TYPE_NAME[a.type]].filter(Boolean).join(' · ');
}
const fmtDate = (ts) => new Date(ts).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
const alreadyText = (a) => (a.listenedAt ? `«${a.title}» è già tra gli ascoltati` : `«${a.title}» è già in lista`);
// L'album già in lista che corrisponde a questo (stesso id o stesso titolo e artista, da qualsiasi fonte)
const findExisting = (x, id = x.id) => albums.find((a) => a.id === id || sameAlbum(a, x));

/* ---------- Filtro e ordinamento ---------- */
let filterText = '';
let favOnly = false; // negli Ascoltati: solo i preferiti
const collator = new Intl.Collator('it', { sensitivity: 'base', numeric: true });
// Per ordinare per artista si ignora l'articolo iniziale: "The Beatles" sta sotto la B
const artistKey = (a) => String(a.artist || '').replace(/^(the|il|lo|la|i|gli|le)\s+/i, '');
const yearOf = (a, missing) => (/^\d{4}$/.test(a.year) ? +a.year : missing);
// Ogni lista ha il suo ordinamento
const sortKey = () => (tab === 'done' ? 'sortDone' : 'sortTodo');

function sortItems(items) {
  const byArtist = (a, b) => collator.compare(artistKey(a), artistKey(b)) || collator.compare(a.title, b.title);
  const sorts = {
    added: (a, b) => (tab === 'done' ? b.listenedAt - a.listenedAt : b.addedAt - a.addedAt),
    artist: byArtist,
    title: (a, b) => collator.compare(a.title, b.title) || byArtist(a, b),
    'year-asc': (a, b) => yearOf(a, 9999) - yearOf(b, 9999) || byArtist(a, b),   // senza anno: in fondo
    'year-desc': (a, b) => yearOf(b, -1) - yearOf(a, -1) || byArtist(a, b),
  };
  return items.sort(sorts[settings[sortKey()]] || sorts.added);
}

// Ogni parola scritta nel filtro deve comparire (anche solo l'inizio) in titolo, artista, anno o nota
function matchesFilter(a) {
  const words = tokens(filterText);
  if (!words.length) return true;
  const hay = tokens(`${a.title} ${a.artist} ${a.year || ''} ${a.note || ''}`);
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
  const favs = tab === 'done' && favOnly;
  const items = sortItems(all.filter((a) => (!favs || a.fav) && matchesFilter(a)));
  $('#list-tools').hidden = all.length === 0;
  const dice = $('[data-act="random"]');
  dice.hidden = items.length === 0;
  dice.setAttribute('aria-label', tab === 'done' ? 'Cosa riascolto?' : 'Cosa ascolto adesso?');
  dice.title = dice.getAttribute('aria-label');
  const favBtn = $('[data-act="fav-filter"]');
  favBtn.hidden = tab !== 'done';
  favBtn.classList.toggle('on', favOnly);
  favBtn.setAttribute('aria-pressed', favOnly);
  $('#sort-label').textContent = (SORT_OPTIONS.find((o) => o.key === settings[sortKey()]) || SORT_OPTIONS[0]).short;
  visibleIds = items.map((a) => a.id);
  $('#list').innerHTML = items.map((a) => {
    const picked = selected.has(a.id);
    // In selezione il tocco sceglie la riga; altrimenti apre la scheda e il cerchio spunta l'ascolto
    const action = selecting
      ? `<span class="check pick ${picked ? 'on' : ''}" aria-hidden="true"><i>${ICON.check}</i></span>`
      : `<button class="check ${a.listenedAt ? 'on' : ''}" data-act="toggle" data-id="${esc(a.id)}"
        aria-label="${a.listenedAt ? 'Segna da ascoltare' : 'Segna come ascoltato'}"><i>${ICON.check}</i></button>`;
    const heart = tab === 'done' && a.fav ? `<i class="fav-mark" aria-label="Preferito">${ICON.heart}</i>` : '';
    return `
    <li class="row ${picked ? 'picked' : ''} ${leaving.has(a.id) ? 'leaving' : ''}" data-act="${selecting ? 'select' : 'detail'}" data-id="${esc(a.id)}" data-title="${esc(a.title)}"
      data-right="${tab === 'done' ? 'Da ascoltare' : 'Ascoltato'}"
      ${selecting ? `role="checkbox" aria-checked="${picked}"` : ''}>
      ${coverHtml(a)}
      <div class="meta">
        <div class="title">${esc(a.title)}</div>
        <div class="sub">${heart}${esc(tab === 'done' ? `${a.artist} · ${fmtDate(a.listenedAt)}` : subLine(a))}</div>
      </div>
      ${action}
    </li>`;
  }).join('');

  $('#select-bar').hidden = !selecting;
  $('#top-bar').hidden = selecting;
  $('.fab').hidden = selecting;
  // Il numero e la parola separati: se lo spazio non basta, fitHeader() lascia solo il numero
  $('#select-count').innerHTML = `${selected.size}<span class="word"> ${selected.size === 1 ? 'selezionato' : 'selezionati'}</span>`;
  $('#select-count').setAttribute('aria-label', selected.size === 1 ? '1 selezionato' : `${selected.size} selezionati`);
  $('[data-act="select-delete"]').disabled = selected.size === 0;
  const bulk = $('[data-act="select-listened"]');
  bulk.disabled = selected.size === 0;
  bulk.innerHTML = tab === 'done' ? ICON.undo : ICON.check;
  bulk.setAttribute('aria-label', tab === 'done' ? 'Rimetti da ascoltare' : 'Segna come ascoltati');
  bulk.title = bulk.getAttribute('aria-label');
  $('[data-act="select-all"]').textContent = selected.size === visibleIds.length && visibleIds.length ? 'Nessuno' : 'Tutti';

  fitHeader();

  const empty = $('#empty');
  empty.hidden = items.length > 0;
  empty.textContent = all.length && filterText.trim()
    ? `Nessun album corrisponde a\n“${filterText.trim()}”.`
    : favs && all.length
    ? 'Nessun preferito.\nTocca il cuore nella scheda di un album ascoltato.'
    : tab === 'todo'
    ? (albums.length ? 'Hai ascoltato tutto.\nAggiungi qualcosa di nuovo.' : 'Nessun album in lista.\nTocca + per aggiungerne uno.')
    : 'Gli album che spunti finiranno qui.';
}

// Con il testo grande l'intestazione deve stare comunque in una riga: i titoli delle schede e il conteggio della
// selezione si rimpiccioliscono quanto basta (--fit), e "Ordina" perde l'etichetta se il filtro resta troppo stretto.
// Si misura invece di calcolare, perché Android moltiplica anche per la dimensione dei caratteri di sistema.
function fitWidth(el, min = 0.5) {
  el.style.removeProperty('--fit');
  if (!el.offsetParent) return;
  // Spazi e numeretti non si rimpiccioliscono col testo: si ripete finché ci sta (pochi passi bastano)
  let fit = 1;
  for (let i = 0; i < 4 && el.scrollWidth > el.clientWidth + 1 && fit > min; i++) {
    fit = Math.max(min, fit * (el.clientWidth / el.scrollWidth) * 0.97);
    el.style.setProperty('--fit', fit.toFixed(3));
  }
}
function fitHeader() {
  fitWidth($('#tabs'));
  const count = $('#select-count');
  count.classList.remove('short');
  fitWidth(count, 0.8); // la parola si rimpicciolisce poco: piuttosto resta solo il numero
  if (count.scrollWidth > count.clientWidth + 1) { count.classList.add('short'); fitWidth(count); }
  const tools = $('#list-tools');
  tools.classList.remove('compact');
  if (!tools.hidden && $('.filter-field').clientWidth < 120) tools.classList.add('compact');
}
window.addEventListener('resize', fitHeader);
document.fonts?.ready.then(fitHeader);

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
// In "Da ascoltare" segna come ascoltati, in "Ascoltati" li rimette da ascoltare
function markSelected() {
  if (!selected.size) return;
  const listen = tab === 'todo';
  const changed = albums.filter((a) => selected.has(a.id));
  const prev = changed.map((a) => a.listenedAt);
  const now = Date.now();
  changed.forEach((a) => { a.listenedAt = listen ? now : null; });
  saveAlbums();
  exitSelection();
  const n = changed.length;
  toast(listen
    ? (n === 1 ? '1 album segnato come ascoltato' : `${n} album segnati come ascoltati`)
    : (n === 1 ? '1 album rimesso in lista' : `${n} album rimessi in lista`), () => {
    changed.forEach((a, i) => { a.listenedAt = prev[i]; });
    saveAlbums(); render();
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
  toast('Album eliminato', () => { albums.splice(Math.min(idx, albums.length), 0, removed); saveAlbums(); render(); });
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
    if (!r || r.classList.contains('leaving')) return;
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

// Album che stanno uscendo dalla lista dopo la spunta: un secondo tocco in quel momento non conta
const leaving = new Set();

function toggleListened(id, rowEl) {
  const a = albums.find((x) => x.id === id);
  if (!a || leaving.has(id)) return;
  const prev = a.listenedAt;
  const apply = () => {
    leaving.delete(id);
    a.listenedAt = prev ? null : Date.now();
    saveAlbums(); render();
    toast(prev ? 'Rimesso in lista' : 'Segnato come ascoltato', () => {
      a.listenedAt = prev; saveAlbums(); render();
    });
  };
  if (rowEl) {
    leaving.add(id);
    rowEl.querySelector('.check').classList.toggle('on', !prev);
    setTimeout(() => rowEl.classList.add('leaving'), 180);
    setTimeout(apply, 480);
  } else apply();
}

/* ---------- Overlay (ricerca, impostazioni, dettaglio) ---------- */
const stack = [];
// Ogni schermata o pannello si apre in cima. La lista sotto resta dov'era: la posizione si ricorda quando si
// apre il primo livello e si rimette quando si chiude l'ultimo (anche se nel frattempo la tastiera o un campo
// messo in vista l'hanno spostata).
let listScrollY = 0;
// Sfondo scuro di ogni livello che ne ha uno (pannelli che arrivano dal basso)
const backdropOf = (id) => ({ sheet: '#sheet-backdrop', dial: '#dial-backdrop', manual: $('#manual').classList.contains('as-sheet') ? '#panel-backdrop' : '' }[id] || '');
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// opts.still: il pannello compare già al suo posto, senza salire dal basso
function openLayer(id, opts = {}) {
  if (!stack.length) listScrollY = window.scrollY;
  const el = $('#' + id);
  el.classList.toggle('still', !!opts.still);
  if (id === 'sheet') { el.style.height = ''; delete el.dataset.tool; } // altezza: la fissa openDetail; menu: openPicker
  el.hidden = false;
  el.scrollTop = 0;
  if (backdropOf(id)) {
    $(backdropOf(id)).classList.toggle('still', !!opts.still); // passando da un pannello all'altro lo sfondo resta com'è
    $(backdropOf(id)).hidden = false;
  }
  stack.push(id);
  document.body.classList.add('locked');
}

// Chiusura animata: il livello sparisce subito (così il codice può riaprirlo o aprirne un altro al suo posto)
// e al suo posto resta per un attimo una copia che esce: i pannelli scendono verso il basso, da dove sono
// arrivati, le schermate intere svaniscono scendendo appena. La copia non ha id e non si può toccare.
function ghostOut(el, animation, scrollTop = 0) {
  if (reducedMotion() || el.hidden) return null;
  const g = el.cloneNode(true);
  g.removeAttribute('id');
  g.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  g.classList.add('layer-ghost');
  g.setAttribute('aria-hidden', 'true');
  document.body.append(g);
  g.scrollTop = scrollTop;
  if (animation) {
    g.style.animation = animation;
    g.addEventListener('animationend', () => g.remove(), { once: true });
  }
  setTimeout(() => g.remove(), 900);
  return g;
}

// opts.ghost = false: chiude senza animazione (quando l'animazione la fa chi chiama)
function closeLayer(opts = {}) {
  const id = stack.pop();
  if (!id) return false;
  const el = $('#' + id);
  const bd = backdropOf(id);
  if (opts.ghost !== false) {
    const panel = el.classList.contains('sheet') || el.classList.contains('as-sheet');
    ghostOut(el, panel ? 'down .24s cubic-bezier(.4,0,.8,.4) forwards' : 'sink .2s ease-in forwards', el.scrollTop);
    if (bd) ghostOut($(bd), 'fade-out .24s ease-in forwards');
  }
  el.hidden = true;
  if (bd) $(bd).hidden = true;
  if (id === 'manual') el.classList.remove('as-sheet');
  if (!stack.length) document.body.classList.remove('locked');
  if (id === 'search' || id === 'manual') render();
  if (stack[stack.length - 1] === 'stats') renderStats();
  if (!stack.length) {
    const y = listScrollY;
    window.scrollTo(0, y);
    requestAnimationFrame(() => { if (!stack.length && listScrollY === y) window.scrollTo(0, y); }); // dopo la chiusura della tastiera
  }
  return true;
}

/* ---------- App di musica preferita e copia ---------- */
// Indirizzi di ricerca web: Android li apre nell'app, se è installata, altrimenti nel browser
const MUSIC_APPS = {
  spotify: { name: 'Spotify', color: '#1DB954', url: (q) => `https://open.spotify.com/search/${encodeURIComponent(q)}` },
  apple: { name: 'Apple Music', color: '#FA2D48', url: (q) => `https://music.apple.com/search?term=${encodeURIComponent(q)}` },
  youtube: { name: 'YouTube Music', color: '#FF0033', url: (q) => `https://music.youtube.com/search?q=${encodeURIComponent(q)}` },
  deezer: { name: 'Deezer', color: '#A238FF', url: (q) => `https://www.deezer.com/search/${encodeURIComponent(q)}` },
  tidal: { name: 'Tidal', color: '#8A8F98', url: (q) => `https://listen.tidal.com/search?q=${encodeURIComponent(q)}` },
  amazon: { name: 'Amazon Music', color: '#25D1DA', url: (q) => `https://music.amazon.com/search/${encodeURIComponent(q)}` },
  bandcamp: { name: 'Bandcamp', color: '#1DA0C3', url: (q) => `https://bandcamp.com/search?q=${encodeURIComponent(q)}` },
  soundcloud: { name: 'SoundCloud', color: '#FF5500', url: (q) => `https://soundcloud.com/search?q=${encodeURIComponent(q)}` },
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
// random = aperta dal dado: in più c'è "Pesca un altro"
// opts.still: la scheda compare già al suo posto, senza salire dal basso (ritorno da Modifica)
function openDetail(id, random = false, opts = {}) {
  const a = albums.find((x) => x.id === id);
  if (!a) return;
  tracksOpen = false; // ogni scheda si apre con i brani chiusi
  const meta = [a.year, TYPE_NAME[a.type], a.genre].filter(Boolean).join(' · ');
  const when = a.listenedAt ? `Ascoltato il ${fmtDate(a.listenedAt)}` : `Aggiunto il ${fmtDate(a.addedAt)}`;
  const again = random && visibleIds.length > 1
    ? `<button data-act="random-again">${ICON.dice}Pesca un altro</button>` : '';
  // "Cerca su …" solo se nelle impostazioni hai scelto l'app di musica preferita
  const app = MUSIC_APPS[settings.musicApp];
  const listen = app
    ? `<a href="${esc(app.url(searchText(a)))}" target="_blank" rel="noopener">${ICON.search}Cerca su ${esc(app.name)}</a>` : '';
  // Il cuore c'è solo per gli album ascoltati
  const fav = a.listenedAt
    ? `<button class="fav-btn ${a.fav ? 'on' : ''}" data-act="fav" data-id="${esc(a.id)}" aria-pressed="${!!a.fav}">${ICON.heart}Preferito</button>` : '';
  $('#sheet').innerHTML = `
    ${random ? `<p class="sheet-kicker">${a.listenedAt ? 'Cosa riascolto?' : 'Cosa ascolto adesso?'}</p>` : ''}
    <div class="head" data-title="${esc(a.title)}">
      ${coverHtml(a)}
      <div class="head-text">
        <h2>${esc(a.title)}</h2><div class="by">${esc(a.artist)}</div>
        ${meta ? `<div class="by">${esc(meta)}</div>` : ''}<div class="by">${esc(when)}</div>
      </div>
    </div>
    <div class="quick">
      ${fav}
      <button data-act="copy-album" data-id="${esc(a.id)}" aria-label="Copia artista e titolo">${ICON.copy}Copia</button>
    </div>
    ${a.note ? `<p class="note">${esc(a.note)}</p>` : ''}
    <div class="actions">
      <button data-act="sheet-toggle" data-id="${esc(a.id)}">${a.listenedAt ? ICON.undo + 'Rimetti tra da ascoltare' : ICON.check + 'Segna come ascoltato'}</button>
      ${listen}
      ${again}
      <button data-act="edit" data-id="${esc(a.id)}">${ICON.edit}Modifica</button>
      ${a.note ? '' : `<button data-act="edit-note" data-id="${esc(a.id)}">${ICON.note}Aggiungi una nota</button>`}
      <button class="danger" data-act="delete" data-id="${esc(a.id)}">${ICON.trash}Elimina</button>
    </div>
    <div class="tracks-sec">
      <button class="tracks-toggle" data-act="tracks-toggle" aria-expanded="${tracksOpen}" aria-controls="detail-tracks">
        ${ICON.tracks}<span>Brani</span><span class="tt-sum" id="tracks-sum"><span class="spinner"></span></span>${ICON.chevron}
      </button>
      <div id="detail-tracks" class="tracks-box" ${tracksOpen ? '' : 'hidden'}></div>
    </div>`;
  openLayer('sheet', { still: !!opts.still });
  // L'altezza resta quella con cui si apre: aprendo i brani l'elenco si allunga dentro la scheda (che scorre)
  const sheet = $('#sheet');
  sheet.style.height = `${sheet.offsetHeight}px`;
  loadDetailTracks(a);
}

/* ---------- Brani nella scheda dell'album ---------- */
// Riga "Brani" sotto le azioni, chiusa quando si apre la scheda. Il riepilogo (numero e durata) si vede subito;
// toccandola si apre l'elenco, dentro la scheda: la scheda non cambia altezza e non scorre da sola.
let tracksOpen = false;
let detailSeq = 0;

// Riepilogo dai dati salvati nell'album (anche quelli scritti a mano): "11 · 49 min"
const storedSummary = (a) => [a.trackCount, a.durationMs > 0 ? `${Math.round(a.durationMs / 60000)} min` : ''].filter(Boolean).join(' · ');

function loadDetailTracks(a) {
  const seq = ++detailSeq;
  const sum = $('#tracks-sum');
  const box = $('#detail-tracks');
  const stale = () => seq !== detailSeq || $('#sheet').hidden || !$('#tracks-sum');
  if (storedSummary(a)) sum.textContent = storedSummary(a);
  const noList = (text) => {
    sum.textContent = storedSummary(a) || text;
    $('[data-act="tracks-toggle"]').disabled = true;
    box.hidden = true;
  };
  // Elenco scritto o corretto a mano (anche vuoto): è quello, senza chiedere niente in rete
  if (Array.isArray(a.tracks)) {
    if (a.tracks.length) box.innerHTML = tracksHtml({ tracks: a.tracks, genre: a.genre });
    else noList('nessuno');
    return;
  }
  trackInfo(a, a.id).then((info) => {
    if (stale()) return;
    // Se l'album non aveva ancora durata, genere o anno, li tiene (salvo dati scritti a mano)
    if (a.durationMs == null && info) { applyInfo(a, info); saveAlbums(); render(); }
    if (!info?.tracks?.length) { noList('non trovati'); return; }
    sum.textContent = [info.tracks.length, totalMs(info.tracks) ? `${Math.round(totalMs(info.tracks) / 60000)} min` : ''].filter(Boolean).join(' · ');
    box.innerHTML = tracksHtml({ ...info, genre: a.genre || info.genre });
  }).catch(() => {
    if (stale()) return;
    if (storedSummary(a)) { noList(''); return; }
    sum.textContent = 'non disponibili';
    box.innerHTML = '<p class="status">Non riesco a caricare i brani: controlla la connessione.</p>';
  });
}

function toggleTracks(btn) {
  tracksOpen = btn.getAttribute('aria-expanded') !== 'true';
  btn.setAttribute('aria-expanded', tracksOpen);
  $('#detail-tracks').hidden = !tracksOpen;
}

function toggleFav(id, btn) {
  const a = albums.find((x) => x.id === id);
  if (!a) return;
  a.fav = !a.fav;
  if (!a.fav) delete a.fav;
  btn.classList.toggle('on', !!a.fav);
  btn.setAttribute('aria-pressed', !!a.fav);
  saveAlbums(); render();
}

/* ---------- Cosa ascolto adesso? / Cosa riascolto? ---------- */
let lastRandom = null;
// Pesca tra gli album visibili della lista aperta (se c'è un filtro, solo tra quelli), mai lo stesso di prima
function pickRandom() {
  const pool = visibleIds.length > 1 ? visibleIds.filter((id) => id !== lastRandom) : visibleIds;
  if (!pool.length) return;
  lastRandom = pool[Math.floor(Math.random() * pool.length)];
  openDetail(lastRandom, true);
}

/* ---------- Toast con annulla ---------- */
// Uno sotto l'altro, al massimo 3: se ne arriva un quarto, il più vecchio se ne va anche se non è scaduto.
// Ognuno ha il suo tempo e il suo Annulla. Quando la colonna cambia, i toast scivolano al loro posto.
const TOAST_MAX = 3;
const TOAST_MS = 3500;

function flipToasts(change) {
  const box = $('#toasts');
  const before = new Map([...box.children].map((t) => [t, t.getBoundingClientRect().top]));
  change();
  for (const [t, top] of before) {
    if (!t.isConnected || !t.animate) continue;
    const dy = top - t.getBoundingClientRect().top;
    if (Math.abs(dy) > 0.5) t.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.3,1)' });
  }
}

function dismissToast(el) {
  if (el.dataset.gone) return;
  el.dataset.gone = '1';
  clearTimeout(el._timer);
  const remove = () => flipToasts(() => el.remove());
  if (!el.animate) { remove(); return; }
  el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.94)' }], { duration: 150, easing: 'ease-in', fill: 'forwards' })
    .onfinish = remove;
}

function toast(text, undo) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (undo ? ' has-undo' : '');
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(text)}</span>${undo ? '<button type="button">Annulla</button>' : ''}`;
  // Con Annulla tutto il toast è il pulsante: il solo testo «ANNULLA» è troppo piccolo da centrare al primo tocco
  if (undo) el.onclick = () => { if (el.dataset.gone) return; dismissToast(el); undo(); };
  const live = [...box.children].filter((t) => !t.dataset.gone);
  live.slice(0, Math.max(0, live.length - TOAST_MAX + 1)).forEach(dismissToast);
  flipToasts(() => box.append(el));
  el._timer = setTimeout(() => dismissToast(el), TOAST_MS);
}

/* ---------- Motori di ricerca (senza chiavi) ---------- */
const UA = 'Ascolti/1.0 (app personale)';
const TIMEOUT = 10000;

async function getJson(url, opts = {}, ms = TIMEOUT) {
  const r = await withTimeout(fetch(url, opts), ms);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return withTimeout(r.json(), ms);
}

// MusicBrainz accetta una richiesta al secondo: se dice "troppe richieste" (503) riprova una volta
async function mbJson(url) {
  const opts = { headers: { 'User-Agent': UA, Accept: 'application/json' } };
  try {
    return await getJson(url, opts);
  } catch (e) {
    if (!/HTTP 503/.test(e.message)) throw e;
    await new Promise((r) => setTimeout(r, 1200));
    return getJson(url, opts);
  }
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
    const j = await mbJson(`https://musicbrainz.org/ws/2/release-group?fmt=json&limit=25&query=${encodeURIComponent(q)}`);
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

// Brani di un risultato, per l'anteprima: { tracks: [{ title, ms }], year, genre }
async function albumInfo(r) {
  const id = encodeURIComponent(r.sourceId);
  if (r.source === 'itunes') {
    const j = await getJson(`https://itunes.apple.com/lookup?id=${id}&entity=song&country=IT&limit=200`);
    const items = j.results || [];
    const album = items.find((x) => x.wrapperType === 'collection') || {};
    const tracks = items.filter((x) => x.wrapperType === 'track')
      .sort((a, b) => (a.discNumber - b.discNumber) || (a.trackNumber - b.trackNumber))
      .map((t) => ({ title: t.trackName, ms: t.trackTimeMillis }));
    return { tracks, count: album.trackCount, genre: album.primaryGenreName };
  }
  if (r.source === 'deezer') {
    const j = await getJson(`https://api.deezer.com/album/${id}`);
    if (j.error) throw new Error(j.error.message);
    return {
      tracks: (j.tracks?.data || []).map((t) => ({ title: t.title, ms: t.duration * 1000 })),
      count: j.nb_tracks, year: (j.release_date || '').slice(0, 4), genre: j.genres?.data?.[0]?.name,
    };
  }
  if (r.source === 'musicbrainz') {
    // I brani dell'edizione originale: tra le pubblicazioni ufficiali la più vecchia (MusicBrainz le elenca in ordine sparso)
    const j = await mbJson(`https://musicbrainz.org/ws/2/release?release-group=${id}&fmt=json&limit=100`);
    const releases = j.releases || [];
    const official = releases.filter((x) => x.status === 'Official');
    const byDate = (x, y) => (x.date || '9999').localeCompare(y.date || '9999');
    const pick = [...(official.length ? official : releases)].sort(byDate)[0];
    if (!pick) return null;
    await new Promise((r) => setTimeout(r, 1000)); // una richiesta al secondo
    const rel = await mbJson(`https://musicbrainz.org/ws/2/release/${encodeURIComponent(pick.id)}?inc=recordings&fmt=json`);
    return { tracks: (rel.media || []).flatMap((m) => (m.tracks || []).map((t) => ({ title: t.title, ms: t.length }))) };
  }
  return null;
}

/* ---------- Schermata di ricerca ---------- */
let results = [];
let searchSeq = 0;
let searchTimer;

const keyOf = (r) => `${r.source}:${r.sourceId}`;

function renderResults() {
  $('#results').innerHTML = results.map((r, i) => {
    const added = !!findExisting(r, keyOf(r));
    return `
    <li class="row" data-act="preview" data-i="${i}" data-title="${esc(r.title)}">
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
    if (linkResult) results = [linkResult, ...results.filter((r) => !sameAlbum(r, linkResult))];
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

// Aggiunge un risultato a "Da ascoltare", con Annulla. Se l'album c'è già (anche da un'altra fonte) lo dice e basta.
function addResult(i) {
  const r = results[i];
  if (!r) return;
  const id = keyOf(r);
  const existing = findExisting(r, id);
  if (existing) { toast(alreadyText(existing)); return; }
  const { engineIdx, pos, sources, ...data } = r; // campi solo per l'ordinamento
  const a = { id, ...data, addedAt: Date.now(), listenedAt: null };
  albums.push(a);
  saveAlbums();
  rememberSearch($('#q').value);
  renderResults();
  if (a.source === 'deezer' && !a.year) enrichDeezerYear(a);
  cacheCovers(); enrichAlbums();
  toast(`Aggiunto: ${a.title}`, () => {
    albums = albums.filter((x) => x !== a); saveAlbums(); renderResults(); render();
  });
}

/* ---------- Brani di un album (anteprima e scheda) ---------- */
// Le richieste si ricordano finché l'app resta aperta: riaprire la stessa scheda non riscarica niente
const infoCache = new Map();
const totalMs = (tracks) => (tracks.length && tracks.every((t) => t.ms > 0) ? tracks.reduce((s, t) => s + t.ms, 0) : 0);

function trackInfo(x, key) {
  if (!infoCache.has(key)) {
    const p = (SOURCE_NAME[x.source] && x.source !== 'link' ? albumInfo(x) : findInfo(x))
      .then((info) => (info?.tracks?.length || info?.count ? info : null));
    infoCache.set(key, p);
    p.catch(() => infoCache.delete(key)); // errore di rete: la prossima volta riprova
  }
  return infoCache.get(key);
}

// Album aggiunti a mano o da un link: si cercano su iTunes e Deezer per artista e titolo
// (prima lo stesso titolo, poi lo stesso titolo senza "Remastered", "Deluxe"…)
async function findInfo(x) {
  const q = `${x.artist || ''} ${x.title || ''}`.trim();
  if (q.length < 2) return null;
  const lists = await Promise.all(ENGINES.slice(0, 2).map((engine) => engine(q).catch(() => [])));
  const ranked = rankResults(lists, q);
  const artist = tokens(x.artist).join(' ');
  const hit = ranked.find((r) => sameAlbum(r, x))
    || ranked.find((r) => baseTitle(r.title) === baseTitle(x.title) && tokens(r.artist).join(' ') === artist);
  return hit ? albumInfo(hit) : null;
}

function tracksHtml(info) {
  const tracks = info.tracks || [];
  const count = tracks.length || info.count || 0;
  const total = totalMs(tracks);
  const summary = [count ? (count === 1 ? '1 brano' : `${count} brani`) : '', total ? `${Math.round(total / 60000)} min` : '', info.genre]
    .filter(Boolean).join(' · ');
  // Numero, titolo e durata in tre colonne: un titolo lungo va a capo senza spostare la durata
  return (summary ? `<p class="tracks-sum">${esc(summary)}</p>` : '') + (tracks.length ? `<ol class="tracks">${tracks.map((t, i) => `
    <li><span class="n">${i + 1}</span><span class="t">${esc(t.title)}</span><span class="dur">${t.ms > 0 ? fmtDuration(t.ms) : ''}</span></li>`).join('')}</ol>` : '');
}

/* ---------- Anteprima di un risultato ---------- */
let previewSeq = 0;
const fmtDuration = (ms) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function openPreview(i) {
  const r = results[i];
  if (!r) return;
  const seq = ++previewSeq;
  const existing = findExisting(r, keyOf(r));
  const meta = () => [r.year, TYPE_NAME[r.type], SOURCE_NAME[r.source]].filter(Boolean).join(' · ');
  $('#sheet').innerHTML = `
    <div class="head preview-head" data-title="${esc(r.title)}">
      ${coverHtml(r)}
      <div class="head-text">
        <h2>${esc(r.title)}</h2><div class="by">${esc(r.artist)}</div><div class="by" id="preview-meta">${esc(meta())}</div>
      </div>
    </div>
    <div id="preview-tracks" class="tracks-box"><p class="status"><span class="spinner"></span>Carico i brani…</p></div>
    <div class="actions">
      ${existing
        ? `<button data-act="close">${ICON.check}${esc(existing.listenedAt ? 'Già tra gli ascoltati' : 'Già in lista')}</button>`
        : `<button data-act="preview-add" data-i="${i}">${ICON.plus}Aggiungi a Da ascoltare</button>`}
    </div>`;
  openLayer('sheet');
  trackInfo(r, keyOf(r)).then((info) => {
    if (seq !== previewSeq || $('#sheet').hidden) return;
    const box = $('#preview-tracks');
    if (!info) { box.innerHTML = ''; return; }
    // Deezer dà l'anno solo qui: lo tiene anche il risultato, così l'album aggiunto ce l'ha
    if (!r.year && /^\d{4}$/.test(info.year || '')) { r.year = info.year; $('#preview-meta').textContent = meta(); }
    box.innerHTML = tracksHtml(info);
  }).catch(() => {
    if (seq !== previewSeq || $('#sheet').hidden) return;
    $('#preview-tracks').innerHTML = '<p class="status">Non riesco a caricare i brani.</p>';
  });
}

/* ---------- Ricerche recenti ---------- */
const RECENT_MAX = 8;
function rememberSearch(q) {
  q = String(q || '').trim().replace(/\s+/g, ' ');
  if (q.length < 2) return;
  recentSearches = [q, ...recentSearches.filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, RECENT_MAX);
  store.set(K_SEARCHES, JSON.stringify(recentSearches)).catch(() => {});
}
function forgetSearch(q) {
  recentSearches = q == null ? [] : recentSearches.filter((s) => s !== q);
  store.set(K_SEARCHES, JSON.stringify(recentSearches)).catch(() => {});
  renderPasteButton();
}
function renderRecent() {
  const box = $('#recent');
  const show = !$('#q').value.trim() && recentSearches.length > 0;
  box.hidden = !show;
  if (!show) return;
  box.innerHTML = `
    <div class="recent-head"><span>Ricerche recenti</span><button class="link-btn" data-act="recent-clear">Cancella</button></div>
    <ul class="recent-list">${recentSearches.map((q) => `
      <li><button class="recent-q" data-act="recent" data-q="${esc(q)}">${ICON.clock}<span>${esc(q)}</span></button>
        <button class="clear-btn" data-act="recent-remove" data-q="${esc(q)}" aria-label="Togli «${esc(q)}» dalle ricerche recenti">${ICON.close}</button></li>`).join('')}
    </ul>`;
}

/* ---------- Aggiunta a mano e modifica ---------- */
// mode: 'add' (nuovo album) o 'edit' (album esistente, id); cover: copertina scelta nel modulo
const form = { mode: 'add', id: null, cover: '' };

// Data per <input type="date"> (giorno locale) e ritorno
const dateValue = (ts) => {
  const d = new Date(ts), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function renderFormCover() {
  const f = $('#manual-form').elements;
  $('#form-cover').innerHTML = coverHtml({ title: f.title.value || '?', cover: form.cover });
  $('#form-cover').dataset.title = f.title.value || '?';
  $('#remove-cover').hidden = !form.cover;
}

// focus: 'note' per aprire il modulo pronto a scrivere la nota.
// from: il pannello da cui si arriva ({ top, detail }): il modulo diventa un pannello alto che cresce da lì;
// con detail = true, indietro e Annulla riportano alla scheda dell'album.
function openForm(mode, album, focus, from = null) {
  const f = $('#manual-form');
  f.reset();
  form.mode = mode;
  form.id = album?.id || null;
  form.cover = album?.cover || '';
  if (album) {
    f.elements.title.value = album.title || '';
    f.elements.artist.value = album.artist || '';
    f.elements.year.value = album.year || '';
    f.elements.note.value = album.note || '';
    f.elements.genre.value = album.genre || '';
  } else {
    f.elements.title.value = $('#q').value.trim(); // da "Non lo trovi?": parte da ciò che hai cercato
  }
  // La data di ascolto si modifica solo per gli album già ascoltati
  const listened = mode === 'edit' && album?.listenedAt;
  $('#listened-field').hidden = !listened;
  f.elements.listened.value = listened ? dateValue(album.listenedAt) : '';
  f.elements.listened.max = dateValue(Date.now());
  $('#form-title').textContent = mode === 'edit' ? 'Modifica album' : 'Aggiungi a mano';
  $('#form-submit').textContent = mode === 'edit' ? 'Salva' : 'Aggiungi';
  renderGenreLabel();
  loadFormTracks(mode === 'edit' ? album : null);
  renderFormCover();
  form.backToDetail = !!from?.detail;
  const manual = $('#manual');
  manual.classList.toggle('as-sheet', !!from);
  openLayer('manual', { still: !!from });
  // Il pannello di partenza si allunga fino in cima: il bordo superiore sale dalla sua altezza, il contenuto
  // compare mentre la copia del pannello di prima svanisce sopra
  if (from && !reducedMotion()) {
    const start = Math.max(0, from.top - manual.getBoundingClientRect().top);
    const ease = 'cubic-bezier(.3,.6,.2,1)';
    manual.animate([{ clipPath: `inset(${start}px 0 0 0 round 18px 18px 0 0)` }, { clipPath: 'inset(0 0 0 0 round 18px 18px 0 0)' }], { duration: 380, easing: ease });
    [...manual.children].forEach((c) => c.animate([{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1 }], { duration: 380, easing: 'ease-out' }));
  }
  // Il modulo parte sempre in cima; la tastiera si apre solo per la nota ("Aggiungi una nota") e per il titolo
  // di un album nuovo, i due casi in cui scrivere è proprio quello che hai chiesto
  if (focus === 'note') setTimeout(() => f.elements.note.focus({ preventScroll: true }), 60);
  else if (mode === 'add') setTimeout(() => f.elements.title.focus({ preventScroll: true }), 60);
}

function submitForm(e) {
  e.preventDefault();
  const f = e.target.elements;
  const rows = readTrackRows();
  const data = {
    title: f.title.value.trim(),
    artist: f.artist.value.trim(),
    year: f.year.value.trim(),
    cover: form.cover,
    note: f.note.value.trim(),
  };
  if (form.mode === 'edit') {
    const a = albums.find((x) => x.id === form.id);
    if (a) {
      const genreBefore = a.genre || '';
      if (a.cover !== data.cover) { delete a.coverAlt; delete a.coverFile; delete a.coverFileOf; }
      // Titolo o artista cambiati: brani e genere trovati in automatico potrebbero essere di un altro album
      if (!sameAlbum(a, data)) {
        if (!a.tracks) { delete a.trackCount; delete a.durationMs; delete a.infoTried; }
        if (!a.genreManual) delete a.genre;
        infoCache.delete(a.id);
      }
      Object.assign(a, data);
      if (!a.note) delete a.note;
      applyFormInfo(a, f, rows, genreBefore);
      // Nuova data di ascolto: lo stesso giorno non cambia l'ora salvata, un altro giorno va a mezzogiorno
      const day = f.listened.value;
      if (a.listenedAt && /^\d{4}-\d{2}-\d{2}$/.test(day) && day !== dateValue(a.listenedAt)) {
        const [y, m, d] = day.split('-').map(Number);
        a.listenedAt = Math.min(new Date(y, m - 1, d, 12).getTime(), Date.now());
      }
    }
    saveAlbums();
    closeLayer(); render();
    cacheCovers(); enrichAlbums();
    toast('Album aggiornato');
    return;
  }
  const existing = findExisting(data, null);
  if (existing) { toast(alreadyText(existing)); return; }
  const now = Date.now();
  const a = { id: `manual:${now}`, source: 'manual', sourceId: String(now), ...data, addedAt: now, listenedAt: null };
  if (!a.note) delete a.note;
  applyFormInfo(a, f, rows, '');
  albums.push(a);
  saveAlbums();
  while (stack.length) closeLayer();
  tab = 'todo'; render();
  cacheCovers(); enrichAlbums();
  toast('Album aggiunto', () => { albums = albums.filter((x) => x !== a); saveAlbums(); render(); });
}

/* ---------- Indietro e Annulla nel modulo ---------- */
// Freccia in alto, tasto indietro di Android e Annulla fanno la stessa cosa: se il modulo viene dalla scheda
// dell'album, si torna lì (il pannello si riabbassa fino all'altezza della scheda), altrimenti si chiude.
function goBack() {
  if (stack[stack.length - 1] === 'manual') { cancelForm(); return true; }
  return closeLayer();
}

function cancelForm() {
  const id = form.mode === 'edit' && form.backToDetail ? form.id : null;
  if (!id || !albums.some((x) => x.id === id)) { closeLayer(); return; }
  const manual = $('#manual');
  const g = ghostOut(manual, null, manual.scrollTop);
  closeLayer({ ghost: false });
  openDetail(id, false, { still: true }); // la scheda è già al suo posto, sotto la copia del modulo
  if (!g) return;
  // La copia del modulo sta sopra la scheda: il contenuto svanisce subito, poi il bordo superiore scende fino a
  // quello della scheda e, arrivato lì, la copia (ormai solo il fondo del pannello) svanisce e lascia la scheda.
  // È il contrario dell'apertura. Lo sfondo scuro intanto resta com'è.
  g.style.zIndex = '22';
  const sheet = $('#sheet');
  const end = Math.max(0, sheet.getBoundingClientRect().top - g.getBoundingClientRect().top);
  const clip = (y) => `inset(${y}px 0 0 0 round 18px 18px 0 0)`;
  g.animate([
    { clipPath: clip(0), opacity: 1 },
    { clipPath: clip(end), opacity: 1, offset: 0.7 },
    { clipPath: clip(end), opacity: 0 },
  ], { duration: 420, easing: 'cubic-bezier(.3,.6,.2,1)', fill: 'forwards' }).onfinish = () => g.remove();
  [...g.children].forEach((c) => c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: "forwards" }));
}

/* ---------- Genere nel modulo ---------- */
// Un menu come gli altri dell'app: le famiglie di generi (le stesse delle statistiche), i generi che hai già
// usato e, in fondo, "Aggiungi un genere…" per scriverne uno nuovo.
const GENRE_CHOICES = [...new Set(GENRES.map(([, name]) => name))].sort(collator.compare);

function renderGenreLabel() {
  $('#genre-label').textContent = $('#manual-form').elements.genre.value || 'Nessuno';
}

function openGenrePicker() {
  const current = $('#manual-form').elements.genre.value;
  const used = albums.map((a) => a.genre).filter((g) => g && !GENRE_CHOICES.includes(g));
  const all = [...new Set([...GENRE_CHOICES, ...used, ...(current ? [current] : [])])].sort(collator.compare);
  openPicker({
    kicker: 'Genere',
    current,
    act: 'set-genre',
    options: [{ key: '', label: 'Nessuno' }, ...all.map((g) => ({ key: g, label: g }))],
  });
  $('#sheet .pick-list').insertAdjacentHTML('beforeend', `
    <button class="pick-option pick-new" data-act="genre-new">${ICON.plus}<span>Aggiungi un genere…</span></button>`);
}

function setGenre(value) {
  $('#manual-form').elements.genre.value = value;
  renderGenreLabel();
  closeLayer();
}

// "Aggiungi un genere…" diventa un campo per scriverlo (qui sì che la tastiera si apre: l'hai chiesto tu)
function showNewGenre(btn) {
  btn.outerHTML = `<div class="pick-new-row">
    <input id="genre-new" maxlength="40" placeholder="Nuovo genere" autocomplete="off" enterkeyhint="done" />
    <button class="primary" data-act="genre-new-ok">Aggiungi</button></div>`;
  const input = $('#genre-new');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addNewGenre(); } });
  input.focus();
  input.scrollIntoView({ block: 'nearest' });
}

function addNewGenre() {
  const value = ($('#genre-new')?.value || '').trim().replace(/\s+/g, ' ');
  if (!value) { $('#genre-new')?.focus(); return; }
  // Se coincide con un genere che c'è già (maiuscole a parte), si usa quello
  const known = [...GENRE_CHOICES, ...albums.map((a) => a.genre).filter(Boolean)].find((g) => g.toLowerCase() === value.toLowerCase());
  setGenre(known || value.charAt(0).toUpperCase() + value.slice(1));
}

/* ---------- Brani nel modulo ---------- */
// Nel modulo i brani sono un elenco (titolo e durata): numero di brani e durata dell'album si ricavano da lì,
// così non possono contraddire l'elenco. Si apre con i brani trovati in automatico; se lo cambi, l'elenco si
// salva nell'album (a.tracks) e diventa quello che si vede ovunque. Il genere è un campo a parte (genreManual).
let formTracksSeq = 0;

// Chiave per capire se l'elenco è cambiato (al secondo, come si vede nel modulo)
const tracksKey = (tracks) => JSON.stringify(tracks.map((t) => [String(t.title || '').trim(), Math.round((t.ms || 0) / 1000)]));

// La durata di ogni brano sta in data-ms della riga e si sceglie con la ghiera (pulsante con l'orologio)
function trackRowHtml(t = { title: '', ms: 0 }) {
  const ms = t.ms > 0 ? Math.round(t.ms / 1000) * 1000 : 0;
  return `<li class="te-row" data-ms="${ms}">
    <span class="n"></span>
    <input class="te-title" placeholder="Titolo del brano" maxlength="200" autocomplete="off" aria-label="Titolo del brano" value="${esc(t.title || '')}" />
    <button type="button" class="te-dur" data-act="dial">${ICON.clock}<span></span></button>
    <button type="button" class="clear-btn" data-act="track-remove" aria-label="Togli il brano">${ICON.close}</button>
  </li>`;
}
function renderRowDur(row) {
  const ms = +row.dataset.ms || 0;
  const btn = row.querySelector('.te-dur');
  btn.querySelector('span').textContent = ms ? fmtDuration(ms) : '—:—';
  btn.classList.toggle('empty', !ms);
  btn.setAttribute('aria-label', ms ? `Durata ${fmtDuration(ms)}: tocca per cambiarla` : 'Durata: tocca per sceglierla');
}

function setTrackRows(tracks) {
  $('#te-list').innerHTML = tracks.map(trackRowHtml).join('');
  form.tracksKey = tracksKey(tracks);
  updateTrackSum();
}

// Numeri dei brani e riepilogo "10 brani · 47 min" mentre scrivi
function updateTrackSum() {
  const rows = [...document.querySelectorAll('#te-list .te-row')];
  rows.forEach((r, i) => { r.querySelector('.n').textContent = i + 1; renderRowDur(r); });
  const ms = rows.map((r) => +r.dataset.ms || 0);
  const total = ms.every((x) => x > 0) ? ms.reduce((s, x) => s + x, 0) : 0;
  $('#te-sum').textContent = rows.length
    ? [plural(rows.length, 'brano', 'brani'), total ? fmtHM(total) : 'durata incompleta'].join(' · ') : '';
  updateResetIcon();
}

// L'icona di ripristino c'è quando l'elenco nel modulo non è quello ufficiale: se l'ufficiale è già noto si
// confronta, altrimenti basta che l'album abbia un elenco scritto a mano. Mai per un album nuovo o se l'elenco
// ufficiale non esiste.
function updateResetIcon() {
  const btn = $('[data-act="tracks-reset"]');
  const rows = readTrackRows();
  btn.hidden = form.mode !== 'edit' || form.officialMissing
    || (form.officialKey !== null ? tracksKey(rows) === form.officialKey : !form.manualAlbum);
}

function loadFormTracks(album) {
  const seq = ++formTracksSeq;
  form.tracksTouched = false;
  form.official = null;        // elenco ufficiale rimesso con il pulsante di ripristino (si applica con Salva)
  form.officialKey = null;     // elenco ufficiale, se già noto (null = non si sa ancora)
  form.officialMissing = false; // l'elenco ufficiale non esiste: niente da ripristinare
  form.manualAlbum = Array.isArray(album?.tracks);
  $('#te-status').textContent = '';
  setTrackRows(album?.tracks || []);
  if (!album || album.tracks) return;
  $('#te-status').innerHTML = '<span class="spinner"></span>Cerco i brani…';
  trackInfo(album, album.id).then((info) => {
    if (seq !== formTracksSeq || $('#manual').hidden) return;
    $('#te-status').textContent = info?.tracks?.length ? '' : 'Brani non trovati: se vuoi, aggiungili tu.';
    if (info?.tracks?.length) form.officialKey = tracksKey(info.tracks); else form.officialMissing = true;
    if (!form.tracksTouched && info?.tracks?.length) setTrackRows(info.tracks);
    updateResetIcon();
  }).catch(() => {
    if (seq !== formTracksSeq || $('#manual').hidden) return;
    $('#te-status').textContent = 'Non riesco a cercare i brani: controlla la connessione, oppure aggiungili tu.';
  });
}

// Cerca di nuovo l'elenco ufficiale (dalla fonte dell'album, o su iTunes e Deezer) e, se c'è, lo rimette nel
// modulo al posto di quello scritto a mano. Diventa definitivo con Salva: l'album torna ai dati automatici.
function resetFormTracks(btn) {
  const a = albums.find((x) => x.id === form.id);
  if (!a) return;
  const seq = ++formTracksSeq;
  const status = $('#te-status');
  btn.disabled = true;
  status.innerHTML = '<span class="spinner"></span>Cerco l’elenco ufficiale…';
  infoCache.delete(a.id); // niente risposte vecchie: si chiede di nuovo
  trackInfo(a, a.id).then((info) => {
    if (seq !== formTracksSeq || $('#manual').hidden) return;
    if (!info?.tracks?.length) {
      form.officialMissing = true;
      updateResetIcon();
      status.textContent = 'Elenco ufficiale non trovato: resta quello che hai scritto.';
      return;
    }
    form.official = info;
    form.officialKey = tracksKey(info.tracks);
    setTrackRows(info.tracks);
    form.tracksTouched = false;
    status.textContent = 'Elenco ufficiale ripristinato: tocca Salva per confermare.';
  }).catch(() => {
    if (seq !== formTracksSeq || $('#manual').hidden) return;
    status.textContent = 'Non riesco a cercare l’elenco ufficiale: controlla la connessione.';
  }).finally(() => { btn.disabled = false; });
}

/* ---------- Ghiera della durata ---------- */
// Si gira col dito: ogni scatto è un secondo (6 gradi), ogni giro completo un minuto. In senso antiorario si
// torna indietro fino a 00:00. I pulsanti sotto servono per i brani lunghi (un minuto alla volta) e per
// rifinire; con la tastiera: frecce ±1 secondo, Pagina su/giù ±1 minuto.
const DIAL_MAX = 99 * 60 + 59;
const dial = { row: null, secs: 0, acc: 0, last: null };

function dialTicks() {
  const svg = $('#dial-ticks');
  if (svg.childElementCount) return;
  let html = '';
  for (let i = 0; i < 60; i++) {
    const long = i % 5 === 0, a = (i * 6 * Math.PI) / 180, r1 = 112, r2 = long ? 100 : 106;
    const p = (r) => `${(120 + r * Math.sin(a)).toFixed(2)},${(120 - r * Math.cos(a)).toFixed(2)}`;
    html += `<line class="${long ? 'long' : ''}" x1="${p(r1).split(',')[0]}" y1="${p(r1).split(',')[1]}" x2="${p(r2).split(',')[0]}" y2="${p(r2).split(',')[1]}"/>`;
  }
  svg.innerHTML = html;
}

function renderDial() {
  const s = dial.secs, sec = s % 60, a = (sec * 6 * Math.PI) / 180, r = 88;
  const mm = String(Math.floor(s / 60)).padStart(2, '0'), ss = String(sec).padStart(2, '0');
  $('#dial-value').textContent = `${mm}:${ss}`;
  const x = 120 + r * Math.sin(a), y = 120 - r * Math.cos(a);
  // Arco dei secondi del minuto in corso, dall'alto fino alla maniglia
  $('#dial-arc').setAttribute('d', sec ? `M120,${120 - r} A${r},${r} 0 ${sec > 30 ? 1 : 0} 1 ${x.toFixed(2)},${y.toFixed(2)}` : '');
  $('#dial-handle').setAttribute('cx', x.toFixed(2));
  $('#dial-handle').setAttribute('cy', y.toFixed(2));
  const knob = $('#dial-knob');
  knob.setAttribute('aria-valuenow', s);
  knob.setAttribute('aria-valuetext', `${plural(Math.floor(s / 60), 'minuto', 'minuti')} e ${plural(sec, 'secondo', 'secondi')}`);
}

function setDial(secs, fromTurn = false) {
  const s = Math.max(0, Math.min(DIAL_MAX, secs));
  if (!fromTurn) dial.acc = s * 6;
  if (s === dial.secs) return;
  dial.secs = s;
  renderDial();
}

function openDial(btn) {
  const row = btn.closest('.te-row');
  const i = [...row.parentElement.children].indexOf(row);
  const title = row.querySelector('.te-title').value.trim();
  dial.row = row;
  dial.secs = -1;
  dialTicks();
  setDial(Math.round((+row.dataset.ms || 0) / 1000));
  $('#dial-title').textContent = title ? `Durata di «${title}»` : `Durata del brano ${i + 1}`;
  openLayer('dial');
}

function confirmDial() {
  if (dial.row?.isConnected) {
    dial.row.dataset.ms = dial.secs * 1000;
    form.tracksTouched = true;
    updateTrackSum();
  }
  closeLayer();
}

// Angolo del dito rispetto al centro della ghiera: 0 in alto, crescente in senso orario.
// Vicino al centro l'angolo salta da una parte all'altra: lì il movimento non conta (null).
function dialAngle(e) {
  const r = $('#dial-knob').getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  if (Math.hypot(dx, dy) < r.width * 0.12) return null;
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

(() => {
  const knob = $('#dial-knob');
  knob.addEventListener('pointerdown', (e) => {
    dial.dragging = true;
    dial.last = dialAngle(e);
    dial.acc = dial.secs * 6;
    try { knob.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
  });
  knob.addEventListener('pointermove', (e) => {
    if (!dial.dragging) return;
    const a = dialAngle(e);
    if (a === null) { dial.last = null; return; }
    if (dial.last === null) { dial.last = a; return; }
    let d = a - dial.last;
    if (d > 180) d -= 360; else if (d < -180) d += 360; // passaggio sopra lo zero in alto
    dial.last = a;
    // Sotto 00:00 non si va: girando ancora indietro la ghiera resta ferma, e riparte appena giri in avanti
    dial.acc = Math.max(0, Math.min(DIAL_MAX * 6, dial.acc + d));
    setDial(Math.round(dial.acc / 6), true);
  });
  const end = () => { dial.dragging = false; dial.last = null; };
  knob.addEventListener('pointerup', end);
  knob.addEventListener('pointercancel', end);
  knob.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 60, PageDown: -60 }[e.key];
    if (step) { e.preventDefault(); setDial(dial.secs + step); }
    else if (e.key === 'Enter') { e.preventDefault(); confirmDial(); }
  });
})();

// Legge l'elenco dal modulo (le righe senza titolo né durata non contano)
function readTrackRows() {
  const rows = [];
  for (const [i, r] of [...document.querySelectorAll('#te-list .te-row')].entries()) {
    const title = r.querySelector('.te-title').value.trim();
    const ms = +r.dataset.ms || 0;
    if (!title && !ms) continue; // riga vuota
    rows.push({ title: title || `Brano ${i + 1}`, ms });
  }
  return rows;
}

// Salva brani e genere del modulo, solo se li hai cambiati
function applyFormInfo(a, f, rows, genreBefore) {
  if (form.official && tracksKey(rows) === tracksKey(form.official.tracks)) {
    // Elenco ufficiale ripristinato e non più toccato: l'album torna ai dati automatici
    delete a.tracks;
    a.trackCount = form.official.tracks.length;
    const total = totalMs(form.official.tracks);
    if (total) a.durationMs = total; else delete a.durationMs;
    a.infoTried = Date.now();
  } else if (tracksKey(rows) !== form.tracksKey) {
    if (rows.length) {
      a.tracks = rows;
      a.trackCount = rows.length;
      if (rows.every((t) => t.ms > 0)) a.durationMs = rows.reduce((s, t) => s + t.ms, 0); else delete a.durationMs;
    } else {
      // Elenco svuotato: niente brani e niente durata, e non si ricercano
      a.tracks = [];
      delete a.trackCount; delete a.durationMs;
    }
    infoCache.delete(a.id);
  }
  const genre = f.genre.value.trim();
  if (genre !== genreBefore) {
    if (genre) a.genre = genre; else delete a.genre;
    a.genreManual = true;
  }
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

/* ---------- Copertine salvate sul telefono ---------- */
// In background ogni copertina viene scaricata una volta in files/covers: così si vede anche senza rete
// e non sparisce se il link in rete smette di funzionare. Il link resta nell'album (e nel backup).
const COVER_DIR = 'covers';
let coverBase = '';            // indirizzo della cartella per la WebView ('' = non disponibile, per esempio nel browser)
const coverFailed = new Set(); // link che in questa sessione non si sono scaricati: non si riprovano
let coverBusy = false;

const localCover = (a) => (coverBase && a.coverFile ? `${coverBase}/${a.coverFile}` : '');
const coverUrls = (a) => [a.cover, a.coverAlt].filter((u) => u && /^https?:\/\//i.test(u));
const hashOf = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36) + s.length.toString(36); };
const headerOf = (headers, name) => Object.entries(headers || {}).find(([k]) => k.toLowerCase() === name)?.[1] || '';

async function initCoverCache() {
  const { Filesystem, CapacitorHttp } = Plugins;
  if (!Filesystem || !CapacitorHttp) return;
  try {
    await Filesystem.mkdir({ path: COVER_DIR, directory: 'DATA', recursive: true }).catch(() => {});
    const { uri } = await Filesystem.getUri({ path: COVER_DIR, directory: 'DATA' });
    const { files } = await Filesystem.readdir({ path: COVER_DIR, directory: 'DATA' });
    const present = new Set(files.map((f) => (typeof f === 'string' ? f : f.name)));
    // Album che puntano a un file che non c'è più (per esempio dopo un ripristino): si riscarica
    let changed = false;
    for (const a of albums) {
      if (a.coverFile && !present.has(a.coverFile)) { delete a.coverFile; delete a.coverFileOf; changed = true; }
    }
    if (changed) saveAlbums();
    // File che nessun album usa più (album eliminati o copertine cambiate)
    const used = new Set(albums.map((a) => a.coverFile).filter(Boolean));
    for (const name of present) {
      if (!used.has(name)) Filesystem.deleteFile({ path: `${COVER_DIR}/${name}`, directory: 'DATA' }).catch(() => {});
    }
    coverBase = Cap.convertFileSrc(uri).replace(/\/$/, '');
  } catch (e) {
    console.warn('Copertine salvate non disponibili', e);
    coverBase = '';
  }
}

async function cacheCover(a) {
  const { Filesystem, CapacitorHttp } = Plugins;
  for (const url of coverUrls(a).filter((u) => !coverFailed.has(u))) {
    try {
      const r = await withTimeout(CapacitorHttp.get({ url, responseType: 'blob', connectTimeout: 10000, readTimeout: 15000 }), 30000);
      const type = String(headerOf(r.headers, 'content-type'));
      if (r.status !== 200 || !/^image\//i.test(type) || typeof r.data !== 'string' || !r.data) throw new Error(`HTTP ${r.status} ${type}`);
      const name = `${hashOf(url)}.${/png/i.test(type) ? 'png' : /webp/i.test(type) ? 'webp' : 'jpg'}`;
      await Filesystem.writeFile({ path: `${COVER_DIR}/${name}`, data: r.data, directory: 'DATA', recursive: true });
      if (!coverUrls(a).includes(url)) return; // copertina cambiata nel frattempo: ci pensa il prossimo giro
      a.coverFile = name; a.coverFileOf = url;
      saveAlbums();
      return;
    } catch {
      coverFailed.add(url);
    }
  }
}

// Scarica una alla volta le copertine che mancano; si può chiamare quante volte si vuole
async function cacheCovers() {
  if (!coverBase || coverBusy) return;
  coverBusy = true;
  try {
    const needs = (a) => !a.coverFile && coverUrls(a).some((u) => !coverFailed.has(u));
    for (let a = albums.find(needs); a; a = albums.find(needs)) await cacheCover(a);
  } finally {
    coverBusy = false;
  }
}

/* ---------- Backup su file ---------- */
const MONTH = 30 * DAY;

function backupFileName() {
  return `ascolti-backup-${dateValue(Date.now())}.json`;
}

// how: 'documents' (cartella Documenti/Ascolti) o 'share' (menu Condividi). Nel browser scarica il file.
async function saveBackup(how) {
  const status = $('#backup-status');
  // I file delle copertine salvate restano sul telefono: nel backup c'è il link
  const list = albums.map(({ coverFile, coverFileOf, ...a }) => a);
  const text = JSON.stringify({ app: 'ascolti', format: 1, exportedAt: new Date().toISOString(), albums: list }, null, 1);
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

// Accetta i backup di questa versione ({ albums: [...] }) e quelli vecchi (solo la lista).
// Un album già presente (stesso id, o stesso titolo e artista) non viene duplicato.
function restoreFromText(text) {
  let data;
  try { data = JSON.parse(text); } catch { toast('Il file non è un backup di Ascolti'); return; }
  const list = Array.isArray(data) ? data : Array.isArray(data?.albums) ? data.albums : null;
  if (!list) { toast('Il file non è un backup di Ascolti'); return; }
  const valid = list.filter((a) => a && typeof a.id === 'string' && typeof a.title === 'string');
  const fresh = [];
  for (const a of valid) {
    const dup = (x) => x.id === a.id || sameAlbum(x, a);
    if (albums.some(dup) || fresh.some(dup)) continue;
    const { coverFile, coverFileOf, ...clean } = a;
    fresh.push(clean);
  }
  albums.push(...fresh);
  saveAlbums(); render(); renderBackupBanner();
  cacheCovers(); enrichAlbums();
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
    : 'Non hai ancora fatto un backup.') + ' La lista sta su questo telefono: tienine una copia.';
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

/* ---------- Durate e generi (in background) ---------- */
// Per le statistiche servono durata, numero di brani e genere di ogni album: si scaricano una volta, uno alla volta,
// con le stesse richieste della riga "Brani", e si salvano nell'album. Un elenco dei brani scritto o corretto
// a mano (a.tracks) e un genere scritto a mano (genreManual) non vengono più toccati. Un album non trovato si
// riprova dopo un mese.
const INFO_RETRY = 30 * DAY;
const infoFailed = new Set(); // errori di rete in questa sessione: si riprova al prossimo avvio
let infoBusy = false;

const needsInfo = (a) => !a.tracks && a.durationMs == null && !infoFailed.has(a.id)
  && (!a.infoTried || Date.now() - a.infoTried > INFO_RETRY);

// Salva nell'album quello che è arrivato (senza sovrascrivere i dati scritti a mano)
function applyInfo(a, info) {
  a.infoTried = Date.now();
  if (!info) return;
  if (!a.tracks) {
    const tracks = info.tracks || [];
    const count = tracks.length || info.count;
    if (count) a.trackCount = count;
    const total = totalMs(tracks);
    if (total) a.durationMs = total;
  }
  const genre = normGenre(info.genre);
  if (genre && !a.genre && !a.genreManual) a.genre = genre;
  if (!a.year && /^\d{4}$/.test(info.year || '')) a.year = info.year;
}

async function enrichAlbums() {
  if (infoBusy) return;
  infoBusy = true;
  let done = 0;
  try {
    for (let a = albums.find(needsInfo); a; a = albums.find(needsInfo)) {
      try { applyInfo(a, await trackInfo(a, a.id)); } catch { infoFailed.add(a.id); }
      if (++done % 10 === 0) { saveAlbums(); if (!$('#stats').hidden) renderStats(); }
      await new Promise((r) => setTimeout(r, a.source === 'musicbrainz' ? 1100 : 250)); // MusicBrainz: una richiesta al secondo
    }
  } finally {
    infoBusy = false;
    if (done) { saveAlbums(); render(); }
    if (!$('#stats').hidden) renderStats();
  }
}

/* ---------- Statistiche ---------- */
const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const MONTHS_LONG = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const WEEKDAYS = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
// Paragoni per il tempo di musica: a ogni apertura delle statistiche se ne pesca uno per la musica ascoltata e uno,
// diverso, per quella da ascoltare. [verbo, cosa, durata in minuti]: diventa "Come <verbo> N volte <cosa>".
// Tra *asterischi* i titoli, che vanno in corsivo. Le durate sono quelle comunemente indicate, arrotondate.
const FUN_UNITS = [
  ['guardare', '*Il Signore degli Anelli*, la trilogia in versione estesa', 686],
  ['guardare', '*Lo Hobbit*, la trilogia in versione estesa', 532],
  ['guardare', 'tutti gli 8 film di *Harry Potter*', 1179],
  ['guardare', 'i 9 film della saga Skywalker di *Star Wars*', 1226],
  ['guardare', 'la trilogia del *Padrino*', 539],
  ['guardare', '*Titanic*', 195],
  ['guardare', '*Via col vento*', 238],
  ['guardare', '*Ben-Hur*, quello del 1959', 212],
  ['guardare', '*Novecento* di Bertolucci', 317],
  ['guardare', '*La meglio gioventù*', 366],
  ['guardare', '*Avengers: Endgame*', 181],
  ['guardare', '*La corazzata Potëmkin* (chiedere a Fantozzi)', 75],
  ['guardare', '*Sátántangó* di Béla Tarr', 439],
  ['guardare', '*Shoah* di Claude Lanzmann', 566],
  ['guardare', 'tutte le stagioni di *Game of Thrones*', 4214],
  ['guardare', 'tutte le stagioni di *Breaking Bad*', 2940],
  ['guardare', 'tutte e 10 le stagioni di *Friends*', 5192],
  ['guardare', 'una serata del Festival di Sanremo', 300],
  ['guardare', 'tutte le 64 partite di un Mondiale', 64 * 90],
  ['ascoltare', '*L’anello del Nibelungo* di Wagner, tutte e quattro le opere', 900],
  ['ascoltare', 'il *Parsifal* di Wagner', 270],
  ['ascoltare', 'la *Nona* di Beethoven', 70],
  ['ascoltare', '*Le quattro stagioni* di Vivaldi', 42],
  ['ascoltare', '*Abbey Road* dei Beatles, lato A e lato B', 47.05],
  ['ascoltare', '*Bohemian Rhapsody*', 5.92],
  ['ascoltare', '*Stairway to Heaven*', 8.03],
  ['«ascoltare»', '*4′33″* di John Cage', 4.55],
  ['andare', 'da Milano a Roma in Frecciarossa', 180],
  ['volare', 'da Milano a New York', 540],
  ['volare', 'da Roma a Tokyo', 780],
  ['andare', 'da Genova a Palermo in traghetto', 1200],
  ['andare', 'dalla Terra alla Luna con l’Apollo 11', 4560],
  ['fare', 'il giro della Terra a bordo della Stazione Spaziale', 92],
  ['aspettare', 'che la luce del Sole arrivi fino a noi', 8.33],
  ['correre', 'una maratona al ritmo del record del mondo', 120.6],
  ['giocare', 'una partita di calcio, senza recupero', 90],
  ['cucinare', 'un ragù fatto come si deve', 180],
  ['preparare', 'le uova sode', 9],
  ['cuocere', 'la pasta al dente', 10],
  ['fare', 'il caffè con la moka', 5],
  ['fare', 'un pomodoro di studio', 25],
  ['dormire', 'una notte intera', 480],
  ['passare', 'una giornata da koala (20 ore di sonno)', 1200],
];
// Una pesca per apertura delle statistiche: funPick si azzera quando le apri, e i due paragoni non coincidono mai.
// Si pesca tra quelli che il tempo supera almeno di una volta e mezza, così la frase è sempre "N volte".
let funPick = {};
let funLast = {};
function funUnitFor(key, ms) {
  const fits = (u) => ms >= u[2] * 60000 * 1.5;
  if (funPick[key] && fits(funPick[key])) return funPick[key];
  const taken = Object.entries(funPick).filter(([k]) => k !== key).map(([, u]) => u);
  const pool = FUN_UNITS.filter((u) => fits(u) && u !== funLast[key] && !taken.includes(u));
  funPick[key] = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  if (funPick[key]) funLast[key] = funPick[key];
  return funPick[key];
}
// "Come guardare <b>87,9 volte</b> <i>La corazzata Potëmkin</i> (chiedere a Fantozzi)"
function funLine(key, ms) {
  const u = funUnitFor(key, ms);
  if (!u) return '';
  const r = ms / (u[2] * 60000);
  const times = r >= 100 ? Math.round(r).toLocaleString('it-IT') : fmtNum(r);
  return `Come ${esc(u[0])} <b>${times} volte</b> ${esc(u[1]).replace(/\*([^*]+)\*/g, '<i>$1</i>')}`;
}

let chartMode = 'album';     // grafico mese per mese: numero di album o ore di musica

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const fmtNum = (n, digits = 1) => n.toLocaleString('it-IT', { maximumFractionDigits: digits });

function fmtDays(ms) {
  const d = ms / DAY;
  if (d < 1) return 'meno di un giorno';
  if (d < 1.5) return '1 giorno';
  if (d < 60) return `${Math.round(d)} giorni`;
  const m = Math.round(d / 30.4);
  return m < 24 ? `${m} mesi` : `${fmtNum(d / 365)} anni`;
}
// Durata di musica: "45 min", "3 h 20 min", "27 h"
function fmtHM(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
// Un periodo di calendario: "10 giorni", "6 settimane", "4 mesi", "2,5 anni"
function fmtSpan(days) {
  if (days < 14) return plural(Math.max(1, Math.round(days)), 'giorno', 'giorni');
  if (days < 60) return `${Math.round(days / 7)} settimane`;
  if (days < 730) return plural(Math.round(days / 30.4), 'mese', 'mesi');
  return `${fmtNum(days / 365)} anni`;
}
const decadeName = (d) => (d < 2000 ? `anni '${String(d).slice(2)}` : `anni ${d}`);

// Una riga cliccabile che apre la scheda dell'album
// act: cosa fa il tocco sulla riga; icon: un'icona in fondo a destra (per esempio la matita)
const albumLine = (a, right, act = 'detail', icon = '') => `
  <button class="stat-album" data-act="${act}" data-id="${esc(a.id)}" data-title="${esc(a.title)}">
    ${coverHtml(a)}<span class="sa-text"><span class="sa-title">${esc(a.title)}</span><span class="sa-sub">${esc(a.artist || '')}</span></span>
    <span class="sa-right">${esc(right)}${icon}</span>
  </button>`;

// Barre orizzontali: [{ label, parts: [valore, …], right }], una parte per serie (la prima più scura)
const hbars = (rows) => {
  const max = Math.max(1, ...rows.map((r) => r.parts.reduce((s, v) => s + v, 0)));
  return `<div class="hbars">${rows.map((r) => `
    <div class="hbar"><span class="hb-label">${esc(r.label)}</span>
      <span class="hb-track">${r.parts.map((v, i) => (v ? `<i class="s${i}" style="width:${(v / max) * 100}%"></i>` : '')).join('')}</span>
      <span class="hb-right">${esc(r.right)}</span></div>`).join('')}</div>`;
};

// Colonne verticali con il valore massimo scritto sopra; tocca una colonna per leggerne il valore nella didascalia
function columns(id, items, caption, labelOf) {
  const max = Math.max(0, ...items.map((x) => x.v));
  const peak = max ? items.findIndex((x) => x.v === max) : -1;
  return `<p class="hint stat-caption" id="${id}-caption" data-default="${esc(caption)}">${esc(caption)}</p>
    <div class="month-chart" style="grid-template-columns:repeat(${items.length},minmax(0,1fr))" role="list">${items.map((x, i) => {
      const h = max ? Math.max(x.v ? 4 : 0, Math.round((x.v / max) * 100)) : 0;
      return `<button class="month" role="listitem" data-act="month" data-cap="${id}-caption" data-label="${esc(x.label)}" aria-label="${esc(x.label)}">
        <span class="month-val">${i === peak ? esc(labelOf(x.v)) : ''}</span>
        <span class="month-bar"><i style="height:${h}%"></i></span>
        <span class="month-name">${esc(x.short)}</span>
      </button>`;
    }).join('')}</div>`;
}

function renderStats() {
  if (!albums.length) {
    $('#stats-body').innerHTML = '<p class="empty">Aggiungi qualche album:\nqui vedrai le tue statistiche.</p>';
    return;
  }
  const now = Date.now();
  const done = albums.filter((a) => a.listenedAt);
  const todo = albums.filter((a) => !a.listenedAt);
  const favs = done.filter((a) => a.fav).length;
  const sumMs = (list) => list.reduce((s, a) => s + (a.durationMs > 0 ? a.durationMs : 0), 0);
  const known = (list) => list.filter((a) => a.durationMs > 0).length;
  // "Conta 5 album su 6: uno non ha ancora la durata."
  const missingNote = (list) => {
    const miss = list.length - known(list);
    return miss ? ` Conta ${known(list)} album su ${list.length}: ${miss === 1 ? 'uno non ha' : `${miss} non hanno`} ancora la durata.` : '';
  };
  const tile = (n, label) => `<div class="stat-tile"><b>${n}</b><span>${label}</span></div>`;
  let html = `<div class="stat-tiles">${tile(todo.length, 'da ascoltare')}${tile(done.length, done.length === 1 ? 'ascoltato' : 'ascoltati')}${tile(favs, favs === 1 ? 'preferito' : 'preferiti')}</div>`;

  // Tempo: ascoltato e ancora da ascoltare
  const doneMs = sumMs(done), todoMs = sumMs(todo);
  html += '<h3>Tempo</h3>';
  if (doneMs || todoMs) {
    if (doneMs) {
      const funDone = [];
      if (doneMs >= DAY) funDone.push(`<b>${fmtNum(doneMs / DAY)} giorni</b> di fila, senza dormire`);
      const lineDone = funLine('done', doneMs);
      if (lineDone) funDone.push(lineDone);
      html += `<p class="stat-big"><b>${fmtHM(doneMs)}</b> di musica ascoltata</p>
        ${funDone.length ? `<ul class="fun">${funDone.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}
        <p class="hint">Contando ogni album una volta, dall'inizio alla fine.${missingNote(done)}</p>`;
    }
    if (todoMs) {
      const fun = [];
      if (todoMs >= DAY) fun.push(`<b>${fmtNum(todoMs / DAY)} giorni</b> di fila, senza dormire`);
      if (todoMs >= 2 * 3600000) fun.push(`un'ora al giorno: <b>${fmtSpan(todoMs / 3600000)}</b>`);
      // Un paragone diverso a ogni apertura delle statistiche
      const lineTodo = funLine('todo', todoMs);
      if (lineTodo) fun.push(lineTodo);
      html += `<p class="stat-big"><b>${fmtHM(todoMs)}</b> ancora da ascoltare</p>
        ${fun.length ? `<ul class="fun">${fun.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}
        ${known(todo) < todo.length ? `<p class="hint">${missingNote(todo).trim()}</p>` : ''}`;
    } else if (todo.length) {
      html += `<p class="hint">${todo.length === 1 ? "L'album da ascoltare non ha" : `I ${todo.length} album da ascoltare non hanno`} ancora la durata.</p>`;
    }
  } else {
    html += `<p class="hint">${infoBusy ? 'Sto cercando le durate degli album: torna tra poco.' : 'Le durate arrivano insieme ai brani degli album: per ora non ne ho.'}</p>`;
  }

  // Ascoltati negli ultimi 12 mesi (mese corrente compreso): album o ore
  const d0 = new Date(now);
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(d0.getFullYear(), d0.getMonth() - 11 + i, 1);
    return { y: d.getFullYear(), m: d.getMonth(), n: 0, ms: 0 };
  });
  for (const a of done) {
    const d = new Date(a.listenedAt);
    const slot = months.find((x) => x.y === d.getFullYear() && x.m === d.getMonth());
    if (slot) { slot.n++; slot.ms += a.durationMs > 0 ? a.durationMs : 0; }
  }
  const hours = chartMode === 'ore';
  const yearN = months.reduce((s, x) => s + x.n, 0), yearMs = months.reduce((s, x) => s + x.ms, 0);
  html += `<div class="stat-head"><h3>Ascoltati per mese</h3>
    <div class="seg small" role="radiogroup" aria-label="Misura">
      <button data-act="chart-mode" data-key="album" role="radio">Album</button><button data-act="chart-mode" data-key="ore" role="radio">Ore</button>
    </div></div>`;
  html += columns('month', months.map((x) => ({
    v: hours ? x.ms / 3600000 : x.n,
    short: MONTHS[x.m].charAt(0).toUpperCase(),
    label: `${MONTHS_LONG[x.m]} ${x.y}: ${plural(x.n, 'album', 'album')}${x.ms ? ` · ${fmtHM(x.ms)}` : ''}`.replace(/^./, (c) => c.toUpperCase()),
  })), hours ? `${fmtHM(yearMs)} negli ultimi 12 mesi` : `${plural(yearN, 'album', 'album')} negli ultimi 12 mesi`,
  (v) => (hours ? fmtNum(v, v < 10 ? 1 : 0) : String(v)));

  // Ritmo: aggiunti e ascoltati negli ultimi 3 mesi, e dove porta
  const since = now - 91 * DAY;
  const added3 = albums.filter((a) => a.addedAt >= since).length;
  const heard3 = done.filter((a) => a.listenedAt >= since).length;
  html += '<h3>Il ritmo della lista</h3>';
  if (added3 || heard3) {
    const perAdd = added3 / 3, perHeard = heard3 / 3, net = perHeard - perAdd;
    html += hbars([
      { label: 'Aggiunti', parts: [perAdd], right: `${fmtNum(perAdd)} al mese` },
      { label: 'Ascoltati', parts: [perHeard], right: `${fmtNum(perHeard)} al mese` },
    ]);
    html += `<p class="stat-line">${net > 0.05 && todo.length
      ? `Di questo passo svuoti la lista in <b>${fmtSpan((todo.length / net) * 30.4)}</b>.`
      : net < -0.05
      ? `Aggiungi più di quanto ascolti: la lista cresce di circa <b>${fmtNum(-net)} album al mese</b>. Di questo passo non la svuoterai mai.`
      : todo.length ? 'Aggiungi quanto ascolti: la lista resta più o meno uguale.' : 'Lista vuota: hai ascoltato tutto.'}</p>
      <p class="hint">Media degli ultimi 3 mesi.</p>`;
  } else {
    html += '<p class="hint">Negli ultimi 3 mesi non hai aggiunto né ascoltato album.</p>';
  }

  // Tempo tra l'aggiunta e l'ascolto
  const waits = done.filter((a) => a.addedAt && a.listenedAt >= a.addedAt).map((a) => a.listenedAt - a.addedAt).sort((a, b) => a - b);
  html += '<h3>Prima di ascoltarli</h3>';
  if (waits.length) {
    const mean = waits.reduce((s, w) => s + w, 0) / waits.length;
    const median = waits.length % 2 ? waits[(waits.length - 1) / 2] : (waits[waits.length / 2 - 1] + waits[waits.length / 2]) / 2;
    html += `<p class="stat-line">In media passano <b>${fmtDays(mean)}</b> tra quando aggiungi un album e quando lo ascolti.</p>
      <p class="hint">Metà degli album li ascolti entro ${fmtDays(median)}.</p>`;
  } else {
    html += '<p class="hint">Quando avrai ascoltato qualche album, qui vedrai quanto tempo restano in lista.</p>';
  }

  // In attesa da più tempo
  const oldest = [...todo].sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0)).slice(0, 3);
  if (oldest.length) {
    html += `<h3>In attesa da più tempo</h3><div class="stat-albums">${oldest.map((a) => albumLine(a, `da ${fmtDays(now - a.addedAt)}`)).join('')}</div>`;
  }

  // Il più lungo e il più corto tra gli ascoltati
  const timed = done.filter((a) => a.durationMs > 0).sort((a, b) => b.durationMs - a.durationMs);
  if (timed.length >= 2) {
    html += `<h3>Il più lungo e il più corto</h3><div class="stat-albums">
      ${albumLine(timed[0], fmtHM(timed[0].durationMs))}${albumLine(timed[timed.length - 1], fmtHM(timed[timed.length - 1].durationMs))}</div>`;
  }

  // Decenni di uscita: ascoltati (scuro) e da ascoltare (chiaro)
  const byDecade = new Map();
  for (const a of albums) {
    const y = yearOf(a, 0);
    if (!y) continue;
    const d = Math.floor(y / 10) * 10;
    const e = byDecade.get(d) || { done: 0, todo: 0 };
    if (a.listenedAt) e.done++; else e.todo++;
    byDecade.set(d, e);
  }
  if (byDecade.size) {
    const rows = [...byDecade.entries()].sort((a, b) => a[0] - b[0]);
    const gaps = done.filter((a) => yearOf(a, 0)).map((a) => new Date(a.listenedAt).getFullYear() - yearOf(a, 0));
    const oldestAlbum = albums.filter((a) => yearOf(a, 0)).sort((a, b) => yearOf(a, 0) - yearOf(b, 0))[0];
    html += `<h3>Decenni</h3>
      <p class="legend"><span><i class="s0"></i>ascoltati</span><span><i class="s1"></i>da ascoltare</span></p>
      ${hbars(rows.map(([d, e]) => ({ label: decadeName(d), parts: [e.done, e.todo], right: `${e.done + e.todo}` })))}
      ${gaps.length ? `<p class="stat-line">In media ascolti musica uscita <b>${plural(Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length), 'anno', 'anni')}</b> prima.</p>` : ''}
      ${oldestAlbum ? `<p class="hint">Il più vecchio in lista: ${esc(oldestAlbum.title)}${oldestAlbum.artist ? `, ${esc(oldestAlbum.artist)}` : ''} (${esc(oldestAlbum.year)}).</p>` : ''}`;
  }

  // Generi
  const byGenre = new Map();
  for (const a of albums) if (a.genre) byGenre.set(a.genre, (byGenre.get(a.genre) || 0) + 1);
  if (byGenre.size) {
    const sorted = [...byGenre.entries()].sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0]));
    const top = sorted.slice(0, 6);
    const rest = sorted.slice(6).reduce((s, [, n]) => s + n, 0);
    if (rest) top.push(['Altri', rest]);
    const withGenre = albums.filter((a) => a.genre).length;
    html += `<h3>Generi</h3>${hbars(top.map(([g, n]) => ({ label: g, parts: [n], right: String(n) })))}
      ${withGenre < albums.length ? `<p class="hint">Su ${withGenre} album su ${albums.length}: MusicBrainz non dà il genere, e puoi scriverlo tu da Modifica.</p>` : ''}`;
  }

  // Abitudini: settimane di fila e giorno della settimana
  if (done.length) {
    const { current, best } = weekStreaks(done.map((a) => a.listenedAt), now);
    const days = WEEKDAYS.map((name) => ({ name, n: 0 }));
    for (const a of done) days[(new Date(a.listenedAt).getDay() + 6) % 7].n++;
    const top = days.reduce((m, d) => (d.n > m.n ? d : m), days[0]);
    html += `<h3>Abitudini</h3>
      <p class="stat-line">${current ? `Ascolti qualcosa da <b>${plural(current, 'settimana', 'settimane')} di fila</b>` : 'Questa settimana e la scorsa non hai spuntato album'}${current > 1 && current === best ? ': è il tuo record.' : best > 1 ? `; il record è ${plural(best, 'settimana', 'settimane')}.` : '.'}</p>
      ${columns('day', days.map((d) => ({ v: d.n, short: d.name.charAt(0).toUpperCase(), label: `${d.name.replace(/^./, (c) => c.toUpperCase())}: ${plural(d.n, 'album', 'album')}` })),
        `Il giorno in cui spunti più album: ${top.name}`, (v) => String(v))}`;
  }

  // Artisti con più album (tra da ascoltare e ascoltati)
  const byArtist = new Map();
  for (const a of albums) {
    const key = tokens(a.artist).join(' ');
    if (!key) continue;
    const e = byArtist.get(key) || { name: a.artist, n: 0, done: 0 };
    e.n++; if (a.listenedAt) e.done++;
    byArtist.set(key, e);
  }
  const topArtists = [...byArtist.values()].filter((e) => e.n > 1).sort((a, b) => b.n - a.n || collator.compare(a.name, b.name)).slice(0, 5);
  html += '<h3>Artisti più presenti</h3>';
  html += topArtists.length
    ? `<ol class="artist-list">${topArtists.map((e) => `<li><span class="artist-name">${esc(e.name)}</span>
        <span class="artist-n">${e.n} album${e.done ? ` · ${e.done} ascoltat${e.done === 1 ? 'o' : 'i'}` : ''}</span></li>`).join('')}</ol>`
    : '<p class="hint">Nessun artista con più di un album, per ora.</p>';

  // Dati mancanti: si possono completare a mano
  const missing = albums.filter((a) => !(a.durationMs > 0));
  if (infoBusy) {
    html += `<p class="hint stat-foot"><span class="spinner"></span>Sto cercando durate e generi: ${albums.length - missing.length} album su ${albums.length}…</p>`;
  } else if (missing.length) {
    html += `<button class="nav-row stat-missing" data-act="stats-missing">
      <span>${plural(missing.length, 'album senza durata', 'album senza durata')}</span><span class="sm-cta">Completa</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6l6 6-6 6"/></svg></button>`;
  }

  $('#stats-body').innerHTML = html;
  markSeg('chart-mode', chartMode);
}

// Tocca una colonna per leggerne il valore; un altro tocco sulla stessa torna alla didascalia iniziale
function showMonth(el) {
  const caption = document.getElementById(el.dataset.cap);
  const on = !el.classList.contains('on');
  el.parentElement.querySelectorAll('.month.on').forEach((m) => m.classList.remove('on'));
  el.classList.toggle('on', on);
  caption.textContent = on ? el.dataset.label : caption.dataset.default;
}

// Elenco degli album senza durata: toccandone uno si apre Modifica, pronto per scrivere i dati
function openMissingList() {
  const missing = albums.filter((a) => !(a.durationMs > 0)).sort((a, b) => collator.compare(a.title, b.title));
  $('#sheet').innerHTML = `
    <p class="sheet-kicker">Album senza durata</p>
    <p class="pick-hint">Non li ho trovati, oppure le fonti non danno la durata. Se vuoi, aggiungi tu i brani con la loro durata.</p>
    <div class="stat-albums">${missing.map((a) => albumLine(a, '', 'edit-info', ICON.edit)).join('')}</div>`;
  openLayer('sheet');
}

/* ---------- Aggiornamenti (release GitHub) ---------- */
const REPO = 'dariotronic/ascolti-todo';
const K_UPDATE = 'update.v1';
const CHECK_EVERY = 60 * 60 * 1000; // controllo automatico al massimo una volta l'ora
let appVersion = '';

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
      return `<div class="upd-row"><span>Nuova versione ${v} disponibile</span><span class="banner-actions">
        ${upd.latest.notes ? '<button data-act="upd-notes" class="muted-btn">Novità</button>' : ''}<button data-act="upd-download">Aggiorna</button></span></div>`;
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
      notes: String(j.body || '').slice(0, 20000), // le novità scritte nella release (www/novita.js)
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
    st.textContent = `Controllo non riuscito (${e.message === 'TIMEOUT' ? 'nessuna risposta' : e.message}).`;
  }
}

/* ---------- Novità ---------- */
// Markdown semplice delle note (## titoli, - elenchi, **grassetto**, *corsivo*), sempre passato da esc()
function mdHtml(md) {
  const inline = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*]+)\*/g, '<i>$1</i>');
  let html = '', list = false;
  for (const raw of String(md || '').split(/\r?\n/)) {
    const line = raw.trim();
    const li = line.match(/^[-*] (.*)/);
    if (li) { if (!list) { html += '<ul>'; list = true; } html += `<li>${inline(li[1])}</li>`; continue; }
    if (list) { html += '</ul>'; list = false; }
    if (!line) continue;
    const h = line.match(/^#{1,4} (.*)/);
    html += h ? `<h4>${inline(h[1])}</h4>` : `<p>${inline(line)}</p>`;
  }
  return html + (list ? '</ul>' : '');
}

// Pannello con le novità; withUpdate: in fondo c'è anche "Aggiorna" (dall'avviso di una versione nuova)
function openNotes(title, md, withUpdate = false) {
  $('#sheet').innerHTML = `
    <p class="sheet-kicker">${esc(title)}</p>
    <div class="notes">${mdHtml(md)}</div>
    <div class="notes-actions">${withUpdate
      ? '<button class="ghost" data-act="close">Più tardi</button><button class="primary" data-act="upd-download">Aggiorna</button>'
      : '<button class="primary" data-act="close">Ho capito</button>'}</div>`;
  openLayer('sheet');
}

// Al primo avvio dopo un aggiornamento: le novità della versione installata, una volta sola.
// Chi installa l'app da zero (nessuna versione vista e lista vuota) non le vede: per lui è tutto nuovo.
function showWhatsNew() {
  if (!appVersion || settings.seenVersion === appVersion) return;
  const notes = typeof NOVITA === 'object' ? NOVITA[appVersion] : '';
  if (notes && (settings.seenVersion || albums.length)) {
    if (stack.length) return; // si è aperto qualcos'altro (per esempio un link condiviso): sarà per il prossimo avvio
    openNotes(`Novità della versione ${appVersion}`, notes);
  }
  settings.seenVersion = appVersion;
  saveSettings();
}

/* ---------- Tema e dimensione del testo ---------- */
const systemDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const themePref = () => (['light', 'system'].includes(settings.theme) ? settings.theme : 'dark');

function applyTheme() {
  const pref = themePref();
  const theme = pref === 'system' ? (systemDark && !systemDark.matches ? 'light' : 'dark') : pref;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('theme', pref); // letto in <head> per evitare il lampo all'avvio
  markSeg('theme', pref);
  // Icone della barra di stato: chiare su tema scuro, scure su tema chiaro
  try { Plugins.SystemBars?.setStyle({ style: theme === 'dark' ? 'DARK' : 'LIGHT' })?.catch?.(() => {}); } catch {}
}
systemDark?.addEventListener?.('change', () => { if (themePref() === 'system') applyTheme(); });

const FONT_SCALES = [0.9, 1, 1.15, 1.3];
function applyFontScale() {
  const s = FONT_SCALES.includes(+settings.fontScale) ? +settings.fontScale : 1;
  document.documentElement.style.setProperty('--fs', s);
  localStorage.setItem('fontScale', s);
  markSeg('font', String(s));
  fitHeader();
}

// Selettori a segmenti delle impostazioni: data-act=<name>, data-key=<valore>
function markSeg(name, value) {
  document.querySelectorAll(`[data-act="${name}"]`).forEach((b) => {
    const on = b.dataset.key === String(value);
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on);
  });
}

/* ---------- Vista: lista o schede ---------- */
function applyView() {
  const grid = settings.view === 'grid';
  const cols = settings.cols === 3 ? 3 : 2;
  const list = $('#list');
  list.classList.toggle('grid', grid);
  list.classList.toggle('cols-3', grid && cols === 3);
  $('#view-switch').checked = grid;
  $('#cols-row').hidden = !grid;
  markSeg('cols', String(cols));
}

/* ---------- Pannello di scelta (al posto dei menu a tendina di Android) ---------- */
// options: [{ key, label, dot? }]; dot: colore del pallino, 'none' = cerchio vuoto, assente = niente pallino.
// Ogni voce ha data-act=act e data-key=key: la scelta la gestisce il click handler.
function openPicker({ kicker, hint, options, current, act }) {
  const row = (o) => `
    <button class="pick-option ${o.key === current ? 'on' : ''}" data-act="${act}" data-key="${esc(o.key)}"
      role="radio" aria-checked="${o.key === current}">
      ${o.dot ? `<i class="pick-dot" style="${o.dot !== 'none' ? `background:${o.dot}` : ''}"></i>` : ''}
      <span>${esc(o.label)}</span>
      ${o.key === current ? ICON.check : ''}
    </button>`;
  $('#sheet').innerHTML = `
    <p class="sheet-kicker">${esc(kicker)}</p>
    ${hint ? `<p class="pick-hint">${esc(hint)}</p>` : ''}
    <div class="pick-list" role="radiogroup">${options.map(row).join('')}</div>`;
  openLayer('sheet');
  $('#sheet').dataset.tool = '1'; // un menu: trascinato in giù chiude solo sé stesso
}

// App di musica preferita: le voci vengono dallo stesso elenco usato per "Cerca su …"
function renderMusicAppLabel() {
  $('#music-app-label').textContent = MUSIC_APPS[settings.musicApp]?.name || 'Nessuna';
}

function openMusicAppPicker() {
  openPicker({
    kicker: 'App di musica',
    hint: 'Dove aprire la ricerca di un album con «Cerca su …».',
    current: MUSIC_APPS[settings.musicApp] ? settings.musicApp : '',
    act: 'set-music-app',
    options: [{ key: '', label: 'Nessuna', dot: 'none' },
      ...Object.entries(MUSIC_APPS).map(([k, app]) => ({ key: k, label: app.name, dot: app.color }))],
  });
}

function setMusicApp(key) {
  settings.musicApp = MUSIC_APPS[key] ? key : '';
  saveSettings();
  renderMusicAppLabel();
  closeLayer();
  toast(settings.musicApp ? `Cercherai su ${MUSIC_APPS[settings.musicApp].name}` : 'Nessuna app di musica');
}

// Ordinamento delle liste: short = etichetta sopra la lista, label = voce nel pannello
const SORT_OPTIONS = [
  { key: 'added', short: 'Recenti', label: () => (tab === 'done' ? 'Ascoltati di recente' : 'Aggiunti di recente') },
  { key: 'artist', short: 'Artista', label: () => 'Artista, dalla A alla Z' },
  { key: 'title', short: 'Titolo', label: () => 'Titolo, dalla A alla Z' },
  { key: 'year-asc', short: 'Anno: vecchi', label: () => 'Anno, dal più vecchio' },
  { key: 'year-desc', short: 'Anno: nuovi', label: () => 'Anno, dal più nuovo' },
];

function openSortPicker() {
  const current = settings[sortKey()];
  openPicker({
    kicker: tab === 'done' ? 'Ordina gli ascoltati' : 'Ordina gli album da ascoltare',
    current: SORT_OPTIONS.some((o) => o.key === current) ? current : 'added',
    act: 'set-sort',
    options: SORT_OPTIONS.map((o) => ({ key: o.key, label: o.label() })),
  });
}

function setSort(key) {
  settings[sortKey()] = SORT_OPTIONS.some((o) => o.key === key) ? key : 'added';
  saveSettings();
  listScrollY = 0; // nuovo ordine: si riparte dall'inizio della lista
  closeLayer();
  render();
  window.scrollTo(0, 0);
}

$('#view-switch').addEventListener('change', (e) => {
  settings.view = e.target.checked ? 'grid' : 'list';
  saveSettings(); applyView();
});

/* ---------- "Condividi → Ascolti" da altre app ---------- */
// Album letto dal link condiviso: compare in cima ai risultati della ricerca
let linkResult = null;

// Come un normale Chrome per Android: i siti musicali rispondono con la pagina completa di metadati
// (alla WebView dell'app, Spotify risponde con la pagina che apre la sua app)
const BROWSER_UA = 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

// Legge un link e ne ricava l'album ({ album }) o almeno un testo da cercare ({ query }); null se non c'è niente
async function readLink(url) {
  let parsed = null;
  try {
    const r = await withTimeout(fetch(url, { headers: { Accept: 'text/html', 'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8', 'User-Agent': BROWSER_UA } }), 12000);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    // Il sito si riconosce dal link, non dall'indirizzo finale dopo eventuali reindirizzamenti
    parsed = parseAlbumPage(url, await withTimeout(r.text(), 12000));
  } catch {}
  if (parsed?.album) return parsed;
  const query = parsed?.query || queryFromUrl(url);
  return query ? { query } : null;
}

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
    $('#q').value = String(text).trim().slice(0, 120); syncClear(); renderPasteButton();
    runSearch();
    return;
  }
  $('#q').value = ''; syncClear(); renderPasteButton();
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
  let read = null;
  try { read = await readLink(url); } finally { $('#paste-link').disabled = false; }
  status.textContent = '';
  const album = read?.album;
  if (!album) { showLinkSearch(read, url); return; }

  const id = `link:${album.sourceId}`;
  const existing = findExisting(album, id);
  if (existing) { toast(alreadyText(existing)); return; }
  const a = { id, ...album, addedAt: Date.now(), listenedAt: null };
  albums.push(a);
  saveAlbums();
  while (stack.length) closeLayer();
  tab = 'todo'; render();
  cacheCovers(); enrichAlbums();
  toast(`Aggiunto: ${a.title}${a.artist ? ` · ${a.artist}` : ''}`, () => {
    albums = albums.filter((x) => x !== a); saveAlbums(); render();
  });
}

// A ricerca vuota: il pulsante del link copiato e le ricerche recenti, per non mescolarsi ai risultati
function renderPasteButton() {
  $('#paste-row').hidden = !!$('#q').value.trim();
  renderRecent();
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
    case 'select-listened': markSelected(); break;
    case 'cols': settings.cols = +el.dataset.key; saveSettings(); applyView(); break;
    case 'theme': settings.theme = el.dataset.key; saveSettings(); applyTheme(); break;
    case 'font': settings.fontScale = +el.dataset.key; saveSettings(); applyFontScale(); break;
    case 'toggle': e.stopPropagation(); toggleListened(id, el.closest('.row')); break;
    case 'detail': openDetail(id); break;
    case 'sheet-toggle': closeLayer(); toggleListened(id); break;
    case 'delete': closeLayer(); deleteOne(id); break;
    case 'fav': toggleFav(id, el); break;
    case 'tracks-toggle': toggleTracks(el); break;
    case 'track-add': {
      form.tracksTouched = true;
      $('#te-list').insertAdjacentHTML('beforeend', trackRowHtml());
      updateTrackSum();
      // La riga nuova si mette in vista; la tastiera si apre solo toccando il titolo
      $('#te-list .te-row:last-child').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      break;
    }
    case 'track-remove': form.tracksTouched = true; el.closest('.te-row').remove(); updateTrackSum(); break;
    case 'tracks-reset': resetFormTracks(el); break;
    case 'form-cancel': cancelForm(); break;
    case 'dial': openDial(el); break;
    case 'dial-step': setDial(dial.secs + +el.dataset.d); break;
    case 'dial-ok': confirmDial(); break;
    case 'dial-cancel': closeLayer(); break;
    case 'fav-filter': favOnly = !favOnly; render(); window.scrollTo(0, 0); break;
    case 'close': goBack(); break;
    case 'open-search':
      openLayer('search'); renderResults(); syncClear(); renderPasteButton();
      setTimeout(() => $('#q').focus(), 60);
      break;
    case 'add': addResult(+el.dataset.i); break;
    case 'preview': openPreview(+el.dataset.i); break;
    case 'preview-add': closeLayer(); addResult(+el.dataset.i); break;
    case 'recent':
      $('#q').value = el.dataset.q; syncClear(); renderPasteButton(); linkResult = null;
      clearTimeout(searchTimer); runSearch();
      break;
    case 'recent-remove': forgetSearch(el.dataset.q); break;
    case 'recent-clear': forgetSearch(null); break;
    case 'clear-search': // "x": svuota testo e risultati, la tastiera resta aperta per una nuova ricerca
      clearTimeout(searchTimer); searchSeq++;
      $('#q').value = ''; syncClear(); linkResult = null; renderPasteButton();
      results = []; renderResults(); $('#status').textContent = '';
      $('#q').focus();
      break;
    case 'open-manual': openForm('add'); break;
    case 'edit':
    case 'edit-note': { // dalla scheda dell'album: la scheda si allunga e diventa il modulo
      const a = albums.find((x) => x.id === id);
      const top = $('#sheet').getBoundingClientRect().top;
      ghostOut($('#sheet'), 'fade-out .22s ease-in forwards', $('#sheet').scrollTop);
      closeLayer({ ghost: false });
      if (a) openForm('edit', a, act === 'edit-note' ? 'note' : '', { top, detail: true });
      break;
    }
    case 'pick-cover': openCoverPicker(); break;
    case 'random': pickRandom(); break;
    case 'paste-link': pasteLink(); break;
    case 'copy-album': copyAlbum(id); break;
    case 'pick-music-app': openMusicAppPicker(); break;
    case 'set-music-app': setMusicApp(el.dataset.key); break;
    case 'pick-sort': openSortPicker(); break;
    case 'set-sort': setSort(el.dataset.key); break;
    case 'random-again': closeLayer(); pickRandom(); break;
    case 'choose-cover': chooseCover(+el.dataset.i); break;
    case 'remove-cover': form.cover = ''; renderFormCover(); break;
    case 'clear-filter':
      filterText = ''; $('#filter').value = ''; $('#filter-clear').hidden = true; render();
      break;
    case 'backup-docs': saveBackup('documents'); break;
    case 'backup-share': saveBackup('share'); break;
    case 'backup-later': // il promemoria torna tra una settimana
      settings.backupSnooze = Date.now() + 7 * DAY; saveSettings(); renderBackupBanner();
      break;
    case 'backup-open':
      $('[data-act="open-settings"]').click();
      setTimeout(() => $('#backup-section').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      break;
    case 'open-settings':
      $('#backup-status').textContent = '';
      renderBackupInfo();
      renderMusicAppLabel();
      $('#app-version').textContent = appVersion ? `Versione installata: ${appVersion}` : 'Versione non disponibile nel browser.';
      $('#upd-status').textContent = '';
      openLayer('settings');
      break;
    case 'open-stats': funPick = {}; renderStats(); openLayer('stats'); break;
    case 'month': showMonth(el); break;
    case 'chart-mode': chartMode = el.dataset.key === 'ore' ? 'ore' : 'album'; renderStats(); break;
    case 'stats-missing': openMissingList(); break;
    case 'edit-info': { // dall'elenco degli album senza durata: il pannello si allunga e diventa il modulo
      const a = albums.find((x) => x.id === id);
      const top = $('#sheet').getBoundingClientRect().top;
      ghostOut($('#sheet'), 'fade-out .22s ease-in forwards', $('#sheet').scrollTop);
      closeLayer({ ghost: false });
      if (a) openForm('edit', a, '', { top });
      break;
    }
    case 'pick-genre': openGenrePicker(); break;
    case 'set-genre': setGenre(el.dataset.key); break;
    case 'genre-new': showNewGenre(el); break;
    case 'genre-new-ok': addNewGenre(); break;
    case 'check-update': manualUpdateCheck(); break;
    case 'upd-download': if (stack[stack.length - 1] === 'sheet') closeLayer(); downloadUpdate(); break;
    case 'upd-notes': openNotes(`Novità della versione ${upd.latest.version}`, upd.latest.notes, true); break;
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
  if (e.key === 'Enter') { clearTimeout(searchTimer); runSearch(); rememberSearch(e.target.value); e.target.blur(); }
});

$('#manual-form').addEventListener('submit', submitForm);
// Elenco dei brani nel modulo: riepilogo aggiornato mentre scrivi
$('#te-list').addEventListener('input', () => {
  form.tracksTouched = true;
  updateTrackSum();
});

/* ---------- Pannelli: trascina verso il basso per chiudere ---------- */
// I pannelli che arrivano dal basso (scheda, modulo aperto dalla scheda, ghiera, menu, anteprime) seguono il dito
// verso il basso. Lasciati oltre un quarto della loro altezza, o con un colpo veloce, si chiudono: e con loro
// tutti i pannelli aperti sotto, fino alla lista o alla schermata intera da cui si era partiti (statistiche,
// ricerca, impostazioni). Fanno eccezione i menu di scelta e la ghiera, che chiudono solo sé stessi e
// riportano al pannello da cui erano stati aperti. Altrimenti tornano al loro posto. Il gesto parte solo se il pannello è in cima
// (prima si scorre su, poi si tira giù) e non dal cerchio della ghiera, dove il dito gira il tempo. Vale anche
// partendo da un campo di testo: un tocco semplice ci mette il cursore come sempre, un trascinamento chiude.
const isPanel = (id) => id === 'sheet' || id === 'dial' || (id === 'manual' && $('#manual').classList.contains('as-sheet'));
// Strumenti di scelta aperti sopra un altro pannello (menu, ghiera): il gesto chiude solo loro, come Annulla
const isTool = (id) => id === 'dial' || (id === 'sheet' && !!$('#sheet').dataset.tool);

function closePanels() {
  let closed = false;
  while (stack.length && isPanel(stack[stack.length - 1])) { closeLayer(); closed = true; }
  return closed;
}

(() => {
  let drag = null;
  const topPanel = (target) => {
    const id = stack[stack.length - 1];
    if (!isPanel(id)) return null;
    const el = $('#' + id);
    return el.contains(target) ? { el, id } : null;
  };
  // Qualcosa tra il dito e il pannello è già scorso in giù: allora il gesto è uno scorrimento, non una chiusura
  const scrolled = (target, panel) => {
    for (let n = target; n && n !== panel.parentElement; n = n.parentElement) if (n.scrollTop > 0) return true;
    return false;
  };
  const cleanup = (el, bd) => {
    el.style.transform = ''; el.style.transition = ''; el.style.animation = '';
    if (bd) { bd.style.opacity = ''; bd.style.transition = ''; }
  };

  document.addEventListener('touchstart', (e) => {
    drag = null;
    if (e.touches.length !== 1) return;
    const panel = topPanel(e.target);
    if (!panel || e.target.closest('#dial-knob') || scrolled(e.target, panel.el)) return;
    const p = e.touches[0];
    drag = { ...panel, bd: backdropOf(panel.id) ? $(backdropOf(panel.id)) : null, x: p.clientX, y: p.clientY, dy: 0, on: false, lastY: p.clientY, lastT: e.timeStamp, v: 0 };
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!drag) return;
    const p = e.touches[0], dx = p.clientX - drag.x, dy = p.clientY - drag.y;
    if (!drag.on) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) { drag = null; return; } // verso l'alto o di lato: non è per noi
      drag.on = true;
      drag.el.style.animation = 'none';
      drag.el.style.transition = 'none';
    }
    e.preventDefault();
    drag.dy = Math.max(0, dy);
    drag.v = (p.clientY - drag.lastY) / Math.max(1, e.timeStamp - drag.lastT);
    drag.lastY = p.clientY; drag.lastT = e.timeStamp;
    drag.el.style.transform = `translateY(${drag.dy}px)`;
    if (drag.bd) drag.bd.style.opacity = String(Math.max(0, 1 - drag.dy / drag.el.offsetHeight));
  }, { passive: false });

  const end = () => {
    const d = drag;
    drag = null;
    if (!d?.on) return;
    if (d.dy > d.el.offsetHeight * 0.25 || d.v > 0.5) {
      // Le copie che scendono partono da dove il dito ha lasciato il pannello
      if (isTool(d.id)) closeLayer(); else closePanels();
      cleanup(d.el, d.bd);
      return;
    }
    // Non abbastanza: il pannello torna su
    d.el.style.transition = 'transform .22s cubic-bezier(.2,.8,.3,1)';
    d.el.style.transform = '';
    if (d.bd) { d.bd.style.transition = 'opacity .22s'; d.bd.style.opacity = ''; }
    setTimeout(() => cleanup(d.el, d.bd), 240);
  };
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);
})();

// Tasto indietro di Android: chiude prima gli overlay
if (Plugins.App) {
  Plugins.App.addListener('backButton', () => {
    if (!goBack() && !exitSelection()) Plugins.App.minimizeApp();
  });
  // Anche quando l'app torna in primo piano (sempre con il limite orario)
  Plugins.App.addListener('resume', () => {
    if (themePref() === 'system') applyTheme();
    resumePendingInstall().catch(() => {});
    consumeShared();
    if (upd.phase !== 'downloading') checkUpdate().catch(() => {});
    cacheCovers(); enrichAlbums();
  });
}

load().then(async () => {
  applyTheme();
  applyFontScale();
  applyView();
  // Prima di disegnare la lista: così le copertine salvate si usano subito (senza aspettare oltre 2 secondi)
  await withTimeout(initCoverCache(), 2000).catch(() => {});
  render();
  renderBackupBanner();
  consumeShared();
  cacheCovers(); enrichAlbums();
  if (Plugins.App) {
    try { appVersion = (await Plugins.App.getInfo()).version; } catch {}
    showWhatsNew();
    checkUpdate().catch(() => {});
  }
});
