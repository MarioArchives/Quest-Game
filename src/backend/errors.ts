// The one error type backends throw, so the app never needs a backend's own error classes.

export type BackendErrorSource = 'call' | 'data' | 'files' | 'auth';

export class BackendError extends Error {
  constructor(
    /** Where it came from: a game action, a read or write, a file, or sign-in. */
    readonly source: BackendErrorSource,
    /** The plain code: 'failed-precondition', 'permission-denied', 'storage/unauthorized', 'auth/popup-blocked', … */
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'BackendError';
  }
}
