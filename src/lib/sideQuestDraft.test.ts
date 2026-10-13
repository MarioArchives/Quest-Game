import { describe, expect, it } from 'vitest';
import { changedFields, sideQuestProblem, type SideQuestDraft } from './sideQuestDraft';

const draft = (over: Partial<SideQuestDraft> = {}): SideQuestDraft => ({ title: 'Best toast', description: 'A photo', windowMin: '40', points: '100', ...over });

describe('sideQuestProblem', () => {
  it('accepts a good draft and the boundaries', () => {
    expect(sideQuestProblem(draft())).toBeNull();
    expect(sideQuestProblem(draft({ title: 'x'.repeat(80), description: 'x'.repeat(500), windowMin: '5', points: '0' }))).toBeNull();
    expect(sideQuestProblem(draft({ windowMin: ' 180 ' }))).toBeNull();
  });

  it.each([
    ['a blank title', { title: '  ' }, 'Give it a title.'],
    ['an 81-character title', { title: 'x'.repeat(81) }, 'The title can be 80 characters at most.'],
    ['a 501-character description', { description: 'x'.repeat(501) }, 'The description can be 500 characters at most.'],
    ['a 4 minute window', { windowMin: '4' }, 'The window is 5 to 180 minutes.'],
    ['a 181 minute window', { windowMin: '181' }, 'The window is 5 to 180 minutes.'],
    ['a fractional window', { windowMin: '10.5' }, 'The window is 5 to 180 minutes.'],
    ['negative points', { points: '-1' }, 'Points are a whole number, 0 or more.'],
    ['empty points', { points: '' }, 'Points are a whole number, 0 or more.'],
  ])('flags %s', (_label, over, message) => {
    expect(sideQuestProblem(draft(over))).toBe(message);
  });
});

describe('changedFields', () => {
  it('is empty when nothing changed (spacing and number formatting aside)', () => {
    expect(changedFields(draft({ title: ' Best toast ', windowMin: '040' }), draft())).toEqual({});
  });

  it('returns only what changed, trimmed and parsed', () => {
    expect(changedFields(draft({ title: ' Best toast at The Crown ', points: '30' }), draft())).toEqual({ title: 'Best toast at The Crown', points: 30 });
    expect(changedFields(draft({ description: 'Two photos', windowMin: '15' }), draft())).toEqual({ description: 'Two photos', windowMin: 15 });
  });
});
