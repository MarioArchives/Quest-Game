import { Link, useNavigate } from 'react-router';
import { Loader } from '../components/Loader';
import { Icon } from '../components/Icon';
import { useGame } from '../data/GameProvider';
import { useNow } from '../data/hooks';
import { useSession } from '../session/SessionProvider';
import { FeedPost } from './home/FeedPost';
import { RanksStrip } from './home/RanksStrip';
import { CheckinCards } from './home/CheckinCard';
import { PoliceCallCard } from './home/PoliceCallCard';
import { SideQuestCards } from './home/SideQuestCard';
import './home/home.css';
import { features, t } from '../pack';

/** Home: the game as a social feed. Ranks on top, the pinned announcement, the side quest, then everything that happened. */
export default function Dashboard() {
  const { ready, feed: feedPosts, feedLoading, feedError } = useGame();
  const now = useNow(30_000);
  const navigate = useNavigate();

  if (!ready) return <Loader className="app__loader" caption="Loading" />;

  return (
    <>
      <RanksStrip onSelect={(uid) => navigate(`/player/${uid}`)} />

      <HomeBanners />

      {features.police ? <PoliceCallCard /> : null}
      {features.checkins ? <CheckinCards /> : null}
      {features.sideQuests ? <SideQuestCards /> : null}

      <section aria-labelledby="feed-title">
        <div className="section-head">
          <h2 id="feed-title">Feed</h2>
          <span className="section-head__meta">Newest first</span>
        </div>
        {feedError ? (
          <p className="note note--error" role="alert">
            Couldn&apos;t load the feed.
          </p>
        ) : feedLoading ? null : feedPosts.length === 0 ? (
          <div className="empty">
            <h3>Quiet so far</h3>
            <p>Nothing has happened yet. The first {t.claim.one} will show up here.</p>
          </div>
        ) : (
          <ul className="feed">
            {feedPosts.map((item) => (
              <FeedPost key={item.id} item={item} now={now} />
            ))}
          </ul>
        )}
      </section>

    </>
  );
}

/** What sits above the side quest on Home: the GM's "playing too?", the pinned announcement, game status and "you have left". */
export function HomeBanners() {
  const { player, isAdmin, joinRequest } = useSession();
  const { state, me } = useGame();
  return (
    <>
    {isAdmin && !player ? (
      <aside className="banner" aria-label="Play as well">
        <Icon name="user" size={22} />
        <p>
          {joinRequest?.status === 'pending' ? (
            <>
              <strong>Joining the game…</strong> Your {t.quest.many} are being dealt.
            </>
          ) : (
            <>
              <strong>Playing too?</strong> {t.gm.Many} need no approval: join as a player and your {t.quest.many} are dealt at once. <Link to="/join">Join the game</Link>
            </>
          )}
        </p>
      </aside>
    ) : null}

    {state.announcement ? (
      <aside className="announce" aria-label={`${t.gm.One} announcement`}>
        <Icon name="megaphone" size={22} />
        <p>
          <span className="announce__label">Pinned from the {t.gm.One}</span>
          {state.announcement}
        </p>
      </aside>
    ) : null}

    {state.status !== 'active' ? <StatusBanner status={state.status} /> : null}

    {me?.left ? (
      <aside className="banner" aria-label="You have left" role="status">
        <Icon name="logout" size={22} />
        <p>
          <strong>The {t.gm.One} has marked you as having left.</strong>{' '}
          {me.left === 'frozen' ? 'Your score is frozen. ' : ''}Ask the {t.gm.One} to bring you back if you want to play again.
        </p>
      </aside>
    ) : null}
    </>
  );
}

function StatusBanner({ status }: { status: 'lobby' | 'paused' | 'ended' | 'active' }) {
  if (status === 'ended') {
    return (
      <aside className="banner banner--ended" aria-label="Game status">
        <Icon name="wrap" size={22} />
        <p>
          <strong>The game has ended.</strong> <Link to="/wrap">See your {t.wrap.one.toLowerCase()}</Link>
        </p>
      </aside>
    );
  }
  if (status === 'paused') {
    return (
      <aside className="banner" aria-label="Game status" role="status">
        <Icon name="gm" size={22} />
        <p>
          <strong>Game paused.</strong> {features.guesses ? `${t.claim.Many} and guesses` : t.claim.Many} are on hold until the {t.gm.One} resumes.
        </p>
      </aside>
    );
  }
  return (
    <aside className="banner" aria-label="Game status" role="status">
      <Icon name="gm" size={22} />
      <p>
        <strong>Waiting for the {t.gm.One} to start.</strong> Your secret {t.quest.many} unlock the moment the game begins.
      </p>
    </aside>
  );
}
