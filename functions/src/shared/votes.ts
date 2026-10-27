import type { GlobalQuest, VoteStyle } from './types.ts';

/**
 * Count side-quest votes. `votes` are the voted-for submission ids (one per voter); `entryIds` are the
 * approved entries that can win. Votes for anything else are ignored. Everyone tied on the highest
 * count (> 0) wins; no votes means no winners. Shared by the server tally and the UI.
 */
export function tallyVotes(
  votes: readonly string[],
  entryIds: readonly string[],
): { counts: Record<string, number>; winners: string[] } {
  const ids = [...new Set(entryIds)];
  const counts: Record<string, number> = {};
  for (const id of ids) counts[id] = 0;
  for (const vote of votes) {
    if (Object.hasOwn(counts, vote)) counts[vote] += 1;
  }
  const top = Math.max(0, ...ids.map((id) => counts[id]));
  const winners = top > 0 ? ids.filter((id) => counts[id] === top) : [];
  return { counts, winners };
}

// ---------- yes/no votes ----------

/** A side quest's way of voting: 'yesno' only when it says so; anything else (missing, old docs) is 'pick'. */
export function voteStyleOf(q: { voteStyle?: unknown } | null | undefined): VoteStyle {
  return q?.voteStyle === 'yesno' ? 'yesno' : 'pick';
}

/** A yes/no vote counted: yeses, noes and yes − no per entry, and the winners. */
export interface BallotTally {
  yes: Record<string, number>;
  no: Record<string, number>;
  net: Record<string, number>;
  winners: string[];
}

/**
 * Count yes/no ballots (one per voter: submission id → 'yes' | 'no'). `entryIds` are the approved entries that can
 * win; judgements on anything else, and values other than 'yes' and 'no', are ignored. Every entry tied on the highest
 * net (yes − no) wins, but only when that net is 1 or more. Shared by the server tally and the UI.
 */
export function tallyBallots(ballots: readonly Readonly<Record<string, unknown>>[], entryIds: readonly string[]): BallotTally {
  const ids = [...new Set(entryIds)];
  const yes: Record<string, number> = {};
  const no: Record<string, number> = {};
  for (const id of ids) {
    yes[id] = 0;
    no[id] = 0;
  }
  for (const ballot of ballots) {
    for (const id of ids) {
      const v = Object.prototype.hasOwnProperty.call(ballot, id) ? ballot[id] : undefined;
      if (v === 'yes') yes[id] += 1;
      else if (v === 'no') no[id] += 1;
    }
  }
  const net: Record<string, number> = {};
  for (const id of ids) net[id] = yes[id] - no[id];
  const top = Math.max(0, ...ids.map((id) => net[id]));
  const winners = top > 0 ? ids.filter((id) => net[id] === top) : [];
  return { yes, no, net, winners };
}

/** Whether `voter`'s ballot judges every entry that isn't theirs (true when there is nothing of anyone else's). */
export function ballotComplete(
  ballot: Readonly<Record<string, unknown>> | null | undefined,
  entries: readonly { id: string; uid: string }[],
  voter: string,
): boolean {
  return entries
    .filter((e) => e.uid !== voter)
    .every((e) => {
      const v = ballot && Object.prototype.hasOwnProperty.call(ballot, e.id) ? ballot[e.id] : undefined;
      return v === 'yes' || v === 'no';
    });
}

/** "1 vote", "5 votes"; for a yes/no count "3 yes · 1 no". */
export function votesText(count: { votes: number } | { yes: number; no: number }): string {
  if ('votes' in count) return `${count.votes} ${count.votes === 1 ? 'vote' : 'votes'}`;
  return `${count.yes} yes · ${count.no} no`;
}

/** One entry's result in words once the vote is counted ("2 votes", "3 yes · 1 no"); null before the tally. */
export function entryVotesText(
  quest: { tally?: GlobalQuest['tally']; yesNo?: GlobalQuest['yesNo']; voteStyle?: unknown },
  submissionId: string,
): string | null {
  if (!quest.tally) return null;
  if (voteStyleOf(quest) === 'yesno') {
    if (!quest.yesNo) return null;
    const r = quest.yesNo[submissionId];
    return votesText({ yes: r?.yes ?? 0, no: r?.no ?? 0 });
  }
  return votesText({ votes: quest.tally[submissionId] ?? 0 });
}
