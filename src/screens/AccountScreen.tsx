import { collection, query, where } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { AshtonLoader } from '../components/AshtonLoader';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { ProfileSheet } from '../components/ProfileSheet';
import { useGame } from '../data/GameProvider';
import { useCollection } from '../data/hooks';
import { useLocationSharing } from '../data/LocationProvider';
import { db } from '../firebase';
import { useSession } from '../session/SessionProvider';
import type { LedgerEntry, Quest } from '../shared';
import { AddEvidenceBanners } from './account/AddEvidenceBanners';
import { ClaimHistory } from './account/ClaimHistory';
import { Hand } from './account/Hand';
import { HouseRules } from './account/HouseRules';
import { LocationCard } from './account/LocationCard';
import { PointsSummary } from './account/PointsSummary';
import { SideQuestEntries } from './account/SideQuestEntries';
import { WitnessRequests } from './account/WitnessRequests';
import './account/account.css';

const STATUS_LABEL = { lobby: 'Waiting to start', active: 'Game live', paused: 'Game paused', ended: 'Game over' } as const;

/** Account: who you are, what your friends are waiting on you for, your hand, your history, your settings. */
export default function AccountScreen() {
  const { user, player, isAdmin, signOut } = useSession();
  const { me, settings, state, ready } = useGame();
  const { stopAndClear } = useLocationSharing();
  const navigate = useNavigate();
  const uid = user?.uid ?? null;
  const [profileOpen, setProfileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const quests = useCollection<Quest>(player && uid ? `quests:${uid}` : null, () => collection(db, 'players', uid!, 'quests'));
  const ledger = useCollection<LedgerEntry>(player && uid ? `ledger:${uid}` : null, () =>
    query(collection(db, 'pointsLedger'), where('uid', '==', uid)),
  );
  const titleById = useMemo(() => new Map(quests.data.map((q) => [q.id, q.title])), [quests.data]);

  if (!ready) return <AshtonLoader className="app__loader" caption="Loading" />;

  const displayName = player?.displayName ?? user?.displayName ?? 'You';
  const rerollsLeft = player ? Math.max(0, settings.rerollLimit - (player.rerollsUsed ?? 0)) : 0;

  const leave = async () => {
    setSigningOut(true);
    try {
      await stopAndClear();
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <>
      <section className="me" aria-label="Your profile">
        <Avatar name={displayName} src={player?.photoURL ?? user?.photoURL} size={68} you />
        <div className="me__text">
          <h2 className="me__name">{displayName}</h2>
          <p className="me__tags">
            <span className="tag tag--ink">{player ? (isAdmin ? 'Player + GM' : 'Player') : 'GM'}</span>
            <span className="tag">{STATUS_LABEL[state.status]}</span>
          </p>
          {user?.email ? <p className="me__email">{user.email}</p> : null}
        </div>
        {player ? (
          <dl className="me__stats">
            <div>
              <dt>Rank</dt>
              <dd>{me ? `#${me.rank}` : '-'}</dd>
            </div>
            <div>
              <dt>Points</dt>
              <dd>{player.points}</dd>
            </div>
            <div>
              <dt>Rerolls</dt>
              <dd>
                {rerollsLeft}/{settings.rerollLimit}
              </dd>
            </div>
          </dl>
        ) : null}
        <div className="me__actions">
          {player ? (
            <Button small icon={<Icon name="edit" size={16} strokeWidth={2.4} />} onClick={() => setProfileOpen(true)}>
              Edit profile
            </Button>
          ) : isAdmin ? (
            <Button small icon={<Icon name="user" size={16} strokeWidth={2.4} />} onClick={() => navigate('/join')}>
              Join as a player
            </Button>
          ) : null}
        </div>
      </section>

      {player ? (
        <>
          <WitnessRequests />
          <AddEvidenceBanners titleById={titleById} />
          <Hand quests={quests.data} loading={quests.loading} rerollsLeft={rerollsLeft} />
          <ClaimHistory titleById={titleById} />
          <SideQuestEntries />
          <LocationCard />
          <PointsSummary entries={ledger.data} loading={ledger.loading} />
        </>
      ) : (
        <p className="note">
          You&apos;re signed in as a GM, so you can run the game from the GM tab. To play as well, join as a player: GMs need no approval and
          your quests are dealt at once.
        </p>
      )}

      <HouseRules />

      <Button block variant="ghost" busy={signingOut} icon={<Icon name="logout" size={18} />} onClick={() => void leave()}>
        Sign out
      </Button>

      {profileOpen ? <ProfileSheet onClose={() => setProfileOpen(false)} /> : null}
    </>
  );
}

