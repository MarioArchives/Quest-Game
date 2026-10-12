// Data-layer plan edge case 15: game rules throw GameError; the Firebase adapter turns it into an HttpsError
// with the same code, message and details, and hides anything else behind 'internal'.
import { HttpsError } from 'firebase-functions/v2/https';
import { describe, expect, it } from 'vitest';
import { toHttpsError } from '../src/firebase/errors.js';
import { fail } from '../src/game/guards.js';
import { GameError, StoreError } from '../src/shared/store/errors.js';

describe('fail()', () => {
  it('throws a GameError with the code, message and details', () => {
    let thrown: unknown;
    try {
      fail('resource-exhausted', 'Too soon.', { retryAt: 123 });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(GameError);
    expect(thrown).toMatchObject({ code: 'resource-exhausted', message: 'Too soon.', details: { retryAt: 123 } });
  });
});

describe('toHttpsError', () => {
  it('keeps a GameError’s code, message and details', () => {
    const out = toHttpsError(new GameError('resource-exhausted', 'Too soon.', { retryAt: 123 }));
    expect(out).toBeInstanceOf(HttpsError);
    expect(out.code).toBe('resource-exhausted');
    expect(out.message).toBe('Too soon.');
    expect(out.details).toEqual({ retryAt: 123 });
  });

  it.each(['failed-precondition', 'permission-denied', 'not-found', 'unauthenticated', 'invalid-argument', 'already-exists'] as const)(
    'keeps %s',
    (code) => {
      expect(toHttpsError(new GameError(code, 'Nope.')).code).toBe(code);
    },
  );

  it('passes an HttpsError through unchanged', () => {
    const original = new HttpsError('failed-precondition', 'Already handled.');
    expect(toHttpsError(original)).toBe(original);
  });

  it('turns anything else into internal "Something went wrong."', () => {
    for (const err of [new Error('boom'), new StoreError('aborted', 'contention'), 'a string', undefined]) {
      const out = toHttpsError(err);
      expect(out.code).toBe('internal');
      expect(out.message).toBe('Something went wrong.');
    }
  });
});
