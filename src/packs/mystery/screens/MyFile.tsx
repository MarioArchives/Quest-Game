// My file as a case file (E4·1): witness requests first, as tags asking for your word; your suspect folder (the
// classification band for your standing, police tape while your check-in is open, mugshot, case number, character,
// stats, your particulars from the booking desk, the sealed motive); a pending reward; your tampering missions on a
// line, one kraft tag at a time (MissionLine); the exhibits folder of clipped prints; then the engine's working cards
// as folders.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Avatar } from '../../../components/Avatar';
import { Button } from '../../../components/Button';
import { Icon } from '../../../components/Icon';
import { Loader } from '../../../components/Loader';
import { ProfileSheet } from '../../../components/ProfileSheet';
import { useRewardSheet } from '../../../components/RewardSheet';
import { useGame } from '../../../data/GameProvider';
import { tsMs, useQuery } from '../../../data/hooks';
import { useLocationSharing } from '../../../data/LocationProvider';
import { forgetThisDevice } from '../../../data/usePush';
import { exhibitsFor } from '../../../lib/exhibits';
import { features, t } from '../../../pack';
import { AddEvidenceBanners } from '../../../screens/account/AddEvidenceBanners';
import { ClaimHistory } from '../../../screens/account/ClaimHistory';
import { LocationCard } from '../../../screens/account/LocationCard';
import { NotificationsCard } from '../../../screens/account/NotificationsCard';
import { PoliceLineCard } from '../../../screens/account/PoliceLineCard';
import { SideQuestEntries } from '../../../screens/account/SideQuestEntries';
import { RequestCard } from '../../../screens/account/WitnessRequests';
import { characterLine } from '../../../screens/player/PlayerTicket';
import { useSession } from '../../../session/SessionProvider';
import { rerollAllowance, rerollsLeft as rerollsLeftFor, type Quest } from '../../../shared';
import { Folder, Stamp, Strung, Tag, TagTop, tiltFor } from './CaseKit';
import { ExhibitsFolder, ParticularsSlip, PoliceTape, SealedNote, StandingBand, Stat, SuspectHead, TopStrip } from './FileParts';
import { MissionLine } from './MissionLine';
import '../../../screens/account/account.css';
import './myfile.css';

const firstName = (name?: string | null) => (name ?? '').trim().split(/\s+/)[0] ?? '';

export default function MyFile() {
  const { user, player, isAdmin, signOut } = useSession();
  const { me, settings, ready, players, myMotive, myGuesses, mySubmissions, globalQuests, witnessRequests } = useGame();
  const reward = useRewardSheet();
  const { stopAndClear } = useLocationSharing();
  const navigate = useNavigate();
  const uid = user?.uid ?? null;
  const [profileOpen, setProfileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const quests = useQuery<Quest>(player && uid ? { path: `players/${uid}/quests` } : null);
  const titleById = useMemo(() => new Map(quests.data.map((q) => [q.id, q.title])), [quests.data]);
  const hand = useMemo(
    () => [...quests.data].filter((q) => q.status !== 'replaced').sort((a, b) => tsMs(a.assignedAt) - tsMs(b.assignedAt) || a.title.localeCompare(b.title)),
    [quests.data],
  );

  if (!ready) return <Loader className="app__loader" caption="Loading" />;

  const displayName = player?.displayName ?? user?.displayName ?? 'You';
  const photo = player?.photoURL ?? user?.photoURL ?? null;
  const rerollsLeft = player ? rerollsLeftFor(settings.rerollLimit, player) : 0;
  const rerollsTotal = player ? rerollAllowance(settings.rerollLimit, player) : settings.rerollLimit;
  const character = features.characters ? player?.character : null;
  const charName = character?.name?.trim() || displayName;
  const exhibits = uid ? exhibitsFor(uid, mySubmissions, globalQuests) : [];

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
    <div className="mf">
      <TopStrip />

      {player ? (
        <>
          {/* Someone waiting on you as their witness comes first. */}
          {witnessRequests.length > 0 ? (
            <Strung className="mf-witness" label={`${t.witness.One} requests`}>
              {witnessRequests.map((request) => (
                <Tag key={request.id} tilt={tiltFor(request.id)}>
                  <TagTop left={`${t.witness.One} request`} right={`${witnessRequests.length} waiting`} />
                  <Stamp tone="bad">Needs your word</Stamp>
                  <p className="mf-wnote">
                    Only approve what you really saw. Rejecting costs them {settings.rejectPenalty} and swaps their {t.quest.one}.
                  </p>
                  <RequestCard request={request} as="div" />
                </Tag>
              ))}
            </Strung>
          ) : null}

          <Folder tab={`Suspect file · ${firstName(displayName)}`} clip="tab" label="Your profile" className="mf-suspect">
            <StandingBand points={player.points} left={!!player.left} />
            <PoliceTape />
            <SuspectHead
              photo={photo}
              name={charName}
              displayName={displayName}
              uid={uid ?? ''}
              line={character ? `${characterLine({ name: character.name, role: character.role })} · played by ${firstName(displayName)}` : displayName}
              onEditPhoto={() => setProfileOpen(true)}
            />
            <dl className={`mf-stats${features.guesses ? '' : ' mf-stats--two'}`}>
              <Stat label="Score" score negative={(player.points ?? 0) < 0}>
                {player.points ?? 0}
              </Stat>
              <Stat label="Rank">
                {me ? me.rank : '-'}
                <small>/{players.length}</small>
              </Stat>
              {features.guesses ? (
                <Stat label="Guesses">
                  {myGuesses.length}
                  {settings.guessLimit > 0 ? <small>/{settings.guessLimit}</small> : null}
                </Stat>
              ) : null}
            </dl>
            <ParticularsSlip uid={uid ?? ''} particulars={player.particulars} />
            {features.characters ? (
              <SealedNote label="Motive · not for the record">
                {myMotive?.text ? <p className="mf-sealed__text">{myMotive.text}</p> : <p className="mf-sealed__text mf-sealed__text--none">The GM hasn&apos;t given you a motive yet.</p>}
                {myMotive?.text && myMotive.byUid ? (
                  <p className="mf-sealed__by">Written by {players.find((p) => p.id === myMotive.byUid)?.displayName ?? 'another player'}</p>
                ) : null}
              </SealedNote>
            ) : null}
          </Folder>

          {reward.pending ? (
            <Strung label="Reward">
              <Tag>
                <TagTop left="Reward" right="Yours to use" />
                <Stamp tone="good">Evidence secured</Stamp>
                <p className="cf-text">You have a choice waiting: destroy it or frame someone.</p>
                <button type="button" className="cf-btn cf-btn--go" onClick={reward.open}>
                  Choose
                </button>
              </Tag>
            </Strung>
          ) : null}

          {quests.loading ? (
            <Loader className="app__loader" caption="Dealing" />
          ) : (
            <MissionLine uid={uid ?? ''} hand={hand} rerollsLeft={rerollsLeft} rerollsTotal={rerollsTotal} />
          )}

          <ExhibitsFolder
            exhibits={exhibits}
            empty="No exhibits yet. Photos from group missions you enter are filed here."
            action={
              <Link to="/" className="mf-link">
                + Photo
              </Link>
            }
          />

          <div className="mf-card mf-work">
            <AddEvidenceBanners titleById={titleById} />
          </div>
          <div className="mf-card mf-work">
            <ClaimHistory titleById={titleById} />
          </div>
          {features.sideQuests ? (
            <div className="mf-card mf-work">
              <SideQuestEntries />
            </div>
          ) : null}
          {features.map ? (
            <div className="mf-card mf-work">
              <LocationCard />
            </div>
          ) : null}
          {features.police && settings.policePhone ? (
            <div className="mf-card mf-work">
              <PoliceLineCard />
            </div>
          ) : null}
          <div className="mf-card mf-work">
            <NotificationsCard />
          </div>
        </>
      ) : (
        <section className="mf-card">
          <p>
            You&apos;re signed in as the {t.gm.One}, so you can run the game from the {t.gm.One} tab. To play as well, join as a player: {t.gm.Many} need no approval and your{' '}
            {t.quest.many} are dealt at once.
          </p>
          {isAdmin ? (
            <Button small variant="primary" icon={<Icon name="user" size={16} strokeWidth={2.4} />} onClick={() => navigate('/join')}>
              Join as a player
            </Button>
          ) : null}
        </section>
      )}
      {!player && isAdmin ? (
        <div className="mf-card mf-work">
          <NotificationsCard gmOnly />
        </div>
      ) : null}

      <section className="mf-card mf-profile" aria-label="Account">
        <div className="mf-profile__who">
          <Avatar name={displayName} src={photo} size={44} uid={uid ?? undefined} />
          <div>
            <div className="mf-profile__name">{displayName}</div>
            {user?.email ? <div className="mf-muted">{user.email}</div> : null}
          </div>
        </div>
        <div className="mf-profile__actions">
          {player ? (
            <Button small icon={<Icon name="edit" size={16} strokeWidth={2.4} />} onClick={() => setProfileOpen(true)}>
              Edit name
            </Button>
          ) : null}
          <Button small variant="ghost" busy={signingOut} icon={<Icon name="logout" size={18} />} onClick={() => void leave()}>
            Sign out
          </Button>
        </div>
      </section>

      {profileOpen ? <ProfileSheet onClose={() => setProfileOpen(false)} /> : null}
    </div>
  );
}
