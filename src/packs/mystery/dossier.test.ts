// Mystery plan edge case 21: the case file's small helpers (mission tags, nameplate, "behind the glass").
import { describe, expect, it } from 'vitest';
import { caseNumber, missionTag, splitProof, surnameInitial } from './dossier';

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

describe('splitProof', () => {
  it('splits the ask from its proof line', () => {
    expect(splitProof('Swap a drink mat for a ransom note. Proof: your witness saw the swap.')).toEqual({ what: 'Swap a drink mat for a ransom note.', proof: 'your witness saw the swap.' });
  });
  it('keeps a description without a proof line whole', () => {
    expect(splitProof('  Just do it.  ')).toEqual({ what: 'Just do it.', proof: null });
  });
  it('treats an empty proof as none', () => {
    expect(splitProof('Do it. Proof:')).toEqual({ what: 'Do it.', proof: null });
  });
});
