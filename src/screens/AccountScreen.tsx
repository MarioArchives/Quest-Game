import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Loader } from '../components/Loader';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { useRewardSheet } from '../components/RewardSheet';
import { ProfileSheet } from '../components/ProfileSheet';
import { useGame } from '../data/GameProvider';
import { useQuery } from '../data/hooks';
import { useLocationSharing } from '../data/LocationProvider';
import { forgetThisDevice } from '../data/usePush';
import { useSession } from '../session/SessionProvider';
import { rerollAllowance, rerollsLeft as rerollsLeftFor, type LedgerEntry, type Quest } from '../shared';
import { AddEvidenceBanners } from './account/AddEvidenceBanners';
import { ClaimHistory } from './account/ClaimHistory';
import { Hand } from './account/Hand';
import { HouseRules } from './account/HouseRules';
import { LocationCard } from './account/LocationCard';
import { NotificationsCard } from './account/NotificationsCard';
import { PointsSummary } from './account/PointsSummary';
import { PoliceLineCard } from './account/PoliceLineCard';
import { StandingBadge } from './home/StandingBadge';
import { SideQuestEntries } from './account/SideQuestEntries';
import { WitnessRequests } from './account/WitnessRequests';
import './account/account.css';
import { features, t } from '../pack';

const STATUS_LABEL = { lobby: 'Waiting to start', active: 'Game live', paused: 'Game paused', ended: 'Game over' } as const;

/** Account: who you are, what your friends are waiting on you for, your hand, your history, your settings. */
export default function AccountScreen() {
  const { user, player, isAdmin, signOut } = useSession();
  const { me, settings, state, ready } = useGame();
  const reward = useRewardSheet();
  const { stopAndClear } = useLocationSharing();
  const navigate = useNavigate();
  const uid = user?.uid ?? null;
  const [profileOpen, setProfileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const quests = useQuery<Quest>(player && uid ? { path: `players/${uid}/quests` } : null);
  const ledger = useQuery<LedgerEntry>(player && uid ? { path: 'pointsLedger', where: [['uid', '==', uid]] } : null);
  const titleById = useMemo(() => new Map(quests.data.map((q) => [q.id, q.title])), [quests.data]);

  if (!ready) return <Loader className="app__loader" caption="Loading" />;

  const displayName = player?.displayName ?? user?.displayName ?? 'You';
  const rerollsLeft = player ? rerollsLeftFor(settings.rerollLimit, player) : 0;
  const rerollsTotal = player ? rerollAllowance(settings.rerollLimit, player) : settings.rerollLimit;

  const leave = async () => {
    setSigningOut(true);
    try {
      await stopAndClear();
      await forgetThisDevice();
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <>
      <section className="me" aria-label="Your profile">
        <Avatar name={displayName} src={player?.photoURL ?? user?.photoURL} size={68} you uid={uid ?? undefined} />
        <div className="me__text">
          <h2 className="me__name">{displayName}</h2>
          <p className="me__tags">
            <span className="tag tag--ink">{player ? (isAdmin ? `Player + ${t.gm.One}` : 'Player') : t.gm.One}</span>
            <span className="tag">{STATUS_LABEL[state.status]}</span>
            {player ? <StandingBadge points={player.points} /> : null}
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
                {rerollsLeft}/{rerollsTotal}
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
          {reward.pending ? (
            <section className="note" aria-label="Reward">
              <p>You have a reward waiting.</p>
              <Button small variant="primary" onClick={reward.open}>
                Use your reward
              </Button>
            </section>
          ) : null}
          <WitnessRequests />
          <AddEvidenceBanners titleById={titleById} />
          <Hand quests={quests.data} loading={quests.loading} rerollsLeft={rerollsLeft} />
          <ClaimHistory titleById={titleById} />
          {features.sideQuests ? <SideQuestEntries /> : null}
          {features.map ? <LocationCard /> : null}
          {features.police ? <PoliceLineCard /> : null}
          <NotificationsCard />
          <PointsSummary entries={ledger.data} loading={ledger.loading} />
        </>
      ) : (
        <p className="note">
          You&apos;re signed in as a {t.gm.One}, so you can run the game from the {t.gm.One} tab. To play as well, join as a player: {t.gm.Many} need no approval and
          your {t.quest.many} are dealt at once.
        </p>
      )}
      {!player && isAdmin ? <NotificationsCard gmOnly /> : null}

      <HouseRules />

      <Button block variant="ghost" busy={signingOut} icon={<Icon name="logout" size={18} />} onClick={() => void leave()}>
        Sign out
      </Button>

      {profileOpen ? <ProfileSheet onClose={() => setProfileOpen(false)} /> : null}
    </>
  );
}

