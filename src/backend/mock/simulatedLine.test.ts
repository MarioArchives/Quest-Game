// The mock's police line is the simulated one: saving a number notes its made-up caller ID (for the calling card),
// and a test call goes out on it and is played in the app through simulateCall, so the booking desk can finish.
import { afterEach, describe, expect, it } from 'vitest';
import { getPack } from '../../../functions/src/shared/packs/index.ts';
import type { SimulatedTurn } from '../../shared';
import { createMockBackend, type MockBackend } from './index';

let opened: MockBackend[] = [];
afterEach(() => {
  for (const m of opened) m.dispose();
  opened = [];
});

async function alexWithPhoneCalls(): Promise<MockBackend> {
  const m = createMockBackend({ pack: getPack('mystery'), now: () => new Date('2026-10-10T20:00:00Z'), rng: () => 0, tickMs: null });
  opened.push(m);
  await m.store.doc('game/settings').update({ policePhone: true });
  await m.auth.signIn('demo-alex');
  return m;
}

const phone = async (m: MockBackend) => (await m.store.doc('phones/demo-alex').get()).data();

describe('the mock’s simulated police line', () => {
  it('gives the calling card a caller ID from the drama range', async () => {
    const m = await alexWithPhoneCalls();
    await m.call('setPoliceLine', { number: '07700 900417' });
    expect(await phone(m)).toMatchObject({ number: '+447700900417', status: 'unverified', callerId: expect.stringMatching(/^\+447700900\d{3}$/) });
  });

  it('places the test call, and answering it in the app with the code verifies the line', async () => {
    const m = await alexWithPhoneCalls();
    await m.call('setPoliceLine', { number: '07700 900417' });
    const { testId, ringing } = await m.call<object, { testId: string; ringing: boolean }>('testPoliceLine', {});
    expect(ringing).toBe(true);
    expect(await phone(m)).toMatchObject({ test: { id: testId, sid: `SIM-${testId}`, result: null } });

    await m.call('simulateCall', { test: testId, action: 'ring' });
    const asked = await m.call<object, SimulatedTurn>('simulateCall', { test: testId, action: 'answer' });
    expect(asked.said.join(' ')).toMatch(/Manchester Metropolitan Police/);
    expect(asked.keypad).toEqual({ attempt: 1, digits: 3 });
    const code = (await phone(m))!.test.code as string;
    const done = await m.call<object, SimulatedTurn>('simulateCall', { test: testId, action: 'keys', digits: code, attempt: 1 });
    expect(done.ended).toBe(true);
    expect(await phone(m)).toMatchObject({ status: 'verified', test: { result: 'passed' } });
  });
});
