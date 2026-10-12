// Mystery plan edge case 20: a player's exhibits are the photos they entered in side quests that went to the vote.
import { describe, expect, it } from 'vitest';
import { Stamp } from '../../functions/src/shared/store/stamp.ts';
import type { Doc, GlobalQuest, Submission } from '../shared';
import { exhibitsFor } from './exhibits';

const at = (min: number) => Stamp.fromMillis(Date.parse('2026-10-10T14:00:00Z') + min * 60_000);

const entry = (id: string, over: Partial<Submission>): Doc<Submission> =>
  ({
    id,
    uid: 'alice',
    kind: 'global',
    questId: 'gq1',
    witnessUid: '',
    createdAt: at(0),
    status: 'approved',
    imagePath: `submissions/alice/${id}.jpg`,
    thumbPath: `submissions/alice/${id}_thumb.jpg`,
    caption: `caption ${id}`,
    ...over,
  }) as Doc<Submission>;

const quests = [
  { id: 'gq1', title: 'Toast the barman' },
  { id: 'gq2', title: 'Group photo with a stranger' },
] as Array<Doc<GlobalQuest>>;

describe('exhibitsFor', () => {
  it("lists the player's side-quest photos that went to the vote, newest first, captioned with the side quest", () => {
    const subs = [entry('e1', { questId: 'gq1', createdAt: at(10) }), entry('e2', { questId: 'gq2', createdAt: at(30) })];
    expect(exhibitsFor('alice', subs, quests)).toEqual([
      { submissionId: 'e2', imagePath: 'submissions/alice/e2.jpg', thumbPath: 'submissions/alice/e2_thumb.jpg', caption: 'Group photo with a stranger' },
      { submissionId: 'e1', imagePath: 'submissions/alice/e1.jpg', thumbPath: 'submissions/alice/e1_thumb.jpg', caption: 'Toast the barman' },
    ]);
  });

  it('leaves out other players, personal claims, entries without a photo, and entries still sealed or thrown out', () => {
    const subs = [
      entry('keep', {}),
      entry('bob', { uid: 'bob' }),
      entry('personal', { kind: 'personal' }),
      entry('nophoto', { imagePath: null, thumbPath: null }),
      entry('sealed', { status: 'sealed' }),
      entry('rejected', { status: 'rejected' }),
    ];
    expect(exhibitsFor('alice', subs, quests).map((e) => e.submissionId)).toEqual(['keep']);
  });

  it('a missing thumbnail is null; an unknown side quest falls back to the entry caption, else nothing', () => {
    const subs = [entry('e1', { thumbPath: undefined, questId: 'gone', createdAt: at(5) }), entry('e2', { questId: 'gone', caption: null })];
    expect(exhibitsFor('alice', subs, quests)).toEqual([
      expect.objectContaining({ submissionId: 'e1', thumbPath: null, caption: 'caption e1' }),
      expect.objectContaining({ submissionId: 'e2', caption: '' }),
    ]);
  });

  it('is empty with nothing to show', () => {
    expect(exhibitsFor('alice', [], quests)).toEqual([]);
  });
});
