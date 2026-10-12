// The document store the game rules run on: exactly the slice of a Firestore-like database they use.
// Implementations: memoryStore (./memory.ts, Node and browsers) and firestoreStore (functions/src/firebase/store.ts).
// Values in and out are plain JSON-like data plus Stamp (./stamp.ts) for times; a Date written is read back as a Stamp.

// `any` like Firestore's DocumentData, so interfaces such as Player can be cast to and from it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DocData = { [field: string]: any };

export type FilterOp = '==' | 'in';
export type Direction = 'asc' | 'desc';

export interface DocSnap<T = DocData> {
  readonly id: string;
  readonly ref: DocRef<T>;
  readonly exists: boolean;
  /** A copy of the document's data; undefined when it doesn't exist. */
  data(): T | undefined;
  /** One top-level field; undefined when the doc or the field is missing. */
  get(field: string): unknown;
}

/** A document in query results: it always exists, so data() is never undefined. */
export interface QueryDocSnap<T = DocData> extends DocSnap<T> {
  readonly exists: true;
  data(): T;
}

export interface QuerySnap<T = DocData> {
  /** Matching documents: in doc-id order unless the query has orderBy. */
  readonly docs: QueryDocSnap<T>[];
  readonly size: number;
  readonly empty: boolean;
}

export interface Query<T = DocData> {
  /** `==` matches equal values of the same type; `in` takes up to 30 values. Missing fields never match. */
  where(field: string, op: FilterOp, value: unknown): Query<T>;
  orderBy(field: string, direction?: Direction): Query<T>;
  limit(n: number): Query<T>;
  /** Only these fields come back in each document. */
  select(...fields: string[]): Query<T>;
  count(): { get(): Promise<{ data(): { count: number } }> };
  get(): Promise<QuerySnap<T>>;
}

export interface CollectionRef<T = DocData> extends Query<T> {
  readonly id: string;
  readonly path: string;
  /** A document in this collection; with no id, a new unique auto id (usable before anything is written). */
  doc(id?: string): DocRef<T>;
  listDocuments(): Promise<DocRef<T>[]>;
}

export interface DocRef<T = DocData> {
  readonly id: string;
  readonly path: string;
  collection(name: string): CollectionRef;
  get(): Promise<DocSnap<T>>;
  /** Replaces the document, or with `merge` deep-merges maps into it. Creates it if missing. */
  set(data: DocData, options?: { merge?: boolean }): Promise<void>;
  /** Replaces the named top-level fields. Throws StoreError('not-found') if the document is missing. */
  update(data: DocData): Promise<void>;
  /** Throws StoreError('already-exists') if the document exists. */
  create(data: DocData): Promise<void>;
  /** A missing document is fine. */
  delete(): Promise<void>;
}

/**
 * A transaction: every read comes before any write (a read after a write throws), writes apply together at the
 * end, a throw discards them all, and the callback may run again if another write got there first.
 */
export interface Txn {
  get<T = DocData>(ref: DocRef<T>): Promise<DocSnap<T>>;
  get<T = DocData>(query: Query<T>): Promise<QuerySnap<T>>;
  /** Snapshots in the order asked for, missing documents included. */
  getAll<T = DocData>(...refs: DocRef<T>[]): Promise<DocSnap<T>[]>;
  set(ref: DocRef, data: DocData, options?: { merge?: boolean }): Txn;
  update(ref: DocRef, data: DocData): Txn;
  create(ref: DocRef, data: DocData): Txn;
  delete(ref: DocRef): Txn;
}

/** Writes applied together, in order, by commit(). */
export interface Batch {
  set(ref: DocRef, data: DocData, options?: { merge?: boolean }): Batch;
  update(ref: DocRef, data: DocData): Batch;
  create(ref: DocRef, data: DocData): Batch;
  delete(ref: DocRef): Batch;
  commit(): Promise<void>;
}

export interface Store {
  /** A document by slash path: "game/state", "players/abc/quests/q1". */
  doc<T = DocData>(path: string): DocRef<T>;
  /** A collection by slash path: "players", "players/abc/quests". */
  collection<T = DocData>(path: string): CollectionRef<T>;
  /** Every collection with this id, at any depth. */
  collectionGroup<T = DocData>(collectionId: string): Query<T>;
  runTransaction<R>(fn: (tx: Txn) => Promise<R>): Promise<R>;
  batch(): Batch;
  /** Deletes the document or collection and everything nested under it. */
  recursiveDelete(ref: DocRef | CollectionRef): Promise<void>;
}

/** One committed change to one document. */
export interface WriteChange {
  path: string;
  before: DocData | undefined;
  after: DocData | undefined;
}

/**
 * A store you can watch: the in-memory store, for live screens and for running triggers in the mock. Listeners run
 * synchronously when a write, batch or transaction commits (once per commit), before its promise resolves.
 */
export interface WatchableStore extends Store {
  /** Called with the current snapshot, then once per committed change to that document. Returns unsubscribe. */
  watchDoc(path: string, onNext: (snap: DocSnap) => void): () => void;
  /** Called with the current results, then once per committed change that alters them. Returns unsubscribe. */
  watchQuery(query: Query, onNext: (snap: QuerySnap) => void): () => void;
  /** Called after every committed write, one change per document. Returns unsubscribe. */
  onWrite(listener: (change: WriteChange) => void): () => void;
}
