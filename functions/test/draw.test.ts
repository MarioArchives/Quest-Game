// Drawing a side-quest template: one function for the timer, "Fire random" and the GM's reshuffle preview.
import { describe, expect, it } from 'vitest';
import { drawTemplate } from '../src/shared/draw.js';
import { constRng } from './helpers.js';

const tpl = (...ids: string[]) => ids.map((id) => ({ id }));
const draw = (ids: string[], used: string[], v: number, skip: string[] = []) => drawTemplate(tpl(...ids), used, constRng(v), skip)?.id ?? null;

describe('drawTemplate', () => {
  it('returns null when there are no templates', () => {
    expect(draw([], [], 0)).toBeNull();
  });

  it('picks from the templates sorted by id, so a pinned rng is repeatable', () => {
    expect(draw(['g3', 'g1', 'g2'], [], 0)).toBe('g1');
    expect(draw(['g3', 'g1', 'g2'], [], 0.5)).toBe('g2');
    expect(draw(['g3', 'g1', 'g2'], [], 0.999)).toBe('g3');
  });

  it('prefers templates no side quest has used yet, ignoring null template ids', () => {
    expect(draw(['g1', 'g2', 'g3'], ['g1', 'g3'], 0)).toBe('g2');
    expect(draw(['g1', 'g2'], [null as unknown as string, 'g1'], 0.9)).toBe('g2');
  });

  it('falls back to all of them once every one has been used', () => {
    expect(draw(['g1', 'g2'], ['g1', 'g2'], 0.9)).toBe('g2');
  });

  it('a reshuffle skips what was already offered, unused ones first', () => {
    expect(draw(['g1', 'g2', 'g3'], ['g3'], 0, ['g1'])).toBe('g2');
    // Every unused one has been shown: used ones come next.
    expect(draw(['g1', 'g2', 'g3'], ['g3'], 0, ['g1', 'g2'])).toBe('g3');
  });

  it('once everything has been shown, offers anything but the one on screen', () => {
    expect(draw(['g1', 'g2', 'g3'], [], 0, ['g1', 'g2', 'g3'])).toBe('g1');
    expect(draw(['g1', 'g2', 'g3'], [], 0, ['g2', 'g3', 'g1'])).toBe('g2');
  });

  it('with a single template, a reshuffle shows it again', () => {
    expect(draw(['g1'], [], 0.5, ['g1'])).toBe('g1');
  });

  it('ignores skipped ids that are not templates any more', () => {
    expect(draw(['g1', 'g2'], [], 0, ['gone'])).toBe('g1');
  });
});
