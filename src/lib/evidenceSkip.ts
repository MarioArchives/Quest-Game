// "Not now" on an Add-evidence banner: remembered per device, and observable so the Account dot
// (which counts approved claims still waiting for evidence) clears the moment a banner is waved away.

const key = (uid: string, id: string) => `fq:skip-evidence:${uid}:${id}`;

const listeners = new Set<() => void>();
let version = 0;

export function isEvidenceSkipped(uid: string, id: string): boolean {
  try {
    return localStorage.getItem(key(uid, id)) === '1';
  } catch {
    return false;
  }
}

export function skipEvidence(uid: string, id: string): void {
  try {
    localStorage.setItem(key(uid, id), '1');
  } catch {
    /* hidden for this visit only */
  }
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribeSkips(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function skipVersion(): number {
  return version;
}
