// The Firebase backend: Auth (Google pop-up), Firestore, callable Functions, Storage and FCM Web Push.
import { getApp } from 'firebase/app';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, type User } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit as limitTo,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Query,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getMessaging, getToken } from 'firebase/messaging';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import type { Doc } from '../../shared';
import type { AuthApi, Backend, BackendUser, DataApi, FilesApi, PushApi, QuerySpec, WriteOp } from '../types';
import { auth, db, functions, storage, useEmulators } from './app';
import { fromFirestore, toBackendError, toFirestoreData } from './convert';

function toUser(user: User | null): BackendUser | null {
  return user ? { uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL } : null;
}

const authApi: AuthApi = {
  onUser: (onNext) => onAuthStateChanged(auth, (next) => onNext(toUser(next))),
  current: () => toUser(auth.currentUser),
  async signIn() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      throw toBackendError(err, 'auth');
    }
  },
  async signOut() {
    try {
      await firebaseSignOut(auth);
    } catch (err) {
      throw toBackendError(err, 'auth');
    }
  },
};

function buildQuery(spec: QuerySpec): Query {
  let q: Query = collection(db, spec.path);
  const constraints = [
    ...(spec.where ?? []).map(([field, op, value]) => where(field, op, value)),
    ...(spec.orderBy ? [orderBy(spec.orderBy[0], spec.orderBy[1])] : []),
    ...(spec.limit !== undefined ? [limitTo(spec.limit)] : []),
  ];
  if (constraints.length) q = query(q, ...constraints);
  return q;
}

const dataApi: DataApi = {
  watchDoc<T>(path: string, onNext: (doc: Doc<T> | null) => void, onError: (err: Error) => void) {
    return onSnapshot(
      doc(db, path),
      { includeMetadataChanges: false },
      (snap) =>
        onNext(snap.exists() ? (fromFirestore({ id: snap.id, ...snap.data({ serverTimestamps: 'estimate' }) }) as Doc<T>) : null),
      (err) => onError(toBackendError(err, 'data')),
    );
  },
  watchQuery<T>(spec: QuerySpec, onNext: (docs: Doc<T>[]) => void, onError: (err: Error) => void) {
    return onSnapshot(
      buildQuery(spec),
      (snap) =>
        onNext(snap.docs.map((d) => fromFirestore({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }) as Doc<T>)),
      (err) => onError(toBackendError(err, 'data')),
    );
  },
  async set(path, data, options) {
    try {
      await setDoc(doc(db, path), toFirestoreData(data), options?.merge ? { merge: true } : {});
    } catch (err) {
      throw toBackendError(err, 'data');
    }
  },
  async update(path, data) {
    try {
      await updateDoc(doc(db, path), toFirestoreData(data));
    } catch (err) {
      throw toBackendError(err, 'data');
    }
  },
  async add(collectionPath, data) {
    try {
      return (await addDoc(collection(db, collectionPath), toFirestoreData(data))).id;
    } catch (err) {
      throw toBackendError(err, 'data');
    }
  },
  async remove(path) {
    try {
      await deleteDoc(doc(db, path));
    } catch (err) {
      throw toBackendError(err, 'data');
    }
  },
  async batch(ops: WriteOp[]) {
    try {
      const batch = writeBatch(db);
      for (const op of ops) {
        const target = doc(db, op.path);
        if (op.op === 'set') {
          if (op.merge) batch.set(target, toFirestoreData(op.data), { merge: true });
          else batch.set(target, toFirestoreData(op.data));
        } else if (op.op === 'update') batch.update(target, toFirestoreData(op.data));
        else batch.delete(target);
      }
      await batch.commit();
    } catch (err) {
      throw toBackendError(err, 'data');
    }
  },
  newId: (collectionPath) => doc(collection(db, collectionPath)).id,
};

const filesApi: FilesApi = {
  upload(path, blob, metadata, onProgress) {
    return new Promise((resolve, reject) => {
      const task = uploadBytesResumable(ref(storage, path), blob, metadata);
      task.on(
        'state_changed',
        (snap) => onProgress?.(snap.bytesTransferred, snap.totalBytes),
        (err) => reject(toBackendError(err, 'files')),
        () => resolve(),
      );
    });
  },
  async url(path) {
    try {
      return await getDownloadURL(ref(storage, path));
    } catch (err) {
      throw toBackendError(err, 'files');
    }
  },
};

// No push against the emulators (there is no FCM there), so the Notifications card stays hidden in local dev.
const VAPID_KEY = useEmulators ? undefined : import.meta.env.VITE_FIREBASE_VAPID_KEY;

const pushApi: PushApi = {
  async token() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const token = await getToken(getMessaging(getApp()), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
      if (!token) throw new Error('No notification token');
      return token;
    } catch (err) {
      throw toBackendError(err, 'call');
    }
  },
};

export function createFirebaseBackend(): Backend {
  return {
    kind: 'firebase',
    auth: authApi,
    data: dataApi,
    async call<I, O>(name: string, data: I): Promise<O> {
      try {
        const result = await httpsCallable<I, O>(functions, name)(data);
        return result.data;
      } catch (err) {
        throw toBackendError(err, 'call');
      }
    },
    files: filesApi,
    push: VAPID_KEY ? pushApi : null,
  };
}
