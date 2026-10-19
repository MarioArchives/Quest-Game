import { describe, expect, it } from 'vitest';
import type { Doc, PhoneTest, PlayerPhone, PoliceCall, PoliceCallPhone } from '../shared';
import { pressKey, simulatedRing } from './simulatedPhone';

const at = { toMillis: () => 0 } as unknown as PhoneTest['startedAt'];

function line(test: Partial<PhoneTest> | null): PlayerPhone {
  return {
    number: '+447700900001',
    status: 'unverified',
    verifiedAt: null,
    failures: 0,
    reason: null,
    callerId: '+447700900999',
    test: test && { id: 't1', code: '111', sid: 'SIM-t1', status: 'queued', result: null, errorCode: null, startedAt: at, heardAt: null, ...test },
    updatedAt: at,
  };
}

function call(over: Partial<PoliceCall> = {}, phone: Partial<PoliceCallPhone> | null = {}): Doc<PoliceCall> {
  return {
    id: 'c1',
    status: 'open',
    channel: 'phone',
    phone: phone && { sid: 'SIM-c1', status: 'queued', result: null, errorCode: null, placedAt: at, heardAt: null, trial: false, ...phone },
    ...over,
  } as Doc<PoliceCall>;
}

describe('simulatedRing', () => {
  it('is my test call while it rings on the simulated line', () => {
    expect(simulatedRing(line({}), null)).toEqual({ key: 'test:t1', target: { test: 't1' }, kind: 'test' });
    expect(simulatedRing(line({ status: 'in-progress' }), null)?.kind).toBe('test');
  });

  it('is nothing once the test has a result, before it has an id, on a real line, or with no test', () => {
    expect(simulatedRing(line({ result: 'passed' }), null)).toBeNull();
    expect(simulatedRing(line({ sid: null }), null)).toBeNull();
    expect(simulatedRing(line({ sid: 'CA123' }), null)).toBeNull();
    expect(simulatedRing(line(null), null)).toBeNull();
    expect(simulatedRing(null, null)).toBeNull();
  });

  it('is my open check-in ringing on the simulated line, after any test call', () => {
    expect(simulatedRing(null, call())).toEqual({ key: 'call:c1', target: { call: 'c1' }, kind: 'checkin' });
    expect(simulatedRing(line({}), call())?.kind).toBe('test');
    expect(simulatedRing(line({ result: 'passed' }), call())?.kind).toBe('checkin');
  });

  it('is no check-in that is in the app, settled, answered on a real line, or not dialled yet', () => {
    expect(simulatedRing(null, call({ channel: 'app' }))).toBeNull();
    expect(simulatedRing(null, call({ status: 'passed' }))).toBeNull();
    expect(simulatedRing(null, call({}, { result: 'answered' }))).toBeNull();
    expect(simulatedRing(null, call({}, { sid: 'CA9' }))).toBeNull();
    expect(simulatedRing(null, call({}, { sid: null }))).toBeNull();
    expect(simulatedRing(null, call({}, null))).toBeNull();
  });
});

describe('pressKey', () => {
  it('adds digits and *, and sends a code once all its digits are in', () => {
    expect(pressKey('', '4', 3)).toEqual({ typed: '4', send: false });
    expect(pressKey('47', '2', 3)).toEqual({ typed: '472', send: true });
    expect(pressKey('', '*', null)).toEqual({ typed: '*', send: false });
  });

  it('sends on #, even with nothing typed (a real keypad does)', () => {
    expect(pressKey('56', '#', null)).toEqual({ typed: '56', send: true });
    expect(pressKey('', '#', null)).toEqual({ typed: '', send: true });
  });

  it('ignores anything else, and stops adding at the limit', () => {
    expect(pressKey('1', 'a', null)).toEqual({ typed: '1', send: false });
    expect(pressKey('1'.repeat(20), '2', null)).toEqual({ typed: '1'.repeat(20), send: false });
  });
});
