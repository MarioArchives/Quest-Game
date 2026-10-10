import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth, db } from '../firebase';
import type { Doc, JoinRequest, Player } from '../shared';

export interface SessionValue {
  /** 'loading' until Firebase has told us who is signed in and we have read their docs. */
  phase: 'loading' | 'signed-out' | 'ready';
  user: User | null;
  /** players/{uid}, once a GM has approved them. */
  player: Doc<Player> | null;
  /** admins/{uid} exists: the user is a GM. */
  isAdmin: boolean;
  joinRequest: Doc<JoinRequest> | null;
  /** The user asked to change their sign-up details while waiting. */
  editingSignup: boolean;
  setEditingSignup(value: boolean): void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

interface Loaded {
  player: boolean;
  admin: boolean;
  request: boolean;
}

const NOT_LOADED: Loaded = { player: false, admin: false, request: false };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [player, setPlayer] = useState<Doc<Player> | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [joinRequest, setJoinRequest] = useState<Doc<JoinRequest> | null>(null);
  const [loaded, setLoaded] = useState<Loaded>(NOT_LOADED);
  const [editingSignup, setEditingSignup] = useState(false);

  useEffect(
    () =>
      onAuthStateChanged(auth, (next) => {
        setUser(next);
        setAuthReady(true);
        if (!next) {
          setPlayer(null);
          setIsAdmin(false);
          setJoinRequest(null);
          setLoaded(NOT_LOADED);
          setEditingSignup(false);
        }
      }),
    [],
  );

  const uid = user?.uid ?? null;
  useEffect(() => {
    if (!uid) return;
    setLoaded(NOT_LOADED);
    const mark = (key: keyof Loaded) => setLoaded((prev) => (prev[key] ? prev : { ...prev, [key]: true }));

    // Permission errors here simply mean "no such doc for you": treat as absent.
    const stopPlayer = onSnapshot(
      doc(db, 'players', uid),
      (snap) => {
        setPlayer(snap.exists() ? ({ id: snap.id, ...snap.data() } as Doc<Player>) : null);
        mark('player');
      },
      () => {
        setPlayer(null);
        mark('player');
      },
    );
    const stopAdmin = onSnapshot(
      doc(db, 'admins', uid),
      (snap) => {
        setIsAdmin(snap.exists());
        mark('admin');
      },
      () => {
        setIsAdmin(false);
        mark('admin');
      },
    );
    const stopRequest = onSnapshot(
      doc(db, 'joinRequests', uid),
      (snap) => {
        setJoinRequest(snap.exists() ? ({ id: snap.id, ...snap.data({ serverTimestamps: 'estimate' }) } as Doc<JoinRequest>) : null);
        mark('request');
      },
      () => {
        setJoinRequest(null);
        mark('request');
      },
    );
    return () => {
      stopPlayer();
      stopAdmin();
      stopRequest();
    };
  }, [uid]);

  const signIn = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const phase: SessionValue['phase'] = !authReady
    ? 'loading'
    : !user
      ? 'signed-out'
      : loaded.player && loaded.admin && loaded.request
        ? 'ready'
        : 'loading';

  const value = useMemo<SessionValue>(
    () => ({ phase, user, player, isAdmin, joinRequest, editingSignup, setEditingSignup, signIn, signOut }),
    [phase, user, player, isAdmin, joinRequest, editingSignup, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

/** Why a sign-in popup failed, in words; null when the user just closed it. */
export function signInErrorMessage(err: unknown): string | null {
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return null;
  if (code === 'auth/popup-blocked') return 'Your browser blocked the sign-in window. Allow pop-ups for this page and try again.';
  if (code === 'auth/network-request-failed') return "Can't reach Google. Check your signal and try again.";
  return 'Sign-in did not work. Try again.';
}
