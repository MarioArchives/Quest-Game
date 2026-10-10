import { collection, limit, orderBy, query } from 'firebase/firestore';
import { useState } from 'react';
import { Link } from 'react-router';
import { AshtonLoader } from '../components/AshtonLoader';
import { Icon } from '../components/Icon';
import { useGame } from '../data/GameProvider';
import { useCollection, useNow } from '../data/hooks';
import { db } from '../firebase';
import { useSession } from '../session/SessionProvider';
import type { FeedItem } from '../shared';
import { FeedPost } from './home/FeedPost';
import { PlayerSheet } from './home/PlayerSheet';
import { RanksStrip } from './home/RanksStrip';
import { SideQuestCards } from './home/SideQuestCard';
import './home/home.css';

const FEED_LIMIT = 50;

/** Home: the festival as a social feed. Ranks on top, the pinned announcement, the side quest, then everything that happened. */
export default function Dashboard() {
  const { player, isAdmin, joinRequest } = useSession();
  const { state, ready, players } = useGame();
  const feed = useCollection<FeedItem>('feed:latest', () => query(collection(db, 'feed'), orderBy('createdAt', 'desc'), limit(FEED_LIMIT)));
  const now = useNow(30_000);
  const [selected, setSelected] = useState<string | null>(null);

  if (!ready) return <AshtonLoader className="app__loader" caption="Loading" />;

  const chosen = selected ? players.find((p) => p.id === selected) : undefined;

  return (
    <>
      <RanksStrip onSelect={setSelected} />

      {isAdmin && !player ? (
        <aside className="banner" aria-label="Play as well">
          <Icon name="user" size={22} />
          <p>
            {joinRequest?.status === 'pending' ? (
              <>
                <strong>Joining the game…</strong> Your quests are being dealt.
              </>
            ) : (
              <>
                <strong>Playing too?</strong> GMs need no approval: join as a player and your quests are dealt at once. <Link to="/join">Join the game</Link>
              </>
            )}
          </p>
        </aside>
      ) : null}

      {state.announcement ? (
        <aside className="announce" aria-label="GM announcement">
          <Icon name="megaphone" size={22} />
          <p>
            <span className="announce__label">Pinned from the GM</span>
            {state.announcement}
          </p>
        </aside>
      ) : null}

      {state.status !== 'active' ? <StatusBanner status={state.status} /> : null}

      <SideQuestCards />

      <section aria-labelledby="feed-title">
        <div className="section-head">
          <h2 id="feed-title">Feed</h2>
          <span className="section-head__meta">Newest first</span>
        </div>
        {feed.error ? (
          <p className="note note--error" role="alert">
            Couldn&apos;t load the feed.
          </p>
        ) : feed.loading ? null : feed.data.length === 0 ? (
          <div className="empty">
            <h3>Quiet so far</h3>
            <p>Nothing has happened yet. The first claim will show up here.</p>
          </div>
        ) : (
          <ul className="feed">
            {feed.data.map((item) => (
              <FeedPost key={item.id} item={item} now={now} />
            ))}
          </ul>
        )}
      </section>

      {chosen ? <PlayerSheet player={chosen} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

function StatusBanner({ status }: { status: 'lobby' | 'paused' | 'ended' | 'active' }) {
  if (status === 'ended') {
    return (
      <aside className="banner banner--ended" aria-label="Game status">
        <Icon name="wrap" size={22} />
        <p>
          <strong>The game has ended.</strong> <Link to="/wrap">See your wrap</Link>
        </p>
      </aside>
    );
  }
  if (status === 'paused') {
    return (
      <aside className="banner" aria-label="Game status" role="status">
        <Icon name="gm" size={22} />
        <p>
          <strong>Game paused.</strong> Claims and guesses are on hold until the GM resumes.
        </p>
      </aside>
    );
  }
  return (
    <aside className="banner" aria-label="Game status" role="status">
      <Icon name="gm" size={22} />
      <p>
        <strong>Waiting for the GM to start.</strong> Your secret quests unlock the moment the game begins.
      </p>
    </aside>
  );
}
