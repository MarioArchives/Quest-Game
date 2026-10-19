// What the app needs from a backend. The app talks only to this interface (through src/backend/index.ts);
// src/backend/firebase/ and src/backend/mock/ implement it. Times come back as Stamps (anything with toMillis).
import type { Doc } from '../shared';

export interface BackendUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

/** Mock only: someone you can sign in as: the GM, a demo player, or a guest who isn't in the game yet (to try joining). */
export interface MockAccount {
  uid: string;
  label: string;
  role: 'gm' | 'player' | 'guest';
}

export interface AuthApi {
  /** Called with the current user straight away, then on every change. Returns unsubscribe. */
  onUser(onNext: (user: BackendUser | null) => void): () => void;
  current(): BackendUser | null;
  /** Firebase: the Google pop-up. Mock: sign in as `accountUid` (the GM when omitted). */
  signIn(accountUid?: string): Promise<void>;
  signOut(): Promise<void>;
  /** Mock only: the accounts the sign-in screen offers. */
  accounts?(): MockAccount[];
}

/** A live query as plain data, so it can be keyed, compared and run by any backend. */
export interface QuerySpec {
  /** Collection path, e.g. "submissions" or "players/abc/quests". */
  path: string;
  /** Equality filters, all of which must match. */
  where?: Array<[field: string, op: '==', value: string | number | boolean | null]>;
  orderBy?: [field: string, direction: 'asc' | 'desc'];
  limit?: number;
}

/** Written as a field value, it becomes the backend's "now" when the write lands. */
export const SERVER_TIME = Object.freeze({ __serverTime: true as const });
export type ServerTime = typeof SERVER_TIME;

export type WriteOp =
  | { op: 'set'; path: string; data: Record<string, unknown>; merge?: boolean }
  | { op: 'update'; path: string; data: Record<string, unknown> }
  | { op: 'remove'; path: string };

export interface DataApi {
  /** Current document (null when missing), then every change. Returns unsubscribe. */
  watchDoc<T>(path: string, onNext: (doc: Doc<T> | null) => void, onError: (err: Error) => void): () => void;
  /** Current results, then every change. Returns unsubscribe. */
  watchQuery<T>(spec: QuerySpec, onNext: (docs: Doc<T>[]) => void, onError: (err: Error) => void): () => void;
  set(path: string, data: Record<string, unknown>, options?: { merge?: boolean }): Promise<void>;
  update(path: string, data: Record<string, unknown>): Promise<void>;
  /** Adds a document with a new id and returns the id. */
  add(collectionPath: string, data: Record<string, unknown>): Promise<string>;
  remove(path: string): Promise<void>;
  /** All the writes or none, in order. */
  batch(ops: WriteOp[]): Promise<void>;
  /** A fresh document id for that collection, without writing anything. */
  newId(collectionPath: string): string;
}

export interface FilesApi {
  upload(
    path: string,
    blob: Blob,
    metadata: { contentType: string; cacheControl?: string },
    onProgress?: (sent: number, total: number) => void,
  ): Promise<void>;
  /** A URL the browser can load (and fetch for "Save image"). */
  url(path: string): Promise<string>;
}

export interface PushApi {
  /** This device's push token (asks the browser for it). */
  token(): Promise<string>;
}

export interface Backend {
  kind: 'firebase' | 'mock';
  auth: AuthApi;
  data: DataApi;
  /** Runs a game action. Failures are BackendErrors with source 'call'. */
  call<I, O>(name: string, data: I): Promise<O>;
  files: FilesApi;
  /** Null when this backend or browser can't do push. */
  push: PushApi | null;
}
