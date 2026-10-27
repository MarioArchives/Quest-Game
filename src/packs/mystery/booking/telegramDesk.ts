// The booking desk's test call, on a phone line or with the police on Telegram: short words, and until it's through a
// foot with Change my number on the left and Skip (the police then reach them in the app) on the right.

/** Where the test call is: dialling, ringing, answered and keying the code, through, missed, or no line at all. */
export type DeskCall = 'dialling' | 'ringing' | 'keying' | 'answered' | 'missed' | 'off';

/** Whether the test call shows its foot (Change my number, Skip): until it's through; with no line it just carries on. */
export function showsFoot(call: DeskCall): boolean {
  return call !== 'answered' && call !== 'off';
}

export interface TestCallWords {
  note: string;
  dialling(number: string): string;
  ringing: string;
  keying: string;
  answered: string;
  /** Said after what went wrong on a miss. */
  missedHint: string;
  /** Whether the hint follows every miss, or only the ones that are the player's to put right. */
  hintAlways: boolean;
}

/** The test call's words on a phone line or on Telegram. */
export function testCallWords(via: 'phone' | 'telegram'): TestCallWords {
  if (via === 'telegram') {
    return {
      note: 'We’ll ring you. Answer on Telegram and reply with the 3\u2011digit code.',
      dialling: () => 'Ringing you on Telegram…',
      ringing: 'Ringing. Answer on Telegram.',
      keying: 'Reply in our chat with the code.',
      answered: 'Answered. We can reach you.',
      missedHint: 'Make sure Telegram is downloaded and calls are allowed.',
      hintAlways: true,
    };
  }
  return {
    note: 'We’ll ring your mobile. Answer and key in the 3\u2011digit code.',
    dialling: (number) => `Dialling ${number}…`,
    ringing: 'Ringing. Answer it.',
    keying: 'Key in the code you hear.',
    answered: 'Answered. We can reach you.',
    missedHint: 'Is the number right, and your ringer on?',
    hintAlways: false,
  };
}
