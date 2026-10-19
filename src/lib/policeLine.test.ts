import { describe, expect, it } from 'vitest';
import type { PoliceCall, PoliceCallPhone } from '../shared';
import { callChannelLine, fallbackNote, lineVia, ringingRule, switchboardLabel, testProgress } from './policeLine';

const base: PoliceCall = {
  uid: 'u',
  kind: 'watch',
  byUid: null,
  note: null,
  question: "What's 2 × 2?",
  expected: '4',
  startsAt: 0,
  endsAt: 0,
  status: 'open',
  answer: null,
  answeredAt: null,
  passPoints: 5,
  failPenalty: 5,
};
const phone = (more: Partial<PoliceCallPhone>): PoliceCallPhone => ({
  sid: 'CA1',
  status: 'completed',
  result: null,
  errorCode: null,
  placedAt: 0,
  heardAt: 0,
  trial: false,
  ...more,
});

describe('callChannelLine', () => {
  it('says how a phone call went', () => {
    expect(callChannelLine({ ...base, channel: 'phone', phone: phone({ status: 'ringing' }) })).toBe('Phone · ringing');
    expect(callChannelLine({ ...base, channel: 'phone', phone: phone({ status: 'pending' }) })).toBe('Phone · calling');
    expect(callChannelLine({ ...base, status: 'passed', answer: '4', channel: 'phone', phone: phone({ result: 'answered' }) })).toBe('Phone · keyed 4');
    expect(callChannelLine({ ...base, status: 'missed', channel: 'phone', phone: phone({ result: 'no-answer' }) })).toBe('Phone · rang out, no answer');
    expect(callChannelLine({ ...base, status: 'missed', channel: 'phone', phone: phone({ result: 'busy' }) })).toBe('Phone · declined');
  });

  it('says a call that never connected went to the app, and why', () => {
    const line = callChannelLine({ ...base, channel: 'app', fallbackReason: 'never-connected', phone: phone({ result: 'never-connected', errorCode: 'no-status' }) });
    expect(line).toBe('Phone · never connected (No word from Twilio within 90 s) · then the app');
  });

  it('says why a check-in was in the app from the start', () => {
    expect(callChannelLine({ ...base, channel: 'app', fallbackReason: 'no-line', phone: null })).toBe('App · no working line');
    expect(callChannelLine({ ...base, channel: 'app', fallbackReason: 'lines-down', phone: null })).toBe('App · phone lines down');
    expect(callChannelLine(base)).toBe('App');
  });
});

describe('fallbackNote', () => {
  it('tells the player why it is in the app only when it is news to them', () => {
    expect(fallbackNote({ ...base, fallbackReason: 'never-connected' })).toMatch(/No fine/);
    expect(fallbackNote({ ...base, fallbackReason: 'lines-down' })).toMatch(/lines are down/);
    expect(fallbackNote({ ...base, fallbackReason: 'no-line' })).toBeNull();
    expect(fallbackNote(base)).toBeNull();
  });
});

describe('testProgress and switchboardLabel', () => {
  const test = { id: 't', code: '111', sid: null, status: 'dialling', result: null, errorCode: null, startedAt: 0, heardAt: null };
  it('follows a test call until it has a result', () => {
    expect(testProgress(test)).toBe('Calling your phone…');
    expect(testProgress({ ...test, status: 'ringing' })).toBe('Ringing your phone…');
    expect(testProgress({ ...test, status: 'in-progress' })).toMatch(/code/);
    expect(testProgress({ ...test, result: 'passed' })).toBeNull();
    expect(testProgress(null)).toBeNull();
  });

  it('names the switchboard', () => {
    expect(switchboardLabel({ mode: 'phone', manual: false })).toBe('Lines up');
    expect(switchboardLabel({ mode: 'app', manual: false })).toBe('Lines down');
    expect(switchboardLabel({ mode: 'app', manual: true })).toBe('App (by hand)');
    expect(switchboardLabel({ mode: 'probation', manual: false })).toBe('On trial');
  });
});

// Plan "Police check-ins over Telegram", edge case 14: the same words for the Telegram line.
describe('on the Telegram line', () => {
  const tg = (more: Partial<PoliceCallPhone>) => phone({ sid: 'TG-c1', ...more });
  const test = { id: 't', code: '111', sid: 'TG-t', status: 'dialling', result: null, errorCode: null, startedAt: 0, heardAt: null };

  it('says how a Telegram call went', () => {
    expect(callChannelLine({ ...base, channel: 'phone', phone: tg({ status: 'ringing' }) })).toBe('Telegram · ringing');
    expect(callChannelLine({ ...base, status: 'passed', answer: '4', channel: 'phone', phone: tg({ result: 'answered' }) })).toBe('Telegram · replied 4');
    expect(callChannelLine({ ...base, status: 'missed', channel: 'phone', phone: tg({ result: 'no-digits' }) })).toBe('Telegram · picked up, no reply');
    expect(callChannelLine({ ...base, status: 'missed', channel: 'phone', phone: tg({ result: 'no-answer' }) })).toBe('Telegram · rang out, no answer');
    expect(callChannelLine({ ...base, status: 'missed', channel: 'phone', phone: tg({ result: 'busy' }) })).toBe('Telegram · declined');
    const resent = callChannelLine({ ...base, channel: 'app', fallbackReason: 'never-connected', phone: tg({ result: 'never-connected', errorCode: 'tg-not-found' }) });
    expect(resent).toMatch(/^Telegram · never connected \(.*Telegram.*\) · then the app$/);
  });

  it('follows a test call on Telegram, and on the phone as before', () => {
    expect(testProgress({ ...test, status: 'ringing' }, 'telegram')).toMatch(/Telegram/);
    expect(testProgress({ ...test, status: 'in-progress' }, 'telegram')).toMatch(/reply/i);
    expect(testProgress({ ...test, status: 'in-progress' }, 'telegram')).not.toMatch(/key in/i);
    expect(testProgress({ ...test, status: 'in-progress' })).toMatch(/key in/i);
  });

  it('tells the player what each outcome costs on the ringing card', () => {
    const call = { ...base, passPoints: 3, failPenalty: 4, heardPenalty: 1 };
    const telegram = ringingRule(call, 'telegram');
    expect(telegram).toMatch(/Telegram|chat/);
    for (const part of ['+3', '−1', '−4']) expect(telegram).toContain(part);
    const keypad = ringingRule(call, 'phone');
    expect(keypad).toMatch(/keypad/);
    expect(keypad).not.toMatch(/Telegram/);
    expect(keypad).toContain('+3');
    expect(keypad).toContain('−4');
  });

  it('knows a call is on Telegram from its id, or from the settings before it has one', () => {
    const none = { policeTelegram: '', policeTelegramNumber: '' };
    expect(lineVia({ ...base, phone: tg({}) }, none)).toBe('telegram');
    expect(lineVia({ ...base, phone: phone({ sid: null }) }, { policeTelegram: '', policeTelegramNumber: '+447700900456' })).toBe('telegram');
    expect(lineVia({ ...base, phone: phone({}) }, none)).toBe('phone');
    expect(lineVia({ ...base, phone: phone({ sid: null }) }, none)).toBe('phone');
  });
});
