// The countdown to the GM's start time: its parts, the app bar chip's words and how close it is.

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export type CountdownStage = 'days' | 'today' | 'final' | 'zero';

const DAY_S = 86_400;

/** Whole seconds left, a part second rounded up (like `formatCountdown`), never negative. */
const secondsLeft = (ms: number) => Math.max(0, Math.ceil(ms / 1000));

export function countdownParts(ms: number): CountdownParts {
  const total = secondsLeft(ms);
  return {
    days: Math.floor(total / DAY_S),
    hours: Math.floor((total % DAY_S) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/** The app bar chip: "9d 4h" from a day up, "3:25:48" under a day, "04:37" under an hour, "00:00" at zero. */
export function chipCountdown(ms: number): string {
  const { days, hours, minutes, seconds } = countdownParts(ms);
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (days > 0) return `${days}d ${hours}h`;
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Days away, today, the last ten minutes (shown red) or zero. */
export function countdownStage(ms: number): CountdownStage {
  if (ms <= 0) return 'zero';
  if (ms <= 10 * 60_000) return 'final';
  return ms > DAY_S * 1000 ? 'days' : 'today';
}

/** "9 days 4 hours", "3 hours 25 minutes", "4 minutes 37 seconds" for a screen reader. */
export function spokenCountdown(ms: number): string {
  const { days, hours, minutes, seconds } = countdownParts(ms);
  const unit = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  if (days > 0) return `${unit(days, 'day')} ${unit(hours, 'hour')}`;
  if (hours > 0) return `${unit(hours, 'hour')} ${unit(minutes, 'minute')}`;
  return `${unit(minutes, 'minute')} ${unit(seconds, 'second')}`;
}
