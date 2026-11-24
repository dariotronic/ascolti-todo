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
let settings = { spotifyId: '', spotifySecret: '', source: 'auto', theme: 'dark' };
let tab = 'todo';

async function load() {
  try { albums = JSON.parse((await store.get(K_ALBUMS)) || '[]'); } catch { albums = []; }
  try { Object.assign(settings, JSON.parse((await store.get(K_SETTINGS)) || '{}')); } catch {}
}
const saveAlbums = () => store.set(K_ALBUMS, JSON.stringify(albums));
const saveSettings = () => store.set(K_SETTINGS, JSON.stringify(settings));

/* ---------- Utilità ---------- */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SOURCE_NAME = { spotify: 'Spotify', deezer: 'Deezer', musicbrainz: 'MusicBrainz', manual: 'Manuale' };
const TYPE_NAME = { single: 'Singolo', ep: 'EP', compilation: 'Raccolta', live: 'Live' };

const ICON = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  open: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/></svg>',
};

function coverHtml(a) {
  const initial = esc((a.title || '?').trim().charAt(0).toUpperCase());
  return `<div class="cover">${a.cover ? `<img loading="lazy" src="${esc(a.cover)}" alt="">` : initial}</div>`;
}
// Copertina mancante (404): resta l'iniziale
document.addEventListener('error', (e) => {
  const img = e.target;
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
  $('#list').innerHTML = items.map((a) => `
    <li class="row" data-act="detail" data-id="${esc(a.id)}" data-title="${esc(a.title)}">
      ${coverHtml(a)}
      <div class="meta">
        <div class="title">${esc(a.title)}</div>
        <div class="sub">${esc(tab === 'done' ? `${a.artist} · ${fmtDate(a.listenedAt)}` : subLine(a))}</div>
      </div>
      <button class="check ${a.listenedAt ? 'on' : ''}" data-act="toggle" data-id="${esc(a.id)}"
        aria-label="${a.listenedAt ? 'Segna da ascoltare' : 'Segna come ascoltato'}"><i>${ICON.check}</i></button>
    </li>`).join('');

  const empty = $('#empty');
  empty.hidden = items.length > 0;
  empty.textContent = tab === 'todo'
    ? (albums.length ? 'Hai ascoltato tutto. Aggiungi qualcosa di nuovo.' : 'Nessun album in lista. Tocca + per aggiungerne uno.')
    : 'Gli album che spunti finiranno qui.';
}

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
function spotifySearchUrl(a) {
  return 'https://open.spotify.com/search/' + encodeURIComponent(`${a.title} ${a.artist}`);
}
function openDetail(id) {
  const a = albums.find((x) => x.id === id);
  if (!a) return;
  const links = [];
  if (a.url) links.push(`<a href="${esc(a.url)}" target="_blank" rel="noopener">${ICON.open}Apri su ${SOURCE_NAME[a.source]}</a>`);
  if (a.source !== 'spotify') links.push(`<a href="${esc(spotifySearchUrl(a))}" target="_blank" rel="noopener">${ICON.search}Cerca su Spotify</a>`);
  const meta = [a.year, TYPE_NAME[a.type], a.tracks ? `${a.tracks} brani` : '', a.listenedAt ? `ascoltato il ${fmtDate(a.listenedAt)}` : `aggiunto il ${fmtDate(a.addedAt)}`].filter(Boolean).join(' · ');
  $('#sheet').innerHTML = `
    <div class="head" data-title="${esc(a.title)}">
      ${coverHtml(a)}
      <div><h2>${esc(a.title)}</h2><div class="by">${esc(a.artist)}</div><div class="by">${esc(meta)}</div></div>
    </div>
    <div class="actions">
      <button data-act="sheet-toggle" data-id="${esc(a.id)}">${a.listenedAt ? ICON.undo + 'Rimetti tra da ascoltare' : ICON.check + 'Segna come ascoltato'}</button>
      ${links.join('')}
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

/* ---------- Motori di ricerca ---------- */
const UA = 'AlbumTracker/1.0 (personal app)';
const hasSpotify = () => !!(settings.spotifyId && settings.spotifySecret);

async function getJson(url, opts = {}) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

let spToken = null;
async function spotifyToken() {
  if (spToken && spToken.exp > Date.now()) return spToken.value;
  const j = await getJson('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${settings.spotifyId}:${settings.spotifySecret}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  spToken = { value: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return spToken.value;
}

const ENGINES = {
  async spotify(q) {
    const token = await spotifyToken();
    const j = await getJson(`https://api.spotify.com/v1/search?type=album&limit=10&q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return (j.albums?.items || []).filter(Boolean).map((a) => {
      const imgs = (a.images || []).slice().sort((x, y) => x.width - y.width);
      return {
        source: 'spotify', sourceId: a.id, title: a.name,
        artist: (a.artists || []).map((x) => x.name).join(', '),
        year: (a.release_date || '').slice(0, 4),
        cover: (imgs.find((i) => i.width >= 250) || imgs[imgs.length - 1] || {}).url || '',
        url: a.external_urls?.spotify || '', tracks: a.total_tracks,
        type: a.album_type === 'album' ? '' : a.album_type,
      };
    });
  },
  async deezer(q) {
    const j = await getJson(`https://api.deezer.com/search/album?limit=20&q=${encodeURIComponent(q)}`);
    if (j.error) throw new Error(j.error.message);
    return (j.data || []).map((a) => ({
      source: 'deezer', sourceId: String(a.id), title: a.title,
      artist: a.artist?.name || '', year: '',
      cover: a.cover_big || a.cover_medium || '', url: a.link || '', tracks: a.nb_tracks,
      type: a.record_type === 'album' ? '' : a.record_type,
    }));
  },
  async musicbrainz(q) {
    const j = await getJson(`https://musicbrainz.org/ws/2/release-group?fmt=json&limit=20&query=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    return (j['release-groups'] || []).map((g) => ({
      source: 'musicbrainz', sourceId: g.id, title: g.title,
      artist: (g['artist-credit'] || []).map((c) => (c.name || c.artist?.name || '') + (c.joinphrase || '')).join(''),
      year: (g['first-release-date'] || '').slice(0, 4),
      cover: `https://coverartarchive.org/release-group/${g.id}/front-250`,
      url: `https://musicbrainz.org/release-group/${g.id}`,
      type: ({ Single: 'single', EP: 'ep' })[g['primary-type']] || '',
    }));
  },
};

// Deezer non restituisce l'anno nella ricerca: lo recupera dopo l'aggiunta
async function enrichDeezerYear(a) {
  try {
    const j = await getJson(`https://api.deezer.com/album/${a.sourceId}`);
    if (j.release_date) { a.year = j.release_date.slice(0, 4); saveAlbums(); render(); }
  } catch {}
}

/* ---------- Schermata di ricerca ---------- */
let results = [];
let searchSeq = 0;
let searchTimer;

function renderSources() {
  const opts = [['auto', 'Auto'], ['spotify', 'Spotify'], ['deezer', 'Deezer'], ['musicbrainz', 'MusicBrainz']];
  $('#sources').innerHTML = opts.map(([k, label]) =>
    `<button data-act="source" data-src="${k}" class="${settings.source === k ? 'active' : ''}" ${k === 'spotify' && !hasSpotify() ? 'disabled' : ''}>${label}</button>`).join('');
}

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

async function runSearch() {
  const q = $('#q').value.trim();
  const status = $('#status');
  const seq = ++searchSeq;
  if (q.length < 2) { results = []; renderResults(); status.textContent = ''; return; }

  let chain;
  if (settings.source === 'auto') chain = [...(hasSpotify() ? ['spotify'] : []), 'deezer', 'musicbrainz'];
  else chain = [settings.source];

  status.innerHTML = '<span class="spinner"></span>Cerco…';
  let found = [], usedFrom = null, errors = [];
  for (const eng of chain) {
    try {
      found = await ENGINES[eng](q);
      if (seq !== searchSeq) return;
      if (found.length) { usedFrom = eng; break; }
    } catch (e) {
      errors.push(`${SOURCE_NAME[eng]}: ${e.message}`);
    }
  }
  if (seq !== searchSeq) return;
  results = found;
  renderResults();
  if (found.length) {
    const fellBack = settings.source === 'auto' && hasSpotify() && usedFrom !== 'spotify';
    status.textContent = `Risultati da ${SOURCE_NAME[usedFrom]}${fellBack ? ' (non trovato su Spotify)' : ''}`;
  } else {
    status.textContent = errors.length && errors.length === chain.length
      ? 'Ricerca non riuscita. Controlla la connessione.'
      : 'Nessun risultato.';
  }
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
    const a = { id, ...r, addedAt: Date.now(), listenedAt: null };
    albums.push(a);
    btn.classList.add('on'); btn.innerHTML = `<i>${ICON.check}</i>`;
    if (a.source === 'deezer') enrichDeezerYear(a);
  }
  saveAlbums();
}

/* ---------- Impostazioni ---------- */
async function saveSpotify() {
  settings.spotifyId = $('#sp-id').value.trim();
  settings.spotifySecret = $('#sp-secret').value.trim();
  spToken = null;
  await saveSettings();
  const st = $('#sp-status');
  if (!hasSpotify()) { st.textContent = 'Chiavi rimosse. La ricerca userà Deezer e MusicBrainz.'; return; }
  st.innerHTML = '<span class="spinner"></span>Verifico…';
  try { await spotifyToken(); st.textContent = 'Collegato a Spotify.'; }
  catch (e) { st.textContent = `Chiavi non valide (${e.message}).`; }
}

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

/* ---------- Eventi ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act, id } = el.dataset;
  switch (act) {
    case 'tab': tab = el.dataset.tab; render(); window.scrollTo(0, 0); break;
    case 'toggle': e.stopPropagation(); toggleListened(id, el.closest('.row')); break;
    case 'detail': openDetail(id); break;
    case 'sheet-toggle': closeLayer(); toggleListened(id); break;
    case 'delete': deleteAlbum(id, el); break;
    case 'close': closeLayer(); break;
    case 'open-search':
      renderSources(); openLayer('search'); renderResults();
      setTimeout(() => $('#q').focus(), 60);
      break;
    case 'source':
      settings.source = el.dataset.src; saveSettings(); renderSources(); runSearch();
      break;
    case 'add': addResult(+el.dataset.i, el); break;
    case 'open-manual': {
      const f = $('#manual-form'); f.reset();
      f.elements.title.value = $('#q').value.trim();
      openLayer('manual'); setTimeout(() => f.elements.title.focus(), 60);
      break;
    }
    case 'open-settings':
      $('#sp-id').value = settings.spotifyId; $('#sp-secret').value = settings.spotifySecret;
      $('#sp-status').textContent = hasSpotify() ? 'Chiavi salvate.' : '';
      $('#backup').value = '';
      $('#app-version').textContent = appVersion ? `Versione installata: ${appVersion}` : 'Versione non disponibile nel browser.';
      $('#upd-status').textContent = '';
      openLayer('settings');
      break;
    case 'check-update': manualUpdateCheck(); break;
    case 'upd-download': downloadUpdate(); break;
    case 'upd-install': installUpdate(); break;
    case 'save-spotify': saveSpotify(); break;
    case 'export': $('#backup').value = JSON.stringify(albums); $('#backup').select(); break;
    case 'import': importBackup(); break;
  }
});

$('#q').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 450); });
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
    if (!closeLayer()) Plugins.App.minimizeApp();
  });
  // Anche quando l'app torna in primo piano (sempre con il limite orario)
  Plugins.App.addListener('resume', () => {
    resumePendingInstall().catch(() => {});
    if (upd.phase !== 'downloading') checkUpdate().catch(() => {});
  });
}

load().then(async () => {
  applyTheme();
  render();
  if (Plugins.App) {
    try { appVersion = (await Plugins.App.getInfo()).version; } catch {}
    checkUpdate().catch(() => {});
  }
});
