// The eye (doubtful, −1) and the heart (credible, +1) on an entry, drawn as on the vote's polaroids. One of them is
// yours at most: tap the other to switch, the same again to take it back. The Log book's entries and the vote's
// polaroids cast the same feed vote (feed/{id}/reactions/{uid}, through useVoting), so their counts and the top entry
// agree. Your own entry shows its counts and no buttons. While agreeing with the verdict pays, the counts stay hidden
// until you've voted or the verdict is in (countsHidden), so nobody just follows the room; then the verdict shows.
import type { PointerEvent } from 'react';
import { useGame } from '../../../data/GameProvider';
import { useSession } from '../../../session/SessionProvider';
import { countsHidden, isYours, myVote, stampCounts, verdictFor, type Vote, type VotePost } from './logbook';
import type { Voting } from './LogbookParts';
import './marks.css';

export type MarkKind = 'eye' | 'heart';

/** Each mark: the vote it casts, what it means and its icon (on a 24 grid). Eye first, as on the deck: no on the left. */
export const MARKS: Record<MarkKind, { vote: Vote; label: string; d: string }> = {
  eye: { vote: -1, label: 'Eye', d: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0' },
  heart: { vote: 1, label: 'Heart', d: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z' },
};
const KINDS: MarkKind[] = ['eye', 'heart'];

export function MarkIcon({ kind }: { kind: MarkKind }) {
  return (
    <svg className={`vm-icon vm-icon--${kind}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d={MARKS[kind].d} />
    </svg>
  );
}

/**
 * "3 eye, 5 heart" as icons with their numbers (counts only: your own entry, the top card, a pinned polaroid), or a "?"
 * for each while they're hidden from you.
 */
export function MarkCounts({ up, down, hidden = false, className }: { up: number; down: number; hidden?: boolean; className?: string }) {
  return (
    <span className={`vm-counts${className ? ` ${className}` : ''}`} aria-label={hidden ? 'Counts hidden until you vote' : `${up} ${up === 1 ? 'heart' : 'hearts'}, ${down} ${down === 1 ? 'eye' : 'eyes'}`}>
      {KINDS.map((kind) => (
        <span key={kind} className={`vm-count vm-count--${kind}`} aria-hidden="true">
          <MarkIcon kind={kind} />
          {hidden ? '?' : kind === 'heart' ? up : down}
        </span>
      ))}
    </span>
  );
}

/** Whether `post`'s counts are hidden from the signed-in player (see countsHidden), with their vote laid over. */
export function useCountsHidden(post: VotePost | null, mine: Vote | null): boolean {
  const { user } = useSession();
  const { settings, state } = useGame();
  return post ? countsHidden(post, user?.uid ?? '', mine, { verdictPoints: settings.verdictPoints, ended: state.status === 'ended' }) : false;
}

/** The two buttons under an entry (or on a polaroid), or its counts when it's yours. */
export function VoteMarks({ post, voting, name }: { post: VotePost; voting: Voting; /** Whose entry, for the buttons' labels. */ name?: string }) {
  const { user, player } = useSession();
  const { settings } = useGame();
  const uid = user?.uid ?? '';
  const { up, down, mine } = stampCounts(post, uid, voting.pending);
  const hidden = useCountsHidden(post, myVote(post, uid, voting.pending));
  const verdictNote = <VerdictNote verdict={verdictFor(post, uid, settings.verdictPoints)} />;
  if (isYours(post, uid)) {
    return (
      <span className="vm vm--own">
        <span className="vm-own">Yours</span>
        <MarkCounts up={up} down={down} />
        {verdictNote}
      </span>
    );
  }
  const whose = name ? `${name}’s entry` : 'this entry';
  return (
    <span className="vm" role="group" aria-label={`A heart or an eye for ${whose}?${hidden ? ' The counts show once you pick.' : ''}`}>
      {KINDS.map((kind) => {
        const { vote, label } = MARKS[kind];
        const on = mine === vote;
        const count = kind === 'heart' ? up : down;
        return (
          <button
            key={kind}
            type="button"
            className={`vm-btn vm-btn--${kind}`}
            aria-pressed={on}
            aria-label={`${label}: ${whose}${hidden ? '' : `, ${count}`}${on ? '. Yours: tap to take it back' : ''}`}
            disabled={!player}
            // A card being dragged (the vote's deck) or a tab swipe must not start on the buttons.
            onPointerDown={(e: PointerEvent) => e.stopPropagation()}
            onClick={() => voting.cast(post, vote)}
          >
            <MarkIcon kind={kind} />
            <span>{hidden ? '?' : count}</span>
          </button>
        );
      })}
      {verdictNote}
    </span>
  );
}

/** Under an entry once its verdict is in: "Verdict ♥ · +1 to you", "Verdict 👁", or "No verdict". */
function VerdictNote({ verdict }: { verdict: { result: Vote | 0; paid: number } | null }) {
  if (!verdict) return null;
  if (verdict.result === 0) return <span className="vm-verdict">No verdict</span>;
  const kind: MarkKind = verdict.result === 1 ? 'heart' : 'eye';
  const paid = verdict.paid > 0 ? ` · +${verdict.paid} to you` : '';
  return (
    <span className={`vm-verdict vm-verdict--${kind}${paid ? ' is-mine' : ''}`} aria-label={`Verdict: the ${kind}${paid ? `, +${verdict.paid} to you` : ''}`}>
      <span aria-hidden="true">Verdict</span>
      <MarkIcon kind={kind} />
      {paid ? <span aria-hidden="true">{paid}</span> : null}
    </span>
  );
}
