// My file's tampering missions on a line (one kraft tag at a time, pegs underneath): which tag the line opens on, the
// count under the pegs, and the fresh mission dealt in an exposed one's place. Pure, so they're tested beside this file.

export type LineTone = 'done' | 'pending' | 'open' | 'exposed';

export interface LineItem {
  id: string;
  tone: LineTone;
  /** When its news happened (approved or exposed), in ms; 0 when unknown or not news. */
  at: number;
}

/** A done or an exposed tag is news until this phone has opened on it, keyed by mission and state; null otherwise. */
export const newsKey = (item: Pick<LineItem, 'id' | 'tone'>): string | null =>
  item.tone === 'done' || item.tone === 'exposed' ? `${item.id}:${item.tone}` : null;

/** The tag the line opens on: the latest news not seen yet, otherwise the first to do, otherwise the first tag. */
export function openingIndex(items: readonly LineItem[], seen: ReadonlySet<string>): number {
  let news = -1;
  items.forEach((item, i) => {
    const key = newsKey(item);
    if (key && !seen.has(key) && (news < 0 || item.at >= items[news]!.at)) news = i;
  });
  if (news >= 0) return news;
  const open = items.findIndex((item) => item.tone === 'open');
  return open >= 0 ? open : 0;
}

/**
 * The hand at a glance, under the pegs: "3 to do", "1 with Maya", "2 filed" (done and exposed), zero counts left out.
 * The pending ones name their witness when they share one; otherwise `withMany` ("with witnesses").
 */
export function handCounts(items: ReadonlyArray<{ tone: LineTone; witness?: string | null }>, withMany: string): string[] {
  const open = items.filter((item) => item.tone === 'open').length;
  const pending = items.filter((item) => item.tone === 'pending');
  const filed = items.filter((item) => item.tone === 'done' || item.tone === 'exposed').length;
  const names = new Set(pending.map((item) => item.witness?.trim() || ''));
  const [only] = names;
  const parts: string[] = [];
  if (open) parts.push(`${open} to do`);
  if (pending.length) parts.push(`${pending.length} ${names.size === 1 && only ? `with ${only}` : withMany}`);
  if (filed) parts.push(`${filed} filed`);
  return parts;
}

/**
 * The mission dealt in an exposed one's place: the exposure and the deal are one transaction, so it was dealt at the
 * very moment the other was exposed. Its index in the line, or -1 when none was dealt (a full hand, an empty deck).
 */
export function replacementIndex(items: ReadonlyArray<{ id: string; dealtAt: number }>, exposed: { id: string; at: number }): number {
  if (!exposed.at) return -1;
  return items.findIndex((item) => item.id !== exposed.id && item.dealtAt === exposed.at);
}

/** The news keys this phone has opened on, as stored: a JSON list of strings; anything else reads as none. */
export function parseSeenNews(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const list: unknown = JSON.parse(raw);
    return new Set(Array.isArray(list) ? list.filter((key): key is string => typeof key === 'string') : []);
  } catch {
    return new Set();
  }
}

const seenKey = (uid: string) => `mf-line-seen:${uid}`;

export function readSeenNews(uid: string): Set<string> {
  try {
    return parseSeenNews(localStorage.getItem(seenKey(uid)));
  } catch {
    return new Set();
  }
}

/** Only the hand's current news is kept, so the list never outgrows the hand. */
export function writeSeenNews(uid: string, keys: Iterable<string>): void {
  try {
    localStorage.setItem(seenKey(uid), JSON.stringify([...keys]));
  } catch {
    /* no storage: the line opens on the same news next time */
  }
}
