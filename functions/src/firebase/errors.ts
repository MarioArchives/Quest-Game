// Game errors to callable errors.
import { HttpsError } from 'firebase-functions/v2/https';
import { GameError } from '../shared/store/errors.js';

/** A GameError becomes an HttpsError with the same code, message and details; anything else is 'internal'. */
export function toHttpsError(err: unknown): HttpsError {
  if (err instanceof HttpsError) return err;
  if (err instanceof GameError) return new HttpsError(err.code, err.message, err.details);
  return new HttpsError('internal', 'Something went wrong.');
}
