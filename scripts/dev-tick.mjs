// Dev-only ticker. The Functions emulator never runs scheduled functions, so this calls the
// `devTick` HTTP function (the same job the 15-minute schedule runs in production) every minute.
//
//   DEV_TICK_URL      override the endpoint
//                     (default http://127.0.0.1:5001/demo-festival-quest/europe-west2/devTick)
//   DEV_TICK_SECONDS  interval between ticks (default 60)
//
// Quiet unless something happens: logs when a side quest opens, starts voting or closes, and once when the
// emulator becomes reachable or drops away. Retries every few seconds until it is up.

const URL_ = process.env.DEV_TICK_URL ?? 'http://127.0.0.1:5001/demo-festival-quest/europe-west2/devTick';
const parsed = Number(process.env.DEV_TICK_SECONDS);
const INTERVAL_MS = (Number.isFinite(parsed) && parsed > 0 ? parsed : 60) * 1000;
const RETRY_MS = Math.min(5000, INTERVAL_MS);

const stamp = () => new Date().toLocaleTimeString('en-GB');
const log = (msg) => console.log(`[dev-tick ${stamp()}] ${msg}`);

let online = false;
let warned = false;
let timer = null;

/** One tick. Returns true when the endpoint answered with 2xx. */
async function tick() {
  try {
    const res = await fetch(URL_, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // `{ data: {} }` keeps this working if devTick is ever turned into a callable.
      body: JSON.stringify({ data: {} }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    if (!online) log('connected to devTick');
    online = true;
    warned = false;

    const body = await res.json().catch(() => null);
    const result = body?.result ?? body?.data ?? body ?? {};
    const opened = asList(result.opened);
    const voting = asList(result.voting);
    const closed = asList(result.closed);
    if (opened.length > 0) log(`opened side quest ${opened.join(', ')}`);
    if (voting.length > 0) log(`voting started on ${voting.join(', ')}`);
    if (closed.length > 0) log(`closed ${closed.join(', ')}`);
    return true;
  } catch (err) {
    if (online) log(`lost devTick (${reason(err)}); will keep retrying`);
    else if (!warned) log(`waiting for the functions emulator at ${URL_} ...`);
    online = false;
    warned = true;
    return false;
  }
}

/** runTick reports ids as a string, an array or null; normalise to a list. */
function asList(v) {
  if (Array.isArray(v)) return v;
  return v ? [String(v)] : [];
}

function reason(err) {
  return err?.cause?.code ?? err?.cause?.message ?? err?.message ?? String(err);
}

async function loop() {
  const ok = await tick();
  timer = setTimeout(loop, ok ? INTERVAL_MS : RETRY_MS);
}

function stop(signal) {
  if (timer) clearTimeout(timer);
  log(`stopped (${signal})`);
  process.exit(0);
}
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

log(`ticking ${URL_} every ${INTERVAL_MS / 1000}s`);
loop();
