// Snapshots the specimen night for the mystery pack's torch tour (src/packs/mystery/tour). It starts the in-memory demo
// on a free port (VITE_BACKEND=mock VITE_GAME_PACK=mystery, never the live game), drives a headless Chrome through it
// as Maya (its own profile and port, over the DevTools protocol), puts the demo into each state the tour shows, and
// keeps the app's DOM:
//
//   src/packs/mystery/tour/snap/scenes.json  each screen: the app (app bar and page), its tab bar, what was over it
//   src/packs/mystery/tour/snap/game.css     the game's CSS, rewritten to live in a shadow root (html/body/:root → snap-*)
//   src/packs/mystery/tour/snap/assets/      the few files the screens point at (map tiles load live from OSM)
//   src/packs/mystery/tour/snap/source.json  the commit it was taken at and a hash of every file whose change could
//                                            change the screens (npm run deploy warns when they no longer match)
//
// The pack's own components carry data-tour="…" names; the engine's elements and one-off ones (the tip-off sheet, the
// route on the map, the entry that says Autograph) are stamped as they are captured. Every name a stop uses is checked
// on the screen it is used on; a missing one fails the run (exit 1) and nothing is written. Run it again after changing
// a screen the tour shows:
//
//   node scripts/packs/mystery/snapshot-tour.mjs [--url http://localhost:5180/] [--scratch <dir>] [--keep-shots]
//   node scripts/packs/mystery/snapshot-tour.mjs --check [--scratch <dir>]
//
// --url uses a demo already running (it must be the mock backend) instead of starting one. --scratch is where Chrome's
// throwaway profile goes, and the screenshots (--keep-shots: each screen as kept). --check writes nothing: it takes the
// tour itself at 360×640, 390×844 and 430×932, checks the tag is on screen and clear of what's lit at every stop, and
// saves a screenshot of each.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hopScreen, STOPS } from '../../../src/packs/mystery/tour/stops.ts';
import { sourceHashes } from '../../lib/source-hashes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const SNAP = join(ROOT, 'src/packs/mystery/tour/snap');
const ASSETS = join(SNAP, 'assets');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const SCRATCH = arg('--scratch', tmpdir());
const CHECK = process.argv.includes('--check');
/** The phone the screens are kept on (the tour reflows them to any width; a map is re-centred). */
const [WIDTH, HEIGHT] = [390, 844];
/** What could change the screens: the deploy preflight compares these files' hashes. */
const WATCH = [
  'src/packs/mystery/screens/',
  'src/packs/mystery/theme.css',
  'src/packs/mystery/buttons.css',
  'src/styles/',
  'src/components/',
  'src/screens/AppFrame.tsx',
  'src/screens/AppFrame.css',
  'src/screens/home/',
  'src/screens/account/',
  'src/modules/map/',
];
/** A still from the demo's clips is never shipped: a plain frame stands in for it. */
const STILL = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#2f3234"/></svg>')}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('·', ...a);

/* ---------------------------------------------------------------- the demo and the browser */

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/** The demo: the given --url, or a mock server of our own on a free port. */
async function startDemo() {
  const given = arg('--url', null);
  if (given) return { base: given.endsWith('/') ? given : `${given}/`, stop: () => {} };
  const port = await freePort();
  const vite = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT,
    env: { ...process.env, VITE_BACKEND: 'mock', VITE_GAME_PACK: 'mystery' },
    stdio: 'ignore',
    detached: true,
  });
  const base = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 240; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await sleep(250);
  }
  log(`demo on ${base}`);
  return {
    base,
    stop: () => {
      try {
        process.kill(-vite.pid);
      } catch {}
    },
  };
}

async function launch(width = WIDTH, height = HEIGHT, reduced = false) {
  const port = await freePort();
  const profile = mkdtempSync(join(SCRATCH, 'tour-snap-'));
  const chrome = spawn(
    'google-chrome',
    [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
      `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let pages = [];
  for (let i = 0; i < 100 && !pages.length; i++) {
    try {
      pages = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((t) => t.type === 'page');
    } catch {}
    if (!pages.length) await sleep(150);
  }
  if (!pages.length) throw new Error('Chrome did not start');
  const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const waiting = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) {
      waiting.get(m.id)(m);
      waiting.delete(m.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((r) => {
      const n = ++id;
      waiting.set(n, r);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.error) throw new Error(r.error.message);
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 800));
    return r.result?.result?.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
  if (reduced) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const mouse = async (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mouseReleased' ? 0 : 1 });
  return {
    send,
    ev,
    mouse,
    goto: (url) => send('Page.navigate', { url }),
    type: (text) => send('Input.insertText', { text }),
    key: async (key, code = key, keyCode = 0) => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
    },
    click: async (sel, text) => {
      const r = await ev(`(() => {
        const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => ${text ? `e.textContent.includes(${JSON.stringify(text)})` : 'true'});
        if (!el) return false;
        el.click();
        return true;
      })()`);
      if (!r) log(`(no ${sel}${text ? ` "${text}"` : ''})`);
      return r;
    },
    /** Waits until `expression` is truthy in the page (polling), up to `ms`. */
    until: async (expression, ms = 30000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (await ev(expression).catch(() => false)) return true;
        await sleep(200);
      }
      return false;
    },
    shot: async (file) => {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    },
    close: () => {
      try {
        ws.close();
      } catch {}
      chrome.kill();
      setTimeout(() => rmSync(profile, { recursive: true, force: true }), 1000);
    },
  };
}

/* ---------------------------------------------------------------- the demo's data */

/** Runs `body` in the page with the demo's backend (`be`), its store (`S`) and the Stamp class to hand; refuses any
 * backend but the in-memory mock. */
const withBackend = (body) => `(async () => {
  const names = performance.getEntriesByType('resource').map((e) => e.name);
  const { backend } = await import(names.find((n) => /\\/src\\/backend\\/index\\.ts/.test(n)));
  const { Stamp } = await import(names.find((n) => /\\/functions\\/src\\/shared\\/store\\/stamp\\.ts/.test(n)) ?? '/functions/src/shared/store/stamp.ts');
  const be = backend();
  if (be.kind !== 'mock' || !be.store) throw new Error('Not the in-memory demo (backend ' + be.kind + '): refusing to touch it.');
  const S = be.store;
  const all = async (path) => (await S.collection(path).get()).docs;
  const at = (min) => Stamp.fromMillis(Date.now() + min * 60000);
  ${body}
})()`;

/** The specimen night: the group 50 minutes into its second bar, whose page of the log book holds just three entries:
 * a fresh one nobody has stamped yet, one Maya has, and one old enough to have its verdict; everything else posted
 * since moves back to the first bar. And the next roll call due now (no quiet hours). */
const SPECIMEN = withBackend(`
  // Whatever the hour the script runs at, it isn't quiet hours on the specimen night.
  await S.doc('game/settings').update({ quietHours: null });
  await S.doc('stops/route-1').update({ startsAt: at(-110), endsAt: at(-50) });
  await S.doc('stops/route-2').update({ startsAt: at(-50) });
  await S.doc('stops/route-3').update({ startsAt: at(10) });
  const here = { 'approved-demo-sam-2': -4, 'entry-demo-sam-side': -15, 'approved-demo-priya-1': -41 };
  let back = -52;
  for (const f of await all('feed')) {
    if (f.id in here) continue;
    if (f.data().createdAt.toMillis() > Date.now() - 50 * 60000) await S.doc('feed/' + f.id).update({ createdAt: at(back--) });
  }
  for (const [id, min] of Object.entries(here)) await S.doc('feed/' + id).update({ createdAt: at(min), ...(min > -30 ? { verdict: null } : {}) });
  for (const p of await all('periodics')) await S.doc('periodics/' + p.id).update({ status: 'running', nextAt: at(-0.1) });
  return 'ok';
`);

/** Tidies the log book once the timer has run: the standing changes the verdicts set off and the roll call's own post
 * would sit on top of the stop and push the entries down. */
const TIDY = withBackend(`
  let n = 0;
  for (const f of await all('feed')) {
    const t = f.data().type;
    if (t === 'standing' || (/^(checkin|periodic)/.test(t) && t !== 'checkin-answer')) { await S.doc('feed/' + f.id).delete(); n++; }
  }
  const verdicts = (await all('feed')).filter((f) => f.data().verdict).length;
  const checkins = (await all('checkins')).length;
  return { removed: n, verdicts, checkins };
`);

/** Alex's hand, by title: the charge that's upheld is one of these, the dismissed one isn't. */
const ALEX = withBackend(`
  return (await all('players/demo-alex/quests')).map((q) => q.data()).filter((q) => q.status !== 'replaced').map((q) => q.title);
`);

/** A word to search for that finds `title`: its longest word. */
const wordOf = (title) => ([...title.matchAll(/[A-Za-z]{4,}/g)].map((m) => m[0]).sort((a, b) => b.length - a.length)[0] ?? title).toLowerCase();

/* ---------------------------------------------------------------- capturing a screen */

/**
 * In the page: stamps the names for the engine's and one-off elements, then keeps the app (without its tab bar), the
 * tab bar and whatever hangs over them (a sheet, the toasts) as HTML. Inputs keep their values, fixed elements are
 * marked (the tour pins them to its own frame), a carousel remembers which card sat in its middle, a scrolling sheet is
 * marked as a scroller, and every URL becomes a token for the script to fetch (map tiles stay as they are: they load
 * live). Leaflet's markers sit on transforms, which the tour's measuring ignores, so a map gets a plain box round its
 * markers instead (`box`).
 */
const CAPTURE = (opts) => `(async (opts) => {
  const missing = [];
  const stamped = [];
  const mark = (el, name) => { el.setAttribute('data-tour', name); stamped.push(el); };
  const added = [];
  if (opts.box) {
    const map = document.querySelector('.leaflet-container');
    const m = map.getBoundingClientRect();
    const rs = [...map.querySelectorAll(opts.box)].map((e) => e.getBoundingClientRect()).filter((r) => r.bottom > m.top && r.top < m.bottom && r.right > m.left && r.left < m.right);
    const x0 = Math.min(...rs.map((r) => r.left)) - m.left, x1 = Math.max(...rs.map((r) => r.right)) - m.left;
    const y0 = Math.min(...rs.map((r) => r.top)) - m.top, y1 = Math.max(...rs.map((r) => r.bottom)) - m.top;
    const box = document.createElement('div');
    box.setAttribute('data-tour', opts.boxName);
    box.className = 'snap-box';
    box.style.cssText = 'left: calc(' + Math.round(x0) + 'px + var(--snap-dx, 0px)); top: calc(' + Math.round(y0) + 'px + var(--snap-dy, 0px)); width: ' + Math.round(x1 - x0) + 'px; height: ' + Math.round(y1 - y0) + 'px';
    map.appendChild(box);
    added.push(box);
    map.setAttribute('data-snap-map', Math.round(m.width) + 'x' + Math.round(m.height));
    stamped.push(map);
  }

  const app = document.querySelector('#root > .app');
  const overlays = [...document.querySelectorAll('#root > :not(.app), body > :not(#root):not(script):not(style):not(noscript):not(vite-error-overlay)')];
  const parts = [app, ...overlays];
  const touched = [];
  const set = (el, k, v) => { touched.push([el, k, el.getAttribute(k)]); el.setAttribute(k, v); };
  for (const part of parts) for (const el of [part, ...part.querySelectorAll('*')]) {
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed') set(el, 'data-snap-fixed', '');
    if (el.matches('input, textarea')) {
      if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked) set(el, 'checked', ''); }
      else if (el.tagName === 'TEXTAREA') set(el, 'data-snap-value', el.value);
      else set(el, 'value', el.value);
    }
    if (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 2 && el.scrollLeft > 0) {
      const mid = el.getBoundingClientRect().left + el.clientWidth / 2;
      const kids = [...el.children];
      const near = kids.reduce((best, k) => { const r = k.getBoundingClientRect(); const d = Math.abs(r.left + r.width / 2 - mid); return !best || d < best.d ? { k, d } : best; }, null);
      if (near) set(near.k, 'data-snap-center', '');
    }
    if (part !== app && /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 2) set(el, 'data-scroller', '');
  }

  for (const [name, sel, text] of opts.tags) {
    const el = [...document.querySelectorAll(sel)].find((e) => !text || e.textContent.includes(text));
    if (el) mark(el, name); else missing.push(name);
  }

  // Blob URLs (a photo from the demo's camera) become data URLs; tiles stay; the demo's clips go; the rest are tokens.
  const urls = [];
  const token = (u, k, el) => {
    if (!u || /^(data:|#|javascript:)/.test(u)) return u;
    const abs = new URL(u, location.href).href;
    if (/tile\\.openstreetmap\\.org/.test(abs)) return abs;
    if (/\\/demo\\/clips\\//.test(abs)) return el.tagName === 'VIDEO' && k === 'src' ? null : opts.still;
    let i = urls.indexOf(abs);
    if (i < 0) i = urls.push(abs) - 1;
    return '__SNAP_' + i + '__';
  };
  const blobs = new Map();
  for (const part of parts) for (const el of part.querySelectorAll('[src^="blob:"], [poster^="blob:"]')) {
    for (const k of ['src', 'poster']) {
      const u = el.getAttribute(k);
      if (u?.startsWith('blob:') && !blobs.has(u)) {
        const b = await (await fetch(u)).blob();
        blobs.set(u, await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }));
      }
    }
  }
  const clean = (root) => {
    root.querySelectorAll('script, noscript, .skip-link').forEach((e) => e.remove());
    for (const el of [root, ...root.querySelectorAll('*')]) {
      for (const k of ['src', 'poster', 'href', 'xlink:href']) {
        const v = el.getAttribute(k);
        if (v == null) continue;
        if (blobs.has(v)) el.setAttribute(k, blobs.get(v));
        else if (k === 'href' && el.tagName === 'A') continue;
        else if (!(k === 'href' && v.startsWith('#'))) {
          const t = token(v, k, el);
          if (t === null) el.removeAttribute(k); else el.setAttribute(k, t);
        }
      }
      if (el.hasAttribute('srcset')) el.removeAttribute('srcset');
      const st = el.getAttribute('style');
      if (st && st.includes('url(')) el.setAttribute('style', st.replace(/url\\((['"]?)([^'")]+)\\1\\)/g, (m, q, u) => 'url(' + q + token(u, 'style', el) + q + ')'));
      if (el.tagName === 'VIDEO') { el.removeAttribute('autoplay'); el.setAttribute('preload', 'none'); el.setAttribute('muted', ''); }
      if (el.hasAttribute('data-snap-value')) { el.textContent = el.getAttribute('data-snap-value'); el.removeAttribute('data-snap-value'); }
    }
    return root;
  };
  const appClone = clean(app.cloneNode(true));
  const bar = appClone.querySelector('nav.tabbar');
  const tabbar = bar ? bar.outerHTML : '';
  bar?.remove();
  const out = {
    appClass: app.className,
    app: appClone.innerHTML,
    tabbar,
    overlays: overlays.map((o) => clean(o.cloneNode(true)).outerHTML).filter((h) => h.length > 40),
    urls,
    missing,
  };
  for (const [el, k, v] of touched.reverse()) v == null ? el.removeAttribute(k) : el.setAttribute(k, v);
  for (const el of stamped) { el.removeAttribute('data-tour'); el.removeAttribute('data-snap-map'); }
  added.forEach((e) => e.remove());
  return out;
})(${JSON.stringify(opts)})`;

/** The CSS on the page now: every <style> (Vite's dev server injects each file as one) by its file, but the tour's own. */
const STYLES = `[...document.querySelectorAll('style')].map((s, i) => ({ id: s.getAttribute('data-vite-dev-id') || 'inline-' + i + '-' + s.textContent.length, text: s.textContent })).filter((s) => !/\\/src\\/packs\\/mystery\\/tour\\//.test(s.id))`;

/* ---------------------------------------------------------------- the sessions */

const scenes = {};
const styles = new Map();
const urls = new Set();
const stampMissing = [];

async function keep(b, id, opts = {}) {
  await b.ev('scrollTo(0, 0)');
  await sleep(250);
  const s = await b.ev(CAPTURE({ tags: [], still: STILL, ...opts }));
  if (s.missing.length) {
    log(`${id}: nothing for ${s.missing.join(', ')}`);
    stampMissing.push(...s.missing.map((m) => `${id}: ${m}`));
  }
  s.urls.forEach((u) => urls.add(u));
  scenes[id] = s;
  for (const st of await b.ev(STYLES)) if (!styles.has(st.id)) styles.set(st.id, st.text);
  if (process.argv.includes('--keep-shots')) await b.shot(join(SCRATCH, `tour-snap-${id}.png`));
  log(`kept ${id} (${Math.round(s.app.length / 1024)} KB${s.overlays.length ? `, ${s.overlays.length} over it` : ''})`);
}

/** Signs in as Maya, sets the stage, and closes any vote and reward that greet her. */
async function signIn(b, base, setup) {
  await b.goto(base);
  if (!(await b.until(`[...document.querySelectorAll('button')].some((e) => e.textContent.includes('Maya'))`, 90000))) {
    throw new Error(`No sign-in screen at ${base}: is it the demo (VITE_BACKEND=mock, VITE_GAME_PACK=mystery)?`);
  }
  await b.click('button', 'Maya');
  await b.until(`!!document.querySelector('#root > .app')`, 30000);
  await sleep(1500);
  if (setup) log('setup', JSON.stringify(await b.ev(setup)));
  await sleep(1500);
  // Whatever greets her, if anything: a vote taking over, a reward to use.
  await b.ev(`[...document.querySelectorAll('button')].find((e) => e.textContent.includes('Back to the case'))?.click()`);
  await sleep(600);
  await b.ev(`[...document.querySelectorAll('button')].find((e) => e.textContent.includes('Keep it for later'))?.click()`);
  await sleep(600);
}

/** Waits for the demo's timer (every 20 s) to hand out verdicts and send the roll call, then tidies the log book. */
async function letTheNightRun(b) {
  let t = null;
  for (let i = 0; i < 12; i++) {
    await sleep(5000);
    t = await b.ev(TIDY);
    if (t.verdicts >= 3 && t.checkins > 0) {
      await sleep(5000);
      log('night', JSON.stringify(await b.ev(TIDY)));
      return;
    }
  }
  log(`the timer did not settle everything (${JSON.stringify(t)}); carrying on`);
}

const route = async (b, hash, wait = 2000) => {
  await b.ev(`location.hash = ${JSON.stringify(hash)}`);
  await sleep(wait);
};

/** Opens Form 3 on Alex's file and searches for `word`. */
async function chargeSearch(b, word) {
  await route(b, '#/player/demo-alex', 2500);
  await b.click('button', 'Type a charge');
  await sleep(1200);
  await b.ev(`document.querySelector('.cs-sheet input')?.focus()`);
  await b.type(word);
  await sleep(1200);
}

/** Picks the charge called `title`, or (given a hand instead) the first one found that isn't in it. */
async function pickCharge(b, { title, notIn }) {
  const picked = await b.ev(`(() => {
    const hits = [...document.querySelectorAll('.cs-hit')];
    const name = (e) => e.querySelector('b')?.textContent.trim();
    const hit = ${JSON.stringify(title ?? null)} ? hits.find((e) => name(e) === ${JSON.stringify(title ?? '')}) : hits.find((e) => !${JSON.stringify(notIn ?? [])}.includes(name(e)));
    hit?.click();
    return hit ? name(hit) : null;
  })()`);
  if (!picked) throw new Error(`No charge to pick (${title ?? 'one not in Alex\'s hand'})`);
  log(`charged Alex with "${picked}"`);
  await sleep(1200);
}

async function fileCharge(b) {
  // The hold to file: a tap arms it, a second files it.
  await b.click('.cs-hold');
  await sleep(300);
  await b.click('.cs-hold');
  await sleep(2500);
}

async function specimenNight(base) {
  const b = await launch();
  try {
    await signIn(b, base, SPECIMEN);
    await letTheNightRun(b);

    await route(b, '#/');
    await keep(b, 'missions');

    await route(b, '#/map', 3500);
    // Pull the map down so the route sits just under Now / Next, where the torch and its tag both fit.
    const m = await b.ev(`(() => { const r = document.querySelector('.leaflet-container').getBoundingClientRect(); const s = [...document.querySelectorAll('.fqpin--stop-next')][0].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.6, next: s.top - r.top }; })()`);
    const lift = Math.round(m.next - 92);
    await b.mouse('mousePressed', m.x, m.y);
    for (let i = 1; i <= 10; i++) await b.mouse('mouseMoved', m.x, m.y - (lift * i) / 10);
    await b.mouse('mouseReleased', m.x, m.y - lift);
    await sleep(3000);
    await keep(b, 'map', { tags: [['strip', '.fqstrip']], box: '.fqpin--stop, .fqpin--player, .fqfoot, .fqpin__label, .fqlabel', boxName: 'route' });

    await route(b, '#/');
    await b.click('.bd-tab', 'Standings');
    await sleep(1500);
    await keep(b, 'standings', { tags: [['st-row2', '.st__li:nth-child(2)'], ['st-row3', '.st__li:nth-child(3)']] });

    await b.ev(TIDY);
    await route(b, '#/feed', 2500);
    // The open stop's newest entry: the fresh one nobody has stamped yet.
    await keep(b, 'logbook', { tags: [['entry-new', '.tl__chapter:not(.tl__shut) .cf-strung > li']] });

    await route(b, '#/account', 2500);
    // Bring the first mission still to do into the middle of the carousel.
    await b.ev(`(() => {
      const t = document.querySelector('.ml-track');
      const it = [...t.querySelectorAll('.ml-item')].find((i) => i.querySelector('.ml-tag--open'));
      if (!it) return;
      const tr = t.getBoundingClientRect();
      const r = it.getBoundingClientRect();
      t.scrollBy({ left: r.left + r.width / 2 - (tr.left + t.clientWidth / 2), behavior: 'instant' });
    })()`);
    await sleep(1200);
    await keep(b, 'file');

    await route(b, '#/player/demo-alex', 2500);
    await keep(b, 'alex');

    const hand = await b.ev(ALEX);
    await chargeSearch(b, wordOf(hand[0]));
    await keep(b, 'search');
    await pickCharge(b, { title: hand[0] });
    await keep(b, 'terms');
    await fileCharge(b);
    await keep(b, 'upheld');
  } finally {
    b.close();
  }
}

/** A dismissed charge on Alex, then (on his file still) Maya, a trusted confidant, tipping off the police about him:
 * the phone in the app bar, who to tip off, what they've been up to, sent, and the tip in the log book. A session of its
 * own, so the tip touches no other screen. */
async function wrongChargeAndTip(base) {
  const b = await launch();
  try {
    await signIn(b, base, SPECIMEN);
    await letTheNightRun(b);
    const hand = await b.ev(ALEX);
    await chargeSearch(b, 'drink');
    await pickCharge(b, { notIn: hand });
    await fileCharge(b);
    await sleep(400);
    await keep(b, 'wrong');

    // Let the toast go, then the tip line.
    await sleep(6000);
    await b.ev('scrollTo(0, 0)');
    await b.click('.tipline');
    await sleep(1200);
    await keep(b, 'tip-pick', { tags: [['tip-pick', '.sheet .tipoff-pick'], ['tip-alex', '.sheet .tipoff-pick__who', 'Alex']] });
    await b.click('.tipoff-pick__who', 'Alex');
    await sleep(1000);
    await b.ev(`document.querySelector('.sheet textarea')?.focus()`);
    await b.type('seen slipping something into Sam’s drink');
    await sleep(600);
    await b.ev(`document.activeElement?.blur()`);
    await sleep(300);
    await keep(b, 'tip-note', { tags: [['tip-field', '.sheet .field'], ['tip-send', '.sheet .btn--danger']] });
    await b.click('.sheet .btn--danger');
    await sleep(1200);
    await keep(b, 'tip-sent');
    await b.ev(TIDY);
    await route(b, '#/feed', 2500);
    await keep(b, 'tip-logbook', { tags: [['tip-entry', '.tl__chapter:not(.tl__shut) .cf-strung > li', 'tipped off']] });
  } finally {
    b.close();
  }
}

/* ---------------------------------------------------------------- every name a stop uses, on its screen */

/** For each stop: the names it lights (on its own screen) and its hops' targets (on the screen each is pointed at). */
function uses() {
  const out = [];
  STOPS.forEach((stop, k) => {
    const own = { tab: stop.tab, scene: stop.scene, overlays: !stop.bare };
    for (const name of [...stop.lit, ...(stop.core ?? [])]) out.push({ stop: k + 1, name, ...own });
    (stop.via ?? []).forEach((hop, i) => {
      const at = hopScreen(stop.via, i);
      const prev = STOPS[k - 1];
      const screen = at ? { tab: at.tab, scene: at.scene, overlays: true } : { tab: prev.tab, scene: prev.scene, overlays: !prev.bare };
      out.push({ stop: k + 1, name: hop.target, hop: true, ...screen });
    });
  });
  return out;
}

/** Checks every use in the page (the tour's own frame, built from the kept HTML); the missing ones. */
async function missingUses(b) {
  const list = uses().map((u) => ({ ...u, html: scenes[u.scene] ? { app: scenes[u.scene].app, tabbar: scenes[u.scene].tabbar, overlays: u.overlays ? scenes[u.scene].overlays : [] } : null }));
  return b.ev(`((list) => list.filter((u) => {
    if (!u.html) return true;
    const root = document.createElement('div');
    root.innerHTML = '<section class="tr-pane tr-pane--' + u.tab + '"><div class="app">' + u.html.app + '</div></section>' +
      '<div class="tr-bar" data-tour="tabbar">' + u.html.tabbar + '</div>' + u.html.overlays.map((o) => '<div class="tr-over">' + o + '</div>').join('');
    const sel = /^[.#[]/.test(u.name) ? u.name : '[data-tour="' + u.name + '"]';
    return !root.querySelector(sel);
  }).map((u) => 'stop ' + u.stop + (u.hop ? ' (hop)' : '') + ': ' + u.name + ' on ' + u.scene))(${JSON.stringify(list)})`);
}

/* ---------------------------------------------------------------- writing it out */

function assetName(u, type) {
  const ext = (u.match(/\.(png|jpe?g|svg|webp|gif|woff2?)(?:[?#]|$)/i)?.[1] ?? { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' }[type.split(';')[0]] ?? 'bin').toLowerCase();
  return `${createHash('sha1').update(u.replace(/^https?:\/\/[^/]+/, '')).digest('hex').slice(0, 12)}.${ext}`;
}

/** Fetches every URL the screens use into snap/assets/. */
async function fetchAssets() {
  rmSync(ASSETS, { recursive: true, force: true });
  mkdirSync(ASSETS, { recursive: true });
  const names = new Map();
  for (const u of urls) {
    const res = await fetch(u);
    if (!res.ok) {
      log(`couldn't fetch ${u}: ${res.status}`);
      names.set(u, '');
      continue;
    }
    const name = assetName(u, res.headers.get('content-type') ?? '');
    writeFileSync(join(ASSETS, name), Buffer.from(await res.arrayBuffer()));
    names.set(u, `__SNAP_ASSET_${name}__`);
  }
  return names;
}

const untoken = (s, list, names) => s.replace(/__SNAP_(\d+)__/g, (_, i) => names.get(list[+i]) ?? '');

/**
 * The game's CSS made to work inside a shadow root: html and :root become <snap-root>, body <snap-body> (selectors
 * only, never declarations), @font-face goes (fonts load at the page's top level, from the pack's own imports), and
 * url()s point at the fetched copies.
 */
function shadowCss(css, cssUrls, base) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let out = '';
  let from = 0;
  let depth = 0;
  let quote = null;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (depth === 0 && (c === '{' || c === '}' || c === ';')) {
      let piece = css.slice(from, i + 1);
      if (c === '{') {
        const prelude = piece.slice(0, -1);
        const t = prelude.trim();
        if (t.startsWith('@font-face')) {
          i = css.indexOf('}', i);
          from = i + 1;
          continue;
        }
        if (!t.startsWith('@'))
          piece =
            prelude
              .replace(/:root\b/g, 'snap-root')
              .replace(/(^|[\s,>+~(])html(?![\w-])/g, '$1snap-root')
              .replace(/(^|[\s,>+~(])body(?![\w-])/g, '$1snap-body') + '{';
      }
      out += piece;
      from = i + 1;
    }
  }
  out += css.slice(from);
  return out.replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, u) => {
    if (/^(data:|#)/.test(u)) return m;
    const abs = new URL(u, base).href;
    cssUrls.add(abs);
    return `url(${q}__CSS_${abs}__${q})`;
  });
}

const git = (...a) => {
  try {
    return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

async function snapshot(base) {
  log(`snapshotting ${base} at ${WIDTH}×${HEIGHT}`);
  await specimenNight(base);
  await wrongChargeAndTip(base);

  // Every name a stop uses must be on the screen it's used on.
  const b = await launch();
  let missing;
  try {
    await b.goto(base);
    await b.until('document.readyState === "complete"', 30000);
    missing = [...stampMissing, ...(await missingUses(b))];
  } finally {
    b.close();
  }
  if (missing.length) {
    console.error(`\nMissing on the screens (nothing written):\n  ${missing.join('\n  ')}`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(SNAP, { recursive: true });
  const cssUrls = new Set();
  let css = '';
  for (const [id, text] of styles) css += `/* ${id.replace(/^.*\/(src|node_modules)\//, '$1/')} */\n${shadowCss(text, cssUrls, base)}\n`;
  cssUrls.forEach((u) => urls.add(u));
  const names = await fetchAssets();
  css = css.replace(/__CSS_(.+?)__/g, (_, u) => names.get(u) ?? u);
  for (const s of Object.values(scenes)) {
    const list = s.urls;
    s.app = untoken(s.app, list, names);
    s.tabbar = untoken(s.tabbar, list, names);
    s.overlays = s.overlays.map((o) => untoken(o, list, names));
    delete s.urls;
    delete s.missing;
  }
  const taken = new Date().toISOString();
  const commit = git('rev-parse', 'HEAD');
  writeFileSync(join(SNAP, 'game.css'), css);
  writeFileSync(join(SNAP, 'scenes.json'), JSON.stringify({ taken, commit, width: WIDTH, scenes }));
  writeFileSync(
    join(SNAP, 'source.json'),
    `${JSON.stringify({ taken, commit, dirty: git('status', '--porcelain') !== '', watch: WATCH, files: sourceHashes(ROOT, WATCH) }, null, 1)}\n`,
  );
  log(`wrote ${Object.keys(scenes).length} screens, ${Math.round(css.length / 1024)} KB of CSS and ${names.size} files at ${commit.slice(0, 7)}`);
}

/* ---------------------------------------------------------------- --check: the tour itself, at three sizes */

const IN_TOUR = (body) => `(() => {
  const host = document.querySelector('[data-tour-host]');
  const sh = host && host.shadowRoot;
  if (!sh) return null;
  ${body}
})()`;

async function check(base) {
  const sizes = [
    [360, 640],
    [390, 844],
    [430, 932],
  ];
  const problems = [];
  const dir = join(SCRATCH, 'tour-check');
  mkdirSync(dir, { recursive: true });
  for (const [w, h] of sizes) {
    const b = await launch(w, h);
    try {
      await signIn(b, base, null);
      await route(b, '#/account', 2500);
      if (!(await b.until(`!!document.querySelector('.tr-tourcard .cf-btn')`, 15000))) throw new Error('No "How tonight works" card in My file');
      await b.click('.tr-tourcard .cf-btn');
      for (let n = 1; n <= STOPS.length; n++) {
        const at = await b.until(IN_TOUR(`return (sh.querySelector('.tr-sr')?.textContent ?? '').startsWith('Stop ${n} of ${STOPS.length}');`), 15000);
        if (!at) {
          problems.push(`${w}×${h} stop ${n}: never reached`);
          break;
        }
        await sleep(1400);
        const m = await b.ev(
          IN_TOUR(`
          const r = (sel) => { const e = sh.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
          return { tag: r('.tr-ht--tour .tr-ht__body'), spot: r('.tr-spot'), dock: r('.tr-dock'), vw: innerWidth, vh: innerHeight };
        `),
        );
        const { tag, spot, dock, vw } = m;
        if (tag.x < 0 || tag.x + tag.w > vw || tag.y < 0 || tag.y + tag.h > dock.y + 1) problems.push(`${w}×${h} stop ${n}: the tag is off the screen (${JSON.stringify(tag)})`);
        const ow = Math.min(tag.x + tag.w, spot.x + spot.w) - Math.max(tag.x, spot.x);
        const oh = Math.min(tag.y + tag.h, spot.y + spot.h) - Math.max(tag.y, spot.y);
        if (ow > 6 && oh > 6) problems.push(`${w}×${h} stop ${n}: the tag covers what's lit by ${Math.round(ow)}×${Math.round(oh)}`);
        await b.shot(join(dir, `${w}x${h}-${String(n).padStart(2, '0')}.png`));
        await b.ev(IN_TOUR(`sh.querySelector('.tr-ht--tour .tr-ht__go').click(); return true;`));
      }
      if (!(await b.until(`!document.querySelector('[data-tour-host]')`, 8000))) problems.push(`${w}×${h}: the tour didn't close after Done`);
      log(`checked ${w}×${h}`);
    } finally {
      b.close();
    }
  }
  if (problems.length) {
    console.error(`\nProblems:\n  ${problems.join('\n  ')}`);
    process.exitCode = 1;
  } else log(`all ${STOPS.length} stops fit at ${sizes.map((s) => s.join('×')).join(', ')}; screenshots in ${dir}`);
}

const demo = await startDemo();
try {
  if (CHECK) await check(demo.base);
  else await snapshot(demo.base);
} finally {
  demo.stop();
}
