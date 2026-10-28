import { describe, expect, it } from 'vitest';
import {
  announcementsFired,
  byDeadline,
  checkinMark,
  checkinRule,
  isStillOpen,
  liveAside,
  missionRule,
  nextLine,
  pullForward,
  sendBack,
  shortName,
  stackOrder,
  storyChapters,
  tabSlots,
} from './missionDeck';

const MIN = 60_000;

describe('the stack', () => {
  const m = (id: string, deadlineMs: number | null, startsMs = 0) => ({ id, deadlineMs, startsMs });

  it('runs soonest deadline first, the ones being checked (no clock) last', () => {
    const order = byDeadline([m('lottery', 18 * MIN), m('check', null), m('roll', 9 * MIN), m('lineup', 12 * MIN)]).map((x) => x.id);
    expect(order).toEqual(['roll', 'lineup', 'lottery', 'check']);
  });

  it('breaks a tie by when they opened, then by id', () => {
    expect(byDeadline([m('b', 5, 2), m('a', 5, 2), m('c', 5, 1)]).map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });

  it('follows the deadlines until it is touched, then keeps the viewer’s order', () => {
    expect(stackOrder(['roll', 'lineup', 'lottery'], null)).toEqual(['roll', 'lineup', 'lottery']);
    expect(stackOrder(['roll', 'lineup', 'lottery'], ['lineup', 'lottery', 'roll'])).toEqual(['lineup', 'lottery', 'roll']);
  });

  it('drops closed ones from a held order and puts new ones at the back', () => {
    expect(stackOrder(['lineup', 'new', 'lottery'], ['lottery', 'roll', 'lineup'])).toEqual(['lottery', 'lineup', 'new']);
  });

  it('sends the front folder to the back on a swipe; a tapped tab comes to the front', () => {
    expect(sendBack(['roll', 'lineup', 'lottery'])).toEqual(['lineup', 'lottery', 'roll']);
    expect(sendBack(['roll'])).toEqual(['roll']);
    expect(sendBack([])).toEqual([]);
    expect(pullForward(['roll', 'lineup', 'lottery'], 'lottery')).toEqual(['lottery', 'roll', 'lineup']);
    expect(pullForward(['roll', 'lineup'], 'gone')).toEqual(['roll', 'lineup']);
  });

  it('keeps each tab in its deadline place however the stack is shuffled', () => {
    const deadline = ['roll', 'lineup', 'lottery'];
    expect([...tabSlots(deadline, ['lineup', 'lottery', 'roll'])]).toEqual([
      ['roll', 0],
      ['lineup', 1],
      ['lottery', 2],
    ]);
    // Past the stack's limit, only the shown ones get places.
    expect([...tabSlots(['a', 'b', 'c', 'd', 'e'], ['e', 'a', 'b', 'c'])]).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
      ['e', 3],
    ]);
  });
});

describe('shortName (a folder tab)', () => {
  it('drops a leading article and a closing mark', () => {
    expect(shortName('The line-up')).toBe('Line-up');
    expect(shortName('Hats only!')).toBe('Hats only');
    expect(shortName('Roll call')).toBe('Roll call');
  });

  it('takes the longest word of a long title (the last one on a tie)', () => {
    expect(shortName('Pocket lottery')).toBe('Lottery');
    expect(shortName('The body is found')).toBe('Found');
  });

  it('cuts a single long word short', () => {
    expect(shortName('Extraordinarily')).toBe('Extraordi…');
  });
});

describe('storyChapters', () => {
  const story = [{ id: 's-body' }, { id: 's-lineup' }, { id: 's-will' }, { id: 's-cellar' }];

  it('numbers chapters by their place in the story and seals the ones not fired', () => {
    const { chapterOf, sealed } = storyChapters(story, ['s-lineup', null, 's-body', 'g-random']);
    expect(chapterOf.get('s-lineup')).toBe(2);
    expect(sealed).toEqual([3, 4]);
  });

  it('a chapter fired twice is still one chapter', () => {
    expect(storyChapters(story, ['s-body', 's-body']).sealed).toEqual([2, 3, 4]);
  });
});

describe('checkinMark', () => {
  const closed = { missedUids: ['jonah'], endedBy: 'time' as const, startsMs: 100 };
  const you = { uid: 'me', joinedMs: 50, answered: false };

  it('a cross when you were fined for missing it', () => {
    expect(checkinMark({ ...closed, missedUids: ['me'] }, you)).toBe('missed');
  });

  it('a tick when you answered, or were asked and not named when it charged', () => {
    expect(checkinMark(closed, { ...you, answered: true })).toBe('entered');
    expect(checkinMark(closed, you)).toBe('entered');
  });

  it('nothing for someone who joined after it opened, or a call-off that charged nobody', () => {
    expect(checkinMark(closed, { ...you, joinedMs: 150 })).toBeNull();
    expect(checkinMark({ missedUids: [], endedBy: 'gm', startsMs: 100 }, you)).toBeNull();
    expect(checkinMark({ missedUids: [], endedBy: 'gm', startsMs: 100 }, { ...you, answered: true })).toBe('entered');
    expect(checkinMark(closed, { ...you, uid: null })).toBeNull();
  });
});

describe('the rules on a folder', () => {
  it('a submit mission pays each entry, a vote mission its winner, with the fine for not entering', () => {
    expect(missionRule({ judging: 'submit', bonusPoints: 3, fastestBonus: 2 }, 3)).toBe('+3 each, the fastest +2 · −3 if you don’t');
    expect(missionRule({ bonusPoints: 5 }, 5)).toBe('Most votes wins +5 · −5 if you don’t');
    expect(missionRule({ judging: 'vote', bonusPoints: 5, fastestBonus: 1 }, 0)).toBe('Most votes wins +5, the fastest entry +1');
  });

  it('a yes/no vote mission says how it is won (plan "Voting takeover…", edge case 17)', () => {
    expect(missionRule({ bonusPoints: 5 }, 5, 'yesno')).toBe('Most yes (less no) wins +5 · −5 if you don’t');
    expect(missionRule({ judging: 'vote', bonusPoints: 5, fastestBonus: 1 }, 0, 'yesno')).toBe('Most yes (less no) wins +5, the fastest entry +1');
    expect(missionRule({ judging: 'submit', bonusPoints: 3 }, 0, 'yesno')).toBe('+3 each');
    expect(missionRule({ bonusPoints: 5 }, 0, 'pick')).toBe('Most votes wins +5');
  });

  it('a periodic mission', () => {
    expect(checkinRule(5)).toBe('−5 if you don’t · one answer, a photo or a comment');
    expect(checkinRule(0)).toBe('No fine · one answer, a photo or a comment');
  });
});

describe('announcements in the deck (plan "Mystery pack: minimal notifications…", edge case 28)', () => {
  it('lists the announcements that have fired, in the story order, never the missions', () => {
    const story = [
      { id: 's-photo' },
      { id: 's-time', kind: 'announce' as const },
      { id: 's-old-days', kind: 'mission' as const },
      { id: 's-reveal', kind: 'announce' as const },
    ];
    expect(announcementsFired(story, [])).toEqual([]);
    expect(announcementsFired(story, ['s-reveal', 's-photo', 's-time']).map((s) => s.id)).toEqual(['s-time', 's-reveal']);
    expect(announcementsFired(story, ['s-time', 's-time', null, 's-gone']).map((s) => s.id)).toEqual(['s-time']);
  });
});

describe('Live and Still open', () => {
  const you = (done: boolean, playing = true) => ({ playing, done });

  it('a group or story mission you are in, still taking entries, is Still open', () => {
    expect(isStillOpen({ kind: 'group', status: 'live', you: you(true) })).toBe(true);
    expect(isStillOpen({ kind: 'story', status: 'live', you: you(true) })).toBe(true);
  });

  it('one you are not in, a vote, entries being checked and roll calls stay in the stack', () => {
    expect(isStillOpen({ kind: 'group', status: 'live', you: you(false) })).toBe(false);
    expect(isStillOpen({ kind: 'group', status: 'voting', you: you(true) })).toBe(false);
    expect(isStillOpen({ kind: 'story', status: 'checking', you: you(true) })).toBe(false);
    expect(isStillOpen({ kind: 'periodic', status: 'live', you: you(true) })).toBe(false);
  });

  it('a GM who only runs the game has nothing Still open', () => {
    expect(isStillOpen({ kind: 'group', status: 'live', you: you(true, false) })).toBe(false);
  });

  it('the Live heading counts what needs you, and offers the tabs only with more than one folder', () => {
    expect(liveAside(2, 3)).toBe('2 need you · tap a tab');
    expect(liveAside(1, 1)).toBe('1 needs you');
    expect(liveAside(0, 2)).toBe('nothing needs you · tap a tab');
  });
});

describe('the Next line', () => {
  const base = { checkin: null, groups: true, drops: true, sealed: 0, gm: 'GM' };

  it('names the next roll call (the GM’s), the drops and the sealed chapters', () => {
    expect(nextLine({ ...base, checkin: { name: 'Roll call', clock: '23:00' }, sealed: 2 })).toBe('Next: roll call at 23:00 · random drops on · 2 chapters sealed');
  });

  it('says who sends group events when drops are off, and one chapter in the singular', () => {
    expect(nextLine({ ...base, drops: false, sealed: 1 })).toBe('Next: group events from the GM · 1 chapter sealed');
  });

  it('is null with nothing to say', () => {
    expect(nextLine({ ...base, groups: false })).toBeNull();
  });
});
