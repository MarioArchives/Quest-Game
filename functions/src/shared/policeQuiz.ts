// What the police ask on a check-in (a pack's `policeQuiz`): a sum, or a multiple-choice question about the case, the
// standings, the route or the player's own particulars, built from what the game knows when the call opens. Pure.
import type { PoliceQuizItem, RelationChoice } from './packs/types.ts';
import { policeQuestion } from './police.ts';
import { standingOf } from './standing.ts';
import type { Fact, Particulars, Settings } from './types.ts';

/** What a question may draw on, read when the call opens. */
export interface QuizSource {
  /** Everyone with a player doc: their name, points, whether they're still playing, and their particulars. */
  players: Array<{ uid: string; name: string; points: number; playing: boolean; particulars: Particulars | null }>;
  facts: Fact[];
  /** The GM's route (name, order, revealed, when it starts). */
  stops: Array<{ name: string; order: number; revealed: boolean; startsAtMs: number | null }>;
  settings: Pick<Settings, 'confidantAbove' | 'poiBelow'>;
  /** The pack's booking-desk relations (for the relation questions). */
  relations: readonly RelationChoice[];
  nowMs: number;
}

export interface QuizQuestion {
  /** As written in the app and the chat. */
  question: string;
  /** The right answer: the option's number ("2") for multiple choice, else the number itself. */
  expected: string;
  /** The options in the order offered; null for a typed number. */
  options: string[] | null;
  /** The quiz item's kind. */
  quiz: string;
}

type Player = QuizSource['players'][number];

/** A question built from the random numbers once an item is known to be askable. */
type Build = (rng: () => number) => QuizQuestion;

/** A mission fact's captions longer than this are skipped: they don't fit on a button or in a sentence. */
const CAPTION_MAX = 48;
const DAY_MIN = 24 * 60;

/** Fisher-Yates with the given random numbers (a copy). */
function shuffled<T>(list: readonly T[], rng: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** The answer among 2 or 3 of the decoys, shuffled: `expected` is the answer's 1-based place. */
function choice(quiz: string, question: string, answer: string, decoys: readonly string[], rng: () => number): QuizQuestion {
  const pool = shuffled([...new Set(decoys)].filter((d) => d !== answer), rng);
  const take = Math.min(pool.length, rng() < 0.5 ? 2 : 3);
  const options = shuffled([answer, ...pool.slice(0, take)], rng);
  return { question, expected: String(options.indexOf(answer) + 1), options, quiz };
}

/** How many unique decoys there are besides the answer. */
const spare = (answer: string, decoys: readonly string[]): number => new Set(decoys.filter((d) => d !== answer)).size;

/** Items with at least this many decoys can be asked as multiple choice (the answer and 2 more). */
const MIN_DECOYS = 2;

const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

/** A player's name as the police say it: the first name, or all of it when another playing player shares the first. */
function nameOf(p: Player, everyone: readonly Player[]): string {
  const first = firstName(p.name);
  return everyone.some((o) => o.uid !== p.uid && firstName(o.name).toLowerCase() === first.toLowerCase()) ? p.name.trim() : first;
}

const clock = (min: number): string => {
  const m = ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Times close to `hhmm` (12 to 95 minutes either side), as many as asked for, shuffled; none when it isn't a time. */
function nearbyTimes(hhmm: string, rng: () => number): string[] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return [];
  const at = Number(m[1]) * 60 + Number(m[2]);
  const offsets: number[] = [];
  for (let d = 12; d <= 95; d++) offsets.push(d, -d);
  return shuffled(offsets, rng).slice(0, 6).map((d) => clock(at + d));
}

/** Heights 4 to 12 cm either side. */
function nearbyHeights(cm: number, rng: () => number): string[] {
  const offsets: number[] = [];
  for (let d = 4; d <= 12; d++) offsets.push(d, -d);
  return shuffled(offsets, rng).slice(0, 6).map((d) => `${cm + d} cm`);
}

/** The questions an item can make now, or null when it can't be asked (a missing fact, a tie, too few decoys, …). */
function builderFor(item: PoliceQuizItem, src: QuizSource, uid: string): Build | null {
  const playing = src.players.filter((p) => p.playing);
  const me = src.players.find((p) => p.uid === uid);
  switch (item.kind) {
    case 'sum':
      return (rng) => ({ ...policeQuestion(rng), options: null, quiz: 'sum' });
    case 'fixed': {
      if (spare(item.answer, item.decoys) < MIN_DECOYS) return null;
      return (rng) => choice('fixed', item.ask, item.answer, item.decoys, rng);
    }
    case 'fact': {
      const fact = src.facts.find((f) => f.key === item.fact);
      if (!fact) return null;
      const listed = Array.isArray(item.decoys) ? item.decoys : [];
      if (fact.value) {
        const value = fact.value;
        if (item.decoys === 'times') {
          return /^(\d{1,2}):(\d{2})$/.test(value.trim()) ? (rng) => choice('fact', item.ask, value, nearbyTimes(value, rng), rng) : null;
        }
        return spare(value, listed) >= MIN_DECOYS ? (rng) => choice('fact', item.ask, value, listed, rng) : null;
      }
      const answer = fact.entries.map((e) => e.caption?.trim() ?? '').find((c) => c && c.length <= CAPTION_MAX);
      if (!answer) return null;
      const decoys = [...(fact.others ?? []).filter((c) => c.length <= CAPTION_MAX), ...listed];
      return spare(answer, decoys) >= MIN_DECOYS ? (rng) => choice('fact', item.ask, answer, decoys, rng) : null;
    }
    case 'standing': {
      if (playing.length < MIN_DECOYS + 1) return null;
      const best = playing.reduce((a, b) => (item.pick === 'lowest' ? (b.points < a.points ? b : a) : b.points > a.points ? b : a));
      if (playing.filter((p) => p.points === best.points).length > 1) return null;
      return (rng) =>
        choice('standing', item.ask, nameOf(best, playing), playing.filter((p) => p !== best).map((p) => nameOf(p, playing)), rng);
    }
    case 'stop': {
      const started = src.stops.filter((s) => s.revealed && s.startsAtMs !== null && s.startsAtMs <= src.nowMs);
      if (!started.length) return null;
      const latest = started.reduce((a, b) => (b.startsAtMs! > a.startsAtMs! || (b.startsAtMs === a.startsAtMs && b.order > a.order) ? b : a));
      // Another bar's name, never one on the route (a hidden stop must not leak).
      const onRoute = new Set(src.stops.map((s) => s.name.trim().toLowerCase()));
      const decoys = item.decoys.filter((d) => !onRoute.has(d.trim().toLowerCase()));
      return spare(latest.name, decoys) >= MIN_DECOYS ? (rng) => choice('stop', item.ask, latest.name, decoys, rng) : null;
    }
    case 'watch-count': {
      if (src.settings.poiBelow == null) return null;
      const n = playing.filter((p) => standingOf(p.points, src.settings) === 'poi').length;
      return () => ({ question: item.ask, expected: String(n), options: null, quiz: 'watch-count' });
    }
    case 'own': {
      if (item.field === 'height') {
        const cm = me?.particulars?.heightCm;
        if (typeof cm !== 'number' || !Number.isFinite(cm)) return null;
        return (rng) => choice('own', item.ask, `${cm} cm`, nearbyHeights(cm, rng), rng);
      }
      const label = src.relations.find((r) => r.id === me?.particulars?.relation)?.label;
      if (!label) return null;
      const decoys = src.relations.map((r) => r.label);
      return spare(label, decoys) >= MIN_DECOYS ? (rng) => choice('own', item.ask, label, decoys, rng) : null;
    }
    case 'whose': {
      // A relation held by exactly one player in all, and that player isn't the one being asked.
      const held = src.relations.filter((r) => playing.filter((p) => p.particulars?.relation === r.id).length === 1);
      const options = held
        .map((r) => ({ relation: r, holder: playing.find((p) => p.particulars?.relation === r.id)! }))
        .filter((o) => o.holder.uid !== uid && playing.filter((p) => p.uid !== uid && p !== o.holder).length >= MIN_DECOYS);
      if (!options.length) return null;
      return (rng) => {
        const { relation, holder } = options[Math.floor(rng() * options.length) % options.length]!;
        const decoys = playing.filter((p) => p.uid !== uid && p !== holder).map((p) => nameOf(p, playing));
        return choice('whose', item.ask.replace(/\{value\}/g, () => relation.phrase), nameOf(holder, playing), decoys, rng);
      };
    }
  }
  return null;
}

/**
 * A question for the police to ask `uid`: a weighted pick among the pack's items that can be asked now (the answer and
 * 2–3 plausible decoys, shuffled), falling back to a sum. With no items or no source, exactly `policeQuestion(rng)`.
 */
export function quizQuestion(items: readonly PoliceQuizItem[] | undefined, src: QuizSource | null, uid: string, rng: () => number): QuizQuestion {
  const sum = (): QuizQuestion => ({ ...policeQuestion(rng), options: null, quiz: 'sum' });
  if (!items?.length || !src) return sum();
  const ready = items.flatMap((item) => {
    const build = builderFor(item, src, uid);
    return build ? [{ weight: item.weight ?? 1, build }] : [];
  });
  if (!ready.length) return sum();
  let r = rng() * ready.reduce((n, o) => n + o.weight, 0);
  const pick = ready.find((o) => (r -= o.weight) < 0) ?? ready[ready.length - 1]!;
  return pick.build(rng);
}

/** Text compared loosely: lower case, no punctuation, no leading a / an / the. */
const loose = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^(?:a|an|the)\s+/, '');

/**
 * A reply as the answer the call checks: for a multiple-choice question the option's number ("2"), matched by its text
 * ignoring case, punctuation and a leading a/an/the ("bob.", "The Bob"), then by its digits ("2302" for "23:02"), then
 * by a number ("2", "option 2"); for a typed number, the reply's digits. '' when nothing matches.
 */
export function answerOf(reply: string, options: readonly string[] | null | undefined): string {
  const digits = reply.replace(/\D/g, '');
  if (!options?.length) return digits;
  const text = loose(reply);
  if (text) {
    const at = options.findIndex((o) => loose(o) === text);
    if (at >= 0) return String(at + 1);
  }
  if (digits) {
    const at = options.findIndex((o) => o.replace(/\D/g, '') === digits);
    if (at >= 0) return String(at + 1);
    const n = Number(digits);
    if (n >= 1 && n <= options.length) return String(n);
  }
  return '';
}

/** An answer as the GM reads it: "2 · Rob" for an option, the answer itself otherwise. */
export function choiceLabel(options: readonly string[] | null | undefined, answer: string): string {
  const n = /^\d+$/.test(answer) ? Number(answer) : 0;
  return options && n >= 1 && n <= options.length ? `${n} · ${options[n - 1]}` : answer;
}
