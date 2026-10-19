// The booking desk with the police on Telegram: the test call is compulsory, so the Telegram card's only way on is the
// test call, and only a failed test (or a server with no line) offers the police in the app.

/** Where the test call is: dialling, ringing, answered and keying the code, through, missed, or no line at all. */
export type DeskCall = 'dialling' | 'ringing' | 'keying' | 'answered' | 'missed' | 'off';

/** The Telegram card's way on, once they've said they have Telegram: on to the test call (ready once they said hello). */
export function telegramFoot(have: 'yes' | 'no' | null, said: boolean): { label: string; ready: boolean } | null {
  return have === 'yes' ? { label: 'Next: a test call', ready: said } : null;
}

/** Whether the test call offers "the police can reach me in the app": only after a miss, or with no line on the server. */
export function offersApp(call: DeskCall): boolean {
  return call === 'missed' || call === 'off';
}

export interface TestCallWords {
  note: string;
  dialling(number: string): string;
  ringing: string;
  keying: string;
  answered: string;
  missedHint: string;
}

/** The test call's words on a phone line or on Telegram. */
export function testCallWords(via: 'phone' | 'telegram'): TestCallWords {
  if (via === 'telegram') {
    return {
      note: 'One last thing: we need to know we can reach you. We’re ringing you on Telegram. Answer, listen for the 3-digit code, and reply with it in our chat.',
      dialling: (number) => `Ringing you on Telegram (${number})…`,
      ringing: 'Ringing on Telegram. Pick up: the desk reads you a short code. Then reply with it in our chat.',
      keying: 'Answered. Reply in our chat with the code you hear.',
      answered: 'Answered. We can reach you.',
      missedHint: ' Is Telegram on this phone, with the mobile you gave, and are its calls allowed?',
    };
  }
  return {
    note: 'One last thing: we need to know we can reach you. We’re ringing your mobile from the number you just saved.',
    dialling: (number) => `Dialling ${number}…`,
    ringing: 'Ringing. Pick up: the desk reads you a short code to key in. Then hang up.',
    keying: 'Answered. Key in the code you hear.',
    answered: 'Answered. We can reach you.',
    missedHint: ' Is the number right, and your ringer on?',
  };
}
