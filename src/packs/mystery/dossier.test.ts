// Mystery plan edge case 21: the case file's small helpers (mission tags, nameplate, "behind the glass").
import { describe, expect, it } from 'vitest';
import { behindTheGlass, caseNumber, missionTag, surnameInitial } from './dossier';

describe('missionTag', () => {
  it('[✓] done: the witness and the points', () => {
    expect(missionTag({ status: 'done' }, { witnessName: 'Tom', points: 100 })).toEqual({ tag: '[✓]', tone: 'done', sub: 'TOM · +100' });
  });

  it('[~] submitted: waiting on the witness', () => {
    expect(missionTag({ status: 'submitted' }, { witnessName: 'Jonas' })).toEqual({ tag: '[~]', tone: 'pending', sub: 'WAITING ON JONAS' });
  });

  it('[ ] active: nothing under it', () => {
    expect(missionTag({ status: 'active' }, {})).toEqual({ tag: '[ ]', tone: 'open', sub: null });
  });

  it('[x] exposed: who exposed it and what it cost, with a real minus sign', () => {
    expect(missionTag({ status: 'exposed' }, { exposedByName: 'Hannah', exposePenalty: 50 })).toEqual({
      tag: '[x]',
      tone: 'exposed',
      sub: 'EXPOSED BY HANNAH · −50',
    });
  });

  it('uses first names only', () => {
    expect(missionTag({ status: 'done' }, { witnessName: 'Tom Jones', points: 100 })?.sub).toBe('TOM · +100');
    expect(missionTag({ status: 'exposed' }, { exposedByName: 'Hannah Lee', exposePenalty: 50 })?.sub).toBe('EXPOSED BY HANNAH · −50');
  });

  it('leaves out what it does not know', () => {
    expect(missionTag({ status: 'done' }, { points: 100 })?.sub).toBe('+100');
    expect(missionTag({ status: 'done' }, { witnessName: 'Tom' })?.sub).toBe('TOM');
    expect(missionTag({ status: 'submitted' }, {})?.sub).toBe('WAITING');
    expect(missionTag({ status: 'exposed' }, { exposePenalty: 50 })?.sub).toBe('EXPOSED · −50');
    expect(missionTag({ status: 'exposed' }, { exposedByName: 'Hannah', exposePenalty: 0 })?.sub).toBe('EXPOSED BY HANNAH');
  });

  it('hides replaced missions', () => {
    expect(missionTag({ status: 'replaced' }, {})).toBeNull();
  });
});

describe('caseNumber', () => {
  it('is "NN · NNNNNN" and the same every time for a uid', () => {
    expect(caseNumber('demo-maya')).toMatch(/^\d{2} · \d{6}$/);
    expect(caseNumber('demo-maya')).toBe(caseNumber('demo-maya'));
  });

  it('differs between players', () => {
    const numbers = new Set(['a', 'b', 'demo-maya', 'demo-sam', 'x7Yq2'].map(caseNumber));
    expect(numbers.size).toBe(5);
  });
});

describe('surnameInitial', () => {
  it.each([
    ['Lady Violet Ashcombe', 'Ashcombe V'],
    ['Priya Sharma', 'Sharma P'],
    ['  Priya   Sharma ', 'Sharma P'],
    ['Dr Grey', 'Grey'],
    ['Colonel Mustard', 'Mustard'],
    ['Professor Plum', 'Plum'],
    ['Mary Ann Evans', 'Evans M'],
    ['Cher', 'Cher'],
    ['', ''],
  ])('%j → %j', (name, plate) => {
    expect(surnameInitial(name)).toBe(plate);
  });
});

describe('behindTheGlass', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
  const s = (uid: string) => ({ kind: 'suspect', uid });
  const you = { kind: 'you' };

  it('just you when nobody else plays', () => {
    expect(behindTheGlass([])).toEqual([you]);
  });

  it('two others, then you, then the rest up to five others', () => {
    expect(behindTheGlass(ids(1))).toEqual([s('p1'), you]);
    expect(behindTheGlass(ids(2))).toEqual([s('p1'), s('p2'), you]);
    expect(behindTheGlass(ids(5))).toEqual([s('p1'), s('p2'), you, s('p3'), s('p4'), s('p5')]);
  });

  it('with more than five others: two, you, two and "+N" for the rest', () => {
    expect(behindTheGlass(ids(6))).toEqual([s('p1'), s('p2'), you, s('p3'), s('p4'), { kind: 'more', count: 2 }]);
    expect(behindTheGlass(ids(12))).toEqual([s('p1'), s('p2'), you, s('p3'), s('p4'), { kind: 'more', count: 8 }]);
  });
});
