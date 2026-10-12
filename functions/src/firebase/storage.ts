// Cloud Storage cleanup for the reset.
import { getStorage } from 'firebase-admin/storage';
import * as logger from 'firebase-functions/logger';

/** Best effort: photos and avatars live in Storage, outside the Firestore wipe. */
export async function wipeFiles(prefixes: string[]): Promise<void> {
  try {
    const bucket = getStorage().bucket();
    for (const prefix of prefixes) {
      try {
        await bucket.deleteFiles({ prefix, force: true });
      } catch (err) {
        logger.warn(`Could not delete storage objects under ${prefix}`, err);
      }
    }
  } catch (err) {
    logger.warn('Could not open the storage bucket; skipping storage cleanup', err);
  }
}
