// Mock sign-in: pick who to be (the GM or a demo player); no passwords, no pop-up.
import { BackendError } from '../errors';
import type { AuthApi, BackendUser, MockAccount } from '../types';

export const MOCK_GM_UID = 'mock-gm';

export interface MockAuth extends AuthApi {
  accounts(): MockAccount[];
}

export function createMockAuth(players: Array<{ uid: string; displayName: string; photoURL?: string | null }>): {
  api: MockAuth;
  dispose(): void;
} {
  const accounts: MockAccount[] = [
    { uid: MOCK_GM_UID, label: 'You (GM)', role: 'gm' },
    ...players.map((p) => ({ uid: p.uid, label: p.displayName, role: 'player' as const })),
  ];
  const photos = new Map(players.map((p) => [p.uid, p.photoURL ?? null]));
  const listeners = new Set<(user: BackendUser | null) => void>();
  let user: BackendUser | null = null;

  const set = (next: BackendUser | null) => {
    user = next;
    for (const listener of [...listeners]) listener(user);
  };

  const api: MockAuth = {
    onUser(onNext) {
      listeners.add(onNext);
      onNext(user);
      return () => listeners.delete(onNext);
    },
    current: () => user,
    async signIn(accountUid = MOCK_GM_UID) {
      const account = accounts.find((a) => a.uid === accountUid);
      if (!account) throw new BackendError('auth', 'auth/user-not-found', `No mock account "${accountUid}".`);
      set({ uid: account.uid, email: `${account.uid}@mock.local`, displayName: account.label, photoURL: photos.get(account.uid) ?? null });
    },
    async signOut() {
      set(null);
    },
    accounts: () => accounts.map((a) => ({ ...a })),
  };
  return { api, dispose: () => listeners.clear() };
}
