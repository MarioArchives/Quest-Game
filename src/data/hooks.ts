import { doc, onSnapshot, type DocumentData, type Query } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import { useEffect, useRef, useState } from 'react';
import { db, storage } from '../firebase';
import type { Doc } from '../shared';

/** Epoch ms from a Firestore Timestamp (or anything with toMillis); 0 when missing. */
export function tsMs(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    return (value as { toMillis(): number }).toMillis();
  }
  return 0;
}

export interface DocState<T> {
  data: Doc<T> | null;
  loading: boolean;
  error: Error | null;
}

/** Live document by path ("game/state"). Pass null to stay idle. */
export function useDocument<T = DocumentData>(path: string | null): DocState<T> {
  const [state, setState] = useState<DocState<T>>({ data: null, loading: path !== null, error: null });

  useEffect(() => {
    if (path === null) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((prev) => (prev.loading ? prev : { data: null, loading: true, error: null }));
    return onSnapshot(
      doc(db, path),
      { includeMetadataChanges: false },
      (snap) => {
        setState({
          data: snap.exists() ? ({ id: snap.id, ...snap.data({ serverTimestamps: 'estimate' }) } as Doc<T>) : null,
          loading: false,
          error: null,
        });
      },
      (error) => setState({ data: null, loading: false, error }),
    );
  }, [path]);

  return state;
}

export interface ListState<T> {
  data: Doc<T>[];
  loading: boolean;
  error: Error | null;
}

/**
 * Live query. `key` identifies the query (re-subscribes when it changes); `build` creates it.
 * Pass key = null to stay idle (for example until the uid is known).
 */
export function useCollection<T = DocumentData>(key: string | null, build: () => Query): ListState<T> {
  const [state, setState] = useState<ListState<T>>({ data: [], loading: key !== null, error: null });
  const buildRef = useRef(build);
  buildRef.current = build;

  useEffect(() => {
    if (key === null) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    setState((prev) => (prev.loading ? prev : { data: [], loading: true, error: null }));
    return onSnapshot(
      buildRef.current(),
      (snap) => {
        setState({
          data: snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }) as Doc<T>),
          loading: false,
          error: null,
        });
      },
      (error) => setState({ data: [], loading: false, error }),
    );
  }, [key]);

  return state;
}

/** Re-renders every `intervalMs` with the current time. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ---- storage paths -> download URLs (memoised, shared across components) ----------------------

const urlCache = new Map<string, Promise<string>>();

export function resolveStorageUrl(path: string): Promise<string> {
  let pending = urlCache.get(path);
  if (!pending) {
    pending = getDownloadURL(storageRef(storage, path));
    // Do not cache failures: the object may simply not be uploaded yet.
    pending.catch(() => urlCache.delete(path));
    urlCache.set(path, pending);
  }
  return pending;
}

/** Download URL for a storage path; null while loading or if it cannot be resolved. */
export function useStorageUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<{ path: string; url: string } | null>(null);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    resolveStorageUrl(path).then(
      (resolved) => {
        if (!cancelled) setUrl({ path, url: resolved });
      },
      () => {
        if (!cancelled) setUrl(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path]);

  return path && url?.path === path ? url.url : null;
}
