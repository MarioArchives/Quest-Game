// An in-memory WatchableStore with Firestore's semantics for the slice the game uses. Runs in Node and browsers:
// the mock backend's database and a fast stand-in for the emulator in tests.
import { StoreError } from './errors.ts';
import type {
  Batch,
  CollectionRef,
  Direction,
  DocData,
  DocRef,
  DocSnap,
  QueryDocSnap,
  FilterOp,
  Query,
  QuerySnap,
  Txn,
  WatchableStore,
  WriteChange,
} from './types.ts';
import {
  cloneStored,
  comparePaths,
  compareValues,
  getField,
  mergeDocs,
  toStored,
  toStoredDoc,
  valuesEqual,
} from './values.ts';

export interface MemoryStoreOptions {
  /** Auto ids; defaults to 20 random characters like Firestore's. */
  newId?: () => string;
}

const MAX_ATTEMPTS = 5;
const MAX_IN_VALUES = 30;
const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** 20 random [A-Za-z0-9] characters; bytes above 247 are skipped so every character is equally likely. */
function randomId(): string {
  let id = '';
  while (id.length < 20) {
    for (const byte of globalThis.crypto.getRandomValues(new Uint8Array(32))) {
      if (byte < 248 && id.length < 20) id += ID_CHARS[byte % 62];
    }
  }
  return id;
}

// ---- paths ----

const lastSegment = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const parentPath = (path: string): string => path.slice(0, Math.max(path.lastIndexOf('/'), 0));

function segmentsOf(path: string): string[] {
  const segments = path.split('/');
  if (segments.some((s) => s === '')) throw new StoreError('invalid-argument', `Invalid path "${path}".`);
  return segments;
}

// Version keys: one per document, per collection path, and per collection id (for collection groups).
const docKey = (path: string): string => `d:${path}`;
const collectionKey = (path: string): string => `c:${path}`;
const groupKey = (id: string): string => `g:${id}`;

// ---- writes ----

interface Op {
  kind: 'set' | 'update' | 'create' | 'delete';
  path: string;
  data?: DocData;
  merge?: boolean;
  /** A validation failure found when the write was queued; it surfaces when the write is applied. */
  error?: unknown;
}

function makeOp(kind: Op['kind'], path: string, data?: DocData, merge?: boolean): Op {
  if (kind === 'delete') return { kind, path };
  try {
    return { kind, path, data: toStoredDoc(data), merge };
  } catch (error) {
    return { kind, path, error };
  }
}

// ---- snapshots ----

class DocSnapImpl implements DocSnap {
  readonly id: string;
  readonly ref: DocRef;

  constructor(
    store: MemoryStore,
    path: string,
    /** The stored data, shared and never mutated. */
    readonly raw: DocData | undefined,
  ) {
    this.id = lastSegment(path);
    this.ref = store.docRef(path);
  }

  get exists(): boolean {
    return this.raw !== undefined;
  }

  data(): DocData | undefined {
    return this.raw === undefined ? undefined : cloneStored(this.raw);
  }

  get(field: string): unknown {
    return this.raw === undefined ? undefined : cloneStored(getField(this.raw, field));
  }
}

class QuerySnapImpl implements QuerySnap {
  readonly docs: QueryDocSnap[];

  constructor(docs: DocSnap[]) {
    // Query results only ever hold existing documents.
    this.docs = docs as QueryDocSnap[];
  }

  get size(): number {
    return this.docs.length;
  }

  get empty(): boolean {
    return this.docs.length === 0;
  }
}

// ---- queries ----

interface Filter {
  field: string;
  op: FilterOp;
  value: unknown;
}

interface Order {
  field: string;
  direction: Direction;
}

interface QuerySpec {
  /** A collection by path, or a collection group by id. */
  scope: { path: string } | { group: string };
  filters: Filter[];
  orders: Order[];
  limit?: number;
  fields?: string[];
}

class QueryImpl implements Query {
  constructor(
    protected readonly store: MemoryStore,
    protected readonly spec: QuerySpec,
  ) {}

  where(field: string, op: FilterOp, value: unknown): Query {
    if (op === 'in') {
      if (!Array.isArray(value)) throw new StoreError('invalid-argument', '"in" needs an array of values.');
      if (value.length > MAX_IN_VALUES) {
        throw new StoreError('invalid-argument', `"in" takes at most ${MAX_IN_VALUES} values.`);
      }
    }
    return this.derive({ filters: [...this.spec.filters, { field, op, value: toStored(value, 'where value') }] });
  }

  orderBy(field: string, direction: Direction = 'asc'): Query {
    return this.derive({ orders: [...this.spec.orders, { field, direction }] });
  }

  limit(n: number): Query {
    return this.derive({ limit: n });
  }

  select(...fields: string[]): Query {
    return this.derive({ fields });
  }

  count() {
    return { get: async () => ({ data: () => ({ count: this.run().length }) }) };
  }

  async get(): Promise<QuerySnap> {
    return new QuerySnapImpl(this.run());
  }

  /** The version key to watch for changes to this query's collection(s). */
  get versionKey(): string {
    return 'group' in this.spec.scope ? groupKey(this.spec.scope.group) : collectionKey(this.spec.scope.path);
  }

  /** Whether a document at `path` is in the collection (or group) this query reads. */
  covers(path: string): boolean {
    const scope = this.spec.scope;
    const parent = parentPath(path);
    return 'group' in scope ? lastSegment(parent) === scope.group : parent === scope.path;
  }

  /** The matching documents, right now. */
  run(): DocSnapImpl[] {
    const { filters, orders, limit, fields } = this.spec;
    let matches: [string, DocData][] = [];
    for (const [path, data] of this.store.docs) {
      if (this.covers(path) && filters.every((f) => matchesFilter(data, f))) matches.push([path, data]);
    }
    if (orders.length > 0) {
      matches = matches.filter(([, data]) => orders.every((o) => getField(data, o.field) !== undefined));
    }
    const last = orders[orders.length - 1];
    matches.sort(([pathA, a], [pathB, b]) => {
      for (const { field, direction } of orders) {
        const c = compareValues(getField(a, field), getField(b, field));
        if (c !== 0) return direction === 'desc' ? -c : c;
      }
      // Ties fall back to the document id (the full path across a group), in the last direction.
      return comparePaths(pathA, pathB) * (last?.direction === 'desc' ? -1 : 1);
    });
    if (limit !== undefined) matches = matches.slice(0, limit);
    return matches.map(([path, data]) => new DocSnapImpl(this.store, path, fields ? pick(data, fields) : data));
  }

  private derive(patch: Partial<QuerySpec>): Query {
    return new QueryImpl(this.store, { ...this.spec, ...patch });
  }
}

function matchesFilter(data: DocData, { field, op, value }: Filter): boolean {
  const actual = getField(data, field);
  if (actual === undefined) return false;
  return op === 'in' ? (value as unknown[]).some((v) => valuesEqual(actual, v)) : valuesEqual(actual, value);
}

const pick = (data: DocData, fields: string[]): DocData =>
  Object.fromEntries(fields.filter((f) => Object.hasOwn(data, f)).map((f) => [f, data[f]]));

// ---- references ----

class CollectionRefImpl extends QueryImpl implements CollectionRef {
  readonly id: string;

  constructor(
    store: MemoryStore,
    readonly path: string,
  ) {
    super(store, { scope: { path }, filters: [], orders: [] });
    this.id = lastSegment(path);
  }

  doc(id?: string): DocRef {
    const docId = id ?? this.store.newId();
    if (docId === '' || docId.includes('/')) throw new StoreError('invalid-argument', `Invalid document id "${docId}".`);
    return this.store.docRef(`${this.path}/${docId}`);
  }

  async listDocuments(): Promise<DocRef[]> {
    return this.run().map((snap) => snap.ref);
  }
}

class DocRefImpl implements DocRef {
  readonly id: string;

  constructor(
    private readonly store: MemoryStore,
    readonly path: string,
  ) {
    this.id = lastSegment(path);
  }

  collection(name: string): CollectionRef {
    return this.store.collection(`${this.path}/${name}`);
  }

  async get(): Promise<DocSnap> {
    return this.store.snapshot(this.path);
  }

  async set(data: DocData, options?: { merge?: boolean }): Promise<void> {
    this.store.apply([makeOp('set', this.path, data, options?.merge)]);
  }

  async update(data: DocData): Promise<void> {
    this.store.apply([makeOp('update', this.path, data)]);
  }

  async create(data: DocData): Promise<void> {
    this.store.apply([makeOp('create', this.path, data)]);
  }

  async delete(): Promise<void> {
    this.store.apply([makeOp('delete', this.path)]);
  }
}

// ---- batches and transactions ----

class BatchImpl implements Batch {
  private readonly ops: Op[] = [];

  private readonly store: MemoryStore;

  constructor(store: MemoryStore) {
    this.store = store;
  }

  set(ref: DocRef, data: DocData, options?: { merge?: boolean }): Batch {
    this.ops.push(makeOp('set', ref.path, data, options?.merge));
    return this;
  }

  update(ref: DocRef, data: DocData): Batch {
    this.ops.push(makeOp('update', ref.path, data));
    return this;
  }

  create(ref: DocRef, data: DocData): Batch {
    this.ops.push(makeOp('create', ref.path, data));
    return this;
  }

  delete(ref: DocRef): Batch {
    this.ops.push(makeOp('delete', ref.path));
    return this;
  }

  async commit(): Promise<void> {
    this.store.apply(this.ops);
  }
}

/** One attempt of a transaction: remembers what was read, and buffers writes. */
class TxnImpl implements Txn {
  readonly ops: Op[] = [];
  private readonly reads = new Map<string, number>();

  private readonly store: MemoryStore;

  constructor(store: MemoryStore) {
    this.store = store;
  }

  get<T = DocData>(ref: DocRef<T>): Promise<DocSnap<T>>;
  get<T = DocData>(query: Query<T>): Promise<QuerySnap<T>>;
  async get(target: DocRef | Query): Promise<DocSnap | QuerySnap> {
    this.assertNoWrites();
    if (target instanceof QueryImpl) {
      this.noteRead(target.versionKey);
      return new QuerySnapImpl(target.run());
    }
    const path = (target as DocRef).path;
    this.noteRead(docKey(path));
    return this.store.snapshot(path);
  }

  async getAll<T = DocData>(...refs: DocRef<T>[]): Promise<DocSnap<T>[]> {
    this.assertNoWrites();
    return refs.map((ref) => {
      this.noteRead(docKey(ref.path));
      return this.store.snapshot(ref.path) as unknown as DocSnap<T>;
    });
  }

  set(ref: DocRef, data: DocData, options?: { merge?: boolean }): Txn {
    this.ops.push(makeOp('set', ref.path, data, options?.merge));
    return this;
  }

  update(ref: DocRef, data: DocData): Txn {
    this.ops.push(makeOp('update', ref.path, data));
    return this;
  }

  create(ref: DocRef, data: DocData): Txn {
    this.ops.push(makeOp('create', ref.path, data));
    return this;
  }

  delete(ref: DocRef): Txn {
    this.ops.push(makeOp('delete', ref.path));
    return this;
  }

  /** True while nothing this attempt read has been written since. */
  isCurrent(): boolean {
    return [...this.reads].every(([key, version]) => this.store.version(key) === version);
  }

  private noteRead(key: string): void {
    // Keep the first version seen: a later read of the same thing can't vouch for what was read earlier.
    if (!this.reads.has(key)) this.reads.set(key, this.store.version(key));
  }

  private assertNoWrites(): void {
    if (this.ops.length > 0) throw new Error('A transaction must do all its reads before any write.');
  }
}

// ---- the store ----

interface DocWatcher {
  path: string;
  onNext: (snap: DocSnap) => void;
}

interface QueryWatcher {
  query: QueryImpl;
  onNext: (snap: QuerySnap) => void;
  /** The last results sent, as ids and data, to tell whether a commit changed them. */
  last: { id: string; data: DocData | undefined }[];
}

/** Runs a listener so that one that throws can't break the commit. */
function safely(listener: () => void): void {
  try {
    listener();
  } catch (error) {
    console.error('Store listener failed:', error);
  }
}

const resultsOf = (snaps: DocSnapImpl[]) => snaps.map((s) => ({ id: s.id, data: s.raw }));

class MemoryStore implements WatchableStore {
  /** Document data by full path; entries are replaced on write, never mutated. */
  readonly docs = new Map<string, DocData>();
  readonly newId: () => string;
  private readonly versions = new Map<string, number>();
  private readonly docWatchers = new Set<DocWatcher>();
  private readonly queryWatchers = new Set<QueryWatcher>();
  private readonly writeListeners = new Set<(change: WriteChange) => void>();

  constructor(options: MemoryStoreOptions) {
    this.newId = options.newId ?? randomId;
  }

  // -- Store --

  doc<T = DocData>(path: string): DocRef<T> {
    if (segmentsOf(path).length % 2 !== 0) throw new StoreError('invalid-argument', `"${path}" is not a document path.`);
    return this.docRef(path) as DocRef<T>;
  }

  collection<T = DocData>(path: string): CollectionRef<T> {
    if (segmentsOf(path).length % 2 !== 1) {
      throw new StoreError('invalid-argument', `"${path}" is not a collection path.`);
    }
    return new CollectionRefImpl(this, path) as unknown as CollectionRef<T>;
  }

  collectionGroup<T = DocData>(collectionId: string): Query<T> {
    return new QueryImpl(this, { scope: { group: collectionId }, filters: [], orders: [] }) as unknown as Query<T>;
  }

  async runTransaction<R>(fn: (tx: Txn) => Promise<R>): Promise<R> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const tx = new TxnImpl(this);
      const result = await fn(tx);
      // Applying is synchronous, so nothing can slip in between this check and the writes.
      if (!tx.isCurrent()) continue;
      this.apply(tx.ops);
      return result;
    }
    throw new StoreError('aborted', `Transaction gave up after ${MAX_ATTEMPTS} attempts.`);
  }

  batch(): Batch {
    return new BatchImpl(this);
  }

  async recursiveDelete(ref: DocRef | CollectionRef): Promise<void> {
    const prefix = `${ref.path}/`;
    const isDoc = ref instanceof DocRefImpl;
    const doomed = [...this.docs.keys()].filter((p) => p.startsWith(prefix) || (isDoc && p === ref.path));
    this.apply(doomed.map((path) => makeOp('delete', path)));
  }

  // -- WatchableStore --

  watchDoc(path: string, onNext: (snap: DocSnap) => void): () => void {
    this.doc(path);
    const watcher: DocWatcher = { path, onNext };
    this.docWatchers.add(watcher);
    safely(() => onNext(this.snapshot(path)));
    return () => this.docWatchers.delete(watcher);
  }

  watchQuery(query: Query, onNext: (snap: QuerySnap) => void): () => void {
    if (!(query instanceof QueryImpl)) throw new StoreError('invalid-argument', 'Not a query of this store.');
    const current = query.run();
    const watcher: QueryWatcher = { query, onNext, last: resultsOf(current) };
    this.queryWatchers.add(watcher);
    safely(() => onNext(new QuerySnapImpl(current)));
    return () => this.queryWatchers.delete(watcher);
  }

  onWrite(listener: (change: WriteChange) => void): () => void {
    this.writeListeners.add(listener);
    return () => this.writeListeners.delete(listener);
  }

  // -- internals shared with the refs --

  docRef(path: string): DocRef {
    return new DocRefImpl(this, path);
  }

  snapshot(path: string): DocSnapImpl {
    return new DocSnapImpl(this, path, this.docs.get(path));
  }

  version(key: string): number {
    return this.versions.get(key) ?? 0;
  }

  /** Validates the writes against the current data, then applies them all, or none. Notifies once. */
  apply(ops: Op[]): void {
    const staged = new Map<string, DocData | undefined>();
    const current = (path: string) => (staged.has(path) ? staged.get(path) : this.docs.get(path));
    for (const op of ops) {
      if (op.error) throw op.error;
      const existing = current(op.path);
      if (op.kind === 'delete') {
        staged.set(op.path, undefined);
      } else if (op.kind === 'update') {
        if (!existing) throw new StoreError('not-found', `No document to update at ${op.path}.`);
        staged.set(op.path, { ...existing, ...cloneStored(op.data!) });
      } else if (op.kind === 'create') {
        if (existing) throw new StoreError('already-exists', `${op.path} already exists.`);
        staged.set(op.path, cloneStored(op.data!));
      } else {
        const data = cloneStored(op.data!);
        staged.set(op.path, op.merge && existing ? mergeDocs(existing, data) : data);
      }
    }
    const changes: WriteChange[] = [];
    for (const [path, after] of staged) {
      const before = this.docs.get(path);
      if (before === undefined && after === undefined) continue;
      if (after === undefined) this.docs.delete(path);
      else this.docs.set(path, after);
      this.bump(path);
      changes.push({ path, before, after });
    }
    if (changes.length > 0) this.notify(changes);
  }

  private bump(path: string): void {
    const parent = parentPath(path);
    for (const key of [docKey(path), collectionKey(parent), groupKey(lastSegment(parent))]) {
      this.versions.set(key, this.version(key) + 1);
    }
  }

  private notify(changes: WriteChange[]): void {
    for (const listener of [...this.writeListeners]) {
      for (const { path, before, after } of changes) {
        safely(() => listener({ path, before: cloneStored(before), after: cloneStored(after) }));
      }
    }
    const paths = new Set(changes.map((c) => c.path));
    for (const watcher of [...this.docWatchers]) {
      if (this.docWatchers.has(watcher) && paths.has(watcher.path)) {
        safely(() => watcher.onNext(this.snapshot(watcher.path)));
      }
    }
    for (const watcher of [...this.queryWatchers]) {
      if (!this.queryWatchers.has(watcher) || !changes.some((c) => watcher.query.covers(c.path))) continue;
      const results = watcher.query.run();
      const next = resultsOf(results);
      if (valuesEqual(watcher.last, next)) continue;
      watcher.last = next;
      safely(() => watcher.onNext(new QuerySnapImpl(results)));
    }
  }
}

export function memoryStore(options: MemoryStoreOptions = {}): WatchableStore {
  return new MemoryStore(options);
}
