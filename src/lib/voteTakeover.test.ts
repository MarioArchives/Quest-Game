// Which open vote takes over the app (plan "Voting takeover: polaroid swipe, the cork board, and yes/no voting",
// edge case 13).
import { describe, expect, it } from 'vitest';
import { ballotProgress, putAside, takeoverQuest, votesNeedingYou, type MyVote, type VoteEntry, type VoteMission } from './voteTakeover';

const MIN = 60_000;
const NOW = 1_000 * MIN;

const mission = (id: string, over: Partial<VoteMission> = {}): VoteMission => ({
  id,
  status: 'voting',
  votingEndsMs: NOW + 10 * MIN,
  ...over,
});
const e = (id: string, uid: string): VoteEntry => ({ id, uid });
const ENTRIES = [e('ea', 'alice'), e('eb', 'bob'), e('ec', 'carol')];

describe('ballotProgress', () => {
  it('pick one: finished once your vote is on an entry still standing', () => {
    expect(ballotProgress({}, null, ENTRIES, 'alice')).toEqual({ style: 'pick', total: 2, judged: 0, finished: false });
    expect(ballotProgress({ voteStyle: 'pick' }, { submissionId: 'eb' }, ENTRIES, 'alice')).toEqual({ style: 'pick', total: 2, judged: 1, finished: true });
  });

  it('pick one: a vote on an entry that has since been thrown out asks again', () => {
    expect(ballotProgress({}, { submissionId: 'gone' }, ENTRIES, 'alice')).toMatchObject({ judged: 0, finished: false });
  });

  it('yes/no: counts the entries judged among everyone else’s', () => {
    expect(ballotProgress({ voteStyle: 'yesno' }, { ballot: { eb: 'yes' } }, ENTRIES, 'alice')).toEqual({ style: 'yesno', total: 2, judged: 1, finished: false });
    expect(ballotProgress({ voteStyle: 'yesno' }, { ballot: { eb: 'yes', ec: 'no' } }, ENTRIES, 'alice')).toEqual({ style: 'yesno', total: 2, judged: 2, finished: true });
  });

  it('yes/no: a judgement on your own entry or on one that has gone does not count', () => {
    expect(ballotProgress({ voteStyle: 'yesno' }, { ballot: { ea: 'yes', gone: 'no', eb: 'yes' } }, ENTRIES, 'alice')).toMatchObject({ judged: 1, finished: false });
  });

  it('with nothing of anyone else’s, there is nothing to finish', () => {
    expect(ballotProgress({ voteStyle: 'yesno' }, null, [e('ea', 'alice')], 'alice')).toEqual({ style: 'yesno', total: 0, judged: 0, finished: false });
  });
});

describe('votesNeedingYou', () => {
  const base = (over: Partial<Parameters<typeof votesNeedingYou>[0]> = {}) => ({
    missions: [mission('m1')],
    entriesByMission: new Map([['m1', ENTRIES]]),
    votes: new Map<string, MyVote | null>(),
    uid: 'alice',
    playing: true,
    nowMs: NOW,
    ...over,
  });

  it('a vote with something of someone else’s to vote on, not cast yet', () => {
    expect(votesNeedingYou(base())).toEqual(['m1']);
  });

  it('two at once: the one closing soonest first, then by id; one with no deadline last', () => {
    const missions = [mission('late', { votingEndsMs: NOW + 15 * MIN }), mission('none', { votingEndsMs: null }), mission('soon', { votingEndsMs: NOW + 5 * MIN }), mission('also', { votingEndsMs: NOW + 5 * MIN })];
    const entriesByMission = new Map(missions.map((m) => [m.id, ENTRIES]));
    expect(votesNeedingYou(base({ missions, entriesByMission }))).toEqual(['also', 'soon', 'late', 'none']);
  });

  it('not a finished vote (either way of voting)', () => {
    const missions = [mission('m1'), mission('m2', { voteStyle: 'yesno' })];
    const entriesByMission = new Map([['m1', ENTRIES], ['m2', ENTRIES]]);
    const votes = new Map<string, MyVote | null>([['m1', { submissionId: 'eb' }], ['m2', { ballot: { eb: 'yes', ec: 'no' } }]]);
    expect(votesNeedingYou(base({ missions, entriesByMission, votes }))).toEqual([]);
  });

  it('a yes/no vote judged only in part still needs you', () => {
    const votes = new Map<string, MyVote | null>([['m1', { ballot: { eb: 'yes' } }]]);
    expect(votesNeedingYou(base({ missions: [mission('m1', { voteStyle: 'yesno' })], votes }))).toEqual(['m1']);
  });

  it.each([
    ['live', mission('m1', { status: 'live' })],
    ['checking', mission('m1', { status: 'checking' })],
    ['closed', mission('m1', { status: 'closed' })],
    ['judged by submission', mission('m1', { judging: 'submit' })],
    ['past its deadline', mission('m1', { votingEndsMs: NOW })],
  ])('not a side quest %s', (_label, m) => {
    expect(votesNeedingYou(base({ missions: [m] }))).toEqual([]);
  });

  it('not one with only your own entry, or no entries', () => {
    expect(votesNeedingYou(base({ entriesByMission: new Map([['m1', [e('ea', 'alice')]]]) }))).toEqual([]);
    expect(votesNeedingYou(base({ entriesByMission: new Map() }))).toEqual([]);
  });

  it('nothing for someone not playing or signed out', () => {
    expect(votesNeedingYou(base({ playing: false }))).toEqual([]);
    expect(votesNeedingYou(base({ uid: null }))).toEqual([]);
  });
});

describe('takeoverQuest and putAside', () => {
  const input = (over: Partial<Parameters<typeof takeoverQuest>[0]> = {}) => ({
    needing: ['m1', 'm2'],
    aside: new Set<string>(),
    current: null,
    pathname: '/',
    policeOpen: false,
    gameActive: true,
    loading: false,
    ...over,
  });

  it('opens the first vote waiting', () => {
    expect(takeoverQuest(input())).toBe('m1');
    expect(takeoverQuest(input({ needing: [] }))).toBeNull();
  });

  it('keeps the vote it has open, even once it no longer needs you (finished, or closed)', () => {
    expect(takeoverQuest(input({ current: 'm2' }))).toBe('m2');
    expect(takeoverQuest(input({ needing: [], current: 'm1' }))).toBe('m1');
  });

  it('after Done, the next vote waiting opens', () => {
    // m1 is finished, so it no longer needs you, and Done cleared the open vote.
    expect(takeoverQuest(input({ needing: ['m2'], current: null }))).toBe('m2');
  });

  it('Back puts every vote waiting aside, but a vote that opens later still takes over', () => {
    const aside = putAside(new Set(), ['m1', 'm2']);
    expect([...aside].sort()).toEqual(['m1', 'm2']);
    expect(takeoverQuest(input({ aside }))).toBeNull();
    expect(takeoverQuest(input({ aside, needing: ['m1', 'm2', 'm3'] }))).toBe('m3');
    expect([...putAside(aside, ['m3'])].sort()).toEqual(['m1', 'm2', 'm3']);
  });

  it('putAside leaves the set it was given alone', () => {
    const before = new Set(['m0']);
    putAside(before, ['m1']);
    expect([...before]).toEqual(['m0']);
  });

  it.each([
    ['in the GM console', { pathname: '/gm' }],
    ['deep in the GM console', { pathname: '/gm/players' }],
    ['during a police check-in', { policeOpen: true }],
    ['while the game is not running', { gameActive: false }],
    ['while your votes load', { loading: true }],
  ])('shows nothing %s, even with a vote open', (_label, over) => {
    expect(takeoverQuest(input({ ...over, current: 'm1' }))).toBeNull();
    expect(takeoverQuest(input(over))).toBeNull();
  });

  it('comes back after the police check-in', () => {
    expect(takeoverQuest(input({ current: 'm1', policeOpen: true }))).toBeNull();
    expect(takeoverQuest(input({ current: 'm1', policeOpen: false }))).toBe('m1');
  });

  it('a page whose name only starts like the GM console still shows it', () => {
    expect(takeoverQuest(input({ pathname: '/gmail' }))).toBe('m1');
  });
});
