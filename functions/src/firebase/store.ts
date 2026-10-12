// Firestore (Admin SDK) behind the neutral Store interface: Stamps in and out, StoreErrors instead of gRPC codes.
// The only server code besides functions/src/index.ts that may import firebase-admin.
import { Timestamp } from 'firebase-admin/firestore';
import type {
  CollectionReference,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Query as NativeQuery,
  QuerySnapshot,
  Transaction,
  WriteBatch,
} from 'firebase-admin/firestore';
import { StoreError, type StoreErrorCode } from '../shared/store/errors.js';
import { Stamp } from '../shared/store/stamp.js';
import type {
  Batch,
  CollectionRef,
  DocData,
  DocRef,
  DocSnap,
  QueryDocSnap,
  Query,
  QuerySnap,
  Store,
  Txn,
} from '../shared/store/types.js';

type SetOptions = { merge?: boolean };

// --- values -----------------------------------------------------------------------------------------------------

const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== 'object' || v === null) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/** Firestore Timestamps become Stamps, at any depth. */
function fromNative(value: unknown): unknown {
  if (value instanceof Timestamp) return Stamp.fromMillis(value.toMillis());
  if (Array.isArray(value)) return value.map(fromNative);
  if (isPlain(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fromNative(v)]));
  return value;
}

/** Stamps become Timestamps, at any depth; `undefined` is refused (the app's Firestore doesn't ignore it). */
function toNative(value: unknown, at = 'value'): unknown {
  if (value === undefined) throw new StoreError('invalid-argument', `Cannot write undefined at ${at}.`);
  if (value instanceof Stamp) return Timestamp.fromMillis(value.toMillis());
  if (Array.isArray(value)) return value.map((v, i) => toNative(v, `${at}[${i}]`));
  if (isPlain(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toNative(v, `${at}.${k}`)]));
  return value;
}

const toNativeData = (data: DocData): DocumentData => toNative(data, 'data') as DocumentData;

// --- errors -----------------------------------------------------------------------------------------------------

const GRPC_CODES: Record<number, StoreErrorCode> = {
  3: 'invalid-argument',
  5: 'not-found',
  6: 'already-exists',
  9: 'failed-precondition',
  10: 'aborted',
};

/** Firestore's gRPC failures become StoreErrors; anything else is left alone. */
function mapError(err: unknown): unknown {
  const code = (err as { code?: unknown } | null)?.code;
  const mapped = typeof code === 'number' ? GRPC_CODES[code] : undefined;
  return mapped ? new StoreError(mapped, err instanceof Error ? err.message : String(err)) : err;
}

async function mapped<R>(run: () => Promise<R>): Promise<R> {
  try {
    return await run();
  } catch (err) {
    throw mapError(err);
  }
}

// --- snapshots and refs -----------------------------------------------------------------------------------------

class WrappedSnap implements DocSnap {
  constructor(private readonly snap: DocumentSnapshot) {}
  get id(): string {
    return this.snap.id;
  }
  get ref(): DocRef {
    return new WrappedDoc(this.snap.ref);
  }
  get exists(): boolean {
    return this.snap.exists;
  }
  data(): DocData | undefined {
    const data = this.snap.data();
    return data === undefined ? undefined : (fromNative(data) as DocData);
  }
  get(field: string): unknown {
    return fromNative(this.snap.get(field));
  }
}

function wrapQuerySnap(snap: QuerySnapshot): QuerySnap {
  // Query results only ever hold existing documents.
  const docs = snap.docs.map((d) => new WrappedSnap(d)) as unknown as QueryDocSnap[];
  return { docs, size: docs.length, empty: docs.length === 0 };
}

class WrappedQuery implements Query {
  constructor(readonly native: NativeQuery) {}
  where(field: string, op: '==' | 'in', value: unknown): Query {
    return new WrappedQuery(this.native.where(field, op, toNative(value, field)));
  }
  orderBy(field: string, direction?: 'asc' | 'desc'): Query {
    return new WrappedQuery(this.native.orderBy(field, direction));
  }
  limit(n: number): Query {
    return new WrappedQuery(this.native.limit(n));
  }
  select(...fields: string[]): Query {
    return new WrappedQuery(this.native.select(...fields));
  }
  count() {
    const agg = this.native.count();
    return {
      get: async () => {
        const snap = await mapped(() => agg.get());
        return { data: () => ({ count: snap.data().count }) };
      },
    };
  }
  async get(): Promise<QuerySnap> {
    return wrapQuerySnap(await mapped(() => this.native.get()));
  }
}

class WrappedCollection extends WrappedQuery implements CollectionRef {
  constructor(private readonly col: CollectionReference) {
    super(col);
  }
  get id(): string {
    return this.col.id;
  }
  get path(): string {
    return this.col.path;
  }
  doc(id?: string): DocRef {
    return new WrappedDoc(id === undefined ? this.col.doc() : this.col.doc(id));
  }
  async listDocuments(): Promise<DocRef[]> {
    return (await mapped(() => this.col.listDocuments())).map((d) => new WrappedDoc(d));
  }
}

class WrappedDoc implements DocRef {
  constructor(readonly native: DocumentReference) {}
  get id(): string {
    return this.native.id;
  }
  get path(): string {
    return this.native.path;
  }
  collection(name: string): CollectionRef {
    return new WrappedCollection(this.native.collection(name));
  }
  async get(): Promise<DocSnap> {
    return new WrappedSnap(await mapped(() => this.native.get()));
  }
  async set(data: DocData, options?: SetOptions): Promise<void> {
    const native = toNativeData(data);
    await mapped(() => (options ? this.native.set(native, options) : this.native.set(native)));
  }
  async update(data: DocData): Promise<void> {
    const native = toNativeData(data);
    await mapped(() => this.native.update(native));
  }
  async create(data: DocData): Promise<void> {
    const native = toNativeData(data);
    await mapped(() => this.native.create(native));
  }
  async delete(): Promise<void> {
    await mapped(() => this.native.delete());
  }
}

const nativeDoc = (ref: DocRef): DocumentReference => {
  if (!(ref instanceof WrappedDoc)) throw new StoreError('invalid-argument', 'Not a Firestore document reference.');
  return ref.native;
};

const nativeQuery = (query: Query): NativeQuery => {
  if (!(query instanceof WrappedQuery)) throw new StoreError('invalid-argument', 'Not a Firestore query.');
  return query.native;
};

// --- transactions and batches -----------------------------------------------------------------------------------

class WrappedTxn implements Txn {
  constructor(private readonly tx: Transaction) {}
  get(target: DocRef): Promise<DocSnap>;
  get(target: Query): Promise<QuerySnap>;
  async get(target: DocRef | Query): Promise<DocSnap | QuerySnap> {
    if (target instanceof WrappedDoc) return new WrappedSnap(await this.tx.get(target.native));
    return wrapQuerySnap(await this.tx.get(nativeQuery(target as Query)));
  }
  async getAll<T = DocData>(...refs: DocRef<T>[]): Promise<DocSnap<T>[]> {
    if (refs.length === 0) return [];
    const snaps = await this.tx.getAll(...refs.map((r) => nativeDoc(r as DocRef)));
    return snaps.map((s) => new WrappedSnap(s) as unknown as DocSnap<T>);
  }
  set(ref: DocRef, data: DocData, options?: SetOptions): Txn {
    const native = toNativeData(data);
    if (options) this.tx.set(nativeDoc(ref), native, options);
    else this.tx.set(nativeDoc(ref), native);
    return this;
  }
  update(ref: DocRef, data: DocData): Txn {
    this.tx.update(nativeDoc(ref), toNativeData(data));
    return this;
  }
  create(ref: DocRef, data: DocData): Txn {
    this.tx.create(nativeDoc(ref), toNativeData(data));
    return this;
  }
  delete(ref: DocRef): Txn {
    this.tx.delete(nativeDoc(ref));
    return this;
  }
}

class WrappedBatch implements Batch {
  constructor(private readonly batch: WriteBatch) {}
  set(ref: DocRef, data: DocData, options?: SetOptions): Batch {
    const native = toNativeData(data);
    if (options) this.batch.set(nativeDoc(ref), native, options);
    else this.batch.set(nativeDoc(ref), native);
    return this;
  }
  update(ref: DocRef, data: DocData): Batch {
    this.batch.update(nativeDoc(ref), toNativeData(data));
    return this;
  }
  create(ref: DocRef, data: DocData): Batch {
    this.batch.create(nativeDoc(ref), toNativeData(data));
    return this;
  }
  delete(ref: DocRef): Batch {
    this.batch.delete(nativeDoc(ref));
    return this;
  }
  async commit(): Promise<void> {
    await mapped(() => this.batch.commit());
  }
}

// --- the store --------------------------------------------------------------------------------------------------

export function firestoreStore(db: Firestore): Store {
  return {
    doc: <T>(path: string) => new WrappedDoc(db.doc(path)) as unknown as DocRef<T>,
    collection: <T>(path: string) => new WrappedCollection(db.collection(path)) as unknown as CollectionRef<T>,
    collectionGroup: <T>(id: string) => new WrappedQuery(db.collectionGroup(id)) as unknown as Query<T>,
    async runTransaction<R>(fn: (tx: Txn) => Promise<R>): Promise<R> {
      // An error the callback threw itself comes out as it was; only Firestore's own failures are mapped.
      let thrown: { err: unknown } | undefined;
      try {
        return await db.runTransaction(async (tx) => {
          thrown = undefined;
          try {
            return await fn(new WrappedTxn(tx));
          } catch (err) {
            thrown = { err };
            throw err;
          }
        });
      } catch (err) {
        if (thrown && thrown.err === err) throw err;
        throw mapError(err);
      }
    },
    batch: () => new WrappedBatch(db.batch()),
    async recursiveDelete(ref: DocRef | CollectionRef): Promise<void> {
      const target = ref instanceof WrappedDoc ? ref.native : ref instanceof WrappedCollection ? ref.native : undefined;
      if (!target) throw new StoreError('invalid-argument', 'Not a Firestore reference.');
      await mapped(() => db.recursiveDelete(target as DocumentReference | CollectionReference));
    },
  };
}
