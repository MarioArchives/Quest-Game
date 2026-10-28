// Deploys the live game (the "prod" alias in .firebaserc): Firestore and Storage rules, functions and the web app.
//
//   npm run deploy                        everything, after checks, a build and a question
//   npm run deploy -- --only web,rules    some targets (rules, functions, web); always deployed backend first
//   npm run deploy -- --dry-run           preflight, checks and build, then stop: nothing is deployed
//   npm run deploy -- --skip-tests        skip typecheck and unit tests
//   npm run deploy -- --yes               do not ask (needed without a terminal)
//
// The site is built from .env.production.local alone (VITE_* from the shell are dropped). Writes .deploy-last.json
// after a deploy, so the next one can remind you what changed by hand (seeding, the police script).

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { packIds } from '../functions/src/shared/packs/index.ts';
import {
  buildEnv,
  checkBundle,
  checkNode,
  checkPacks,
  checkSecrets,
  checkWebEnv,
  consentProblem,
  deploySteps,
  functionsEnv,
  parseArgs,
  parseEnvFile,
  prodAlias,
  reminders,
  secretsNeeded,
  snapshotDrift,
  snapshotWarning,
} from './lib/deploy-plan.mjs';
import { sourceHashes } from './lib/source-hashes.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const LAST = `${ROOT}.deploy-last.json`;

const ok = (/** @type {string} */ m) => console.log(`  ✓ ${m}`);
const bad = (/** @type {string} */ m) => console.log(`  ✗ ${m}`);
const warn = (/** @type {string} */ m) => console.log(`  ! ${m}`);

/** @param {string} path @returns {string | null} */
function readOrNull(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/** Run a command and capture its output (null on failure to start). */
function capture(/** @type {string} */ cmd, /** @type {string[]} */ args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
  return r.error ? null : { status: r.status, out: (r.stdout ?? '').trim() };
}

/** Run a command with inherited output; true on success. */
function run(/** @type {string} */ cmd, /** @type {string[]} */ args, /** @type {object} */ opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  return spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts }).status === 0;
}

function die(/** @type {string} */ msg) {
  console.error(`\n${msg}`);
  process.exit(1);
}

/** The secrets that already exist, or null when gcloud is not there. */
function existingSecrets(/** @type {string[]} */ needed, /** @type {string} */ project) {
  /** @type {string[]} */
  const found = [];
  for (const name of needed) {
    const r = capture('gcloud', ['secrets', 'versions', 'list', name, '--project', project, '--limit', '1', '--format=value(name)']);
    if (!r) return null;
    if (r.status === 0 && r.out) found.push(name);
  }
  return found;
}

/** Preflight: every problem at once. Returns what the later steps need. */
function preflight(/** @type {ReturnType<typeof parseArgs>} */ opts) {
  /** @type {string[]} */
  const errors = [];
  console.log('Preflight');
  const nodeProblem = checkNode(process.version);
  if (nodeProblem) errors.push(nodeProblem);
  else ok(`Node ${process.version}`);

  let project = '';
  try {
    project = prodAlias(JSON.parse(readFileSync(`${ROOT}.firebaserc`, 'utf8')));
    ok(`live project ${project}`);
  } catch (e) {
    errors.push(/** @type {Error} */ (e).message);
  }

  const webText = readOrNull(`${ROOT}.env.production.local`);
  const webEnv = webText === null ? null : parseEnvFile(webText);
  const web = checkWebEnv(webEnv, project);
  errors.push(...web.errors);
  web.warnings.forEach(warn);
  if (web.errors.length === 0) ok('.env.production.local');

  const fn = functionsEnv({
    base: readOrNull(`${ROOT}functions/.env`),
    byId: readOrNull(`${ROOT}functions/.env.${project}`),
    byAlias: readOrNull(`${ROOT}functions/.env.prod`),
  });
  const packErrors = checkPacks(webEnv?.VITE_GAME_PACK, fn.GAME_PACK, packIds());
  errors.push(...packErrors);
  if (packErrors.length === 0) ok(`pack ${fn.GAME_PACK} on site and functions`);

  if (opts.targets.includes('functions') && project) {
    const needed = secretsNeeded(fn);
    if (needed.length === 0) ok('no secrets to check');
    else {
      const existing = existingSecrets(needed, project);
      if (!existing) warn('gcloud not found: secrets not checked.');
      else {
        const missing = checkSecrets(needed, existing);
        errors.push(...missing);
        if (missing.length === 0) ok(`secrets ${needed.join(', ')}`);
      }
    }
  }

  // A pack with a tour snapshot: advisory only, when the screens it shows have changed since it was taken.
  const snapText = fn.GAME_PACK ? readOrNull(`${ROOT}src/packs/${fn.GAME_PACK}/tour/snap/source.json`) : null;
  if (snapText) {
    try {
      const source = JSON.parse(snapText);
      const stale = snapshotWarning(snapshotDrift(source, sourceHashes(ROOT, source.watch ?? [])), fn.GAME_PACK);
      if (stale) warn(stale);
      else ok('tour snapshot matches the screens');
    } catch {
      warn('the tour snapshot\'s source.json is unreadable: re-take the snapshot.');
    }
  }

  const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD'])?.out ?? '?';
  const commit = capture('git', ['rev-parse', '--short', 'HEAD'])?.out ?? '?';
  const dirty = (capture('git', ['status', '--porcelain'])?.out ?? '') !== '';
  ok(`${branch} @ ${commit}`);
  if (dirty) warn('uncommitted changes: the deploy includes them.');

  if (errors.length > 0) {
    errors.forEach(bad);
    die('Preflight failed; nothing was deployed.');
  }
  const consent = consentProblem({ tty: Boolean(process.stdin.isTTY), yes: opts.yes, dryRun: opts.dryRun });
  if (consent) die(consent);
  return { project, pack: fn.GAME_PACK, commit, dirty, fullCommit: capture('git', ['rev-parse', 'HEAD'])?.out ?? commit };
}

/** Build the site and check what came out. */
function buildSite(/** @type {string} */ project) {
  if (!run('npx', ['vite', 'build'], { env: buildEnv(process.env) })) die('The build failed; nothing was deployed.');
  const dir = `${ROOT}dist/assets`;
  const js = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.js')) : [];
  const text = js.map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
  const errors = checkBundle(text, project);
  if (!existsSync(`${ROOT}dist/index.html`)) errors.push('dist/index.html is missing.');
  console.log('\nBuilt site');
  if (errors.length > 0) {
    errors.forEach(bad);
    die('The built site is wrong; nothing was deployed.');
  }
  ok(`${js.length} scripts for ${project}, index.html present`);
}

async function confirm(/** @type {string} */ question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

/** Files changed since the last recorded deploy (committed and not). */
function changedSince(/** @type {string} */ commit) {
  const committed = capture('git', ['diff', '--name-only', commit])?.out ?? '';
  const status = capture('git', ['status', '--porcelain'])?.out ?? '';
  const dirty = status.split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^.* -> /, ''));
  return [...new Set([...committed.split('\n').filter(Boolean), ...dirty])];
}

function lastRecord() {
  try {
    return JSON.parse(readFileSync(LAST, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    die(/** @type {Error} */ (e).message);
  }
  const { project, pack, commit, dirty, fullCommit } = preflight(opts);

  if (!opts.skipTests) {
    console.log('\nChecks');
    if (!run('npm', ['run', 'typecheck']) || !run('npm', ['run', 'test:unit'])) die('Checks failed; nothing was deployed.');
  }
  if (opts.targets.includes('web')) buildSite(project);

  const steps = deploySteps(opts.targets);
  console.log(`\nProject  ${project}\nPack     ${pack}\nCommit   ${commit}${dirty ? ' (+ uncommitted changes)' : ''}\nSteps    ${steps.join('  then  ')}\n`);
  if (opts.dryRun) {
    console.log('Dry run: nothing deployed.');
    return;
  }
  if (!opts.yes && !(await confirm(`Deploy to ${project}? [y/N] `))) die('Not deployed.');

  for (const step of steps) {
    if (!run('npx', ['firebase', 'deploy', '--only', step, '--project', 'prod'])) die(`Deploying ${step} failed; later steps were not run.`);
  }

  const previous = lastRecord();
  writeFileSync(LAST, `${JSON.stringify({ commit: fullCommit, at: new Date().toISOString(), targets: opts.targets, pack }, null, 2)}\n`);
  console.log(`\nDeployed. Site: https://${project}.web.app`);
  const after = reminders({ changed: previous ? changedSince(previous.commit) : [], pack, lastCommit: previous?.commit ?? null });
  if (after.note) console.log(`\n${after.note}`);
  after.lines.forEach((l) => console.log(`  -> ${l}`));
}

await main();
