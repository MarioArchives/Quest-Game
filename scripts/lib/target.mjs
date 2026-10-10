// Which Firebase project the admin scripts (seed, make-admin) talk to.
//
// By default: the local emulators under the demo project, no credentials needed.
// With --prod: the real project aliased "prod" in .firebaserc, authenticated with Application Default
// Credentials (`gcloud auth application-default login`). Any *_EMULATOR_HOST variables are dropped so a
// stray one can never send "prod" writes to an emulator (or the reverse).

import { readFileSync } from 'node:fs';

export const EMULATOR_PROJECT_ID = 'demo-festival-quest';

/** The project id aliased "prod" in .firebaserc. */
export function prodProjectId() {
  const rc = JSON.parse(readFileSync(new URL('../../.firebaserc', import.meta.url), 'utf8'));
  const id = rc.projects?.prod;
  if (!id) throw new Error('No "prod" alias in .firebaserc. Add one with `npx firebase use --add`.');
  return id;
}

/**
 * Point the Admin SDK at the emulators (default ports from firebase.json unless already set) or, with
 * `prod`, at the real project. Returns the project id to pass to initializeApp.
 */
export function selectTarget({ prod, emulators }) {
  if (prod) {
    for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) {
      delete process.env[name];
    }
    return prodProjectId();
  }
  for (const [name, host] of Object.entries(emulators)) process.env[name] ??= host;
  // Skip the slow Google metadata-server probe (the emulators need no credentials).
  process.env.METADATA_SERVER_DETECTION ??= 'none';
  return EMULATOR_PROJECT_ID;
}

/** Turn the usual "no credentials" failure into the command that fixes it. */
export function explainCredentials(err) {
  const msg = String(err?.message ?? err);
  if (/default credentials|invalid_grant|reauth|UNAUTHENTICATED|Could not load the default credentials/i.test(msg)) {
    return (
      `${msg}\n\n` +
      '  --prod uses Application Default Credentials. Sign in once with:\n' +
      '    gcloud auth application-default login\n' +
      `    gcloud auth application-default set-quota-project ${prodProjectId()}`
    );
  }
  return msg;
}
