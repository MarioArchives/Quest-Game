// Data-layer plan edge case 21: errors read the same in the app whichever backend raised them.
import { describe, expect, it } from 'vitest';
import { BackendError } from '../backend/errors';
import { ApiError, toApiError } from './apiError';

const NOW = Date.parse('2026-10-10T14:00:00Z');
const call = (code: string, message: string, details?: unknown) => new BackendError('call', code, message, details);

describe('toApiError: game actions', () => {
  it('passes a human message through for the codes whose text is written for people, without the [400] suffix', () => {
    expect(toApiError(call('failed-precondition', 'The game has ended. [400]'), NOW)).toMatchObject({
      code: 'failed-precondition',
      message: 'The game has ended.',
      retryAt: null,
    });
    for (const code of ['permission-denied', 'invalid-argument', 'not-found', 'already-exists', 'unauthenticated']) {
      expect(toApiError(call(code, 'Pick another witness.'), NOW).message).toBe('Pick another witness.');
    }
  });

  it('falls back to friendly text for internal errors or text that is not for people', () => {
    expect(toApiError(call('internal', 'INTERNAL'), NOW).message).toBe('Something went wrong on our side. Try again in a moment.');
    expect(toApiError(call('failed-precondition', 'Firebase: something odd'), NOW).message).toBe("That isn't possible right now.");
    expect(toApiError(call('failed-precondition', ''), NOW).message).toBe("That isn't possible right now.");
    expect(toApiError(call('aborted', 'whatever'), NOW).message).toBe('That clashed with another change. Try again.');
  });

  it('reads retryAt from the details and says how long to wait', () => {
    const err = toApiError(call('resource-exhausted', 'Too soon.', { retryAt: NOW + 4.2 * 60_000 }), NOW);
    expect(err.retryAt).toBe(NOW + 4.2 * 60_000);
    expect(err.message).toBe('Too soon. You can try again in 5 min.');
  });

  it('a past or missing retryAt leaves the message alone', () => {
    expect(toApiError(call('resource-exhausted', 'Slow down.'), NOW)).toMatchObject({ message: 'Slow down.', retryAt: null });
  });
});

describe('toApiError: data, files and sign-in', () => {
  it('uses the client messages by code', () => {
    expect(toApiError(new BackendError('data', 'permission-denied', 'Missing or insufficient permissions.'), NOW).message).toBe(
      "That isn't allowed right now. Is the game running?",
    );
    expect(toApiError(new BackendError('files', 'storage/canceled', 'x'), NOW).message).toBe('The upload was cancelled.');
    expect(toApiError(new BackendError('data', 'unavailable', 'x'), NOW).message).toBe(
      "Can't reach the server. Check your signal and try again.",
    );
  });

  it('an unknown client code gets the generic message', () => {
    expect(toApiError(new BackendError('data', 'weird/code', 'x'), NOW).message).toBe('Something went wrong. Try again in a moment.');
  });
});

describe('toApiError: anything else', () => {
  it('returns an ApiError unchanged', () => {
    const err = new ApiError('failed-precondition', 'Already done.');
    expect(toApiError(err, NOW)).toBe(err);
  });

  it('wraps a plain Error or a non-error', () => {
    expect(toApiError(new Error('Disk full'), NOW)).toMatchObject({ code: 'unknown', message: 'Disk full' });
    expect(toApiError('???', NOW)).toMatchObject({ code: 'unknown', message: 'Something went wrong.' });
  });
});
