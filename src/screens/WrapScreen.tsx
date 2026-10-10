import { collection } from 'firebase/firestore';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { AshtonLoader } from '../components/AshtonLoader';
import { useGame } from '../data/GameProvider';
import { useCollection, useDocument } from '../data/hooks';
import { db } from '../firebase';
import { useSession } from '../session/SessionProvider';
import type { Doc, FinalStandings, Standing, Wrap } from '../shared';
import {
  AwardCard,
  CompletedCard,
  DetectiveCard,
  ExposedCard,
  HandCard,
  MissingWrapCard,
  RankCard,
  RerollsCard,
  SeriesCard,
  SideQuestsCard,
  TopPhotoCard,
  VenuesCard,
} from './wrap/cards';
import { HandsCard, PodiumCard } from './wrap/Finale';
import { WrapStory, type StoryCard } from './wrap/WrapStory';
import './wrap/wrap.css';

/** Standings from the finished wraps, for when game/final cannot be read. */
function standingsFromWraps(wraps: Doc<Wrap>[]): Standing[] {
  return wraps
    .map((w) => ({ uid: w.uid, displayName: w.displayName, photoURL: w.photoURL, points: w.points, rank: w.rank }))
    .sort((a, b) => a.rank - b.rank || b.points - a.points || a.displayName.localeCompare(b.displayName));
}

function Notice({ title, children }: { title: string; children: string }) {
  return (
    <section className="wrap-notice halftone" aria-label="Wrap">
      <p className="eyebrow">Festival Quest &middot; Wrap</p>
      <h2 className="wrap-notice__title">{title}</h2>
      <p className="wrap-notice__note">{children}</p>
      <Link to="/" className="btn btn--primary btn--on-red">
        Back to the game
      </Link>
    </section>
  );
}

export default function WrapScreen() {
  const { user, player } = useSession();
  const { state, ready, settings } = useGame();
  const uid = user?.uid ?? null;
  const ended = state.status === 'ended';
  const isPlayer = Boolean(player);

  const mine = useDocument<Wrap>(ended && isPlayer && uid ? `wraps/${uid}` : null);
  const final = useDocument<FinalStandings>(ended ? 'game/final' : null);
  const all = useCollection<Wrap>(ended ? 'wraps:all' : null, () => collection(db, 'wraps'));

  const cards = useMemo<StoryCard[]>(() => {
    const out: StoryCard[] = [];
    const wrap = mine.data;
    const wraps = [...all.data].sort((a, b) => a.rank - b.rank || b.points - a.points || a.displayName.localeCompare(b.displayName));
    const standings = final.data?.standings?.length ? final.data.standings : standingsFromWraps(wraps);

    if (wrap) {
      const tiedWith = standings.filter((s) => s.rank === wrap.rank && s.uid !== wrap.uid).map((s) => s.displayName);
      out.push(
        { id: 'rank', label: 'Rank and points', body: <RankCard wrap={wrap} tiedWith={tiedWith} /> },
        { id: 'points-over-time', label: 'Your points across the night', body: <SeriesCard wrap={wrap} /> },
        { id: 'quests', label: 'Quests completed', body: <CompletedCard wrap={wrap} /> },
        { id: 'side-quests', label: 'Side quests won', body: <SideQuestsCard wrap={wrap} /> },
        { id: 'hand', label: 'Your secret hand, revealed', body: <HandCard wrap={wrap} /> },
        { id: 'detective', label: 'Detective stats', body: <DetectiveCard wrap={wrap} /> },
        { id: 'exposed', label: 'Exposed by', body: <ExposedCard wrap={wrap} /> },
        { id: 'top-photo', label: 'Your most-reacted photo', body: <TopPhotoCard wrap={wrap} /> },
      );
      // Quests no longer depend on a place, so this card only appears if the wrap has venues to list.
      if ((wrap.venues?.length ?? 0) > 0) {
        out.push({ id: 'venues', label: 'Venues you posted from', body: <VenuesCard wrap={wrap} /> });
      }
      out.push(
        { id: 'rerolls', label: 'Rerolls used', body: <RerollsCard wrap={wrap} limit={settings.rerollLimit} /> },
        { id: 'award', label: 'Your award', body: <AwardCard wrap={wrap} /> },
      );
    } else if (isPlayer) {
      out.push({ id: 'not-ready', label: 'Your wrap is not ready', body: <MissingWrapCard /> });
    }

    if (standings.length > 0) {
      out.push({ id: 'podium', label: 'The podium', body: <PodiumCard standings={standings} meUid={uid} /> });
    }
    const hands = wraps.length > 0 ? wraps : wrap ? [{ ...wrap, id: wrap.uid }] : [];
    if (hands.length > 0) {
      out.push({ id: 'all-hands', label: "Everyone's final hand", body: <HandsCard wraps={hands} meUid={uid} /> });
    }
    return out;
  }, [mine.data, all.data, final.data, isPlayer, uid, settings.rerollLimit]);

  if (!ready) return <AshtonLoader className="app__loader" caption="Loading" />;

  if (!ended) {
    return (
      <Notice title="Not yet">
        Your wrap opens the moment the GM ends the game. Keep snapping, keep guessing, and see where you finish.
      </Notice>
    );
  }

  const loading = mine.loading || final.loading || all.loading;
  if (loading) return <AshtonLoader className="app__loader" caption="Printing your wrap" />;

  if (cards.length === 0) {
    const failed = mine.error || final.error || all.error;
    return (
      <Notice title={failed ? "Can't load it" : 'Nothing here'}>
        {failed
          ? "The wrap couldn't be loaded. Check your signal and reload the page."
          : "There's no wrap to show for this game yet."}
      </Notice>
    );
  }

  return <WrapStory cards={cards} />;
}
