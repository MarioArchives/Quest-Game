import { describe, expect, it } from 'vitest';
import {
  defaultTab,
  filedAtMs,
  filedRule,
  missionResult,
  needsYou,
  slimClosed,
  tabClock,
  tabLabel,
  tonight,
  wasIn,
  yourMark,
  type MissionLike,
  type YourPart,
} from './missionTabs';

const mission = (id: string, startsMs: number, extra: Partial<MissionLike> = {}): MissionLike => ({ id, status: 'closed', startsMs, ...extra });

const you = (extra: Partial<YourPart> = {}): YourPart => ({
  uid: 'me',
  playing: true,
  entryIds: [],
  voted: false,
  canVote: true,
  wasIn: true,
  ...extra,
});

describe('tonight', () => {
  it('keeps the side quests since the start, newest first, numbered in the order they opened', () => {
    const list = tonight([mission('b', 300), mission('old', 50), mission('a', 200), mission('c', 400)], 100);
    expect(list.map((t) => [t.mission.id, t.number])).toEqual([
      ['c', 3],
      ['b', 2],
      ['a', 1],
    ]);
  });

  it('keeps every one before the game has started', () => {
    expect(tonight([mission('a', 1), mission('b', 2)], null).map((t) => t.number)).toEqual([2, 1]);
    expect(tonight([mission('a', 1)], 0)).toHaveLength(1);
  });

  it('orders a tie by id, so the numbers are steady', () => {
    expect(tonight([mission('y', 5), mission('x', 5)], null).map((t) => `${t.number}${t.mission.id}`)).toEqual(['2y', '1x']);
  });
});

describe('wasIn', () => {
  it('needs you joined by the time it opened, and not gone before', () => {
    expect(wasIn(100, null, 200)).toBe(true);
    expect(wasIn(300, null, 200)).toBe(false);
    expect(wasIn(100, 150, 200)).toBe(false);
    expect(wasIn(100, 250, 200)).toBe(true);
    expect(wasIn(0, 0, 200)).toBe(true);
  });
});

describe('needsYou', () => {
  it('wants your entry while live', () => {
    expect(needsYou(mission('a', 1, { status: 'live' }), you())).toBe(true);
    expect(needsYou(mission('a', 1, { status: 'live' }), you({ entryIds: ['s1'] }))).toBe(false);
  });

  it('wants your vote while voting, when there is something to vote for', () => {
    expect(needsYou(mission('a', 1, { status: 'voting' }), you())).toBe(true);
    expect(needsYou(mission('a', 1, { status: 'voting' }), you({ voted: true }))).toBe(false);
    expect(needsYou(mission('a', 1, { status: 'voting' }), you({ canVote: false }))).toBe(false);
    expect(needsYou(mission('a', 1, { status: 'voting', judging: 'submit' }), you())).toBe(false);
  });

  it('never asks while the GM checks, once closed, or of anyone not playing', () => {
    expect(needsYou(mission('a', 1, { status: 'checking' }), you())).toBe(false);
    expect(needsYou(mission('a', 1, { status: 'closed' }), you())).toBe(false);
    expect(needsYou(mission('a', 1, { status: 'live' }), you({ playing: false }))).toBe(false);
  });
});

describe('yourMark', () => {
  it('marks a Vote win, an entry and a miss', () => {
    const vote = mission('a', 1, { winnerUids: ['me'] });
    expect(yourMark(vote, you({ entryIds: ['s1'] }))).toBe('won');
    expect(yourMark(mission('a', 1, { winnerUids: ['them'] }), you({ entryIds: ['s1'] }))).toBe('entered');
    expect(yourMark(mission('a', 1), you())).toBe('missed');
  });

  it('counts the fastest entry as the win on a Submit mission', () => {
    const submit = mission('a', 1, { judging: 'submit', fastestSubmissionId: 's1' });
    expect(yourMark(submit, you({ entryIds: ['s1'] }))).toBe('won');
    expect(yourMark(submit, you({ entryIds: ['s2'] }))).toBe('entered');
  });

  it('has no mark while open, for a winner whose entry was thrown out, or for one never yours to enter', () => {
    expect(yourMark(mission('a', 1, { status: 'live' }), you({ entryIds: ['s1'] }))).toBeNull();
    expect(yourMark(mission('a', 1, { winnerUids: ['me'] }), you())).toBe('missed');
    expect(yourMark(mission('a', 1), you({ wasIn: false }))).toBeNull();
    expect(yourMark(mission('a', 1), you({ uid: null }))).toBeNull();
  });
});

describe('defaultTab', () => {
  const tab = (id: string, status: MissionLike['status'], needs = false) => ({ id, status, needsYou: needs });

  it('opens on a live one you have not entered, then a vote you have not cast, then the newest', () => {
    expect(defaultTab([tab('d', 'closed'), tab('c', 'voting', true), tab('b', 'live', true)])).toBe('b');
    expect(defaultTab([tab('d', 'closed'), tab('c', 'voting', true), tab('b', 'live')])).toBe('c');
    expect(defaultTab([tab('d', 'closed'), tab('c', 'voting'), tab('b', 'checking')])).toBe('d');
    expect(defaultTab([])).toBeNull();
  });
});

describe('slimClosed', () => {
  it('slims closed tabs once there are more than five', () => {
    expect(slimClosed(5)).toBe(false);
    expect(slimClosed(6)).toBe(true);
  });
});

describe('tabClock', () => {
  it('fits a narrow tab', () => {
    expect(tabClock(724_000, 0)).toBe('12:04');
    expect(tabClock(3_900_000, 0)).toBe('1h05');
    expect(tabClock(0, 5000)).toBe('00:00');
    expect(tabClock(1_500, 1_000)).toBe('00:01');
  });
});

describe('tabLabel', () => {
  it('names the number, title and state', () => {
    expect(tabLabel(4, 'The line-up', mission('a', 1, { status: 'live' }), you())).toBe('No. 4, The line-up: live, you haven’t entered');
    expect(tabLabel(4, 'The line-up', mission('a', 1, { status: 'live' }), you({ entryIds: ['s'] }))).toBe('No. 4, The line-up: live, you’re in');
    expect(tabLabel(3, 'Pocket lottery', mission('a', 1, { status: 'voting' }), you())).toBe('No. 3, Pocket lottery: voting, you haven’t voted');
    expect(tabLabel(3, 'Pocket lottery', mission('a', 1, { status: 'voting' }), you({ voted: true }))).toBe('No. 3, Pocket lottery: voting, you voted');
    expect(tabLabel(9, 'Hats', mission('a', 1, { status: 'checking' }), you())).toBe('No. 9, Hats: entries being checked');
    expect(tabLabel(1, 'Body', mission('a', 1, { judging: 'submit', fastestSubmissionId: 's' }), you({ entryIds: ['s'] }))).toBe('No. 1, Body: closed, you were fastest');
    expect(tabLabel(2, 'Hats', mission('a', 1, { winnerUids: ['me'] }), you({ entryIds: ['s'] }))).toBe('No. 2, Hats: closed, you won');
    expect(tabLabel(2, 'Hats', mission('a', 1), you({ entryIds: ['s'] }))).toBe('No. 2, Hats: closed, you were in');
    expect(tabLabel(2, 'Hats', mission('a', 1), you())).toBe('No. 2, Hats: closed, you missed it');
    expect(tabLabel(2, 'Hats', mission('a', 1), you({ uid: null, wasIn: false }))).toBe('No. 2, Hats: closed');
  });
});

describe('filedAtMs', () => {
  const feed = [
    { type: 'global-won', ref: 'sub-9', ms: 900 },
    { type: 'global-scored', ref: 'q2', ms: 800 },
    { type: 'voting-open', ref: 'q1', ms: 500 },
  ];

  it('finds the closing post: a Submit summary or a Vote winner', () => {
    expect(filedAtMs(mission('q2', 1, { judging: 'submit' }), feed)).toBe(800);
    expect(filedAtMs(mission('q1', 1, { winningSubmissionIds: ['sub-9'] }), feed)).toBe(900);
  });

  it('is unknown without one', () => {
    expect(filedAtMs(mission('q1', 1, { winningSubmissionIds: [] }), feed)).toBeNull();
    expect(filedAtMs(mission('q3', 1), [])).toBeNull();
  });
});

describe('filedRule', () => {
  it('says what it paid', () => {
    expect(filedRule({ judging: 'submit', bonusPoints: 3, fastestBonus: 2 }, 3)).toBe('No vote: every entry earned +3, the fastest +2 more. No entry cost −3.');
    expect(filedRule({ judging: 'submit', bonusPoints: 3 }, 0)).toBe('No vote: every entry earned +3.');
    expect(filedRule({ bonusPoints: 5 }, 5)).toBe('Most votes won +5. Ties all won. No entry cost −5.');
    expect(filedRule({ judging: 'vote', bonusPoints: 5, fastestBonus: 2 }, 0)).toBe('Most votes won +5, the fastest entry +2. Ties all won.');
  });
});

describe('missionResult', () => {
  const entry = (id: string, uid: string, createdMs: number) => ({ id, uid, createdMs });
  const entries = [entry('s3', 'sam', 30), entry('s1', 'maya', 10), entry('s2', 'priya', 20)];

  it('leads a Vote with its winners and their votes, and counts every vote cast', () => {
    const m = mission('q', 1, { winningSubmissionIds: ['s2'], tally: { s1: 2, s2: 3, s3: 0 } });
    const r = missionResult(m, entries, []);
    expect(r.leads.map((l) => [l.entry.uid, l.votes])).toEqual([['priya', 3]]);
    expect(r.votes.map((v) => [v.entry.uid, v.votes])).toEqual([
      ['priya', 3],
      ['maya', 2],
    ]);
    expect(r.entered).toEqual(['maya', 'priya', 'sam']);
    expect(r.fastest).toBeNull();
  });

  it('names a Vote’s fastest entry when it paid a bonus and did not win', () => {
    const m = mission('q', 1, { winningSubmissionIds: ['s2'], tally: { s2: 1 }, fastestBonus: 2, fastestSubmissionId: 's1' });
    expect(missionResult(m, entries, []).fastest?.uid).toBe('maya');
    const winner = mission('q', 1, { winningSubmissionIds: ['s1'], tally: { s1: 1 }, fastestBonus: 2, fastestSubmissionId: 's1' });
    expect(missionResult(winner, entries, []).fastest).toBeNull();
  });

  it('leads a Submit with its fastest entry, with no vote', () => {
    const m = mission('q', 1, { judging: 'submit', fastestSubmissionId: 's1', tally: {} });
    const r = missionResult(m, entries, []);
    expect(r.leads.map((l) => [l.entry.uid, l.votes])).toEqual([['maya', null]]);
    expect(r.votes).toEqual([]);
  });

  it('leaves out a winner whose entry no longer stands', () => {
    const m = mission('q', 1, { winningSubmissionIds: ['gone'], tally: { gone: 2 } });
    expect(missionResult(m, entries, []).leads).toEqual([]);
  });

  it('takes the fines from the points lines that name it', () => {
    const lines = [
      { uid: 'jonah', delta: -3, reason: 'skipped' },
      { uid: 'maya', delta: 3, reason: 'global-entry' },
      { uid: 'theo', delta: 0, reason: 'skipped' },
    ];
    expect(missionResult(mission('q', 1), entries, lines).fined).toEqual([
      { uid: 'jonah', delta: -3 },
      { uid: 'theo', delta: 0 },
    ]);
  });
});
