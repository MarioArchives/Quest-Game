// Edge cases 1–11, (Revision 2) W1–W3 and (Revision 3) V1–V4, X4: Firestore security rules.
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-fq-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

const T = Timestamp.fromDate(new Date('2026-10-10T14:00:00Z'));

async function seed(status: 'lobby' | 'active' | 'paused' | 'ended' = 'active') {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'game/state'), { status, startedAt: T, endedAt: null, nextGlobalQuestAt: null, announcement: null });
    await setDoc(doc(db, 'game/settings'), { rerollLimit: 10 });
    await setDoc(doc(db, 'game/final'), { standings: [], endedAt: T });
    await setDoc(doc(db, 'admins/gm'), { email: 'gm@example.com' });
    for (const uid of ['alice', 'bob', 'carol']) {
      await setDoc(doc(db, `players/${uid}`), {
        displayName: uid, photoURL: null, joinedAt: T, points: 0, rerollsUsed: 0, questsCompleted: 0,
      });
    }
    await setDoc(doc(db, 'players/alice/quests/q1'), { templateId: 'p01', title: 'Secret', description: 'x', venueId: null, status: 'active', assignedAt: T });
    await setDoc(doc(db, 'players/bob/quests/bq1'), { templateId: 'p02', title: 'Secret', description: 'x', venueId: null, status: 'active', assignedAt: T });
    await setDoc(doc(db, 'joinRequests/pending'), { uid: 'pending', displayName: 'Pen', photoURL: null, email: null, status: 'pending', createdAt: T, updatedAt: T });
    await setDoc(doc(db, 'joinRequests/other'), { uid: 'other', displayName: 'Oth', photoURL: null, email: null, status: 'pending', createdAt: T, updatedAt: T });
    await setDoc(doc(db, 'questTemplates/p01'), { title: 'Secret', description: 'x', scope: 'personal', venueId: null, winRule: null, active: true });
    await setDoc(doc(db, 'globalQuests/gq1'), { title: 'Brass', status: 'live' });
    const sub = (uid: string, s: string) => ({
      uid, kind: 'personal', questId: 'q1', witnessUid: 'carol', imagePath: `submissions/${uid}/x.jpg`,
      thumbPath: `submissions/${uid}/x_thumb.jpg`, caption: 'c', location: null, createdAt: T, status: s,
    });
    await setDoc(doc(db, 'submissions/pendingA'), sub('alice', 'pending'));
    await setDoc(doc(db, 'submissions/approvedA'), sub('alice', 'approved'));
    await setDoc(doc(db, 'submissions/rejectedA'), sub('alice', 'rejected'));
    await setDoc(doc(db, 'guesses/g1'), { guesserUid: 'alice', targetUid: 'bob', templateId: 'p02', correct: true, createdAt: T });
    await setDoc(doc(db, 'guessCooldowns/alice_bob'), { lastAt: T });
    await setDoc(doc(db, 'locations/bob'), { lat: 54.05, lng: -2.8, accuracy: 10, updatedAt: T });
    await setDoc(doc(db, 'pointsLedger/l1'), { uid: 'alice', delta: 100, reason: 'quest', ref: null, by: 'gm', createdAt: T });
    await setDoc(doc(db, 'feed/f1'), { type: 'join', text: 'alice joined', uid: 'alice', ref: null, createdAt: T });
    await setDoc(doc(db, 'wraps/alice'), { uid: 'alice', points: 0 });
    await setDoc(doc(db, 'wraps/bob'), { uid: 'bob', points: 0 });
  });
}

async function setStatus(status: 'lobby' | 'active' | 'paused' | 'ended') {
  await env.withSecurityRulesDisabled(async (c) => {
    await updateDoc(doc(c.firestore(), 'game/state'), { status });
  });
}

const as = (uid: string): Firestore => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const anon = (): Firestore => env.unauthenticatedContext().firestore() as unknown as Firestore;

beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

describe('1. secret hands', () => {
  it("another player cannot read or list a player's quests", async () => {
    await assertFails(getDoc(doc(as('bob'), 'players/alice/quests/q1')));
    await assertFails(getDocs(collection(as('bob'), 'players/alice/quests')));
  });

  it('the owner and the GM can', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'players/alice/quests/q1')));
    await assertSucceeds(getDocs(collection(as('alice'), 'players/alice/quests')));
    await assertSucceeds(getDoc(doc(as('gm'), 'players/alice/quests/q1')));
    await assertSucceeds(getDocs(collection(as('gm'), 'players/alice/quests')));
  });

  it('nobody can write quests from the client, not even the owner or GM', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'players/alice/quests/q1'), { status: 'done' }));
    await assertFails(setDoc(doc(as('gm'), 'players/alice/quests/q9'), { templateId: 'p09' }));
  });

  it('signed-out users can read nothing', async () => {
    const db = anon();
    await assertFails(getDoc(doc(db, 'game/state')));
    await assertFails(getDoc(doc(db, 'players/alice')));
    await assertFails(getDoc(doc(db, 'questTemplates/p01')));
    await assertFails(getDocs(collection(db, 'feed')));
    await assertFails(getDocs(query(collection(db, 'submissions'), where('status', '==', 'approved'))));
  });
});

describe('2. signed in but awaiting approval', () => {
  it('can read only their own join request', async () => {
    await assertSucceeds(getDoc(doc(as('pending'), 'joinRequests/pending')));
    await assertFails(getDoc(doc(as('pending'), 'joinRequests/other')));
  });

  it('can check their own (missing) player and admin docs, to know when they are approved', async () => {
    await assertSucceeds(getDoc(doc(as('pending'), 'players/pending')));
    await assertSucceeds(getDoc(doc(as('pending'), 'admins/pending')));
  });

  it('cannot read game data', async () => {
    const db = as('pending');
    await assertFails(getDoc(doc(db, 'players/alice')));
    await assertFails(getDocs(collection(db, 'players')));
    await assertFails(getDocs(collection(db, 'feed')));
    await assertFails(getDoc(doc(db, 'questTemplates/p01')));
    await assertFails(getDoc(doc(db, 'submissions/approvedA')));
    await assertFails(getDoc(doc(db, 'game/state')));
  });

  it('cannot write any join request (requests go through requestJoin)', async () => {
    await assertFails(updateDoc(doc(as('pending'), 'joinRequests/pending'), { status: 'approved' }));
    await assertFails(setDoc(doc(as('newbie'), 'joinRequests/newbie'), { uid: 'newbie', status: 'pending' }));
    await assertFails(setDoc(doc(as('gm'), 'joinRequests/newbie'), { uid: 'newbie', status: 'approved' }));
  });

  it("players cannot read others' join requests; the GM can list pending ones", async () => {
    await assertFails(getDoc(doc(as('alice'), 'joinRequests/pending')));
    await assertSucceeds(getDocs(query(collection(as('gm'), 'joinRequests'), where('status', '==', 'pending'))));
  });
});

describe('3. player profiles', () => {
  it('a player can change their own displayName and photoURL while the game is in the lobby', async () => {
    await setStatus('lobby');
    await assertSucceeds(updateDoc(doc(as('alice'), 'players/alice'), { displayName: 'Ally', photoURL: 'https://x/y.jpg' }));
  });

  it.each(['active', 'paused', 'ended'] as const)('R8: names are locked once the game has started (%s); photos can still change', async (status) => {
    await setStatus(status);
    await assertFails(updateDoc(doc(as('alice'), 'players/alice'), { displayName: 'Ally' }));
    await assertFails(updateDoc(doc(as('alice'), 'players/alice'), { displayName: 'Ally', photoURL: 'https://x/y.jpg' }));
    await assertSucceeds(updateDoc(doc(as('alice'), 'players/alice'), { photoURL: 'https://x/z.jpg' }));
  });

  it.each([
    ['points', { points: 9999 }],
    ['rerollsUsed', { rerollsUsed: 3 }],
    ['extraRerolls (GM-granted rerolls)', { extraRerolls: 5 }],
    ['extraRerolls alongside their photo', { photoURL: 'https://x/z.jpg', extraRerolls: 5 }],
    ['questsCompleted', { questsCompleted: 40 }],
    ['name and points together', { displayName: 'Ally', points: 1 }],
  ])('cannot change %s', async (_label, data) => {
    await assertFails(updateDoc(doc(as('alice'), 'players/alice'), data));
  });

  it("cannot edit someone else's profile, create their own player doc, or delete it", async () => {
    await assertFails(updateDoc(doc(as('alice'), 'players/bob'), { displayName: 'Bobby' }));
    await assertFails(setDoc(doc(as('pending'), 'players/pending'), { displayName: 'Pen', points: 0 }));
    await assertFails(deleteDoc(doc(as('alice'), 'players/alice')));
  });

  it('players and the GM can read the player list', async () => {
    await assertSucceeds(getDocs(collection(as('bob'), 'players')));
    await assertSucceeds(getDocs(collection(as('gm'), 'players')));
  });
});

// A claim (V1): exactly these fields. No photo, caption or location — evidence comes after approval.
const newSubmission = (uid = 'alice', over: Record<string, unknown> = {}) => ({
  uid,
  kind: 'personal',
  questId: 'q1',
  witnessUid: 'bob',
  createdAt: serverTimestamp(),
  status: 'pending',
  ...over,
});

describe('4. creating submissions', () => {
  it('a player can claim a quest while the game is active', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'submissions/new1'), newSubmission()));
  });

  it('X4: side-quest entries cannot be written by clients (they go through enterSideQuest)', async () => {
    await assertFails(setDoc(doc(as('alice'), 'submissions/new2'), newSubmission('alice', { kind: 'global', questId: 'gq1' })));
  });

  it.each(['lobby', 'paused', 'ended'] as const)('refuses submissions while the game is %s', async (status) => {
    await setStatus(status);
    await assertFails(setDoc(doc(as('alice'), 'submissions/new1'), newSubmission()));
  });

  it.each([
    ["someone else's uid", newSubmission('alice', { uid: 'bob' })],
    ['a status other than pending', newSubmission('alice', { status: 'approved' })],
    ['a client-chosen createdAt', newSubmission('alice', { createdAt: Timestamp.fromDate(new Date('2026-10-10T10:00:00Z')) })],
    ['an unknown kind', newSubmission('alice', { kind: 'bonus' })],
    ['V1: a photo at claim time', newSubmission('alice', { imagePath: 'submissions/alice/new1.jpg', thumbPath: 'submissions/alice/new1_thumb.jpg' })],
    ['V1: a caption at claim time', newSubmission('alice', { caption: 'Found it' })],
    ['V1: a location', newSubmission('alice', { location: { lat: 54.05, lng: -2.8, accuracy: 12 } })],
    ['an extra field (pointsAwarded)', newSubmission('alice', { pointsAwarded: 100 })],
  ])('rejects %s', async (_label, data) => {
    await assertFails(setDoc(doc(as('alice'), 'submissions/new1'), data));
  });

  it('non-players cannot submit', async () => {
    await assertFails(setDoc(doc(as('pending'), 'submissions/new1'), newSubmission('pending')));
  });

  it.each([
    ['themselves as witness', newSubmission('alice', { witnessUid: 'alice' })],
    ['a witness who is not a player', newSubmission('alice', { witnessUid: 'pending' })],
    ['a non-string witness', newSubmission('alice', { witnessUid: 42 })],
  ])('W1: rejects %s', async (_label, data) => {
    await assertFails(setDoc(doc(as('alice'), 'submissions/new1'), data));
  });

  it('W1: rejects a submission with no witness', async () => {
    const { witnessUid: _omit, ...noWitness } = newSubmission();
    await assertFails(setDoc(doc(as('alice'), 'submissions/new1'), noWitness));
  });
});

describe('R4. sealed side-quest entries', () => {
  it('only the entrant and the GM can read an entry until voting reveals it', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'submissions/sealedA'), {
        uid: 'alice', kind: 'global', questId: 'gq1', status: 'sealed', createdAt: T,
        imagePath: 'submissions/alice/e.jpg', thumbPath: 'submissions/alice/e_thumb.jpg', caption: 'secret',
      });
    });
    await assertSucceeds(getDoc(doc(as('alice'), 'submissions/sealedA')));
    await assertSucceeds(getDoc(doc(as('gm'), 'submissions/sealedA')));
    await assertFails(getDoc(doc(as('bob'), 'submissions/sealedA')));
    await assertFails(getDocs(query(collection(as('bob'), 'submissions'), where('status', '==', 'sealed'))));
  });
});

describe('W2/W3. witnesses', () => {
  it('the named witness can read a pending submission; other players still cannot', async () => {
    await assertSucceeds(getDoc(doc(as('carol'), 'submissions/pendingA')));
    await assertFails(getDoc(doc(as('bob'), 'submissions/pendingA')));
  });

  it("the witness's inbox query succeeds, but nobody can query someone else's inbox", async () => {
    const inbox = (who: string, of: string) =>
      getDocs(query(collection(as(who), 'submissions'), where('witnessUid', '==', of), where('status', '==', 'pending')));
    await assertSucceeds(inbox('carol', 'carol'));
    await assertFails(inbox('bob', 'carol'));
  });

  it('the owner can hand a pending submission to another witness', async () => {
    await assertSucceeds(updateDoc(doc(as('alice'), 'submissions/pendingA'), { witnessUid: 'bob' }));
  });

  it.each([
    ['to themselves', { witnessUid: 'alice' }],
    ['to a non-player', { witnessUid: 'pending' }],
    ['together with another field', { witnessUid: 'bob', caption: 'edited' }],
  ])('the owner cannot change the witness %s', async (_label, data) => {
    await assertFails(updateDoc(doc(as('alice'), 'submissions/pendingA'), data));
  });

  it('nobody can change the witness once reviewed, or on someone else\'s submission', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'submissions/approvedA'), { witnessUid: 'bob' }));
    await assertFails(updateDoc(doc(as('alice'), 'submissions/rejectedA'), { witnessUid: 'bob' }));
    await assertFails(updateDoc(doc(as('bob'), 'submissions/pendingA'), { witnessUid: 'bob' }));
    await assertFails(updateDoc(doc(as('carol'), 'submissions/pendingA'), { witnessUid: 'bob' }));
    await assertFails(updateDoc(doc(as('gm'), 'submissions/pendingA'), { witnessUid: 'bob' }));
  });
});

describe('5. reading and changing submissions', () => {
  it('pending and rejected submissions are visible only to the owner, the witness and the GM', async () => {
    for (const id of ['pendingA', 'rejectedA']) {
      await assertSucceeds(getDoc(doc(as('alice'), `submissions/${id}`)));
      await assertSucceeds(getDoc(doc(as('gm'), `submissions/${id}`)));
      await assertFails(getDoc(doc(as('bob'), `submissions/${id}`)));
    }
  });

  it('approved submissions are visible to every player', async () => {
    await assertSucceeds(getDoc(doc(as('bob'), 'submissions/approvedA')));
  });

  it('a feed query filtered to approved succeeds; an unfiltered player query fails', async () => {
    await assertSucceeds(getDocs(query(collection(as('bob'), 'submissions'), where('status', '==', 'approved'))));
    await assertFails(getDocs(collection(as('bob'), 'submissions')));
  });

  it('owners can query their own history and the GM can query everything', async () => {
    await assertSucceeds(getDocs(query(collection(as('alice'), 'submissions'), where('uid', '==', 'alice'))));
    await assertSucceeds(getDocs(collection(as('gm'), 'submissions')));
  });

  it('no client can update or delete a submission', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'submissions/approvedA'), { caption: 'edited' }));
    await assertFails(updateDoc(doc(as('alice'), 'submissions/pendingA'), { status: 'approved' }));
    await assertFails(deleteDoc(doc(as('alice'), 'submissions/pendingA')));
    await assertFails(updateDoc(doc(as('gm'), 'submissions/pendingA'), { status: 'approved' }));
    await assertFails(deleteDoc(doc(as('gm'), 'submissions/pendingA')));
  });
});

describe('V3. no comments, and no reactions on submissions', () => {
  it('nobody can comment anywhere', async () => {
    const comment = (uid: string) => ({ uid, text: 'Great photo', createdAt: serverTimestamp() });
    await assertFails(setDoc(doc(as('bob'), 'submissions/approvedA/comments/c1'), comment('bob')));
    await assertFails(setDoc(doc(as('gm'), 'submissions/approvedA/comments/c1'), comment('gm')));
    await assertFails(setDoc(doc(as('bob'), 'feed/f1/comments/c1'), comment('bob')));
  });

  it('reactions on submissions are refused (they live on feed posts now)', async () => {
    await assertFails(setDoc(doc(as('carol'), 'submissions/approvedA/reactions/carol'), { emoji: '🔥', createdAt: serverTimestamp() }));
  });
});

describe('V2. reactions on feed posts', () => {
  const react = (emoji: unknown) => ({ emoji, createdAt: serverTimestamp() });

  it('a player sets, changes and removes their own reaction; players and the GM read them', async () => {
    await assertSucceeds(setDoc(doc(as('carol'), 'feed/f1/reactions/carol'), react('😂')));
    await assertSucceeds(setDoc(doc(as('carol'), 'feed/f1/reactions/carol'), react('👏')));
    await assertSucceeds(getDocs(collection(as('alice'), 'feed/f1/reactions')));
    await assertSucceeds(getDocs(collection(as('gm'), 'feed/f1/reactions')));
    await assertSucceeds(deleteDoc(doc(as('carol'), 'feed/f1/reactions/carol')));
  });

  it('E1: accepts the quick set and any emoji typed from the keyboard', async () => {
    for (const emoji of ['🎸', '🥳', '❤️', '🫶', '👑', '💩', '🦆', '👍🏽', '🇬🇧', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '👩🏽‍❤️‍💋‍👨🏿', '👨‍👩‍👧‍👦']) {
      await assertSucceeds(setDoc(doc(as('carol'), 'feed/f1/reactions/carol'), react(emoji)));
    }
  });

  it.each([
    ["another player's reaction doc", 'alice', react('🔥')],
    ['plain text', 'carol', react('lol')],
    ['an emoji with text', 'carol', react('🔥 lol')],
    ['an empty emoji', 'carol', react('')],
    ['more than 16 code points', 'carol', react('😂'.repeat(17))],
    ['a number', 'carol', react(5)],
    ['a client-chosen createdAt', 'carol', { emoji: '🔥', createdAt: T }],
    ['an extra field', 'carol', { ...react('🔥'), count: 9 }],
  ])('refuses %s', async (_label, docId, data) => {
    await assertFails(setDoc(doc(as('carol'), `feed/f1/reactions/${docId}`), data));
  });

  it("players can't remove someone else's reaction, and non-players can't react or read", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'feed/f1/reactions/bob'), { emoji: '🔥', createdAt: T });
    });
    await assertFails(deleteDoc(doc(as('alice'), 'feed/f1/reactions/bob')));
    await assertFails(setDoc(doc(as('pending'), 'feed/f1/reactions/pending'), react('🔥')));
    await assertFails(getDocs(collection(as('pending'), 'feed/f1/reactions')));
  });

  it('nobody updates or deletes feed posts from the client, not even the GM', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'feed/f1'), { reactionCount: 99 }));
    await assertFails(updateDoc(doc(as('gm'), 'feed/f1'), { text: 'edited' }));
    await assertFails(deleteDoc(doc(as('gm'), 'feed/f1')));
  });
});

describe('V4. side-quest votes are secret', () => {
  it('no client can read or write votes, not even the GM', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'globalQuests/gq1/votes/bob'), { submissionId: 'approvedA', createdAt: T });
    });
    await assertFails(getDoc(doc(as('bob'), 'globalQuests/gq1/votes/bob')));
    await assertFails(getDocs(collection(as('gm'), 'globalQuests/gq1/votes')));
    await assertFails(setDoc(doc(as('carol'), 'globalQuests/gq1/votes/carol'), { submissionId: 'approvedA', createdAt: serverTimestamp() }));
  });
});

describe('8. server-only collections', () => {
  it('a guess is readable by the guesser and the GM only', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'guesses/g1')));
    await assertSucceeds(getDocs(query(collection(as('alice'), 'guesses'), where('guesserUid', '==', 'alice'))));
    await assertSucceeds(getDoc(doc(as('gm'), 'guesses/g1')));
    await assertFails(getDoc(doc(as('bob'), 'guesses/g1')));
    await assertFails(getDoc(doc(as('carol'), 'guesses/g1')));
    await assertFails(getDocs(collection(as('carol'), 'guesses')));
  });

  it('no client writes guesses, cooldowns, the ledger, wraps, game/final or admins', async () => {
    for (const who of ['alice', 'gm']) {
      const db = as(who);
      await assertFails(setDoc(doc(db, 'guesses/x'), { guesserUid: who, targetUid: 'bob', templateId: 'p02', correct: true }));
      await assertFails(setDoc(doc(db, 'guessCooldowns/x'), { lastAt: T }));
      await assertFails(setDoc(doc(db, 'pointsLedger/x'), { uid: who, delta: 1000 }));
      await assertFails(setDoc(doc(db, `wraps/${who}`), { points: 1000 }));
      await assertFails(setDoc(doc(db, 'game/final'), { standings: [] }));
      await assertFails(setDoc(doc(db, 'admins/alice'), { email: 'x' }));
    }
    await assertFails(getDoc(doc(as('alice'), 'guessCooldowns/alice_bob')));
  });

  it('the feed accepts creates from the GM only', async () => {
    const item = { type: 'announcement', text: 'Bar closes at 11', uid: null, ref: null, createdAt: serverTimestamp() };
    await assertSucceeds(addDoc(collection(as('gm'), 'feed'), item));
    await assertFails(addDoc(collection(as('alice'), 'feed'), item));
    await assertSucceeds(getDocs(collection(as('alice'), 'feed')));
  });

  it('players can read the ledger and the admin list', async () => {
    await assertSucceeds(getDocs(collection(as('bob'), 'pointsLedger')));
    await assertSucceeds(getDoc(doc(as('bob'), 'admins/gm')));
  });
});

const loc = (over: Record<string, unknown> = {}) => ({ lat: 54.0489, lng: -2.8012, accuracy: 15, updatedAt: serverTimestamp(), ...over });

describe('9. locations', () => {
  it('players write only their own position while the game is active', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'locations/alice'), loc()));
    await assertFails(setDoc(doc(as('alice'), 'locations/bob'), loc()));
  });

  it.each([
    ['lat 91', loc({ lat: 91 })],
    ['lat -91', loc({ lat: -91 })],
    ['lng 181', loc({ lng: 181 })],
    ['lng -181', loc({ lng: -181 })],
    ['a string lat', loc({ lat: '54' })],
    ['an extra field', loc({ battery: 12 })],
  ])('rejects %s', async (_label, data) => {
    await assertFails(setDoc(doc(as('alice'), 'locations/alice'), data));
  });

  it('accepts the boundary values', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'locations/alice'), loc({ lat: 90, lng: -180 })));
  });

  it.each(['lobby', 'paused', 'ended'] as const)('refuses writes while %s but still allows deleting your own', async (status) => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'locations/alice'), { lat: 54, lng: -2.8, accuracy: 5, updatedAt: T });
    });
    await setStatus(status);
    await assertFails(setDoc(doc(as('alice'), 'locations/alice'), loc()));
    await assertSucceeds(deleteDoc(doc(as('alice'), 'locations/alice')));
  });

  it("cannot delete someone else's position", async () => {
    await assertFails(deleteDoc(doc(as('alice'), 'locations/bob')));
  });

  it('players and the GM can read positions; non-players cannot', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'locations/bob')));
    await assertSucceeds(getDocs(collection(as('gm'), 'locations')));
    await assertFails(getDocs(collection(as('pending'), 'locations')));
  });
});

describe('10. game docs, templates and global quests', () => {
  it('players and the GM can read state, settings and final standings', async () => {
    for (const who of ['alice', 'gm']) {
      await assertSucceeds(getDoc(doc(as(who), 'game/state')));
      await assertSucceeds(getDoc(doc(as(who), 'game/settings')));
      await assertSucceeds(getDoc(doc(as(who), 'game/final')));
    }
  });

  it('only the GM writes state and settings', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'game/state'), { announcement: 'hi' }));
    await assertFails(updateDoc(doc(as('alice'), 'game/settings'), { rerollLimit: 99 }));
    await assertSucceeds(updateDoc(doc(as('gm'), 'game/state'), { announcement: 'Meet at the castle' }));
    await assertSucceeds(updateDoc(doc(as('gm'), 'game/settings'), { rerollLimit: 12 }));
  });

  it('templates and global quests are readable by players and writable by the GM only', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'questTemplates/p01')));
    await assertSucceeds(getDocs(collection(as('alice'), 'questTemplates')));
    await assertSucceeds(getDoc(doc(as('alice'), 'globalQuests/gq1')));
    await assertFails(setDoc(doc(as('alice'), 'questTemplates/p99'), { title: 'Easy one', scope: 'personal', active: true }));
    await assertFails(updateDoc(doc(as('alice'), 'globalQuests/gq1'), { winnerUid: 'alice' }));
    await assertSucceeds(setDoc(doc(as('gm'), 'questTemplates/p99'), { title: 'New', description: 'd', scope: 'personal', venueId: null, winRule: null, active: true }));
    await assertSucceeds(updateDoc(doc(as('gm'), 'questTemplates/p01'), { active: false }));
  });
});

describe('P10. push tokens are server-only', () => {
  it('no client reads or writes pushTokens: not the owner, another player, the GM or a signed-out user', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'pushTokens/t1'), { uid: 'alice', token: 'tok-a', createdAt: T, updatedAt: T });
    });
    for (const uid of ['alice', 'bob', 'gm', 'pending']) {
      await assertFails(getDoc(doc(as(uid), 'pushTokens/t1')));
      await assertFails(getDocs(collection(as(uid), 'pushTokens')));
      await assertFails(setDoc(doc(as(uid), 'pushTokens/t2'), { uid, token: 'tok-x', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
      await assertFails(updateDoc(doc(as(uid), 'pushTokens/t1'), { uid }));
      await assertFails(deleteDoc(doc(as(uid), 'pushTokens/t1')));
    }
    await assertFails(getDoc(doc(anon(), 'pushTokens/t1')));
  });
});

describe('11. wraps', () => {
  it("before the end, a wrap is visible to its owner and the GM only", async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'wraps/alice')));
    await assertSucceeds(getDoc(doc(as('gm'), 'wraps/alice')));
    await assertFails(getDoc(doc(as('bob'), 'wraps/alice')));
  });

  it('once the game has ended, every player can read every wrap', async () => {
    await setStatus('ended');
    await assertSucceeds(getDoc(doc(as('bob'), 'wraps/alice')));
    await assertSucceeds(getDocs(collection(as('bob'), 'wraps')));
    await assertFails(getDoc(doc(as('pending'), 'wraps/alice')));
  });
});
