// Seeds the Firebase Emulator Suite for local development. Safe to run repeatedly.
//
//   npm run seed                      game/state (if missing), game/settings (defaults under GM edits), quest catalogue
//                                     of the chosen pack (the default pack, or $GAME_PACK)
//   npm run seed -- --pack <id>       seed another pack (--pack=<id> works too); an unknown id lists the known ones
//   npm run seed -- --switch-pack     allow game/state to move to another pack (otherwise a pack switch is refused)
//   npm run seed -- --demo            ... plus 4 demo bot players: hands, witnessed quests, a rejection, reactions,
//                                     placeholder photos, and, when the pack has them, a live side quest with two
//                                     entries and map pins
//   npm run seed -- --reset-demo      delete the demo players and everything they own, then seed them again
//   npm run seed -- --reset-settings  overwrite game/settings with the defaults (discards GM edits)
//   npm run seed -- --wait            poll until the emulators answer (up to 2 min) before seeding;
//                                     `npm run dev` runs this so the catalogue is always loaded
//   npm run seed -- --prod            game/state, game/settings and the catalogue in the real project
//                                     (the "prod" alias in .firebaserc); demo data stays emulator-only
//
// Talks to the emulators unless --prod: honours FIRESTORE_EMULATOR_HOST / FIREBASE_STORAGE_EMULATOR_HOST
// (set by `firebase emulators:exec`) and otherwise uses the firebase.json dev ports. --prod signs in with
// Application Default Credentials (`gcloud auth application-default login`).

import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
// Node 24 strips the types, so the pack and its defaults are shared with the functions.
import { defaultSettingsFor, getPack } from '../functions/src/shared/packs/index.ts';
import { buildDemo, DEMO_SIDE_QUEST } from '../functions/src/shared/demo/index.ts';
import { planPeriodics, planRoute, planSettings, planState, resolvePackId } from './lib/seed-plan.mjs';
import { toFirestore } from './lib/stamps.mjs';
import { explainCredentials, selectTarget } from './lib/target.mjs';

const CACHE_CONTROL = 'public,max-age=31536000,immutable';
const WAIT_MS = 120_000;

const FLAGS = ['--demo', '--reset-demo', '--reset-settings', '--wait', '--prod', '--switch-pack', '--help', '-h'];
const argv = process.argv.slice(2);
// `--pack <id>` takes a value, which is not a flag; `--pack=<id>` is one token.
const flagArgs = argv.filter((a, i) => !(argv[i - 1] === '--pack') && a !== '--pack' && !a.startsWith('--pack='));
const args = new Set(flagArgs);
const unknown = flagArgs.filter((a) => !FLAGS.includes(a));
if (args.has('--help') || args.has('-h') || unknown.length > 0) {
  if (unknown.length > 0) console.error(`Unknown option(s): ${unknown.join(' ')}\n`);
  console.log('Usage: npm run seed -- [--demo] [--reset-demo] [--reset-settings] [--wait] [--prod] [--pack <id>] [--switch-pack]');
  process.exit(unknown.length > 0 ? 1 : 0);
}
const RESET_DEMO = args.has('--reset-demo');
const DEMO = args.has('--demo') || RESET_DEMO;
const RESET_SETTINGS = args.has('--reset-settings');
const WAIT = args.has('--wait');
const PROD = args.has('--prod');
const SWITCH_PACK = args.has('--switch-pack');
let PACK_ID;
try {
  PACK_ID = resolvePackId(argv, process.env);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
const PACK = getPack(PACK_ID);
const DEFAULT_SETTINGS = defaultSettingsFor(PACK);
if (PROD && (DEMO || WAIT)) {
  console.error('--demo, --reset-demo and --wait are for the emulators only; they cannot be combined with --prod.');
  process.exit(1);
}

const PROJECT_ID = selectTarget({
  prod: PROD,
  emulators: { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199' },
});
const BUCKET = `${PROJECT_ID}.appspot.com`;

initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
const db = getFirestore();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when something answers HTTP on host:port (any status counts). */
async function answers(host) {
  try {
    await fetch(`http://${host}/`, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

/** Poll the emulators this run needs until they answer, or fail after WAIT_MS (--wait), or at once. */
async function ensureEmulators() {
  const targets = [{ name: 'Firestore', host: process.env.FIRESTORE_EMULATOR_HOST }];
  if (DEMO) targets.push({ name: 'Storage', host: process.env.FIREBASE_STORAGE_EMULATOR_HOST });

  const deadline = Date.now() + WAIT_MS;
  let waited = false;
  for (const { name, host } of targets) {
    let lastNote = Date.now();
    while (!(await answers(host))) {
      if (!WAIT) {
        throw new Error(
          `Cannot reach the ${name} emulator at ${host}.\n` +
            '  Start it with `npm run dev` (or `npm run emulators`) in another terminal, then retry\n' +
            '  (or pass --wait to keep trying for up to two minutes).',
        );
      }
      if (Date.now() > deadline) throw new Error(`Gave up waiting for the ${name} emulator at ${host} after 2 minutes.`);
      if (!waited) console.log(`Waiting for the emulators (${name} at ${host}) ...`);
      else if (Date.now() - lastNote > 15_000) {
        console.log(`  still waiting for ${name} at ${host} ...`);
        lastNote = Date.now();
      }
      waited = true;
      await sleep(1000);
    }
  }
  if (waited) console.log('Emulators are up.');
}

/** Write docs in batches of 400. `entries` is [ref, data, options?]. */
async function writeAll(entries) {
  for (let i = 0; i < entries.length; i += 400) {
    const batch = db.batch();
    for (const [ref, data, options] of entries.slice(i, i + 400)) {
      if (options) batch.set(ref, data, options);
      else batch.set(ref, data);
    }
    await batch.commit();
  }
}

/** Create only the docs that do not exist yet (never overwrites). Returns { created, skipped }. */
async function createMissing(entries) {
  if (entries.length === 0) return { created: 0, skipped: 0 };
  const snaps = await db.getAll(...entries.map(([ref]) => ref));
  const missing = entries.filter((_, i) => !snaps[i].exists);
  await writeAll(missing);
  return { created: missing.length, skipped: entries.length - missing.length };
}

// ---------------------------------------------------------------- core data

async function seedState() {
  const ref = db.doc('game/state');
  const plan = planState((await ref.get()).data(), PACK_ID, { switchPack: SWITCH_PACK });
  if (plan.action === 'refuse') throw new PackRefused(plan.message);
  if (plan.action === 'create') await ref.set(plan.data);
  else if (plan.data) await ref.set(plan.data, { merge: true });
  return plan.message;
}

class PackRefused extends Error {}

async function seedSettings() {
  const ref = db.doc('game/settings');
  const plan = planSettings((await ref.get()).data(), DEFAULT_SETTINGS, { reset: RESET_SETTINGS });
  if (plan.mode === 'none') return 'kept GM values';
  await ref.set(plan.data, plan.mode === 'merge' ? { merge: true } : undefined);
  if (RESET_SETTINGS) return 'reset to defaults';
  return plan.mode === 'set' ? 'created from defaults' : `kept GM values, added missing: ${plan.added.join(', ')}`;
}

/**
 * Upsert the catalogue. An existing template keeps its `active` flag so GM retirements survive.
 * Quests never depend on a location or a win rule, so those legacy fields are removed from old docs.
 * Seeded templates (ids `p-…` / `g-…`) that are no longer in the pack's catalogue are retired, so replacing the
 * catalogue takes effect; GM-written templates have auto ids and are never touched.
 */
async function seedTemplates(quests) {
  const items = [
    ...quests.personal.map((q) => ({ ...q, scope: 'personal' })),
    ...quests.global.map((q) => ({ ...q, scope: 'global' })),
  ];
  const refs = items.map((q) => db.doc(`questTemplates/${q.id}`));
  const snaps = await db.getAll(...refs);
  let created = 0;
  const entries = items.map((q, i) => {
    const existing = snaps[i].data();
    if (!existing) created++;
    const data = {
      title: q.title,
      description: q.description,
      scope: q.scope,
      windowMin: q.scope === 'global' ? (q.windowMin ?? null) : null,
    };
    if (q.scope === 'personal' && q.points != null) data.points = q.points;
    if (!existing) data.active = true;
    for (const legacy of ['venueId', 'winRule']) if (existing && legacy in existing) data[legacy] = FieldValue.delete();
    return [refs[i], data, { merge: true }];
  });
  const listed = new Set(items.map((q) => q.id));
  const dropped = (await db.collection('questTemplates').where('active', '==', true).get()).docs.filter(
    (d) => /^[pg]-/.test(d.id) && !listed.has(d.id),
  );
  for (const d of dropped) entries.push([d.ref, { active: false }, { merge: true }]);
  await writeAll(entries);
  return {
    personal: quests.personal.length,
    global: quests.global.length,
    created,
    updated: items.length - created,
    retired: dropped.length,
  };
}

/** The pack's starting route as hidden stops. Creates only missing ids, so the GM's edits survive a re-seed. */
async function seedRoute() {
  const stops = planRoute(PACK);
  if (stops.length === 0) return null;
  const entries = stops.map((s) => [db.doc(`stops/${s.id}`), { ...s.data, createdAt: FieldValue.serverTimestamp() }]);
  return createMissing(entries);
}

/** The pack's starting periodic missions. Creates only missing ids, so the GM's edits survive a re-seed. */
async function seedPeriodics() {
  const plan = planPeriodics(PACK);
  if (plan.length === 0) return null;
  return createMissing(plan.map((p) => [db.doc(`periodics/${p.id}`), { ...p.data, createdAt: FieldValue.serverTimestamp() }]));
}

// ---------------------------------------------------------------- demo data

async function uploadPoster({ path, contentType, text }) {
  await getStorage()
    .bucket(BUCKET)
    .file(path)
    .save(Buffer.from(text), {
      contentType,
      resumable: false,
      metadata: { cacheControl: CACHE_CONTROL },
    });
}

/** Delete every demo document and photo (players, their submissions, ledger, feed posts, side quest, pins). */
async function resetDemo() {
  const uids = buildDemo({ pack: PACK, settings: DEFAULT_SETTINGS, nowMs: Date.now() }).players.map((p) => p.uid);
  for (const uid of uids) {
    await db.recursiveDelete(db.doc(`players/${uid}`));
    await db.doc(`locations/${uid}`).delete();
    await db.doc(`motives/${uid}`).delete();
  }
  for (const col of ['submissions', 'pointsLedger', 'feed', 'rewards']) {
    const snap = await db.collection(col).where('uid', 'in', uids).get();
    for (const doc of snap.docs) await db.recursiveDelete(doc.ref); // feed posts take their reactions with them
  }
  const sideFeed = await db.collection('feed').where('ref', '==', DEMO_SIDE_QUEST).get();
  for (const doc of sideFeed.docs) await db.recursiveDelete(doc.ref);
  await db.recursiveDelete(db.doc(`globalQuests/${DEMO_SIDE_QUEST}`));
  for (const d of buildDemo({ pack: PACK, settings: DEFAULT_SETTINGS, nowMs: Date.now() }).docs) {
    if (d.path.startsWith('stops/')) await db.doc(d.path).delete();
  }
  for (const uid of uids) await getStorage().bucket(BUCKET).deleteFiles({ prefix: `submissions/${uid}/`, force: true });
  console.log('  demo reset      removed the demo players and everything they own');
}

async function seedDemo(settings) {
  const demo = buildDemo({ pack: PACK, settings, nowMs: Date.now() });

  // Locations are live data: always rewritten, with a fresh updatedAt so the pins show as "just now".
  const isLocation = (d) => d.path.startsWith('locations/');
  const live = demo.docs.filter(isLocation);
  const rest = demo.docs.filter((d) => !isLocation(d));

  // Everything else is created only when missing, so a rerun never overwrites a demo player's progress.
  const snaps = rest.length ? await db.getAll(...rest.map((d) => db.doc(d.path))) : [];
  const missing = rest.filter((_, i) => !snaps[i].exists);
  const writes = [...missing, ...live];
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const { path, data } of writes.slice(i, i + 400)) batch.set(db.doc(path), toFirestore(data));
    await batch.commit();
  }

  // Poster images are deterministic, so re-uploading just overwrites the same objects.
  for (const f of demo.files) await uploadPoster(f);

  const summary = [];
  const players = demo.docs.filter((d) => /^players\/[^/]+$/.test(d.path));
  for (const { data } of players) {
    summary.push(`${data.displayName} (${data.points} pts, ${data.questsCompleted} done)`);
  }
  const side = demo.docs.find((d) => /^globalQuests\/[^/]+$/.test(d.path));
  if (side) {
    const entries = demo.docs.filter((d) => d.data.kind === 'global').length;
    summary.push(`side quest "${side.data.title}" is live with ${entries} entries`);
  }
  summary.push(`${live.length} map pins`);
  const stops = demo.docs.filter((d) => d.path.startsWith('stops/')).length;
  if (stops) summary.push(`${stops} route stops`);
  return { created: missing.length, skipped: rest.length - missing.length, photos: demo.files.length, summary };
}

// ---------------------------------------------------------------- main

async function countOf(query) {
  return (await query.count().get()).data().count;
}

async function main() {
  if (!PROD) await ensureEmulators();
  console.log(`Seeding ${PROJECT_ID} (${PROD ? 'production Firestore' : `Firestore ${process.env.FIRESTORE_EMULATOR_HOST}`})`);

  const quests = PACK.catalogue;
  console.log(`Pack: ${PACK_ID} (${PACK.name})`);

  console.log(`  game/state      ${await seedState()}`);
  console.log(`  game/settings   ${await seedSettings()}`);
  const t = await seedTemplates(quests);
  console.log(`  questTemplates  ${t.personal} personal + ${t.global} global (${t.created} new, ${t.updated} updated, ${t.retired} old retired)`);

  if (!DEMO) {
    const r = await seedRoute();
    if (r) console.log(`  route stops     ${r.created} created, ${r.skipped} already there (hidden until the GM reveals them)`);
  }
  const pm = await seedPeriodics();
  if (pm) console.log(`  periodic        ${pm.created} created, ${pm.skipped} already there (the GM manages them)`);

  if (DEMO) {
    if (RESET_DEMO) await resetDemo();
    console.log(`  demo players    uploading photos to ${BUCKET} (Storage ${process.env.FIREBASE_STORAGE_EMULATOR_HOST})`);
    const settings = { ...DEFAULT_SETTINGS, ...((await db.doc('game/settings').get()).data() ?? {}) };
    const d = await seedDemo(settings);
    console.log(`  demo players    ${d.created} docs created, ${d.skipped} already there, ${d.photos} photos uploaded`);
    for (const line of d.summary) console.log(`                  - ${line}`);
  }

  const counts = {
    questTemplates: await countOf(db.collection('questTemplates')),
    players: await countOf(db.collection('players')),
    quests: await countOf(db.collectionGroup('quests')),
    submissions: await countOf(db.collection('submissions')),
    pointsLedger: await countOf(db.collection('pointsLedger')),
    feed: await countOf(db.collection('feed')),
    reactions: await countOf(db.collectionGroup('reactions')),
    globalQuests: await countOf(db.collection('globalQuests')),
    locations: await countOf(db.collection('locations')),
    ...(PACK.features.stops ? { stops: await countOf(db.collection('stops')) } : {}),
  };
  console.log(`Firestore now holds: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  if (!DEMO && !PROD) console.log('Tip: add `-- --demo` for demo players and photos (plus a live side quest and map pins where the pack has them).');
  console.log('Done.');
}

main().catch((err) => {
  if (err instanceof PackRefused) {
    console.error(`\n${err.message}`);
    process.exit(1);
  }
  console.error(`\nSeed failed: ${PROD ? explainCredentials(err) : (err?.message ?? err)}`);
  process.exit(1);
});
