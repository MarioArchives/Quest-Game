import { describe, expect, it } from 'vitest';
import {
  announcementsFired,
  byDeadline,
  checkinMark,
  checkinRule,
  missionRule,
  openLine,
  opensLine,
  pullForward,
  rangeLabel,
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

describe('shortName (a folder tab and its chip)', () => {
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

describe('rangeLabel', () => {
  it('joins runs of chapters', () => {
    expect(rangeLabel([3, 4, 5, 6, 7])).toBe('3–7');
    expect(rangeLabel([7, 3, 5, 6])).toBe('3, 5–7');
    expect(rangeLabel([4])).toBe('4');
    expect(rangeLabel([])).toBe('');
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

describe('openLine', () => {
  const playing = { playing: true, done: false };

  it('says the time left and whether you are in, red while it needs you', () => {
    expect(openLine('group', 'live', '18:20', { playing: true, done: true })).toEqual({ text: '18:20 left · you’re in', tone: 'ok' });
    expect(openLine('story', 'live', '12:04', playing)).toEqual({ text: '12:04 left · not in', tone: 'hot' });
    expect(openLine('periodic', 'live', '09:12', playing)).toEqual({ text: '09:12 left · not answered', tone: 'hot' });
    expect(openLine('periodic', 'live', '09:12', { playing: true, done: true })).toEqual({ text: '09:12 left · answered', tone: 'ok' });
  });

  it('covers the check and the vote', () => {
    expect(openLine('group', 'checking', null, playing)).toEqual({ text: 'entries being checked', tone: 'plain' });
    expect(openLine('group', 'voting', '04:10', playing)).toEqual({ text: 'vote · 04:10 left · not voted', tone: 'hot' });
    expect(openLine('group', 'voting', '04:10', { playing: true, done: true })).toEqual({ text: 'vote · 04:10 left · you voted', tone: 'ok' });
    expect(openLine('group', 'voting', '04:10', { ...playing, nothingToVote: true })).toEqual({ text: 'vote · 04:10 left', tone: 'plain' });
  });

  it('asks nothing of a GM who only runs the game', () => {
    expect(openLine('group', 'live', '18:20', { playing: false, done: false })).toEqual({ text: '18:20 left', tone: 'plain' });
    expect(openLine('group', 'live', null, { playing: false, done: false }).text).toBe('time’s up');
  });
});

describe('the rules on a folder', () => {
  it('a submit mission pays each entry, a vote mission its winner, with the fine for not entering', () => {
    expect(missionRule({ judging: 'submit', bonusPoints: 3, fastestBonus: 2 }, 3)).toBe('+3 each, the fastest +2 · −3 if you don’t');
    expect(missionRule({ bonusPoints: 5 }, 5)).toBe('Most votes wins +5 · −5 if you don’t');
    expect(missionRule({ judging: 'vote', bonusPoints: 5, fastestBonus: 1 }, 0)).toBe('Most votes wins +5, the fastest entry +1');
  });

  it('a periodic mission', () => {
    expect(checkinRule(5)).toBe('−5 if you don’t · one answer, a photo or a comment');
    expect(checkinRule(0)).toBe('No fine · one answer, a photo or a comment');
  });

  it('when the next one opens', () => {
    expect(opensLine('22:42', 54 * MIN, 0)).toBe('opens 22:42 · in 54 min');
    expect(opensLine('22:42', 0, MIN)).toBe('opens 22:42 · any minute');
  });
});

describe('a long-running mission and announcements in the deck (plan "Mystery pack: minimal notifications…", edge case 28)', () => {
  const playing = { playing: true, done: false };

  it('a long-running mission shows its hours-long clock like any other', () => {
    expect(openLine('story', 'live', '4:59:12', playing)).toEqual({ text: '4:59:12 left · not in', tone: 'hot' });
  });

  it('after its deadline it waits for its vote, not a check', () => {
    expect(openLine('story', 'checking', null, playing, { longRun: true })).toEqual({ text: 'entries closed · vote opens later', tone: 'plain' });
    expect(openLine('group', 'checking', null, playing)).toEqual({ text: 'entries being checked', tone: 'plain' });
  });

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
