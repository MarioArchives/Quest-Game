// Makes a signed-in user a GM (game master) by writing admins/{uid} in Firestore.
//
//   npm run make-admin -- you@example.com
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

const USAGE = 'Usage: npm run make-admin -- <email> [--uid <uid>] [--prod]';

/** @returns {{ email: string | null, uid: string | null }} */
function parseArgs(argv) {
  let email = null;
  let uid = null;
  let prod = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--uid') {
      uid = argv[++i] ?? null;
      if (!uid) throw new Error('--uid needs a value.');
    } else if (a.startsWith('--uid=')) {
      uid = a.slice('--uid='.length);
    } else if (a === '--prod') {
      prod = true;
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
  if (!email && !uid) throw new Error('Give the GM\'s email address (or --uid).');
  return { email, uid, prod };
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
  const { email: wantedEmail, uid: wantedUid, prod } = parseArgs(process.argv.slice(2));
  const projectId = selectTarget({
    prod,
    emulators: { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' },
  });
  initializeApp({ projectId });

  if (!prod) await assertUp('Firestore', process.env.FIRESTORE_EMULATOR_HOST);
  let uid = wantedUid;
  let email = wantedEmail;

  if (!uid || !email) {
    if (!prod) await assertUp('Auth', process.env.FIREBASE_AUTH_EMULATOR_HOST);
    try {
      const user = uid ? await getAuth().getUser(uid) : await getAuth().getUserByEmail(email);
      uid = user.uid;
      email = email ?? user.email?.toLowerCase() ?? null;
    } catch (err) {
      if (err?.code !== 'auth/user-not-found') throw err;
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

  await getFirestore().doc(`admins/${uid}`).set({ email: email ?? '' }, { merge: true });
  console.log(`${email || uid} is now a GM in ${projectId} (admins/${uid}).`);
  console.log('Reload the app; the GM tab appears in the bottom bar.');
}

main().catch((err) => {
  console.error(`\nmake-admin failed: ${process.argv.includes('--prod') ? explainCredentials(err) : (err?.message ?? err)}`);
  process.exit(1);
});
