// The booking desk with the police on Telegram (plan "Police check-ins over Telegram", edge case 16): the test call is
// compulsory. The Telegram card never offers the app; its only way on is the test call, and only a test call that
// fails (or a server with no line at all) offers the police in the app.
import { describe, expect, it } from 'vitest';
import { offersApp, telegramFoot, testCallWords, type DeskCall } from './telegramDesk';

describe('telegramFoot', () => {
  it('has no way on until they say whether they have Telegram, nor while they are getting it', () => {
    expect(telegramFoot(null, false)).toBeNull();
    expect(telegramFoot('no', false)).toBeNull();
  });

  it('then leads to the test call, ready once they have said hello', () => {
    expect(telegramFoot('yes', false)).toMatchObject({ ready: false });
    expect(telegramFoot('yes', true)).toMatchObject({ ready: true });
    expect(telegramFoot('yes', true)!.label).toMatch(/test call/i);
  });

  it('never offers the app', () => {
    for (const have of [null, 'yes', 'no'] as const) {
      for (const said of [false, true]) expect(telegramFoot(have, said)?.label ?? '').not.toMatch(/app/i);
    }
  });
});

describe('offersApp', () => {
  it('offers the police in the app only after the test call fails, or with no line on the server', () => {
    const calls: DeskCall[] = ['dialling', 'ringing', 'keying', 'answered', 'missed', 'off'];
    expect(calls.filter(offersApp)).toEqual(['missed', 'off']);
  });
});

describe('testCallWords', () => {
  it('words the test call for Telegram: ringing there, a code to reply with in the chat', () => {
    const words = testCallWords('telegram');
    expect(words.note).toMatch(/Telegram/);
    expect(words.ringing).toMatch(/Telegram/);
    expect(words.keying).toMatch(/reply|chat/i);
    expect(words.keying).not.toMatch(/key in/i);
    expect(words.dialling('07700 900123')).toMatch(/Telegram/);
    expect(words.missedHint).toMatch(/Telegram/);
  });

  it('keeps the keypad words for a phone line', () => {
    const words = testCallWords('phone');
    expect(words.keying).toMatch(/key in/i);
    expect(words.note).not.toMatch(/Telegram/);
    expect(words.dialling('07700 900123')).toContain('07700 900123');
  });
});
