// Police check-ins (packs with police): the question a call asks, checking the answer, and the cooldowns. Shared by
// the functions and the app.

const MIN_MS = 60_000;

/** A sobriety sum: "What's 7 + 8?" with its answer, "15". */
export function policeQuestion(rng: () => number): { question: string; expected: string } {
  const pick = () => 2 + Math.floor(rng() * 11);
  const a = pick();
  const b = pick();
  const times = rng() < 0.5;
  return { question: `What's ${a} ${times ? '×' : '+'} ${b}?`, expected: String(times ? a * b : a + b) };
}

/** True when `given` is the expected answer, ignoring spaces. */
export function isRightAnswer(given: string, expected: string): boolean {
  const squash = (s: string) => s.replace(/\s+/g, '');
  const g = squash(given);
  return g.length > 0 && g === squash(expected);
}

/** Milliseconds until `everyMin` minutes have passed since `lastMs`; 0 once they have, or when there is no last. */
export function cooldownLeftMs(lastMs: number | null, everyMin: number, nowMs: number): number {
  if (lastMs == null) return 0;
  return Math.max(0, lastMs + everyMin * MIN_MS - nowMs);
}
