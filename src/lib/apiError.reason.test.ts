// The server's own word for why an action was refused (`details.reason`), for the app to act on: a test call on a
// server with no phone line ('not-set-up') carries on in the app rather than offering to ring again.
import { describe, expect, it } from 'vitest';
import { BackendError } from '../backend/errors';
import { ApiError, toApiError } from './apiError';

describe('toApiError: the reason', () => {
  it('is read from the details of a refused action', () => {
    const err = toApiError(new BackendError('call', 'failed-precondition', "Phone calls aren't set up on this server yet. [400]", { reason: 'not-set-up' }));
    expect(err).toMatchObject({ code: 'failed-precondition', message: "Phone calls aren't set up on this server yet.", reason: 'not-set-up' });
  });

  it('is null when the server gave none, or not as a word', () => {
    expect(toApiError(new BackendError('call', 'failed-precondition', 'A test call is already on its way.')).reason).toBeNull();
    expect(toApiError(new BackendError('call', 'failed-precondition', 'No.', { reason: 42 })).reason).toBeNull();
    expect(toApiError(new BackendError('call', 'failed-precondition', 'No.', { reason: '' })).reason).toBeNull();
    expect(toApiError(new BackendError('data', 'permission-denied', 'Missing or insufficient permissions.')).reason).toBeNull();
    expect(new ApiError('internal', 'Something went wrong.').reason).toBeNull();
  });
});
