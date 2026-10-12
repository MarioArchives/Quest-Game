// The mock's data layer: the app's DataApi over the in-memory store.
import { Stamp } from '../../../functions/src/shared/store/stamp.ts';
import { StoreError } from '../../../functions/src/shared/store/errors.ts';
import type { DocData, DocSnap, Query, WatchableStore } from '../../../functions/src/shared/store/types.ts';
import type { Doc } from '../../shared';
import { BackendError } from '../errors';
import { SERVER_TIME, type DataApi, type QuerySpec, type WriteOp } from '../types';

/** Copies the value with every SERVER_TIME (at any depth) replaced by a Stamp for `now`. */
function stamped(value: unknown, now: Date): unknown {
  if (value === SERVER_TIME) return Stamp.fromDate(now);
  if (Array.isArray(value)) return value.map((v) => stamped(v, now));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stamped(v, now)]));
  }
  return value;
}

const stampedDoc = (data: Record<string, unknown>, now: Date) => stamped(data, now) as DocData;

function toBackendError(err: unknown): BackendError {
  if (err instanceof BackendError) return err;
  if (err instanceof StoreError) return new BackendError('data', err.code, err.message);
  return new BackendError('data', 'internal', err instanceof Error ? err.message : 'Something went wrong.');
}

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    throw toBackendError(err);
  }
}

const toDoc = <T>(snap: DocSnap): Doc<T> => ({ id: snap.id, ...snap.data() }) as Doc<T>;

function buildQuery(store: WatchableStore, spec: QuerySpec): Query {
  let q: Query = store.collection(spec.path);
  for (const [field, op, value] of spec.where ?? []) q = q.where(field, op, value);
  if (spec.orderBy) q = q.orderBy(spec.orderBy[0], spec.orderBy[1]);
  if (spec.limit !== undefined) q = q.limit(spec.limit);
  return q;
}

export function createMockData(store: WatchableStore, now: () => Date): DataApi {
  return {
    watchDoc<T>(path: string, onNext: (doc: Doc<T> | null) => void, onError: (err: Error) => void) {
      try {
        return store.watchDoc(path, (snap) => onNext(snap.exists ? toDoc<T>(snap) : null));
      } catch (err) {
        onError(toBackendError(err));
        return () => {};
      }
    },
    watchQuery<T>(spec: QuerySpec, onNext: (docs: Doc<T>[]) => void, onError: (err: Error) => void) {
      try {
        return store.watchQuery(buildQuery(store, spec), (snap) => onNext(snap.docs.map((d) => toDoc<T>(d))));
      } catch (err) {
        onError(toBackendError(err));
        return () => {};
      }
    },
    set: (path, data, options) =>
      guarded(() => store.doc(path).set(stampedDoc(data, now()), options?.merge ? { merge: true } : undefined)),
    update: (path, data) => guarded(() => store.doc(path).update(stampedDoc(data, now()))),
    add: (collectionPath, data) =>
      guarded(async () => {
        const ref = store.collection(collectionPath).doc();
        await ref.set(stampedDoc(data, now()));
        return ref.id;
      }),
    remove: (path) => guarded(() => store.doc(path).delete()),
    batch: (ops: WriteOp[]) =>
      guarded(() => {
        const at = now();
        const batch = store.batch();
        for (const op of ops) {
          const ref = store.doc(op.path);
          if (op.op === 'set') batch.set(ref, stampedDoc(op.data, at), op.merge ? { merge: true } : undefined);
          else if (op.op === 'update') batch.update(ref, stampedDoc(op.data, at));
          else batch.delete(ref);
        }
        return batch.commit();
      }),
    newId: (collectionPath) => store.collection(collectionPath).doc().id,
  };
}
