// Which police line a deployment runs, and the only secrets it declares (plan edge case 11): the CLI asks for every
// declared secret at deploy time, so a deployment must declare exactly its own line's.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { policeLineConfig } from '../src/firebase/lineConfig.js';

const TWILIO = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'];
const TELEGRAM = ['TELEGRAM_LINE_SECRET'];

describe('policeLineConfig', () => {
  it.each([
    ['nothing set', {}, null, []],
    ['a Twilio caller ID', { POLICE_CALLER_ID: '+447700900123' }, 'twilio', TWILIO],
    ['the Telegram line', { POLICE_LINE: 'telegram' }, 'telegram', TELEGRAM],
    ['the Telegram line, written loosely', { POLICE_LINE: ' Telegram ' }, 'telegram', TELEGRAM],
    ['both: the line asked for wins', { POLICE_LINE: 'telegram', POLICE_CALLER_ID: '+447700900123' }, 'telegram', TELEGRAM],
    ['an unknown line', { POLICE_LINE: 'pigeon' }, null, []],
    ['the emulators', { FUNCTIONS_EMULATOR: 'true' }, 'simulated', []],
    ['the emulators, even with a caller ID', { FUNCTIONS_EMULATOR: 'true', POLICE_CALLER_ID: '+447700900123' }, 'simulated', []],
    ['the emulators with the Telegram line (the real script, locally)', { FUNCTIONS_EMULATOR: 'true', POLICE_LINE: 'telegram' }, 'telegram', TELEGRAM],
  ])('%s', (_name, env, kind, secrets) => {
    expect(policeLineConfig(env as Record<string, string>)).toEqual({ kind, secrets });
  });

  it('is what functions/src/index.ts declares its secrets and exports its line by', () => {
    const index = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
    expect(index).toMatch(/policeLineConfig\(process\.env\)/);
    expect(index).toMatch(/export const telegramLine\b/);
    expect(index).not.toMatch(/^const TWILIO_ACCOUNT_SID = defineSecret/m);
  });
});
