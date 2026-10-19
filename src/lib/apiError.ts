// Errors from game actions and data, phrased for people. Pure: works with any backend's BackendError.
import { BackendError } from '../backend/errors';
import { t } from '../pack';

export class ApiError extends Error {
  readonly code: string;
  /** Epoch ms when a rate-limited action becomes available again ('resource-exhausted'). */
  readonly retryAt: number | null;
  /** The server's own word for why, when it gave one (`details.reason`, e.g. 'not-set-up'), for the app to act on. */
  readonly reason: string | null;

  constructor(code: string, message: string, retryAt: number | null = null, reason: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.retryAt = retryAt;
    this.reason = reason;
  }
}

const FALLBACK: Record<string, string> = {
  unauthenticated: 'You need to sign in again.',
  'permission-denied': "You're not allowed to do that.",
  'failed-precondition': "That isn't possible right now.",
  'invalid-argument': "Something about that request wasn't right.",
  'not-found': "We couldn't find that. It may have changed, so try refreshing.",
  'already-exists': 'That has already been done.',
  'resource-exhausted': 'Slow down a little and try again shortly.',
  unavailable: "Can't reach the server. Check your signal and try again.",
  'deadline-exceeded': 'That took too long. Try again.',
  unimplemented: "That isn't available yet.",
  cancelled: 'Cancelled.',
  aborted: 'That clashed with another change. Try again.',
};

/** Codes whose server-written message is already phrased for people. */
const SERVER_MESSAGE_CODES = new Set([
  'permission-denied',
  'failed-precondition',
  'invalid-argument',
  'not-found',
  'already-exists',
  'resource-exhausted',
  'unauthenticated',
]);

function retryAtFrom(details: unknown): number | null {
  if (details && typeof details === 'object' && 'retryAt' in details) {
    const value = Number((details as { retryAt: unknown }).retryAt);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function reasonFrom(details: unknown): string | null {
  if (details && typeof details === 'object' && 'reason' in details) {
    const value = (details as { reason: unknown }).reason;
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

/** The cap a refused action ran into ('resource-exhausted' with `details.limit`), if any. */
function limitFrom(details: unknown): number | null {
  if (details && typeof details === 'object' && 'limit' in details) {
    const value = Number((details as { limit: unknown }).limit);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

/** Messages for errors thrown by the client SDKs (Firestore / Storage), not by our callables. */
const CLIENT_FALLBACK: Record<string, string> = {
  'permission-denied': "That isn't allowed right now. Is the game running?",
  'storage/unauthorized': "That upload isn't allowed right now. Is the game running?",
  'storage/canceled': 'The upload was cancelled.',
  'storage/retry-limit-exceeded': 'The upload kept failing. Check your signal and try again.',
  'storage/quota-exceeded': `The photo storage is full. Tell the ${t.gm.One}.`,
  unavailable: "Can't reach the server. Check your signal and try again.",
  'resource-exhausted': 'Slow down a little and try again shortly.',
  'unauthenticated': 'You need to sign in again.',
  'not-found': "We couldn't find that. It may have changed.",
};

const GENERIC = 'Something went wrong. Try again in a moment.';

/** Anything thrown (a BackendError, an ApiError, any Error) as an ApiError with a message for people. */
export function toApiError(err: unknown, nowMs: number = Date.now()): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof BackendError) {
    const code = err.code;
    if (err.source !== 'call') return new ApiError(code, CLIENT_FALLBACK[code] ?? GENERIC);
    const retryAt = retryAtFrom(err.details);
    // The Functions SDK appends the HTTP status to the server's text ("The game has ended. [400]").
    const server = (err.message ?? '').replace(/\s*\[\d{3}\]\s*$/, '').trim();
    const looksHuman = server.length > 0 && server.length < 200 && !/^internal$/i.test(server) && !server.includes('Firebase:');
    let message: string;
    if (SERVER_MESSAGE_CODES.has(code) && looksHuman) message = server;
    else message = FALLBACK[code] ?? 'Something went wrong on our side. Try again in a moment.';
    const limit = limitFrom(err.details);
    if (code === 'resource-exhausted' && limit !== null) message = `You have used all ${limit} of your guesses.`;
    else if (code === 'resource-exhausted' && retryAt && retryAt > nowMs) {
      const mins = Math.max(1, Math.ceil((retryAt - nowMs) / 60_000));
      message = `Too soon. You can try again in ${mins} min.`;
    }
    return new ApiError(code, message, retryAt, reasonFrom(err.details));
  }
  if (err instanceof Error) return new ApiError('unknown', err.message || 'Something went wrong.');
  return new ApiError('unknown', 'Something went wrong.');
}
