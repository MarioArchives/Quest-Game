import { describe, expect, it } from 'vitest';
import { AWARD_IDS, type CaseAward } from '../../../../functions/src/shared/packs/mystery/caseClosed.ts';
import { AWARD_COUNT, AWARD_LOOK, awardStory, myStory, type AwardContext } from './awards';
import { capitalise, listed, numberWord, ordinal, placeWord, plural, possessive } from './words';

const MIN = 60_000;
const NAMES: Record<string, string> = { maya: 'Maya', sam: 'Sam', jonah: 'Jonah', ruth: 'Ruth' };
const ctx = (over: Partial<AwardContext> = {}): AwardContext => ({
  name: (uid) => NAMES[uid] ?? uid,
  timeline: [],
  verdict: { opened: true, tally: { jonah: 5 }, photos: { jonah: 2 }, uids: ['jonah'], motiveBy: { jonah: 'maya' } },
  time: (ms) => `T${ms / MIN}`,
  deathAt: null,
  lovers: [],
  ...over,
});
const award = (id: CaseAward['id'], n: Record<string, Record<string, number>>): CaseAward => ({ id, uids: Object.keys(n), n });

describe('every award', () => {
  it('has a name, a stamp and a kicker, and words for one winner and for several', () => {
    expect(AWARD_COUNT).toBe(26);
    for (const id of AWARD_IDS) {
      expect(AWARD_LOOK[id].name).toBeTruthy();
      const zeros = { votes: 1, photos: 1, calls: 2, passed: 1, failed: 0, missed: 1, police: 1, rollCalls: 1, skipped: 1, up: 1, down: 0, tips: 1, landed: 1, earned: 5, lost: 0, doubtful: 1, posts: 1, frames: 1, points: 1, lead: 1, peak: 5, at: 10 * MIN, low: -11, upheld: 1, made: 1, missions: 2, framed: 2, answered: 1 };
      const one = awardStory(award(id, { sam: zeros }), ctx({ deathAt: 20 * MIN }));
      expect(one.headline).not.toMatch(/undefined|NaN/);
      expect(one.story).not.toMatch(/undefined|NaN/);
      const many = awardStory(award(id, { sam: zeros, ruth: zeros }), ctx());
      expect(many.headline).not.toMatch(/undefined|NaN/);
      expect(many.uids).toEqual(['sam', 'ruth']);
    }
  });
});

describe('the words for tonight', () => {
  it('tells the police record in words, leaving out what did not happen', () => {
    expect(awardStory(award('called', { ruth: { calls: 4, passed: 2, failed: 1, missed: 1 } }), ctx())).toMatchObject({
      headline: 'Police have Ruth on speed dial',
      story: 'Four check-ins in one night: one missed, one fluffed and two passed.',
      name: 'Most Called by Police',
      tone: 'plain',
    });
    expect(awardStory(award('unresponsive', { jonah: { police: 2, rollCalls: 3, skipped: 0 } }), ctx()).story).toBe('Missed two police calls and three roll calls.');
  });

  it('never says who was framed, only how often', () => {
    const s = awardStory(award('puppet', { ruth: { frames: 4 } }), ctx());
    expect(s.story).toBe('Four frames chosen as a reward. Whom Ruth framed stays sealed.');
  });

  it('times the frames on the Fall Guy and quotes the GM on their pet', () => {
    const timeline = [
      { uid: 'jonah', t: 385 * MIN, delta: -5, reason: 'framed' as const, note: null },
      { uid: 'jonah', t: 390 * MIN, delta: -5, reason: 'framed' as const, note: null },
      { uid: 'sam', t: 400 * MIN, delta: 1, reason: 'adjust' as const, note: 'for the Macarena!' },
    ];
    expect(awardStory(award('fallguy', { jonah: { framed: 2 } }), ctx({ timeline })).story).toBe('At T385 and T390. The Post protects its sources.');
    expect(awardStory(award('pet', { sam: { points: 1 } }), ctx({ timeline }))).toMatchObject({ headline: 'The GM rewards Sam', story: '+1 from the GM by hand: “for the Macarena”.' });
  });

  it('names the motive writer’s victim and Bob’s lover where there is one', () => {
    expect(awardStory(award('pen', { maya: {} }), ctx()).story).toBe('Maya wrote why Jonah did it. The case closed on Jonah.');
    expect(awardStory(award('sidepiece', { ruth: {} }), ctx({ lovers: ['Sam'] })).story).toBe('Ruth told the booking desk they were Bob’s sidepiece. Bob’s lover, Sam, declined to comment.');
  });

  it('shares a headline between several winners, but tells each their own in their profile', () => {
    const present = award('present', { sam: { answered: 5 }, ruth: { answered: 4 } });
    expect(awardStory(present, ctx()).headline).toBe('Two answered every roll call');
    expect(myStory(present, 'ruth', ctx())).toMatchObject({ headline: 'Ruth answered every roll call', story: 'Four out of four, on the hour.', uids: ['ruth'] });
    expect(awardStory(award('champion', { sam: { points: 9, lead: 0 }, maya: { points: 9, lead: 0 } }), ctx()).headline).toBe('Sam and Maya share the title');
  });

  it('counts the minutes from the last roll call to the time of death', () => {
    expect(awardStory(award('lastseen', { ruth: { at: 238 * MIN } }), ctx({ deathAt: 242 * MIN })).story).toBe('Ruth’s roll-call answer at T238 came four minutes before the time of death.');
  });
});

describe('the paper’s words', () => {
  it('spells small numbers, lists with "and", and places', () => {
    expect([numberWord(0), numberWord(6), numberWord(12), numberWord(13)]).toEqual(['no', 'six', 'twelve', '13']);
    expect([listed([]), listed(['A']), listed(['A', 'B']), listed(['A', 'B', 'C'])]).toEqual(['', 'A', 'A and B', 'A, B and C']);
    expect([plural(1, 'vote'), plural(3, 'vote'), plural(2, 'roll call', 'roll calls', true)]).toEqual(['1 vote', '3 votes', 'two roll calls']);
    expect([ordinal(1), ordinal(2), ordinal(3), ordinal(11), ordinal(22)]).toEqual(['1st', '2nd', '3rd', '11th', '22nd']);
    expect([placeWord(3), placeWord(11)]).toEqual(['Third', '11th']);
    expect([capitalise('two'), possessive('Maya')]).toEqual(['Two', 'Maya’s']);
  });
});
