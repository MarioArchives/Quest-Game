// The police phone rules as pure functions (shared/switchboard.ts, shared/phone.ts): where a check-in goes, what a
// call's outcome does to the switchboard and to the player's line, phone numbers, Twilio's statuses and error codes,
// the spoken question and the contact card.
import { describe, expect, it } from 'vitest';
import {
  callStatusMeaning,
  describePhoneError,
  describeTestResult,
  formatPhone,
  linesFault,
  normalisePhone,
  policeVCard,
  spokenDigits,
  spokenQuestion,
  tripsAtOnce,
} from '../src/shared/phone.js';
import { afterOutcome, lineAfterOutcome, routeCall, SWITCHBOARD_DEFAULT, switchboardOf, type CallOutcome } from '../src/shared/switchboard.js';
import type { Switchboard } from '../src/shared/types.js';

const sb = (more: Partial<Switchboard> = {}): Switchboard => ({ ...SWITCHBOARD_DEFAULT, ...more });
const verified = { status: 'verified' as const };

describe('routeCall', () => {
  it('phone calls off: the app, with no reason', () => {
    expect(routeCall({ phoneOn: false, line: verified, switchboard: sb(), trialTaken: false })).toEqual({ channel: 'app', fallbackReason: null, trial: false });
  });

  it.each([undefined, null, { status: 'unverified' as const }, { status: 'failed' as const }, { status: 'paused' as const }, { status: 'app-only' as const }])(
    'no verified line (%o): the app, "no-line"',
    (line) => {
      expect(routeCall({ phoneOn: true, line, switchboard: sb(), trialTaken: false })).toEqual({ channel: 'app', fallbackReason: 'no-line', trial: false });
    },
  );

  it('lines up: it rings; lines down: the app, "lines-down"', () => {
    expect(routeCall({ phoneOn: true, line: verified, switchboard: sb(), trialTaken: false })).toEqual({ channel: 'phone', fallbackReason: null, trial: false });
    expect(routeCall({ phoneOn: true, line: verified, switchboard: sb({ mode: 'app' }), trialTaken: false })).toEqual({
      channel: 'app',
      fallbackReason: 'lines-down',
      trial: false,
    });
  });

  it('on probation, one trial at a time rings; the rest wait in the app', () => {
    const probation = sb({ mode: 'probation' });
    expect(routeCall({ phoneOn: true, line: verified, switchboard: probation, trialTaken: false })).toEqual({ channel: 'phone', fallbackReason: null, trial: true });
    expect(routeCall({ phoneOn: true, line: verified, switchboard: probation, trialTaken: true }).fallbackReason).toBe('lines-down');
    expect(routeCall({ phoneOn: true, line: verified, switchboard: sb({ mode: 'probation', trialCallId: 'c1' }), trialTaken: false }).channel).toBe('app');
  });

  it('a missing switchboard doc reads as lines up', () => {
    expect(switchboardOf(undefined)).toEqual(SWITCHBOARD_DEFAULT);
    expect(switchboardOf({ mode: 'app' }).streak).toBe(0);
  });
});

describe('afterOutcome', () => {
  const failed = (uid: string, more: Partial<CallOutcome> = {}): CallOutcome => ({
    kind: 'checkin',
    connected: false,
    uid,
    callId: `call-${uid}`,
    code: '13224',
    message: 'x',
    at: 0,
    threshold: 3,
    ...more,
  });

  it('trips on the third call in a row that never connects, across at least two players', () => {
    let s = sb();
    for (const uid of ['a', 'b']) {
      const r = afterOutcome(s, failed(uid));
      expect(r.change).toBeNull();
      s = r.next;
    }
    expect(s).toMatchObject({ mode: 'phone', streak: 2, streakUids: ['a', 'b'] });
    const r = afterOutcome(s, failed('a'));
    expect(r.change).toBe('tripped');
    expect(r.next).toMatchObject({ mode: 'app', manual: false, streak: 3, lastError: { code: '13224' } });
  });

  it('never trips on one player alone, however many', () => {
    let s = sb();
    for (let i = 0; i < 6; i++) s = afterOutcome(s, failed('a')).next;
    expect(s).toMatchObject({ mode: 'phone', streak: 6, streakUids: ['a'] });
  });

  it('a call that connects starts the count again', () => {
    const s = afterOutcome(afterOutcome(sb(), failed('a')).next, failed('b')).next;
    expect(afterOutcome(s, { ...failed('c'), connected: true }).next).toMatchObject({ mode: 'phone', streak: 0, streakUids: [] });
  });

  it('an account error trips at once, from a check-in or a test; a permission error only from a check-in', () => {
    expect(afterOutcome(sb(), failed('a', { code: '20003' })).change).toBe('tripped');
    expect(afterOutcome(sb(), failed('a', { code: '20003', kind: 'test', callId: null })).change).toBe('tripped');
    expect(afterOutcome(sb(), failed('a', { code: '21215' })).change).toBe('tripped');
    expect(afterOutcome(sb(), failed('a', { code: '21215', kind: 'test', callId: null })).change).toBeNull();
  });

  it('test calls that never connect do not count towards the streak', () => {
    expect(afterOutcome(sb(), failed('a', { kind: 'test', callId: null })).next.streak).toBe(0);
  });

  it('on probation the trial decides: connected restores, never connected trips again', () => {
    const probation = sb({ mode: 'probation', trialCallId: 'call-a' });
    const ok = afterOutcome(probation, { ...failed('a'), connected: true });
    expect(ok.change).toBe('restored');
    expect(ok.next).toMatchObject({ mode: 'phone', trialCallId: null });
    const bad = afterOutcome(probation, failed('a'));
    expect(bad.change).toBe('tripped');
    expect(bad.next).toMatchObject({ mode: 'app', trialCallId: null });
    expect(afterOutcome(probation, failed('b')).change).toBeNull();
  });

  it('while down, outcomes only note the last error', () => {
    const r = afterOutcome(sb({ mode: 'app', manual: true }), failed('a', { code: '20003' }));
    expect(r.change).toBeNull();
    expect(r.next).toMatchObject({ mode: 'app', manual: true, lastError: { code: '20003' } });
  });
});

describe('lineAfterOutcome', () => {
  it('two calls in a row that never connect pause a verified line', () => {
    expect(lineAfterOutcome({ status: 'verified', failures: 0 }, false, '13224', 'why')).toEqual({ failures: 1 });
    expect(lineAfterOutcome({ status: 'verified', failures: 1 }, false, null, 'why')).toEqual({ failures: 2, status: 'paused', reason: 'why' });
  });

  it("the account's or the system's fault never counts against the line", () => {
    for (const code of ['20003', '21215', 'not-set-up', 'no-status', 'no-result', 'network']) {
      expect(lineAfterOutcome({ status: 'verified', failures: 1 }, false, code, 'why'), code).toBeNull();
    }
  });

  it('a call that connects clears the count', () => {
    expect(lineAfterOutcome({ status: 'verified', failures: 1 }, true, null, 'why')).toEqual({ failures: 0 });
    expect(lineAfterOutcome({ status: 'verified', failures: 0 }, true, null, 'why')).toBeNull();
  });
});

describe('phone numbers', () => {
  it.each([
    ['07700 900123', '+447700900123'],
    ['+44 7700 900123', '+447700900123'],
    ['+44 (0)7700 900123', '+447700900123'],
    ['+44 07700 900123', '+447700900123'],
    ['0044 7700 900123', '+447700900123'],
    ['07700-900-123', '+447700900123'],
    ['+49 151 23456789', '+4915123456789'],
  ])('reads %s as %s', (raw, e164) => {
    expect(normalisePhone(raw, 'en-GB')).toBe(e164);
  });

  it('refuses what cannot be a number', () => {
    for (const raw of ['', 'call me', '123', '7700900123', '+0123456789', 7700, null]) expect(normalisePhone(raw, 'en-GB'), String(raw)).toBeNull();
    expect(normalisePhone('07700 900123', 'en')).toBeNull();
  });

  it('reads a national number in the locale’s country', () => {
    expect(normalisePhone('(415) 555-0132', 'en-US')).toBe('+14155550132');
    expect(normalisePhone('06 1234 5678', 'it-IT')).toBe('+390612345678');
  });

  it('shows a home number the way its owner writes it', () => {
    expect(formatPhone('+447700900123', 'en-GB')).toBe('07700 900123');
    expect(formatPhone('+4915123456789', 'en-GB')).toBe('+4915123456789');
  });
});

describe('Twilio, as the game reads it', () => {
  it('maps each CallStatus', () => {
    expect(['queued', 'initiated'].map(callStatusMeaning)).toEqual(['pending', 'pending']);
    expect(['ringing', 'in-progress'].map(callStatusMeaning)).toEqual(['reached', 'reached']);
    expect(callStatusMeaning('completed')).toBe('answered-ended');
    expect(['busy', 'no-answer'].map(callStatusMeaning)).toEqual(['unanswered', 'unanswered']);
    expect(['failed', 'canceled'].map(callStatusMeaning)).toEqual(['never-connected', 'never-connected']);
  });

  it('knows which errors trip the switchboard and which are the line’s', () => {
    expect(tripsAtOnce('20003', 'test')).toBe(true);
    expect(tripsAtOnce('21215', 'checkin')).toBe(true);
    expect(tripsAtOnce('21215', 'test')).toBe(false);
    expect(tripsAtOnce('13224', 'checkin')).toBe(false);
    expect(tripsAtOnce(null, 'checkin')).toBe(false);
    expect(linesFault('13224')).toBe(true);
    expect(linesFault(null)).toBe(true);
    expect(linesFault('20003')).toBe(false);
  });

  it('describes errors and test results in words', () => {
    expect(describePhoneError('21215')).toMatch(/geo permissions/);
    expect(describePhoneError('99999')).toBe('Twilio error 99999');
    expect(describeTestResult('wrong-code', null)).toMatch(/didn't match/);
    expect(describeTestResult('never-connected', '20003')).toMatch(/20003/);
  });
});

describe('the spoken question and code', () => {
  it('reads the sums aloud', () => {
    expect(spokenQuestion("What's 7 × 8?")).toBe("What's 7 times 8?");
    expect(spokenQuestion("What's 12 + 9?")).toBe("What's 12 plus 9?");
    expect(spokenDigits('482')).toBe('4, 8, 2');
  });
});

describe('policeVCard', () => {
  it('is a vCard 3.0 with the name and number, escaped and in CRLF lines', () => {
    const card = policeVCard({ name: 'Smith, Jones; Co', number: '+447700900000' });
    expect(card.split('\r\n')).toEqual([
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Smith\\, Jones\\; Co',
      'N:Smith\\, Jones\\; Co;;;;',
      'ORG:Smith\\, Jones\\; Co',
      'TEL;TYPE=CELL,VOICE:+447700900000',
      'END:VCARD',
      '',
    ]);
  });

  it('folds a long photo line at 75 characters', () => {
    const card = policeVCard({ name: 'Police', number: '+447700900000', photo: 'A'.repeat(200) });
    const lines = card.split('\r\n');
    expect(lines.every((l) => l.length <= 75)).toBe(true);
    const photo = lines.slice(lines.findIndex((l) => l.startsWith('PHOTO')), lines.indexOf('END:VCARD'));
    expect(photo.slice(1).every((l) => l.startsWith(' '))).toBe(true);
    expect(photo.map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe(`PHOTO;ENCODING=b;TYPE=PNG:${'A'.repeat(200)}`);
  });
});
