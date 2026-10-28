// Makes a signed-in user a GM (game master) by writing admins/{uid} in Firestore, or takes it away again.
//
//   npm run make-admin -- you@example.com
//   npm run make-admin -- --list                         lists the GMs (uid, email, name)
//   npm run make-admin -- them@example.com --remove      deletes admins/{uid}: they're a player again
//   npm run make-admin -- you@example.com --uid <uid>   skip the Auth lookup and use this uid
//   npm run make-admin -- --uid <uid>                   email is looked up if the user exists
//   npm run make-admin -- you@example.com --prod        the real project ("prod" in .firebaserc)
//
// The user must have signed in once through the app's Google button first, so that Auth knows them.
// Talks to the emulators unless --prod: honours FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST
// and otherwise uses the firebase.json dev ports. --prod signs in with Application Default Credentials
// (`gcloud auth application-default login`).

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { explainCredentials, selectTarget } from './lib/target.mjs';

const USAGE = 'Usage: npm run make-admin -- <email> [--uid <uid>] [--remove] [--prod]   or   npm run make-admin -- --list [--prod]';

/** @returns {{ email: string | null, uid: string | null, prod: boolean, remove: boolean, list: boolean }} */
function parseArgs(argv) {
  let email = null;
  let uid = null;
  let prod = false;
  let remove = false;
  let list = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--uid') {
      uid = argv[++i] ?? null;
      if (!uid) throw new Error('--uid needs a value.');
    } else if (a.startsWith('--uid=')) {
      uid = a.slice('--uid='.length);
    } else if (a === '--prod') {
      prod = true;
    } else if (a === '--remove') {
      remove = true;
    } else if (a === '--list') {
      list = true;
    } else if (a === '--help' || a === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else if (a.startsWith('-')) {
      throw new Error(`Unknown option ${a}.`);
    } else if (!email) {
      email = a.trim().toLowerCase();
    } else {
      throw new Error(`Unexpected argument ${a}.`);
    }
  }
  if (list) return { email, uid, prod, remove, list };
  if (!email && !uid) throw new Error('Give the GM\'s email address (or --uid).');
  return { email, uid, prod, remove, list };
}

/** Fail fast with a useful message when an emulator is not running. */
async function assertUp(name, host) {
  try {
    await fetch(`http://${host}/`, { signal: AbortSignal.timeout(3000) });
  } catch {
    throw new Error(
      `Cannot reach the ${name} emulator at ${host}.\n` +
        '  Start it with `npm run dev` (or `npm run emulators`) in another terminal, then retry.',
    );
  }
}

async function main() {
  const { email: wantedEmail, uid: wantedUid, prod, remove, list } = parseArgs(process.argv.slice(2));
  const projectId = selectTarget({
    prod,
    emulators: { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' },
  });
  initializeApp({ projectId });

  if (!prod) await assertUp('Firestore', process.env.FIRESTORE_EMULATOR_HOST);
  if (list) return listAdmins(projectId, prod);
  let uid = wantedUid;
  let email = wantedEmail;
  // Removing goes by the email on the admin doc first, so it works even for a user Auth no longer has.
  if (remove && !uid) {
    const hit = await getFirestore().collection('admins').where('email', '==', email).limit(1).get();
    if (!hit.empty) uid = hit.docs[0].id;
  }

  if (!uid || !email) {
    if (!prod) await assertUp('Auth', process.env.FIREBASE_AUTH_EMULATOR_HOST);
    try {
      const user = uid ? await getAuth().getUser(uid) : await getAuth().getUserByEmail(email);
      uid = user.uid;
      email = email ?? user.email?.toLowerCase() ?? null;
    } catch (err) {
      if (err?.code !== 'auth/user-not-found') throw err;
      if (remove && !uid) throw new Error(`${email} is not a GM in ${projectId}. See them all with --list.`);
      if (!uid) {
        throw new Error(
          prod
            ? `No user with the email ${email} in ${projectId} yet.\n\n` +
                '  Sign in once on the live site with the Google button, then run this command again.'
            : `No user with the email ${email} in the Auth emulator yet.\n\n` +
                '  1. Open the app (http://localhost:5173) and press the Google sign-in button.\n' +
                '  2. In the emulator\'s fake account picker choose "Add new account" and enter this email\n' +
                '     (or pick the account if it is already listed).\n' +
                '  3. Run this command again.\n\n' +
                '  Already know the uid? Use `--uid <uid>` to skip the lookup.',
        );
      }
      console.warn(`Note: no Auth user for uid ${uid}; writing the admin doc anyway.`);
    }
  }

  if (remove) {
    const ref = getFirestore().doc(`admins/${uid}`);
    if (!(await ref.get()).exists) throw new Error(`${email || uid} is not a GM in ${projectId}.`);
    await ref.delete();
    console.log(`${email || uid} is no longer a GM in ${projectId} (deleted admins/${uid}).`);
    console.log('Their GM tab goes on their next reload; they can ask to join as a player.');
    return;
  }

  await getFirestore().doc(`admins/${uid}`).set({ email: email ?? '' }, { merge: true });
  console.log(`${email || uid} is now a GM in ${projectId} (admins/${uid}).`);
  console.log('Reload the app; the GM tab appears in the bottom bar.');
}

/** Prints every GM: uid, the email on the admin doc, and the name Auth knows them by. */
async function listAdmins(projectId, prod) {
  const snap = await getFirestore().collection('admins').get();
  if (snap.empty) return console.log(`No GMs in ${projectId}.`);
  if (!prod) await assertUp('Auth', process.env.FIREBASE_AUTH_EMULATOR_HOST);
  console.log(`GMs in ${projectId}:`);
  for (const d of snap.docs) {
    const name = await getAuth()
      .getUser(d.id)
      .then((u) => u.displayName ?? '')
      .catch(() => '(no Auth user)');
    console.log(`  ${d.id}  ${d.data().email || '-'}  ${name}`);
  }
}

main().catch((err) => {
  console.error(`\nmake-admin failed: ${process.argv.includes('--prod') ? explainCredentials(err) : (err?.message ?? err)}`);
  process.exit(1);
});
