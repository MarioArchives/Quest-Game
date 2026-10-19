import { describe, expect, it } from 'vitest';
import {
  catchUpOrder,
  entryTitle,
  isYours,
  nextVote,
  pickLine,
  pickOfStop,
  pileLine,
  pillText,
  scoreLabel,
  stampCounts,
  stopChip,
  toStamp,
  topByLine,
  tonightLine,
  underLine,
  type VotePost,
} from './logbook';

const post = (id: string, extra: Partial<VotePost> = {}): VotePost => ({ id, type: 'approved', uid: 'p1', ...extra });

describe('nextVote', () => {
  it('sets a vote when there is none', () => {
    expect(nextVote(null, 1)).toBe(1);
    expect(nextVote(undefined, -1)).toBe(-1);
  });
  it('takes the vote back when the same stamp is tapped', () => {
    expect(nextVote(1, 1)).toBeNull();
    expect(nextVote(-1, -1)).toBeNull();
  });
  it('switches when the other stamp is tapped', () => {
    expect(nextVote(1, -1)).toBe(-1);
    expect(nextVote(-1, 1)).toBe(1);
  });
});

describe('stampCounts', () => {
  it('reads missing counts as 0', () => {
    expect(stampCounts(post('a'), 'me')).toEqual({ up: 0, down: 0, mine: null });
  });
  it('shows your pending vote at once', () => {
    expect(stampCounts(post('a', { up: 3, down: 1 }), 'me', { a: 1 })).toEqual({ up: 4, down: 1, mine: 1 });
  });
  it('switches a vote the server already has', () => {
    const p = post('a', { up: 3, down: 1, votes: { me: 1 } });
    expect(stampCounts(p, 'me', { a: -1 })).toEqual({ up: 2, down: 2, mine: -1 });
    expect(stampCounts(p, 'me', { a: null })).toEqual({ up: 2, down: 1, mine: null });
    expect(stampCounts(p, 'me')).toEqual({ up: 3, down: 1, mine: 1 });
  });
});

describe('toStamp', () => {
  const posts = [
    post('a'),
    post('b', { votes: { me: 1 } }),
    post('c', { uid: 'me' }),
    post('d', { type: 'standing' }),
    post('e', { actorUid: 'me' }),
    post('f', { votes: { other: -1 } }),
  ];
  it('counts votable entries that are not yours and not voted on', () => {
    expect(toStamp(posts, 'me').map((p) => p.id)).toEqual(['a', 'f']);
  });
  it('honours a pending vote or a taken-back one', () => {
    expect(toStamp(posts, 'me', { a: 1, b: null }).map((p) => p.id)).toEqual(['b', 'f']);
  });
  it('knows which entries are yours', () => {
    expect(isYours(posts[2]!, 'me')).toBe(true);
    expect(isYours(posts[4]!, 'me')).toBe(true);
    expect(isYours(posts[3]!, 'me')).toBe(false);
    expect(isYours(posts[0]!, 'me')).toBe(false);
  });
});

describe('stop chips', () => {
  it('says what is left, or that all is stamped, or nothing', () => {
    expect(stopChip(5, 3)).toBe('3 to stamp');
    expect(stopChip(5, 0)).toBe('All stamped');
    expect(stopChip(0, 0)).toBeNull();
  });
});

describe('pickOfStop', () => {
  it('is empty when nothing scores 1 or more', () => {
    expect(pickOfStop([post('a'), post('b', { up: 1, down: 1 }), post('c', { score: -2 })])).toEqual([]);
  });
  it('takes the highest score', () => {
    expect(pickOfStop([post('a', { up: 1 }), post('b', { up: 3, down: 0 }), post('c', { score: 2 })]).map((p) => p.id)).toEqual(['b']);
  });
  it('keeps every entry tied for it', () => {
    expect(pickOfStop([post('a', { score: 2 }), post('b', { up: 2 }), post('c', { score: 1 })]).map((p) => p.id)).toEqual(['a', 'b']);
  });
  it('words one pick, a tie and a long tie', () => {
    expect(pickLine([])).toBeNull();
    expect(pickLine(['the corkscrew'])).toBe('Pick: the corkscrew');
    expect(pickLine(['the corkscrew', 'the charge'])).toBe('Pick: the corkscrew + the charge (tied)');
    expect(pickLine(['a', 'b', 'c', 'd'])).toBe('Pick: a + b + 2 more (tied)');
  });
  it('names an entry by its caption, else its words, clipped', () => {
    expect(entryTitle({ text: 'Maya answered the roll call', caption: 'Who is that?' })).toBe('Who is that?');
    expect(entryTitle({ text: 'Maya answered the roll call at the cellar steps again', caption: '' }, 20)).toBe('Maya answered the r…');
  });
});

describe('catchUpOrder', () => {
  const chapters = [
    { posts: [post('h1'), post('h2', { votes: { me: 1 } }), post('h3')] },
    { posts: [post('e1'), post('e2', { uid: 'me' })] },
    { posts: [post('o1')] },
  ];
  it('puts this stop first, newest first, then earlier stops', () => {
    const order = catchUpOrder(chapters, 'me');
    expect(order.map((o) => o.post.id)).toEqual(['h1', 'h3', 'e1', 'o1']);
    expect(order.map((o) => o.chapter)).toEqual([0, 0, 1, 2]);
  });
  it('leaves out what you have just stamped', () => {
    expect(catchUpOrder(chapters, 'me', { h1: -1 }).map((o) => o.post.id)).toEqual(['h3', 'e1', 'o1']);
  });
  it('words the pill and the pile heading', () => {
    expect(pillText(3, 5)).toBe('Next to stamp · 3 left here');
    expect(pillText(0, 5)).toBe('Next to stamp · 5 earlier');
    expect(pillText(0, 0)).toBeNull();
    const order = catchUpOrder(chapters, 'me');
    expect(pileLine(0, order)).toBe('1 of 2 here · then 2 earlier');
    expect(pileLine(2, order)).toBe('1 of 2 earlier');
  });
});

describe('the top card', () => {
  it('labels the score and the entry', () => {
    expect(scoreLabel(3)).toBe('+3');
    expect(topByLine({ who: 'Priya', what: 'Murder weapon', stop: 'the Royal Oak', time: '22:12' })).toBe('Priya · Murder weapon · the Royal Oak, 22:12');
    expect(topByLine({ who: 'Priya', what: null, stop: null, time: '22:12' })).toBe('Priya · 22:12');
    expect(tonightLine(55)).toBe('55 entries tonight');
    expect(tonightLine(1)).toBe('1 entry tonight');
  });
  it('words the card underneath once it changed hands', () => {
    expect(underLine('The corkscrew', 3, '22:40', '23:19')).toBe('The corkscrew · +3 · 22:40–23:19');
    expect(underLine('The corkscrew', null, '22:40', null)).toBe('The corkscrew · from 22:40');
  });
});
