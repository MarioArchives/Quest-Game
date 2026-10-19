// What the police say on a phone call (game/voice.ts): the engine's lines, a pack's own wording and recordings, and
// the TwiML that carries them.
import { describe, expect, it } from 'vitest';
import { callerName, DEFAULT_LINES, DEFAULT_VOICE, renderTwiml, voiceOf, voiceScript, type RenderOptions } from '../src/game/voice.js';
import { getPack, validatePack } from '../src/shared/packs/index.js';
import { VOICE_LINES } from '../src/shared/phone.js';
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
