// What the police say on a phone call (game/voice.ts): the engine's lines, a pack's own wording and recordings, and
// the TwiML that carries them.
import { describe, expect, it } from 'vitest';
import { accusedSpeech, callerName, DEFAULT_CHAT_LINES, DEFAULT_LINES, DEFAULT_VOICE, officerFor, renderTwiml, voiceOf, voiceScript, type RenderOptions } from '../src/game/voice.js';
import { getPack, validatePack } from '../src/shared/packs/index.js';
import { accusation, CHAT_LINES, spokenChoices, VOICE_LINES } from '../src/shared/phone.js';
import type { PoliceVoice } from '../src/shared/packs/types.js';
import { getPack as packOf } from '../src/shared/packs/index.js';
import { testPack } from './packs.js';

const opts = (recorded: string[] = []): RenderOptions => ({
  action: (query) => `https://example.test/policeVoice?${new URLSearchParams(query).toString()}`,
  voice: DEFAULT_VOICE,
  recording: (line) => (recorded.includes(line) ? `https://example.test/audio/police/${line}.mp3` : null),
});

describe('renderTwiml', () => {
  it('reads text out in the Polly voice, escaped, and hangs up', () => {
    expect(renderTwiml([{ kind: 'say', speech: { text: 'Fish & <chips> "now"' } }, { kind: 'hangup' }], opts())).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Brian" language="en-GB">Fish &amp; &lt;chips&gt; &quot;now&quot;</Say><Hangup/></Response>',
    );
  });

  it('gathers keypad digits, finished by #, posting even when nothing was keyed', () => {
    const xml = renderTwiml(
      [{ kind: 'gather', speech: [{ text: "What's 2 times 2?" }], next: { call: 'c1', step: 'gather', try: '1' }, timeoutSec: 8, numDigits: 3 }],
      opts(),
    );
    expect(xml).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="dtmf" finishOnKey="#" timeout="8" actionOnEmptyResult="true" method="POST" action="https://example.test/policeVoice?call=c1&amp;step=gather&amp;try=1" numDigits="3"><Say voice="Polly.Brian" language="en-GB">What&apos;s 2 times 2?</Say></Gather></Response>',
    );
  });

  it('plays a recorded line instead of reading it; the question is always read', () => {
    const xml = renderTwiml([{ kind: 'say', speech: { text: 'Correct.', line: 'pass' } }, { kind: 'say', speech: { text: 'What?' } }], opts(['pass']));
    expect(xml).toContain('<Play>https://example.test/audio/police/pass.mp3</Play>');
    expect(xml).toContain('>What?</Say>');
  });

  it('an empty reply is an empty Response (status callbacks)', () => {
    expect(renderTwiml([], opts())).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  });
});

describe('voiceScript', () => {
  it('fills in the caller, the player and the check-in noun', () => {
    const say = voiceScript(testPack({ features: { police: true } }), { policeCallerName: 'Test Constabulary' });
    expect(say('intro-watch', 'Alice')).toEqual({ text: 'This is Test Constabulary, with a police check-in for Alice.', line: 'intro-watch' });
    expect(say('closed').text).toBe('This police check-in is closed. Goodbye.');
  });

  it('a blank caller name is "the police"', () => {
    expect(callerName({ policeCallerName: '  ' })).toBe('the police');
    expect(callerName({ policeCallerName: 'x'.repeat(60) })).toHaveLength(40);
  });

  it("uses a pack's own lines and voice", () => {
    const pack = testPack({ features: { police: true }, policeVoice: { voice: { voice: 'Polly.Amy', language: 'en-GB' }, lines: { pass: 'Off you go, {name}.' } } });
    expect(voiceScript(pack, { policeCallerName: 'X' })('pass', 'Sam').text).toBe('Off you go, Sam.');
    expect(voiceOf(pack)).toEqual({ voice: 'Polly.Amy', language: 'en-GB' });
    expect(voiceOf(testPack())).toEqual(DEFAULT_VOICE);
  });

  it('has a line for every key, and the mystery pack’s wording is valid', () => {
    expect(Object.keys(DEFAULT_LINES).sort()).toEqual([...VOICE_LINES].sort());
    expect(validatePack(getPack('mystery'))).toEqual([]);
  });

  it('validatePack refuses unknown or blank lines, and a voice without police', () => {
    const problems = validatePack(testPack({ policeVoice: { lines: { nope: 'x', pass: ' ' } as never, recordings: ['zzz' as never] } }));
    expect(problems.join('\n')).toMatch(/police feature is off/);
    expect(problems.join('\n')).toMatch(/"nope" is not one/);
    expect(problems.join('\n')).toMatch(/"zzz" is not one/);
    expect(problems.join('\n')).toMatch(/"pass" is blank/);
  });
});

describe('a tip-off read out: what the tipper accused them of', () => {
  it('turns the note into the end of "You have been accused of …"', () => {
    expect(accusation('Being a silly patotie')).toBe('being a silly patotie');
    expect(accusation('  of being late to the bar.  ')).toBe('being late to the bar');
    expect(accusation('Of hogging the jukebox')).toBe('hogging the jukebox');
    expect(accusation('stealing chips!!!')).toBe('stealing chips');
    expect(accusation('DUI at the jukebox')).toBe('DUI at the jukebox');
    expect(accusation('I know what you did')).toBe('I know what you did');
    expect(accusation('  ')).toBe('');
    expect(accusation('...')).toBe('');
    expect(accusation(null)).toBe('');
    expect(accusation(42)).toBe('');
  });

  it('is said in the engine’s words, never as a recording (it changes every call)', () => {
    const pack = testPack({ features: { police: true } });
    expect(DEFAULT_LINES.accused).toBe('You have been accused of {accusation}.');
    expect(accusedSpeech(pack, { policeCallerName: 'X' }, 'Being a silly patotie')).toEqual({ text: 'You have been accused of being a silly patotie.' });
    expect(accusedSpeech(pack, { policeCallerName: 'X' }, '  ')).toBeNull();
    expect(accusedSpeech(pack, { policeCallerName: 'X' }, null)).toBeNull();
  });

  it("uses a pack's own wording, with the player's name and the caller", () => {
    const pack = testPack({ features: { police: true }, policeVoice: { lines: { accused: 'Word is you were caught {accusation}, {name}. Says {caller}.' } } });
    expect(accusedSpeech(pack, { policeCallerName: 'Test Constabulary' }, 'dancing on tables', 'Sam')!.text).toBe(
      'Word is you were caught dancing on tables, Sam. Says Test Constabulary.',
    );
  });

  it('validatePack refuses a recording of it, since it is always read out', () => {
    const problems = validatePack(testPack({ features: { police: true }, policeVoice: { recordings: ['accused'] } }));
    expect(problems.join('\n')).toMatch(/accused.*read out/);
  });
});

// Plan "Police that sound official, a question bank, …", edge cases 1 and 2.
describe('varied lines and officers', () => {
  const VARIED = testPack({
    features: { police: true },
    policeVoice: {
      officers: [{ name: 'DS One', telegramVoice: 'en-GB-RyanNeural' }, { name: 'DC Two', telegramVoice: 'en-GB-SoniaNeural' }, { name: 'PC Three' }],
      lines: {
        'intro-watch': ['A, {officer}, for {name}.', 'B, {officer}, for {name}.', 'C, {officer}, for {name}.'],
        pass: ['Pass one.', 'Pass two.'],
      },
      chatLines: { ask: 'In the chat: {question}' },
    },
  });
  const S = { policeCallerName: 'Test Constabulary' };
  const seeds = Array.from({ length: 40 }, (_, i) => `call-${i}`);

  it('a call hears the same variant and the same officer every time (a retry included)', () => {
    for (const seed of seeds.slice(0, 5)) {
      const a = voiceScript(VARIED, S, { seed });
      const b = voiceScript(VARIED, S, { seed });
      expect(a('intro-watch', 'Sam').text).toBe(b('intro-watch', 'Sam').text);
      expect(a('pass').text).toBe(b('pass').text);
      expect(officerFor(VARIED, seed)).toEqual(officerFor(VARIED, seed));
    }
  });

  it('different calls hear different variants and officers', () => {
    const intros = new Set(seeds.map((seed) => voiceScript(VARIED, S, { seed })('intro-watch', 'Sam').text.charAt(0)));
    const officers = new Set(seeds.map((seed) => officerFor(VARIED, seed)!.name));
    const passes = new Set(seeds.map((seed) => voiceScript(VARIED, S, { seed })('pass').text));
    expect(intros.size).toBeGreaterThan(1);
    expect(officers.size).toBeGreaterThan(1);
    expect(passes.size).toBe(2);
  });

  it("fills {officer} with that call's officer", () => {
    const seed = seeds[7]!;
    const officer = officerFor(VARIED, seed)!;
    expect(voiceScript(VARIED, S, { seed })('intro-watch', 'Sam').text).toMatch(new RegExp(`^[ABC], ${officer.name}, for Sam\\.$`));
  });

  it('a pack without officers has none', () => {
    expect(officerFor(testPack({ features: { police: true } }), 'x')).toBeNull();
  });

  it('fills {question}; on a line answered in the chat, the chat lines are used instead', () => {
    const phone = voiceScript(VARIED, S, { seed: 's' });
    const chat = voiceScript(VARIED, S, { seed: 's', chat: true });
    expect(phone('ask', 'Sam', { question: "What's 2 times 2?" }).text).toBe("What's 2 times 2?");
    expect(chat('ask', 'Sam', { question: "What's 2 times 2?" }).text).toBe("In the chat: What's 2 times 2?");
    // Lines that aren't chat lines read the same either way.
    expect(chat('pass').text).toBe(phone('pass').text);
    const plain = voiceScript(testPack({ features: { police: true } }), S, { seed: 's', chat: true });
    expect(plain('ask', '', { question: 'Q?' }).text).toBe(DEFAULT_CHAT_LINES.ask.replace('{question}', 'Q?'));
    expect(plain('again').text).toBe(DEFAULT_CHAT_LINES.again);
    expect(plain('test-key-in').text).toBe(DEFAULT_CHAT_LINES['test-key-in']);
  });

  it('every chat line has an engine wording, and the engine has the new lines', () => {
    expect(Object.keys(DEFAULT_CHAT_LINES).sort()).toEqual([...CHAT_LINES].sort());
    expect(DEFAULT_LINES.ask).toContain('{question}');
    expect(DEFAULT_LINES.purpose.trim()).not.toBe('');
  });

  it('accusedSpeech picks its variant by the call too', () => {
    const pack = testPack({ features: { police: true }, policeVoice: { lines: { accused: ['One: {accusation}.', 'Two: {accusation}.'] } } });
    const texts = new Set(seeds.map((seed) => accusedSpeech(pack, S, 'hogging the jukebox', 'Sam', { seed })!.text));
    expect([...texts].sort()).toEqual(['One: hogging the jukebox.', 'Two: hogging the jukebox.']);
    expect(accusedSpeech(pack, S, 'x', '', { seed: 'a' })!.text).toBe(accusedSpeech(pack, S, 'x', '', { seed: 'a' })!.text);
  });

  it('drops a leading "been" from an accusation', () => {
    expect(accusation('been hogging the jukebox')).toBe('hogging the jukebox');
    expect(accusation('Been stealing chips!')).toBe('stealing chips');
  });

  it('says a multiple-choice question\'s options for the keypad', () => {
    expect(spokenChoices(['Bob', 'Rob', 'Bill'])).toBe('Press 1 for Bob, 2 for Rob, or 3 for Bill.');
    expect(spokenChoices(['Bob', 'Rob'])).toBe('Press 1 for Bob, or 2 for Rob.');
  });
});

describe('validatePack and the police voice', () => {
  const problems = (voice: PoliceVoice, features: Record<string, boolean> = {}) =>
    validatePack(testPack({ features: { police: true, ...features }, policeVoice: voice })).join('\n');

  it('accepts variants, officers and chat lines', () => {
    expect(problems({ officers: [{ name: 'DS One', telegramVoice: 'en-GB-RyanNeural' }], lines: { pass: ['A.', 'B {officer}.'] }, chatLines: { ask: 'Chat: {question}' } })).toBe('');
  });

  it.each([
    ['a recorded line with variants', { lines: { pass: ['A.', 'B.'] }, recordings: ['pass'] }, /pass.*record|record.*pass/i],
    ['a recorded line naming the officer', { officers: [{ name: 'DS One' }], lines: { pass: 'Bye from {officer}.' }, recordings: ['pass'] }, /pass.*(record|officer)/i],
    ['{officer} without officers', { lines: { pass: 'Bye from {officer}.' } }, /officer/i],
    ['an accused line without {accusation}', { lines: { accused: 'You did a thing.' } }, /accused.*\{accusation\}|accusation/i],
    ['an ask line without {question}', { lines: { ask: 'Answer now.' } }, /ask.*question/i],
    ['a chat ask without {question}', { chatLines: { ask: 'Answer now.' } }, /ask.*question/i],
    ['a blank variant', { lines: { pass: ['A.', '  '] } }, /pass.*blank/i],
    ['more than ten variants', { lines: { pass: Array.from({ length: 11 }, (_, i) => `P${i}.`) } }, /pass.*(10|ten|variants)/i],
    ['an officer with a made-up voice', { officers: [{ name: 'DS One', telegramVoice: 'Brian' }] }, /voice/i],
    ['a blank officer', { officers: [{ name: '  ' }] }, /officer/i],
    ['an unknown chat line', { chatLines: { nope: 'x' } as never }, /nope/],
  ])('refuses %s', (_label, voice, what) => {
    expect(problems(voice as PoliceVoice)).toMatch(what);
  });
});

describe("the mystery pack's police", () => {
  const mystery = packOf('mystery');
  const voice = mystery.policeVoice!;
  const all = (key: string): string[] => {
    const v = (voice.lines as Record<string, string | string[] | undefined>)[key];
    return v === undefined ? [] : typeof v === 'string' ? [v] : [...v];
  };

  it('has the five officers, each with a Telegram voice', () => {
    expect(voice.officers!.map((o) => o.name)).toEqual([
      'Detective Inspector Margaret Hollings',
      'Detective Sergeant Alan Whitworth',
      'Detective Constable Priya Marsh',
      'Desk Sergeant Lorraine Cottam',
      'Police Constable Gareth Openshaw',
    ]);
    for (const o of voice.officers!) expect(o.telegramVoice).toMatch(/^en-GB-[A-Za-z]+Neural$/);
  });

  it('sounds official and varied: an officer, the department and the case, the tip, the drink, the chat', () => {
    expect(all('intro-tip').length).toBeGreaterThanOrEqual(2);
    for (const line of all('intro-tip')) {
      expect(line).toContain('{officer}');
      expect(line).toMatch(/Major Incident Team/);
      expect(line).toMatch(/Operation Last Orders/);
    }
    for (const line of all('intro-watch')) expect(line).toContain('{officer}');
    for (const line of all('accused')) expect(line).toMatch(/tipped off that you have been \{accusation\}/);
    expect(all('purpose').some((l) => /handling your drink/.test(l))).toBe(true);
    const chatAsk = voice.chatLines!.ask!;
    for (const line of typeof chatAsk === 'string' ? [chatAsk] : chatAsk) expect(line).toMatch(/chat.*\{question\}/i);
    for (const key of ['pass', 'fail', 'no-answer']) expect(all(key).length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(voice)).not.toMatch(/Greater Manchester Police/);
  });

  it('opens every call with "This is {caller}." and a failed test says to refresh the case page and try again', () => {
    for (const key of ['intro-tip', 'intro-watch', 'test-intro']) {
      for (const line of all(key)) expect(line.startsWith('This is {caller}.')).toBe(true);
    }
    const say = voiceScript(mystery, { policeCallerName: 'Manchester Metropolitan Police' }, { seed: 'call-1' });
    expect(say('intro-watch', 'Sam').text.startsWith('This is Manchester Metropolitan Police.')).toBe(true);
    expect(say('test-fail').text).toBe('Refresh the case page and try again.');
  });

  it('is a valid pack, with case updates on', () => {
    expect(validatePack(mystery)).toEqual([]);
    expect(mystery.settings?.policeNotices).toBe(true);
  });
});
