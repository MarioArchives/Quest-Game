// Pure decisions for scripts/deploy.mjs, kept apart so they can be tested without a shell, git or Firebase.

import { policeLineConfig } from '../../functions/src/firebase/lineConfig.ts';

export const USAGE = 'Usage: npm run deploy -- [--only web,functions,rules] [--dry-run] [--skip-tests] [--yes]';

/** Deploy order: the backend (rules, functions) before the site. */
const TARGETS = ['rules', 'functions', 'web'];

/** The keys the web build cannot do without. */
const WEB_KEYS = [
  'VITE_GAME_PACK',
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

/**
 * Read the command line.
 * @param {string[]} argv
 * @returns {{ targets: string[], dryRun: boolean, skipTests: boolean, yes: boolean }}
 */
export function parseArgs(argv) {
  const fail = (/** @type {string} */ why) => new Error(`${why}\n${USAGE}`);
  const wanted = new Set();
  let onlyGiven = false;
  const flags = { dryRun: false, skipTests: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    let list;
    if (a === '--only') {
      list = argv[++i];
      if (list === undefined || list.startsWith('--')) throw fail('--only needs a list of targets.');
    } else if (a.startsWith('--only=')) {
      list = a.slice('--only='.length);
    } else if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--skip-tests') flags.skipTests = true;
    else if (a === '--yes') flags.yes = true;
    else throw fail(`Unknown argument: ${a}`);
    if (list !== undefined) {
      onlyGiven = true;
      for (const t of list.split(',').map((s) => s.trim()).filter(Boolean)) {
        if (!TARGETS.includes(t)) throw fail(`Unknown target: ${t}`);
        wanted.add(t);
      }
    }
  }
  if (onlyGiven && wanted.size === 0) throw fail('--only needs a list of targets.');
  return { targets: TARGETS.filter((t) => !onlyGiven || wanted.has(t)), ...flags };
}

/**
 * The project id aliased "prod" in .firebaserc.
 * @param {{ projects?: Record<string, string> }} rc
 * @returns {string}
 */
export function prodAlias(rc) {
  const id = rc?.projects?.prod;
  if (!id) throw new Error('No "prod" alias in .firebaserc. Add one with `npx firebase use --add`.');
  return id;
}

/**
 * @param {string} version e.g. process.version
 * @returns {string | null} a problem, or null
 */
export function checkNode(version) {
  const major = Number.parseInt(version.replace(/^v/, ''), 10);
  if (major >= 24) return null;
  return `Node 24 or later is needed (this is ${version}). Switch with: export PATH=~/.nvm/versions/node/v24.13.1/bin:$PATH`;
}

/**
 * Parse KEY=value lines, skipping comments and blanks and unquoting values.
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnvFile(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.endsWith(value[0])) value = value.slice(1, -1);
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
}

/**
 * Check the env the web build will read (.env.production.local).
 * @param {Record<string, string> | null} env null when the file is missing
 * @param {string} projectId
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function checkWebEnv(env, projectId) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  if (!env) {
    errors.push('.env.production.local is missing: the site would build without the live project\'s Firebase config.');
    return { errors, warnings };
  }
  const missing = WEB_KEYS.filter((k) => !env[k]);
  if (missing.length > 0) errors.push(`.env.production.local lacks ${missing.join(', ')}.`);
  if (env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_PROJECT_ID !== projectId) {
    errors.push(`.env.production.local points at ${env.VITE_FIREBASE_PROJECT_ID}, but the live project is ${projectId}.`);
  }
  if (env.VITE_USE_EMULATORS === 'true') errors.push('.env.production.local sets VITE_USE_EMULATORS=true.');
  if (env.VITE_BACKEND === 'mock') errors.push('.env.production.local sets VITE_BACKEND=mock.');
  if (!env.VITE_FIREBASE_VAPID_KEY) warnings.push('VITE_FIREBASE_VAPID_KEY is not set: the site will build without push notifications.');
  return { errors, warnings };
}

/**
 * The functions' env as Firebase reads it: .env, then .env.<project id>, then .env.<alias>.
 * @param {{ base: string | null, byId: string | null, byAlias: string | null }} files file texts, null when absent
 * @returns {Record<string, string>}
 */
export function functionsEnv({ base, byId, byAlias }) {
  return { ...parseEnvFile(base ?? ''), ...parseEnvFile(byId ?? ''), ...parseEnvFile(byAlias ?? '') };
}

/**
 * @param {string | undefined} webPack VITE_GAME_PACK
 * @param {string | undefined} functionsPack GAME_PACK
 * @param {string[]} known registered pack ids
 * @returns {string[]} errors
 */
export function checkPacks(webPack, functionsPack, known) {
  /** @type {string[]} */
  const errors = [];
  if (!functionsPack) errors.push('The functions have no GAME_PACK (set it in functions/.env or functions/.env.<project id>).');
  for (const [label, id] of [['The site (VITE_GAME_PACK)', webPack], ['The functions (GAME_PACK)', functionsPack]]) {
    if (id && !known.includes(id)) errors.push(`${label} names an unknown pack "${id}" (known: ${known.join(', ')}).`);
  }
  if (webPack && functionsPack && webPack !== functionsPack) {
    errors.push(`The site builds pack "${webPack}" but the functions run "${functionsPack}".`);
  }
  return errors;
}

/**
 * The secrets the functions declare for this env.
 * @param {Record<string, string | undefined>} env the functions' env
 * @returns {string[]}
 */
export function secretsNeeded(env) {
  return policeLineConfig(env).secrets;
}

/**
 * @param {string[]} needed
 * @param {string[]} existing
 * @returns {string[]} errors
 */
export function checkSecrets(needed, existing) {
  return needed.filter((n) => !existing.includes(n)).map((n) => `Secret ${n} does not exist in the live project (the functions declare it).`);
}

/**
 * The shell's env for the build, without VITE_* so only .env.production.local counts.
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, string | undefined>}
 */
export function buildEnv(env) {
  return Object.fromEntries(Object.entries(env).filter(([k]) => !k.startsWith('VITE_')));
}

/**
 * The `firebase deploy --only` values, backend before the site.
 * @param {string[]} targets any of rules, functions, web
 * @returns {string[]}
 */
export function deploySteps(targets) {
  const backend = [];
  if (targets.includes('rules')) backend.push('firestore,storage');
  if (targets.includes('functions')) backend.push('functions');
  const steps = backend.length > 0 ? [backend.join(',')] : [];
  // Rules and functions are one step when both are wanted.
  if (targets.includes('web')) steps.push('hosting');
  return steps;
}

/**
 * Check the built JS belongs to the live project.
 * @param {string} text all of dist/assets/*.js
 * @param {string} projectId
 * @returns {string[]} errors
 */
export function checkBundle(text, projectId) {
  /** @type {string[]} */
  const errors = [];
  if (!text.includes(projectId)) errors.push(`The built site never mentions ${projectId}.`);
  if (text.includes('demo-quest-game')) errors.push('The built site contains the demo project id (demo-quest-game).');
  if (text.includes('127.0.0.1')) errors.push('The built site contains an emulator host (127.0.0.1).');
  return errors;
}

/**
 * What to do by hand after a deploy, from the files changed since the last one.
 * @param {{ changed: string[], pack: string, lastCommit: string | null }} input
 * @returns {{ lines: string[], note: string | null }}
 */
export function reminders({ changed, pack, lastCommit }) {
  if (!lastCommit) return { lines: [], note: 'No earlier deploy is recorded, so there is nothing to compare: check by hand whether quests or the police script changed.' };
  /** @type {string[]} */
  const lines = [];
  if (changed.includes(`functions/src/shared/packs/${pack}/quests.json`)) {
    lines.push(`The ${pack} quests changed: run npm run seed -- --prod --pack ${pack}`);
  }
  if (changed.includes('services/telegram-police/police_call.py')) {
    lines.push('The police script changed: copy services/telegram-police/police_call.py to the telegram-police-line-vm VM (~/police-line) and restart the police-line service.');
  }
  return { lines, note: null };
}

/**
 * The files a pack's tour snapshot was taken from that have changed since (edited, added or removed), so the screens it
 * shows may no longer match the game's. Packs without a snapshot have nothing to compare.
 * @param {{ files: Record<string, string> } | null} source the snapshot's source.json, or null
 * @param {Record<string, string>} now the same paths' hashes as they are now
 * @returns {string[]}
 */
export function snapshotDrift(source, now) {
  if (!source?.files) return [];
  const paths = new Set([...Object.keys(source.files), ...Object.keys(now)]);
  return [...paths].filter((p) => source.files[p] !== now[p]).sort();
}

/**
 * The preflight's advisory line about the snapshot, or null when it's up to date (or the pack has none).
 * @param {string[]} drift from snapshotDrift
 * @param {string} pack
 * @returns {string | null}
 */
export function snapshotWarning(drift, pack) {
  if (drift.length === 0) return null;
  const shown = drift.slice(0, 3).join(', ');
  const more = drift.length > 3 ? ` and ${drift.length - 3} more` : '';
  return `the tour's specimen screens may be stale: ${shown}${more} changed since its snapshot. Re-take it: node scripts/packs/${pack}/snapshot-tour.mjs`;
}

/**
 * @param {{ tty: boolean, yes: boolean, dryRun: boolean }} input
 * @returns {string | null} a problem, or null
 */
export function consentProblem({ tty, yes, dryRun }) {
  if (tty || yes || dryRun) return null;
  return 'No terminal to ask in: pass --yes to deploy without asking, or --dry-run.';
}
