// My file as a case file (E4·1): witness requests first, as tags asking for your word; your suspect folder (mugshot,
// case number, character, stats, the sealed motive); a pending reward; your tampering missions strung up as kraft
// tags whose states are stamps; the exhibits folder of clipped prints; then the engine's working cards as folders.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { rerollQuest } from '../../../api';
import { Avatar } from '../../../components/Avatar';
import { Button } from '../../../components/Button';
import { ChangeWitnessSheet } from '../../../components/ChangeWitnessSheet';
import { ClaimSheet } from '../../../components/ClaimSheet';
import { ConfirmSheet } from '../../../components/ConfirmSheet';
import { Icon } from '../../../components/Icon';
import { Loader } from '../../../components/Loader';
import { ProfileSheet } from '../../../components/ProfileSheet';
import { useRewardSheet } from '../../../components/RewardSheet';
import { useToast } from '../../../components/Toast';
import { useGame } from '../../../data/GameProvider';
import { tsMs, useQuery } from '../../../data/hooks';
import { clockTime } from '../../../lib/time';
import { useLocationSharing } from '../../../data/LocationProvider';
import { forgetThisDevice } from '../../../data/usePush';
import { exhibitsFor } from '../../../lib/exhibits';
import { features, t, zone } from '../../../pack';
import { AddEvidenceBanners } from '../../../screens/account/AddEvidenceBanners';
import { ClaimHistory } from '../../../screens/account/ClaimHistory';
import { LocationCard } from '../../../screens/account/LocationCard';
import { NotificationsCard } from '../../../screens/account/NotificationsCard';
import { SideQuestEntries } from '../../../screens/account/SideQuestEntries';
import { RequestCard } from '../../../screens/account/WitnessRequests';
import { characterLine } from '../../../screens/player/PlayerTicket';
import { useSession } from '../../../session/SessionProvider';
import { rerollAllowance, rerollsLeft as rerollsLeftFor, type Doc, type Quest } from '../../../shared';
import { missionTag, splitProof, type MissionTag } from '../dossier';
import { Folder, Stamp, Strung, Tag, TagTop, tiltFor, type StampTone } from './CaseKit';
import { ExhibitsFolder, SealedNote, Stat, StandingStamp, SuspectHead, TopStrip } from './FileParts';
import '../../../screens/account/account.css';
import './myfile.css';

const firstName = (name?: string | null) => (name ?? '').trim().split(/\s+/)[0] ?? '';

/** A mission's state as the stamp on its tag. */
const STAMP: Record<MissionTag['tone'], { tone: StampTone; label: string }> = {
  done: { tone: 'good', label: 'Done' },
  pending: { tone: 'warm', label: `With your ${t.witness.one}` },
  open: { tone: 'plain', label: 'To do' },
  exposed: { tone: 'bad', label: 'Exposed' },
};

export default function MyFile() {
  const { user, player, isAdmin, signOut } = useSession();
  const { me, settings, state, ready, players, playersById, myMotive, myGuesses, mySubmissions, globalQuests, witnessRequests } = useGame();
  const reward = useRewardSheet();
  const toast = useToast();
  const { stopAndClear } = useLocationSharing();
  const navigate = useNavigate();
  const uid = user?.uid ?? null;
  const [profileOpen, setProfileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [claiming, setClaiming] = useState<Doc<Quest> | null>(null);
  const [rerolling, setRerolling] = useState<Doc<Quest> | null>(null);
  const [repicking, setRepicking] = useState<string | null>(null);

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
  const gameActive = state.status === 'active';
  const character = features.characters ? player?.character : null;
  const charName = character?.name?.trim() || displayName;
  const exhibits = uid ? exhibitsFor(uid, mySubmissions, globalQuests) : [];
  const repick = repicking ? mySubmissions.find((s) => s.id === repicking && s.status === 'pending') : undefined;

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

  const infoFor = (quest: Doc<Quest>) => {
    const sub = quest.submissionId ? mySubmissions.find((s) => s.id === quest.submissionId) : mySubmissions.find((s) => s.kind === 'personal' && s.questId === quest.id);
    if (quest.status === 'done') {
      return { witnessName: firstName(playersById.get(sub?.reviewedBy ?? sub?.witnessUid ?? '')?.displayName), points: sub?.pointsAwarded ?? quest.points ?? settings.questPoints };
    }
    if (quest.status === 'submitted') {
      const pending = mySubmissions.find((s) => s.kind === 'personal' && s.questId === quest.id && s.status === 'pending');
      return { witnessName: firstName(playersById.get(pending?.witnessUid ?? '')?.displayName) };
    }
    return { exposedByName: firstName(playersById.get(quest.exposedBy ?? '')?.displayName), exposePenalty: settings.exposePenalty };
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
            <SuspectHead
              photo={photo}
              name={charName}
              displayName={displayName}
              uid={uid ?? ''}
              line={character ? `${characterLine({ name: character.name, role: character.role })} · played by ${firstName(displayName)}` : displayName}
              onEditPhoto={() => setProfileOpen(true)}
            >
              <StandingStamp points={player.points} />
            </SuspectHead>
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
            {features.characters ? (
              <SealedNote label="Motive · not for the record">
                {myMotive?.text ? <p className="mf-sealed__text">{myMotive.text}</p> : <p className="mf-sealed__text mf-sealed__text--none">The GM hasn&apos;t given you a motive yet.</p>}
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

          <div className="mf-group">
            <Folder tab={`${t.quest.Many} · ${rerollsLeft} ${rerollsLeft === 1 ? 'reroll' : 'rerolls'} left`} clip={false} label={t.quest.Many}>
              <p className="mf-desc" title={`${rerollsLeft} of ${rerollsTotal} rerolls left`}>
                Strung up in the order they were dealt. Send one to your {t.witness.one} when it&apos;s done.
              </p>
              {!gameActive ? (
                <p className="mf-desc mf-missions__note" role="status">
                  {state.status === 'lobby'
                    ? `The game hasn't started yet. ${t.claim.Many} open when the ${t.gm.One} starts.`
                    : state.status === 'paused'
                      ? `The game is paused. ${t.claim.Many} open again when the ${t.gm.One} resumes.`
                      : `The game has ended. No more ${t.claim.many}.`}
                </p>
              ) : null}
            </Folder>
            {quests.loading ? (
              <Loader className="app__loader" caption="Dealing" />
            ) : hand.length === 0 ? (
              <p className="mf-quiet">None in hand. Ask the {t.gm.One} if this looks wrong.</p>
            ) : (
              <Strung label={t.quest.Many} className="mf-missions">
                {hand.map((quest, i) => {
                  const info = infoFor(quest);
                  const tag = missionTag(quest, info);
                  if (!tag) return null;
                  const sub = quest.submissionId ? mySubmissions.find((x) => x.id === quest.submissionId) : undefined;
                  const pending = quest.status === 'submitted' ? mySubmissions.find((x) => x.kind === 'personal' && x.questId === quest.id && x.status === 'pending') : undefined;
                  const who = ('witnessName' in info ? info.witnessName : null) || ('exposedByName' in info ? info.exposedByName : null);
                  const stamp = STAMP[tag.tone];
                  const label =
                    tag.tone === 'done' && who
                      ? `${tag.tag} ${stamp.label} · ${who} saw it`
                      : tag.tone === 'pending' && who
                        ? `${tag.tag} ${stamp.label} · ${who}`
                        : tag.tone === 'exposed' && who
                          ? `${tag.tag} ${stamp.label} by ${who}`
                          : `${tag.tag} ${stamp.label}`;
                  const at =
                    tag.tone === 'done'
                      ? tsMs(sub?.reviewedAt ?? null)
                      : tag.tone === 'pending'
                        ? tsMs(pending?.createdAt ?? null)
                        : tag.tone === 'exposed'
                          ? tsMs(quest.exposedAt ?? null)
                          : 0;
                  const when = tag.tone === 'open' ? 'Open' : at ? `${tag.tone === 'pending' ? 'Sent ' : ''}${clockTime(at, zone)}` : '';
                  const { what, proof } = splitProof(quest.description ?? '');
                  const pts = tag.tone === 'done' && 'points' in info && info.points != null ? `+${info.points}` : tag.tone === 'exposed' && settings.exposePenalty ? `−${settings.exposePenalty}` : null;
                  return (
                    <Tag key={quest.id} tilt={tiltFor(quest.id)} rowClassName={`mf-mission mf-mission--${tag.tone}`}>
                      <TagTop left={`No. ${i + 1} · ${quest.title}`} right={when} />
                      <Stamp tone={stamp.tone}>{label}</Stamp>
                      <p className={`cf-text${tag.tone === 'exposed' ? ' is-struck' : ''}`}>{what || quest.title}</p>
                      {proof && (tag.tone === 'open' || tag.tone === 'pending') ? (
                        <details className="mf-mission__more">
                          <summary>Proof</summary>
                          <p>{proof}</p>
                        </details>
                      ) : null}
                      {pending ? (
                        <button type="button" className="mf-link mf-link--btn" onClick={() => setRepicking(pending.id)}>
                          Ask someone else
                        </button>
                      ) : null}
                      {quest.status === 'active' ? (
                        <div className="cf-btns">
                          <button type="button" className="cf-btn cf-btn--go" disabled={!gameActive} aria-label={`${t.claim.One}: ${quest.title}`} onClick={() => setClaiming(quest)}>
                            Submit
                          </button>
                          <button
                            type="button"
                            className="cf-btn"
                            disabled={rerollsLeft <= 0 || state.status === 'ended'}
                            aria-label={`Reroll: ${quest.title}`}
                            title={rerollsLeft <= 0 ? 'No rerolls left' : `Reroll this ${t.quest.one}`}
                            onClick={() => setRerolling(quest)}
                          >
                            Reroll
                          </button>
                        </div>
                      ) : null}
                      {pts ? (
                        <div className="cf-foot">
                          <span className={`cf-pts ${tag.tone === 'exposed' ? 'cf-pts--neg' : 'cf-pts--pos'}`}>{pts}</span>
                        </div>
                      ) : null}
                    </Tag>
                  );
                })}
              </Strung>
            )}
          </div>

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
      {claiming ? <ClaimSheet quest={claiming} onClose={() => setClaiming(null)} /> : null}
      {repick ? <ChangeWitnessSheet submission={repick} onClose={() => setRepicking(null)} /> : null}
      {rerolling ? (
        <ConfirmSheet
          title={`Swap this ${t.quest.one}?`}
          confirmLabel="Reroll it"
          onClose={() => setRerolling(null)}
          onConfirm={async () => {
            await rerollQuest({ questId: rerolling.id });
            toast(`Fresh ${t.quest.one} dealt.`, 'success');
          }}
        >
          <p>
            <strong>&ldquo;{rerolling.title}&rdquo;</strong> goes back in the deck and you get a different one at random.
          </p>
          <p className="muted">
            This uses one reroll. You have {rerollsLeft} left, {Math.max(0, rerollsLeft - 1)} after this.
          </p>
        </ConfirmSheet>
      ) : null}
    </div>
  );
}
