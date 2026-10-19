// The charge sheet's search (Form 3): the Charge line finds a mission by any word from its title or text, and "Words
// like it" offers other words to try, worked out from the missions' own text alone: other endings of the word being
// typed ("dancing" → dance), a near spelling when it finds nothing ("drnk" → drink), then words from the missions it
// found that lead on to others ("drink" → hold, from Hold this).

export interface Charge {
  id: string;
  title: string;
  description?: string | null;
}

export interface ChargeIndex<C extends Charge> {
  /** A–Z by title. */
  charges: C[];
  /** Each charge's distinct words, title and text, by id: what a search looks through. */
  words: Map<string, string[]>;
  /** Each charge's title words and the words of what it asks (its text before "Proof:"), as roots, by id. */
  asks: Map<string, Set<string>>;
  /** Each charge's title words, as roots, by id. */
  titles: Map<string, Set<string>>;
  /** Every distinct word and its root: itself, or a shorter word it starts with ("holding" → "hold"). */
  roots: Map<string, string>;
}

export interface WordLike {
  word: string;
  /** How many charges a search for it finds. */
  count: number;
}

/** A piece of text, marked where a searched word matched. */
export interface Piece {
  text: string;
  hit: boolean;
}

// Words that say nothing about a mission: the glue of a sentence, and numbers ("five" links Hold this to the conga
// line, not usefully).
const STOP = new Set(
  (
    'a about after again all also an and another any anything are as ask asking asks at be before both but by can ' +
    'did do does doing done each eight every everyone five for four from get gets getting give got has have her him his how if ' +
    'in into is it its just keep least let like make me more most my nine no not of off on once one only or other our ' +
    'out over own seven six so someone something still take ten than that the their them then there they this those three ' +
    'to too two until up us very was way we were what when where which who whole whom why will with without you your ' +
    'yours youre'
  ).split(' '),
);

/** Lower case, accents off, apostrophes dropped ("You’re" → "youre"), split into words. */
export function wordsOf(text: string): string[] {
  const plain = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’‘]/g, '');
  return plain.match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** The distinct words of what was typed, in order. */
export function queryWords(query: string): string[] {
  return [...new Set(wordsOf(query))];
}

export function indexCharges<C extends Charge>(list: readonly C[]): ChargeIndex<C> {
  const charges = [...list].sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
  const words = new Map<string, string[]>();
  const all = new Set<string>();
  for (const c of charges) {
    const own = [...new Set(wordsOf(`${c.title} ${c.description ?? ''}`))];
    words.set(c.id, own);
    for (const w of own) all.add(w);
  }
  // A word's root is the shortest word of four letters or more that starts it and is at most three letters shorter
  // ("hands" → "hand", "players" → "player"), so a word and its endings are offered once.
  const sorted = [...all].sort((a, b) => a.length - b.length || a.localeCompare(b));
  const roots = new Map<string, string>();
  for (const w of sorted) {
    const root = sorted.find((r) => r.length >= 4 && r.length < w.length && w.length - r.length <= 3 && w.startsWith(r));
    roots.set(w, root ? (roots.get(root) ?? root) : w);
  }
  const rootsOf = (text: string) => new Set(wordsOf(text).map((w) => roots.get(w) ?? w));
  const asks = new Map<string, Set<string>>();
  const titles = new Map<string, Set<string>>();
  for (const c of charges) {
    const ask = (c.description ?? '').split(/\bProof:/)[0] ?? '';
    asks.set(c.id, rootsOf(`${c.title} ${ask}`));
    titles.set(c.id, rootsOf(c.title));
  }
  return { charges, words, asks, titles, roots };
}

const starts = (words: Iterable<string>, q: string) => {
  for (const w of words) if (w.startsWith(q)) return true;
  return false;
};

/**
 * The charges a search finds: every typed word must start a word of the charge's title or text. Title matches first,
 * then A–Z; an empty search is the whole book, A–Z.
 */
export function searchCharges<C extends Charge>(index: ChargeIndex<C>, query: string): C[] {
  const qs = queryWords(query);
  if (qs.length === 0) return index.charges;
  const found = index.charges.filter((c) => qs.every((q) => starts(index.words.get(c.id) ?? [], q)));
  const inTitle = (c: C) => qs.some((q) => starts(wordsOf(c.title), q));
  return [...found.filter(inTitle), ...found.filter((c) => !inTitle(c))];
}

/** How many charges a search for one word finds. */
function countFor<C extends Charge>(index: ChargeIndex<C>, word: string): number {
  let n = 0;
  for (const c of index.charges) if (starts(index.words.get(c.id) ?? [], word)) n += 1;
  return n;
}

/** Edit distance, with two swapped neighbours as one edit ("drnik" → "drink" is 1). */
export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const row = d[i]!;
      row[j] = Math.min(d[i - 1]![j]! + 1, row[j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[a.length]![b.length]!;
}

/** The same stem with another ending: a shared start of four letters or more, at most two letters short of either. */
function sameStem(typed: string, word: string): boolean {
  let n = 0;
  while (n < typed.length && n < word.length && typed[n] === word[n]) n += 1;
  return n >= 4 && n >= Math.min(typed.length, word.length) - 2;
}

/** A typo away: one edit, or two in a longer word. */
const typo = (typed: string, word: string) => typed.length >= 3 && editDistance(typed, word) <= (typed.length >= 6 ? 2 : 1);

/**
 * Up to `limit` other words to search for, each with how many charges it finds. First other endings of the last word
 * typed (and, when that word finds nothing, near spellings); then words from what the charges it found ask for that
 * lead on to other charges: title words first, then the words most of them share, then the rarer. Never what was
 * typed or its endings, the glue of a sentence, or words so common (in more than a tenth of the book) they don't narrow
 * anything.
 */
export function wordsLike<C extends Charge>(index: ChargeIndex<C>, query: string, limit = 3): WordLike[] {
  const qs = queryWords(query);
  const last = qs[qs.length - 1];
  // Nothing for a word still being started.
  if (!last || last.length < 3) return [];
  const typed = (w: string) => qs.some((q) => w.startsWith(q) || q.startsWith(w));
  const out: WordLike[] = [];
  const add = (word: string, count: number) => {
    if (out.length < limit && count > 0 && !out.some((o) => o.word === word)) out.push({ word, count });
  };

  const lost = countFor(index, last) === 0;
  const spelled = [...new Set(index.roots.values())]
    .filter((w) => w.length >= 3 && !typed(w) && !STOP.has(w) && (sameStem(last, w) || (lost && typo(last, w))))
    .map((w) => ({ w, dist: editDistance(last, w), count: countFor(index, w) }))
    .sort((a, b) => a.dist - b.dist || b.count - a.count || a.w.localeCompare(b.w));
  for (const s of spelled) add(s.w, s.count);

  const common = Math.max(4, Math.ceil(index.charges.length / 10));
  const shared = new Map<string, { n: number; title: boolean }>();
  for (const c of searchCharges(index, query)) {
    const titled = index.titles.get(c.id) ?? new Set<string>();
    for (const r of index.asks.get(c.id) ?? []) {
      if (r.length < 3 || STOP.has(r) || typed(r)) continue;
      const s = shared.get(r) ?? { n: 0, title: false };
      shared.set(r, { n: s.n + 1, title: s.title || titled.has(r) });
    }
  }
  const leads = [...shared]
    .map(([w, s]) => ({ w, ...s, count: countFor(index, w) }))
    .filter((s) => s.count > s.n && s.count <= common)
    .sort((a, b) => Number(b.title) - Number(a.title) || b.n - a.n || a.count - b.count || a.w.localeCompare(b.w));
  for (const l of leads) add(l.w, l.count);
  return out;
}

/** The text cut into pieces, marked wherever a typed word starts a word (just the typed part: "drink" in "drinks"). */
export function highlight(text: string, query: string): Piece[] {
  if (!text) return [];
  const qs = queryWords(query);
  if (qs.length === 0) return [{ text, hit: false }];
  // In the text a typed letter may carry an accent or sit by an apostrophe ("youre" marks "you're").
  const letter = (ch: string) => `${ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\p{M}*`;
  const word = (q: string) => [...q].map(letter).join("['’‘]?");
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${qs.map(word).join('|')})`, 'giu');
  const plain = text.normalize('NFD');
  const pieces: Piece[] = [];
  let at = 0;
  for (const m of plain.matchAll(re)) {
    if (m.index > at) pieces.push({ text: plain.slice(at, m.index), hit: false });
    pieces.push({ text: m[0], hit: true });
    at = m.index + m[0].length;
  }
  if (at < plain.length) pieces.push({ text: plain.slice(at), hit: false });
  return pieces.map((p) => ({ ...p, text: p.text.normalize('NFC') }));
}
