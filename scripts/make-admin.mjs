// Makes a signed-in user a GM (game master) by writing admins/{uid} in the Firestore emulator.
//
//   npm run make-admin -- you@example.com
//   npm run make-admin -- you@example.com --uid <uid>   skip the Auth lookup and use this uid
//   npm run make-admin -- --uid <uid>                   email is looked up if the user exists
//
// The user must have signed in once through the app's Google button first, so that the Auth
// emulator knows them. Honours FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST and otherwise
// uses the firebase.json dev ports.

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'demo-festival-quest';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
// Skip the slow Google metadata-server probe (the emulators need no credentials).
process.env.METADATA_SERVER_DETECTION ??= 'none';

const USAGE = 'Usage: npm run make-admin -- <email> [--uid <uid>]';

/** @returns {{ email: string | null, uid: string | null }} */
function parseArgs(argv) {
  let email = null;
  let uid = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--uid') {
      uid = argv[++i] ?? null;
      if (!uid) throw new Error('--uid needs a value.');
    } else if (a.startsWith('--uid=')) {
      uid = a.slice('--uid='.length);
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
  return { email, uid };
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
  const { email: wantedEmail, uid: wantedUid } = parseArgs(process.argv.slice(2));
  initializeApp({ projectId: PROJECT_ID });

  await assertUp('Firestore', process.env.FIRESTORE_EMULATOR_HOST);
  let uid = wantedUid;
  let email = wantedEmail;

  if (!uid || !email) {
    await assertUp('Auth', process.env.FIREBASE_AUTH_EMULATOR_HOST);
    try {
      const user = uid ? await getAuth().getUser(uid) : await getAuth().getUserByEmail(email);
      uid = user.uid;
      email = email ?? user.email?.toLowerCase() ?? null;
    } catch (err) {
      if (err?.code !== 'auth/user-not-found') throw err;
      if (!uid) {
        throw new Error(
          `No user with the email ${email} in the Auth emulator yet.\n\n` +
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
  console.log(`${email || uid} is now a GM (admins/${uid}).`);
  console.log('Reload the app; the GM tab appears in the bottom bar.');
}

main().catch((err) => {
  console.error(`\nmake-admin failed: ${err?.message ?? err}`);
  process.exit(1);
});
