// Errors that mean something to the game and the app, whatever backend is underneath.

/** Why a game action was refused. The Firebase adapter turns it into an HttpsError with the same code. */
export type GameErrorCode =
  | 'invalid-argument'
  | 'failed-precondition'
  | 'permission-denied'
  | 'not-found'
  | 'already-exists'
  | 'resource-exhausted'
  | 'unauthenticated'
  | 'internal';

// No parameter properties in this folder: Node runs these files directly (type stripping) and can't handle them.
export class GameError extends Error {
  readonly code: GameErrorCode;
  readonly details?: unknown;

  constructor(code: GameErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'GameError';
    this.code = code;
    this.details = details;
  }
}

/** What a store reports instead of native codes (gRPC numbers and the like). */
export type StoreErrorCode = 'not-found' | 'already-exists' | 'aborted' | 'invalid-argument' | 'failed-precondition';

export class StoreError extends Error {
  readonly code: StoreErrorCode;

  constructor(code: StoreErrorCode, message: string) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
  }
}
