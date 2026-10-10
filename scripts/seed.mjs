// Seeds the Firebase Emulator Suite for local development. Safe to run repeatedly.
//
//   npm run seed                      game/state (if missing), game/settings (defaults under GM edits), quest catalogue
//   npm run seed -- --demo            ... plus 4 demo bot players: hands, witnessed quests, a rejection, reactions,
//                                     a live side quest with two entries, placeholder photos and map pins
//   npm run seed -- --reset-demo      delete the demo players and everything they own, then seed them again
//   npm run seed -- --reset-settings  overwrite game/settings with the defaults (discards GM edits)
//   npm run seed -- --wait            poll until the emulators answer (up to 2 min) before seeding;
//                                     `npm run dev` runs this so the catalogue is always loaded
//
// Talks to the emulators only: honours FIRESTORE_EMULATOR_HOST / FIREBASE_STORAGE_EMULATOR_HOST (set by
// `firebase emulators:exec`) and otherwise uses the firebase.json dev ports.

import { readFile } from 'node:fs/promises';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
// Node 24 strips the types, so the real defaults are shared with the functions.
import { DEFAULT_SETTINGS } from '../functions/src/shared/settings.ts';

const PROJECT_ID = 'demo-festival-quest';
const BUCKET = `${PROJECT_ID}.appspot.com`;
const CACHE_CONTROL = 'public,max-age=31536000,immutable';
const CASTLE = { lat: 54.0495, lng: -2.8048 };
const WAIT_MS = 120_000;
const DEMO_SIDE_QUEST = 'demo-side';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= '127.0.0.1:9199';
// Skip the slow Google metadata-server probe (the emulators need no credentials).
process.env.METADATA_SERVER_DETECTION ??= 'none';

const FLAGS = ['--demo', '--reset-demo', '--reset-settings', '--wait', '--help', '-h'];
const args = new Set(process.argv.slice(2));
const unknown = [...args].filter((a) => !FLAGS.includes(a));
if (args.has('--help') || args.has('-h') || unknown.length > 0) {
  if (unknown.length > 0) console.error(`Unknown option(s): ${unknown.join(' ')}\n`);
  console.log('Usage: npm run seed -- [--demo] [--reset-demo] [--reset-settings] [--wait]');
  process.exit(unknown.length > 0 ? 1 : 0);
}
const RESET_DEMO = args.has('--reset-demo');
const DEMO = args.has('--demo') || RESET_DEMO;
const RESET_SETTINGS = args.has('--reset-settings');
const WAIT = args.has('--wait');

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
  if ((await ref.get()).exists) return 'kept existing';
  await ref.set({ status: 'lobby', startedAt: null, endedAt: null, nextGlobalQuestAt: null, announcement: null });
  return 'created (lobby)';
}

async function seedSettings() {
  const ref = db.doc('game/settings');
  const existing = (await ref.get()).data();
  if (RESET_SETTINGS) {
    await ref.set({ ...DEFAULT_SETTINGS });
    return 'reset to defaults';
  }
  if (!existing) {
    await ref.set({ ...DEFAULT_SETTINGS });
    return 'created from defaults';
  }
  // Only fill in keys that are missing; existing values (and any legacy keys) are left alone.
  const missing = Object.fromEntries(Object.entries(DEFAULT_SETTINGS).filter(([k]) => !(k in existing)));
  const added = Object.keys(missing);
  if (added.length > 0) await ref.set(missing, { merge: true });
  return added.length > 0 ? `kept GM values, added missing: ${added.join(', ')}` : 'kept GM values';
}

/**
 * Upsert the catalogue. An existing template keeps its `active` flag so GM retirements survive.
 * Quests never depend on a location or a win rule, so those legacy fields are removed from old docs.
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
    if (!existing) data.active = true;
    for (const legacy of ['venueId', 'winRule']) if (existing && legacy in existing) data[legacy] = FieldValue.delete();
    return [refs[i], data, { merge: true }];
  });
  await writeAll(entries);
  return { personal: quests.personal.length, global: quests.global.length, created, updated: items.length - created };
}

// ---------------------------------------------------------------- demo data

/** Small deterministic PRNG so the bots always get the same hands. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function shuffled(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const xmlEscape = (s) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);

/** Greedy word wrap into at most `maxLines` lines of `maxChars`. */
function wrap(text, maxChars, maxLines) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && (line + ' ' + word).length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '...';
  }
  return lines;
}

/** Gig-poster style placeholder photo: paper, ink and one red. 4:3 so it behaves like a real photo. */
function posterSvg({ title, who, width, height }) {
  const k = width / 1200;
  const r = (v) => Math.round(v * 10) / 10;
  const lines = wrap(title.toUpperCase(), 14, 3);
  // Conservative glyph width (0.72em, bold caps) so the fallback fonts still fit when Anton is not installed.
  const longest = Math.max(...lines.map((l) => l.length));
  const fontSize = Math.min(150 * k, (1020 * k) / (longest * 0.72));
  const titleLines = lines
    .map((l, i) => `<text x="${r(90 * k)}" y="${r(300 * k + i * fontSize * 1.02)}" font-size="${r(fontSize)}">${xmlEscape(l)}</text>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="#F4F2EE"/>
<rect x="${r(24 * k)}" y="${r(24 * k)}" width="${r(width - 48 * k)}" height="${r(height - 48 * k)}" fill="none" stroke="#111" stroke-width="${r(6 * k)}"/>
<circle cx="${r(width - 230 * k)}" cy="${r(height - 250 * k)}" r="${r(170 * k)}" fill="#E1251B"/>
<rect x="${r(70 * k)}" y="${r(70 * k)}" width="${r(390 * k)}" height="${r(56 * k)}" fill="#E1251B"/>
<g font-family="Anton, Impact, 'Arial Narrow Bold', 'Arial Black', sans-serif" font-weight="700" fill="#111">
<text x="${r(90 * k)}" y="${r(112 * k)}" font-size="${r(34 * k)}" fill="#fff" letter-spacing="${r(3 * k)}">FESTIVAL QUEST</text>
${titleLines}
<text x="${r(90 * k)}" y="${r(height - 130 * k)}" font-size="${r(54 * k)}" fill="#E1251B">${xmlEscape(who.toUpperCase())}</text>
</g>
<text x="${r(90 * k)}" y="${r(height - 70 * k)}" font-family="Archivo, Arial, sans-serif" font-size="${r(26 * k)}" font-weight="700" fill="#111" letter-spacing="${r(2 * k)}">DEMO PHOTO · LANCASTER MUSIC FESTIVAL</text>
</svg>
`;
}

/**
 * Demo players. `done` quests were claimed, then approved by a bot witness; `evidence` is what the player
 * added afterwards ('photo' = photo + caption, 'caption' = comment only, null = none yet).
 * `rejected` is a claim its witness turned down; `submitted` is a claim still waiting for its witness.
 */
const BOTS = [
  {
    uid: 'demo-maya',
    name: 'Maya',
    done: [
      { evidence: 'photo', caption: 'Found it tucked behind the amps.', note: 'Saw the whole thing. Legend.' },
      { evidence: 'photo', caption: 'Absolutely worth the queue.', note: null },
      { evidence: null, caption: null, note: 'Heard it with my own ears.' },
    ],
    rerolls: 0,
    offset: [0.0003, -0.0007],
  },
  {
    uid: 'demo-sam',
    name: 'Sam',
    done: [
      { evidence: 'photo', caption: 'Ten out of ten, would repeat.', note: null },
      { evidence: 'caption', caption: 'No photo, but trust me, it happened.', note: 'I was there, it did.' },
    ],
    rerolls: 1,
    offset: [-0.0004, 0.0005],
  },
  {
    uid: 'demo-priya',
    name: 'Priya',
    done: [
      { evidence: 'photo', caption: 'Everyone was very nice about it.', note: 'Very nice about it, I can confirm.' },
      { evidence: 'photo', caption: 'The crowd loved it.', note: null },
    ],
    submitted: { witness: 'demo-maya' },
    rerolls: 0,
    offset: [0.0008, 0.0004],
  },
  {
    uid: 'demo-jonah',
    name: 'Jonah',
    done: [{ evidence: 'photo', caption: 'Easier than expected, honestly.', note: null }],
    rejected: { witness: 'demo-sam', note: 'That was a different band. Try again!' },
    rerolls: 2,
    offset: [-0.0009, -0.0003],
  },
];

/** Reactions on feed posts: post id -> [voter uid, emoji]. Only applied to posts that get created. */
const REACTIONS = {
  'approved-demo-maya-1': [['demo-sam', '🔥'], ['demo-priya', '😍'], ['demo-jonah', '👏']],
  'approved-demo-maya-2': [['demo-priya', '🤘']],
  'approved-demo-sam-1': [['demo-maya', '😂'], ['demo-jonah', '🔥']],
  'approved-demo-priya-1': [['demo-maya', '👏']],
  'rejected-demo-jonah-rejected': [['demo-maya', '😮'], ['demo-priya', '😂']],
  'entry-demo-maya-side': [['demo-priya', '🔥'], ['demo-jonah', '🤘']],
  'entry-demo-sam-side': [['demo-maya', '👏']],
};

async function uploadPoster(path, svg) {
  await getStorage()
    .bucket(BUCKET)
    .file(path)
    .save(Buffer.from(svg), {
      contentType: 'image/svg+xml',
      resumable: false,
      metadata: { cacheControl: CACHE_CONTROL },
    });
}

/** Delete every demo document and photo (players, their submissions, ledger, feed posts, side quest, pins). */
async function resetDemo() {
  const uids = BOTS.map((b) => b.uid);
  for (const uid of uids) {
    await db.recursiveDelete(db.doc(`players/${uid}`));
    await db.doc(`locations/${uid}`).delete();
  }
  for (const col of ['submissions', 'pointsLedger', 'feed']) {
    const snap = await db.collection(col).where('uid', 'in', uids).get();
    for (const doc of snap.docs) await db.recursiveDelete(doc.ref); // feed posts take their reactions with them
  }
  const sideFeed = await db.collection('feed').where('ref', '==', DEMO_SIDE_QUEST).get();
  for (const doc of sideFeed.docs) await db.recursiveDelete(doc.ref);
  await db.recursiveDelete(db.doc(`globalQuests/${DEMO_SIDE_QUEST}`));
  for (const uid of uids) await getStorage().bucket(BUCKET).deleteFiles({ prefix: `submissions/${uid}/`, force: true });
  console.log('  demo reset      removed the demo players and everything they own');
}

async function seedDemo(quests, settings) {
  const { personal, global: sideQuests } = quests;
  const questPoints = settings.questPoints ?? DEFAULT_SETTINGS.questPoints;
  const rejectPenalty = settings.rejectPenalty ?? DEFAULT_SETTINGS.rejectPenalty;
  const sidePoints = settings.sideQuestPoints ?? DEFAULT_SETTINGS.sideQuestPoints;
  const windowMin = settings.globalWindowMin ?? DEFAULT_SETTINGS.globalWindowMin;
  const handSize = settings.starterQuestCount ?? DEFAULT_SETTINGS.starterQuestCount;
  const now = Date.now();
  const at = (minutesAgo) => Timestamp.fromMillis(now - minutesAgo * 60_000);

  const entries = [];
  const uploads = [];
  const summary = [];
  const postIds = new Set();
  let timeline = 200; // minutes ago; each event is a bit more recent than the last

  // Witnesses are always other bots: bot i is vouched for by bot i+1, i+2, ... in turn (never itself).
  const witnessFor = (botIndex, n) => BOTS[(botIndex + 1 + ((n - 1) % (BOTS.length - 1))) % BOTS.length];
  const claimOf = (t, witnessUid) => ({ witnessUid, claimTitle: t.title, claimDescription: t.description });
  const pushPhoto = (path, thumbPath, title, who) => {
    uploads.push([path, posterSvg({ title, who, width: 1200, height: 900 })]);
    uploads.push([thumbPath, posterSvg({ title, who, width: 400, height: 300 })]);
  };

  /** Feed post, with its reactions (reactionCount is kept in step with them). */
  const pushPost = (id, createdAt, fields) => {
    postIds.add(id);
    const reactions = REACTIONS[id] ?? [];
    entries.push([db.doc(`feed/${id}`), { ...fields, createdAt, reactionCount: reactions.length }]);
    reactions.forEach(([uid, emoji], i) => {
      entries.push([db.doc(`feed/${id}/reactions/${uid}`), { emoji, createdAt: Timestamp.fromMillis(createdAt.toMillis() + (i + 1) * 90_000) }]);
    });
  };

  for (const [botIndex, bot] of BOTS.entries()) {
    const rng = mulberry32(hashString(bot.uid));
    const deck = shuffled(personal, rng);
    const needed = handSize + bot.done.length + bot.rerolls + (bot.rejected ? 1 : 0);
    if (deck.length < needed) throw new Error(`Not enough personal quests in quests.json for ${bot.name}`);
    const take = (n) => deck.splice(0, n);

    const live = take(handSize); // the current hand: q1.. (a fresh quest is dealt whenever one is completed or rejected)
    const done = take(bot.done.length);
    const replaced = take(bot.rerolls);
    const rejectedQuest = bot.rejected ? take(1)[0] : null;

    const questData = (t, status, minutesAgo, extra = {}) => ({
      templateId: t.id,
      title: t.title,
      description: t.description,
      status,
      assignedAt: at(minutesAgo),
      submissionId: null,
      completedAt: null,
      exposedBy: null,
      exposedAt: null,
      ...extra,
    });
    const questRef = (id) => db.doc(`players/${bot.uid}/quests/${id}`);
    const pending = bot.submitted ? `${bot.uid}-pending` : null;
    const rejectedId = bot.rejected ? `${bot.uid}-rejected` : null;

    entries.push([
      db.doc(`players/${bot.uid}`),
      {
        displayName: bot.name,
        photoURL: null,
        joinedAt: at(240),
        points: questPoints * bot.done.length - (bot.rejected ? rejectPenalty : 0),
        rerollsUsed: bot.rerolls,
        questsCompleted: bot.done.length,
      },
    ]);
    pushPost(`join-${bot.uid}`, at(240), { type: 'join', text: `${bot.name} joined the game`, uid: bot.uid, ref: null });

    // Live hand: mostly active; the last quest is "submitted" while its claim waits for the witness.
    live.forEach((t, i) => {
      const isSubmitted = pending && i === live.length - 1;
      entries.push([
        questRef(`q${i + 1}`),
        questData(t, isSubmitted ? 'submitted' : 'active', 230 - i * 5, { submissionId: isSubmitted ? pending : null }),
      ]);
    });
    replaced.forEach((t, i) => entries.push([questRef(`rr${i + 1}`), questData(t, 'replaced', 235 - i * 5)]));

    // Completed quests: claimed with no photo, approved by a bot witness, evidence added afterwards.
    done.forEach((t, i) => {
      const n = i + 1;
      const d = bot.done[i];
      const subId = `${bot.uid}-${n}`;
      const minutesAgo = (timeline -= 11);
      const witness = witnessFor(botIndex, n);
      const withPhoto = d.evidence === 'photo';
      const imagePath = withPhoto ? `submissions/${bot.uid}/${subId}.jpg` : null;
      const thumbPath = withPhoto ? `submissions/${bot.uid}/${subId}_thumb.jpg` : null;
      const caption = d.evidence ? d.caption : null;
      const postId = `approved-${subId}`;

      entries.push([questRef(`done${n}`), questData(t, 'done', 235 - i * 5, { submissionId: subId, completedAt: at(minutesAgo - 3) })]);
      entries.push([
        db.doc(`submissions/${subId}`),
        {
          uid: bot.uid,
          kind: 'personal',
          questId: `done${n}`,
          ...claimOf(t, witness.uid),
          createdAt: at(minutesAgo + 4),
          status: 'approved',
          imagePath,
          thumbPath,
          caption,
          evidenceAt: d.evidence ? at(minutesAgo - 3) : null,
          feedId: postId,
          processedAt: at(minutesAgo + 4),
          pointsAwarded: questPoints,
          reviewedBy: witness.uid,
          reviewedAt: at(minutesAgo),
          reviewNote: d.note,
          rejectReason: null,
          questTitle: t.title,
          refillQuestId: `q${n}`,
        },
      ]);
      entries.push([
        db.doc(`pointsLedger/ledger-${subId}`),
        { uid: bot.uid, delta: questPoints, reason: 'quest', ref: subId, by: witness.uid, note: d.note, createdAt: at(minutesAgo) },
      ]);
      pushPost(postId, at(minutesAgo), {
        type: 'approved',
        text: `${bot.name} completed "${t.title}" — witnessed by ${witness.name}`,
        uid: bot.uid,
        ref: subId,
        photoURL: null,
        points: questPoints,
        actorUid: witness.uid,
        note: d.note,
        questTitle: t.title,
        submissionId: subId,
        imagePath,
        thumbPath,
        caption,
      });
      if (withPhoto) pushPhoto(imagePath, thumbPath, t.title, bot.name);
    });

    // A claim its witness turned down: -rejectPenalty, the quest swapped for a fresh one (no reroll cost).
    if (bot.rejected) {
      const t = rejectedQuest;
      const witness = BOTS.find((b) => b.uid === bot.rejected.witness);
      const minutesAgo = (timeline -= 11);
      const postId = `rejected-${rejectedId}`;
      entries.push([questRef('rej1'), questData(t, 'replaced', 220, { submissionId: rejectedId })]);
      entries.push([
        db.doc(`submissions/${rejectedId}`),
        {
          uid: bot.uid,
          kind: 'personal',
          questId: 'rej1',
          ...claimOf(t, witness.uid),
          createdAt: at(minutesAgo + 3),
          status: 'rejected',
          imagePath: null,
          thumbPath: null,
          caption: null,
          feedId: postId,
          processedAt: at(minutesAgo + 3),
          pointsAwarded: 0,
          reviewedBy: witness.uid,
          reviewedAt: at(minutesAgo),
          reviewNote: bot.rejected.note,
          rejectReason: null,
        },
      ]);
      entries.push([
        db.doc(`pointsLedger/ledger-${rejectedId}`),
        { uid: bot.uid, delta: -rejectPenalty, reason: 'rejected', ref: rejectedId, by: witness.uid, note: bot.rejected.note, createdAt: at(minutesAgo) },
      ]);
      pushPost(postId, at(minutesAgo), {
        type: 'rejected',
        text: `${witness.name} rejected ${bot.name}'s claim "${t.title}"`,
        uid: bot.uid,
        ref: rejectedId,
        photoURL: null,
        points: -rejectPenalty,
        actorUid: witness.uid,
        note: bot.rejected.note,
        questTitle: t.title,
        submissionId: rejectedId,
      });
    }

    // One bot has a claim waiting for its witness (processedAt is set so the functions trigger leaves it alone).
    if (bot.submitted) {
      const t = live[live.length - 1];
      entries.push([
        db.doc(`submissions/${pending}`),
        {
          uid: bot.uid,
          kind: 'personal',
          questId: `q${live.length}`,
          ...claimOf(t, bot.submitted.witness),
          createdAt: at(6),
          status: 'pending',
          processedAt: at(6),
        },
      ]);
    }

    const points = questPoints * bot.done.length - (bot.rejected ? rejectPenalty : 0);
    const extras = [bot.submitted && '1 waiting on a witness', bot.rejected && '1 rejected'].filter(Boolean);
    summary.push(`${bot.name} (${points} pts, ${bot.done.length} done${extras.length ? ', ' + extras.join(', ') : ''})`);
  }

  // A live side quest with two entries (no witness: everyone votes once voting opens).
  const template = sideQuests.find((q) => q.id === 'g-album-cover') ?? sideQuests[0];
  const side = {
    title: template.title,
    description: template.description,
    bonusPoints: sidePoints,
    source: 'gm-random',
    templateId: template.id,
    startsAt: at(5),
    endsAt: Timestamp.fromMillis(now - 5 * 60_000 + windowMin * 60_000),
    status: 'live',
    votingEndsAt: null,
    winnerUids: [],
    winningSubmissionIds: [],
    tally: null,
  };
  entries.push([db.doc(`globalQuests/${DEMO_SIDE_QUEST}`), side]);
  pushPost('side-open', at(5), { type: 'global-open', text: `New side quest: ${side.title}`, uid: null, ref: DEMO_SIDE_QUEST });
  const sideEntrants = [
    { bot: BOTS[0], caption: 'Moody. Very moody.', minutesAgo: 4 },
    { bot: BOTS[1], caption: 'Sam on lead vocals, obviously.', minutesAgo: 2 },
  ];
  for (const { bot, caption, minutesAgo } of sideEntrants) {
    const subId = `${bot.uid}-side`;
    const imagePath = `submissions/${bot.uid}/${subId}.jpg`;
    const thumbPath = `submissions/${bot.uid}/${subId}_thumb.jpg`;
    const postId = `entry-${subId}`;
    entries.push([
      db.doc(`submissions/${subId}`),
      {
        uid: bot.uid,
        kind: 'global',
        questId: DEMO_SIDE_QUEST,
        createdAt: at(minutesAgo),
        status: 'approved',
        imagePath,
        thumbPath,
        caption,
        evidenceAt: at(minutesAgo),
        feedId: postId,
        processedAt: at(minutesAgo),
        pointsAwarded: 0,
        questTitle: side.title,
      },
    ]);
    pushPost(postId, at(minutesAgo), {
      type: 'approved',
      text: `${bot.name} entered the side quest "${side.title}"`,
      uid: bot.uid,
      ref: subId,
      photoURL: null,
      questTitle: side.title,
      submissionId: subId,
      imagePath,
      thumbPath,
      caption,
    });
    pushPhoto(imagePath, thumbPath, side.title, bot.name);
  }
  summary.push(`side quest "${side.title}" is live with ${sideEntrants.length} entries`);

  // Reactions only make sense on posts that exist; a typo in REACTIONS would silently drop them, so say so.
  for (const id of Object.keys(REACTIONS)) if (!postIds.has(id)) throw new Error(`REACTIONS refers to a post that is not seeded: ${id}`);

  const { created, skipped } = await createMissing(entries);

  // Locations are live data: always refresh updatedAt so the pins show as "just now".
  await writeAll(
    BOTS.map((bot) => [
      db.doc(`locations/${bot.uid}`),
      { lat: CASTLE.lat + bot.offset[0], lng: CASTLE.lng + bot.offset[1], accuracy: 10, updatedAt: Timestamp.now() },
    ]),
  );

  // Poster images are deterministic, so re-uploading just overwrites the same objects.
  for (const [path, svg] of uploads) await uploadPoster(path, svg);

  return { created, skipped, photos: uploads.length, summary };
}

// ---------------------------------------------------------------- main

async function countOf(query) {
  return (await query.count().get()).data().count;
}

async function main() {
  await ensureEmulators();
  console.log(`Seeding ${PROJECT_ID} (Firestore ${process.env.FIRESTORE_EMULATOR_HOST})`);

  const quests = JSON.parse(await readFile(new URL('./data/quests.json', import.meta.url), 'utf8'));

  console.log(`  game/state      ${await seedState()}`);
  console.log(`  game/settings   ${await seedSettings()}`);
  const t = await seedTemplates(quests);
  console.log(`  questTemplates  ${t.personal} personal + ${t.global} global (${t.created} new, ${t.updated} updated)`);

  if (DEMO) {
    if (RESET_DEMO) await resetDemo();
    console.log(`  demo players    uploading photos to ${BUCKET} (Storage ${process.env.FIREBASE_STORAGE_EMULATOR_HOST})`);
    const settings = (await db.doc('game/settings').get()).data() ?? DEFAULT_SETTINGS;
    const d = await seedDemo(quests, settings);
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
  };
  console.log(`Firestore now holds: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  if (!DEMO) console.log('Tip: add `-- --demo` for demo players, photos, a live side quest and map pins.');
  console.log('Done.');
}

main().catch((err) => {
  console.error(`\nSeed failed: ${err?.message ?? err}`);
  process.exit(1);
});
