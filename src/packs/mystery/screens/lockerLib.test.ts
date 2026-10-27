import { describe, expect, it } from 'vitest';
import { Stamp } from '../../../../functions/src/shared/store/stamp.ts';
import { LOCKER_TABS, askBeforeMove, deskCounts, linesAlarm, lockerSummary, missionKind, nudge, runningFor, untilLabel, stepTab, tagNumber, tonightJobs, waited, type JobsInput } from './lockerLib';

describe('tagNumber', () => {
  it('is stable and four digits', () => {
    expect(tagNumber('abc123')).toBe(tagNumber('abc123'));
    expect(tagNumber('abc123')).toMatch(/^\d{4}$/);
    expect(tagNumber('')).toBe('1000');
  });
});

describe('lockerSummary', () => {
  it('says nothing sealed for no rewards', () => expect(lockerSummary([])).toBe('Nothing sealed yet'));
  it('lists the non-zero parts', () => {
    expect(lockerSummary([{ status: 'framed' }, { status: 'framed' }, { status: 'cleaned' }])).toBe('2 frames and 1 destroyed exhibit');
    expect(lockerSummary([{ status: 'pending' }])).toBe('1 reward unused');
    expect(lockerSummary([{ status: 'framed' }, { status: 'cleaned' }, { status: 'pending' }, { status: 'void' }])).toBe(
      '1 frame, 1 destroyed exhibit and 1 reward unused',
    );
  });
});

describe('runningFor', () => {
  it('reads minutes under an hour, then hours and minutes', () => {
    expect(runningFor(0)).toBe('0m');
    expect(runningFor(45 * 60_000 + 59_000)).toBe('45m');
    expect(runningFor(2 * 3_600_000)).toBe('2h');
    expect(runningFor(3 * 3_600_000 + 12 * 60_000)).toBe('3h 12m');
  });
  it('never goes negative (a clock a little behind the server)', () => {
    expect(runningFor(-90_000)).toBe('0m');
  });
});

describe('stepTab', () => {
  it('moves along the folder tabs with the arrow keys, wrapping round', () => {
    expect(stepTab(LOCKER_TABS, 'tonight', 'ArrowRight')).toBe('suspects');
    expect(stepTab(LOCKER_TABS, 'setup', 'ArrowRight')).toBe('tonight');
    expect(stepTab(LOCKER_TABS, 'tonight', 'ArrowLeft')).toBe('setup');
    expect(stepTab(LOCKER_TABS, 'missions', 'ArrowLeft')).toBe('suspects');
  });
  it('jumps to the ends with Home and End, and ignores other keys', () => {
    expect(stepTab(LOCKER_TABS, 'missions', 'Home')).toBe('tonight');
    expect(stepTab(LOCKER_TABS, 'suspects', 'End')).toBe('setup');
    expect(stepTab(LOCKER_TABS, 'suspects', 'Enter')).toBeNull();
    expect(stepTab(LOCKER_TABS, 'suspects', 'ArrowDown')).toBeNull();
  });
});

describe('linesAlarm', () => {
  it('rings while calls are on and the lines went down by themselves (or are on trial)', () => {
    expect(linesAlarm({ mode: 'app', manual: false }, true)).toBe(true);
    expect(linesAlarm({ mode: 'probation', manual: false }, true)).toBe(true);
  });
  it('is quiet with the lines up, calls off, no switchboard yet, or the GM switching to the app by hand', () => {
    expect(linesAlarm({ mode: 'phone', manual: false }, true)).toBe(false);
    expect(linesAlarm({ mode: 'app', manual: false }, false)).toBe(false);
    expect(linesAlarm(null, true)).toBe(false);
    expect(linesAlarm({ mode: 'app', manual: true }, true)).toBe(false);
  });
});

describe('tonightJobs', () => {
  const none: JobsInput = { linesDown: false, joins: [], statements: [], checking: null, story: { nextId: null, caseOpen: true, taking: false } };

  it('is empty when nothing needs the GM', () => expect(tonightJobs(none)).toEqual([]));

  it('puts the most urgent first: lines, the door, statements, entries, then the story', () => {
    const jobs = tonightJobs({
      linesDown: true,
      joins: [{ id: 'ellie', at: 300 }],
      statements: [
        { id: 'priya', at: 200 },
        { id: 'theo', at: 100 },
      ],
      checking: 'hats',
      story: { nextId: 's-4', caseOpen: true, taking: false },
    });
    expect(jobs).toEqual([
      { kind: 'lines', id: 'lines' },
      { kind: 'door', id: 'ellie' },
      { kind: 'statement', id: 'theo' },
      { kind: 'statement', id: 'priya' },
      { kind: 'entries', id: 'hats' },
      { kind: 'story', id: 's-4' },
    ]);
  });

  it('lists the door oldest first', () => {
    const jobs = tonightJobs({ ...none, joins: [{ id: 'b', at: 2 }, { id: 'a', at: 1 }] });
    expect(jobs.map((j) => j.id)).toEqual(['a', 'b']);
  });

  it('only offers the next story mission while the case is open and no group mission takes entries', () => {
    expect(tonightJobs({ ...none, story: { nextId: 's-4', caseOpen: true, taking: false } })).toEqual([{ kind: 'story', id: 's-4' }]);
    expect(tonightJobs({ ...none, story: { nextId: 's-4', caseOpen: false, taking: false } })).toEqual([]);
    expect(tonightJobs({ ...none, story: { nextId: 's-4', caseOpen: true, taking: true } })).toEqual([]);
    expect(tonightJobs({ ...none, story: { nextId: null, caseOpen: true, taking: false } })).toEqual([]);
  });
});

describe('missionKind', () => {
  it('names where a group mission came from', () => {
    expect(missionKind({ source: 'story', storyId: 's-1' }, 'GM')).toBe('Story mission');
    expect(missionKind({ source: 'gm-random', storyId: 's-1' }, 'GM')).toBe('Story mission');
    expect(missionKind({ source: 'gm-custom' }, 'GM')).toBe('From the GM');
    expect(missionKind({ source: 'timer' }, 'GM')).toBe('Random drop');
    expect(missionKind({ source: 'gm-random', storyId: null }, 'GM')).toBe('Random drop');
  });
});

describe('waited', () => {
  it('reads minutes, then hours and minutes', () => {
    expect(waited(30_000)).toBe('just now');
    expect(waited(14 * 60_000 + 20_000)).toBe('14 min');
    expect(waited(65 * 60_000)).toBe('1 h 5 min');
    expect(waited(2 * 3_600_000)).toBe('2 h');
  });
  it('never goes negative', () => expect(waited(-60_000)).toBe('just now'));
});

describe('the start time on the case strip (countdown plan edge case 21)', () => {
  const NIGHT = Date.parse('2026-11-07T19:00:00Z');
  const booked = { bookedAt: Stamp.fromMillis(NIGHT - 86_400_000) };
  const atDesk = { bookedAt: null };
  /** A player doc from before the booking desk: no bookedAt at all, so nothing to book. */
  const older = {};

  it('nudge adds whole minutes, either way', () => {
    expect(nudge(NIGHT, 15)).toBe(Date.parse('2026-11-07T19:15:00Z'));
    expect(nudge(NIGHT, 30)).toBe(Date.parse('2026-11-07T19:30:00Z'));
    expect(nudge(NIGHT, -15)).toBe(Date.parse('2026-11-07T18:45:00Z'));
  });

  it('asks before a move only once someone has booked in', () => {
    expect(askBeforeMove([])).toBe(false);
    expect(askBeforeMove([atDesk, atDesk])).toBe(false);
    expect(askBeforeMove([atDesk, booked])).toBe(true);
    expect(askBeforeMove([older])).toBe(true);
  });

  it('a player who left does not count as booked', () => {
    expect(askBeforeMove([{ ...booked, left: 'out' as const }, atDesk])).toBe(false);
  });

  it('counts who is booked and who is still at the desk, leaving out anyone who left', () => {
    expect(deskCounts([])).toEqual({ booked: 0, atDesk: 0 });
    expect(deskCounts([booked, booked, older, atDesk, { ...booked, left: 'frozen' as const }, { ...atDesk, left: 'out' as const }])).toEqual({ booked: 3, atDesk: 1 });
  });
});

describe('untilLabel', () => {
  it('reads days and hours, then hours and minutes, then minutes, rounded down', () => {
    expect(untilLabel((11 * 24 + 21) * 3_600_000 + 5 * 60_000)).toBe('11 days 21 h');
    expect(untilLabel(24 * 3_600_000)).toBe('1 day 0 h');
    expect(untilLabel(74 * 60_000 + 59_000)).toBe('1 h 14 min');
    expect(untilLabel(9 * 60_000)).toBe('9 min');
  });
  it('says now at or past zero', () => {
    expect(untilLabel(59_000)).toBe('now');
    expect(untilLabel(-60_000)).toBe('now');
  });
});
