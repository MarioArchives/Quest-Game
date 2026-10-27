// The booking desk's test call: short words, and a foot with Change my number and Skip until the call is through.
import { describe, expect, it } from 'vitest';
import { showsFoot, testCallWords, type DeskCall } from './telegramDesk';

describe('showsFoot', () => {
  it('offers Change my number and Skip until the test call is through (with no line at all it just carries on)', () => {
    const calls: DeskCall[] = ['dialling', 'ringing', 'keying', 'answered', 'missed', 'off'];
    expect(calls.filter(showsFoot)).toEqual(['dialling', 'ringing', 'keying', 'missed']);
  });
});

describe('testCallWords', () => {
  it('words the test call for Telegram: we ring, answer there, reply with the 3-digit code', () => {
    const words = testCallWords('telegram');
    expect(words.note).toMatch(/ring you/i);
    expect(words.note).toMatch(/Telegram/);
    expect(words.note).toMatch(/3\u2011digit code/); // a non-breaking hyphen keeps "3-digit" on one line
    expect(words.ringing).toMatch(/Telegram/);
    expect(words.keying).toMatch(/reply|chat/i);
    expect(words.keying).not.toMatch(/key in/i);
    expect(words.dialling('07700 900123')).toMatch(/Telegram/);
  });

  it('after any miss on Telegram, says to have Telegram downloaded with calls allowed', () => {
    const words = testCallWords('telegram');
    expect(words.missedHint).toMatch(/Telegram is downloaded/);
    expect(words.missedHint).toMatch(/calls are allowed/);
    expect(words.hintAlways).toBe(true);
  });

  it('keeps it short: the note is one or two sentences', () => {
    for (const via of ['telegram', 'phone'] as const) {
      const note = testCallWords(via).note;
      expect(note.length).toBeLessThanOrEqual(80);
      expect(note.split(/[.!?](\s|$)/).filter((s) => s && s.trim()).length).toBeLessThanOrEqual(2);
    }
  });

  it('keeps the keypad words for a phone line', () => {
    const words = testCallWords('phone');
    expect(words.keying).toMatch(/key in/i);
    expect(words.note).not.toMatch(/Telegram/);
    expect(words.dialling('07700 900123')).toContain('07700 900123');
    expect(words.hintAlways).toBe(false);
  });
});
