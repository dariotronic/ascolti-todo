// Screenshot del README: app vera (www/) in Edge headless, schermo da telefono emulato via DevTools.
// Uso: node capture.mjs <cartella www> <cartella di uscita> <demo.json>
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , WWW, OUT, DEMO] = process.argv;
mkdirSync(OUT, { recursive: true });
const demo = JSON.parse(readFileSync(DEMO, 'utf8'));
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9444;
const W = 412, H = 915, DPR = 2;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'edge-shots-'))}`, '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });

let targets;
for (let i = 0; i < 50; i++) {
  try { targets = await (await fetch(`http://localhost:${PORT}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch {}
  await wait(200);
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let seq = 0; const pending = new Map(); const events = [];
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method) events.push(d.method);
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; pending.set(id, (d) => (d.error ? rej(new Error(method + ': ' + d.error.message)) : res(d.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const loaded = async () => { for (let i = 0; i < 100; i++) { if ((await evaluate('document.readyState')) === 'complete') return; await wait(50); } };

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
const URL_APP = pathToFileURL(join(WWW, 'index.html')).href;

// Album di esempio: in "Da ascoltare" i primi, "Ascoltati" gli ultimi due
const now = Date.now();
const albums = demo.map((a, i) => ({
  id: 'demo' + i, source: 'itunes', sourceId: String(i), title: a.title, artist: a.artist, year: a.year, cover: a.cover, type: '',
  addedAt: now - i * 3600e3, listenedAt: i >= demo.length - 2 ? now - i * 86400e3 : null,
}));

async function shot(name, { settings = {}, setup = '', clip }) {
  await send('Page.navigate', { url: URL_APP });
  await loaded();
  const s = { theme: 'dark', view: 'list', cols: 2, sort: 'added', lastBackup: now, musicApp: '', ...settings };
  await evaluate(`localStorage.clear();
    localStorage.setItem('settings.v1', ${JSON.stringify(JSON.stringify(s))});
    localStorage.setItem('theme', ${JSON.stringify(s.theme)});
    localStorage.setItem('albums.v1', ${JSON.stringify(JSON.stringify(albums))}); true`);
  await send('Page.reload');
  await loaded();
  await wait(400);
  // Niente animazioni: ogni schermata è ferma e nitida
  await evaluate(`(() => { const st = document.createElement('style');
    st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'; document.head.append(st); return true })()`);
  const region = await evaluate(`(async () => { ${setup}
    await new Promise((r) => setTimeout(r, 300));
    // Aspetta le copertine visibili (al massimo 6 secondi)
    const imgs = [...document.images].filter((i) => i.getBoundingClientRect().bottom > 0);
    await Promise.race([Promise.all(imgs.map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))), new Promise((r) => setTimeout(r, 6000))]);
    await new Promise((r) => setTimeout(r, 200));
    return (${String(clip)})();
  })()`);
  const { data } = await send('Page.captureScreenshot', {
    format: 'jpeg', quality: 88, captureBeyondViewport: false,
    clip: { x: 0, y: Math.max(0, Math.round(region.y)), width: W, height: Math.round(region.h), scale: 1 },
  });
  writeFileSync(join(OUT, name + '.jpg'), Buffer.from(data, 'base64'));
  console.log('ok', name, Math.round(region.h) + 'px');
}

const top = (h) => `() => ({ y: 0, h: ${h} })`;
const sheetClip = () => { const r = document.querySelector('#sheet').getBoundingClientRect(); return { y: r.top - 24, h: r.height + 24 }; };
const results = JSON.stringify(demo.slice(0, 1));

const scenes = {
  '01-lista': { clip: top(640) },
  '02-schede': { settings: { view: 'grid', cols: 2 }, clip: top(700) },
  '03-schede-chiaro': { settings: { view: 'grid', cols: 3, theme: 'light' }, clip: top(560) },
  '04-ricerca': {
    setup: `document.querySelector('[data-act=open-search]').click(); const q = document.querySelector('#q'); q.value = 'radiohead'; syncClear(); renderPasteButton();
      results = window.__results; renderResults(); albums.find(a => a.title === 'Kid A') && true;`,
    clip: top(600),
  },
  '05-link-copiato': {
    setup: `document.querySelector('[data-act=open-search]').click();`,
    clip: top(330),
  },
  '06-dal-link': {
    setup: `document.querySelector('[data-act=open-search]').click(); const q = document.querySelector('#q'); q.value = 'Offshore Breaks Fatlantic'; syncClear(); renderPasteButton();
      results = window.__linkResults; renderResults();`,
    clip: top(420),
  },
  '07-filtro': {
    setup: `const f = document.querySelector('#filter'); f.value = '2000'; f.dispatchEvent(new Event('input'));`,
    clip: top(400),
  },
  '08-ordina': { setup: `openSortPicker();`, clip: sheetClip },
  '09-gesti': {
    setup: `const r = document.querySelectorAll('#list .row');
      r[1].dataset.swipe = 'right'; r[1].classList.add('swipe-armed'); r[1].style.transform = 'translateX(215px)';
      r[3].dataset.swipe = 'left'; r[3].style.transform = 'translateX(-130px)';`,
    clip: top(600),
  },
  '10-selezione': { setup: `startSelection('demo1'); togglePick('demo3'); togglePick('demo4');`, clip: top(560) },
  '11-dado': { setup: `Math.random = () => 0.33; pickRandom();`, clip: sheetClip },
  '12-scheda': { settings: { musicApp: 'spotify' }, setup: `openDetail('demo8');`, clip: sheetClip },
  '13-modifica': { setup: `openForm('edit', albums.find(a => a.title === 'Mint Jams'));`, clip: top(560) },
  '14-copertina': {
    setup: `openForm('edit', albums.find(a => a.title === 'Mint Jams')); openLayer('covers'); document.querySelector('#cq').value = 'mint jams casiopea';
      coverChoices = window.__covers; document.querySelector('#cover-grid').innerHTML = coverChoices.map((r, i) => \`
        <button class="cover-tile" data-act="choose-cover" data-i="\${i}"><div class="cover"><img src="\${r.cover}" alt=""></div>
        <span class="tile-title">\${esc(r.title)}</span><span class="tile-sub">\${esc([r.artist, r.year].filter(Boolean).join(' · '))}</span></button>\`).join('');
      document.querySelector('#covers-status').textContent = 'Tocca la copertina che vuoi usare.';`,
    clip: top(560),
  },
  '15-impostazioni': { settings: { musicApp: 'spotify' }, setup: `appVersion = '1.8.2'; document.querySelector('[data-act=open-settings]').click(); renderMusicAppLabel();`, clip: top(688) },
  '16-app-musica': { settings: { musicApp: 'spotify' }, setup: `document.querySelector('[data-act=open-settings]').click(); openMusicAppPicker();`, clip: sheetClip },
  '17-aggiornamento': {
    setup: `appVersion = '1.8.2'; upd.latest = { version: '1.9.0', url: '' }; upd.phase = 'downloading'; upd.progress = 0.62; renderUpdate();`,
    clip: top(340),
  },
};

// Dati extra iniettati nella pagina prima di ogni scena
const extra = JSON.parse(readFileSync(join(DEMO, '..', 'extra.json'), 'utf8'));
for (const [name, scene] of Object.entries(scenes)) {
  const setup = `window.__results = ${JSON.stringify(extra.results)}; window.__linkResults = ${JSON.stringify(extra.linkResults)};
    window.__covers = ${JSON.stringify(extra.covers)}; ${scene.setup || ''}`;
  try { await shot(name, { ...scene, setup }); } catch (e) { console.log('ERRORE', name, e.message); }
}
ws.close();
edge.kill();
