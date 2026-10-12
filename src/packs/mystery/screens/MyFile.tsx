// My file: the interview room. Who you are, your motive, your exhibits and your tampering missions, then the
// engine's working cards (witness requests, notifications, house rules…) as paper files.
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
import { PhotoThumb } from '../../../components/PhotoViewer';
import { ProfileSheet } from '../../../components/ProfileSheet';
import { useRewardSheet } from '../../../components/RewardSheet';
import { useToast } from '../../../components/Toast';
import { useGame } from '../../../data/GameProvider';
import { tsMs, useNow, useQuery } from '../../../data/hooks';
import { useLocationSharing } from '../../../data/LocationProvider';
import { forgetThisDevice } from '../../../data/usePush';
import { exhibitsFor } from '../../../lib/exhibits';
import { features, t, zone } from '../../../pack';
import { AddEvidenceBanners } from '../../../screens/account/AddEvidenceBanners';
import { ClaimHistory } from '../../../screens/account/ClaimHistory';
import { HouseRules } from '../../../screens/account/HouseRules';
import { LocationCard } from '../../../screens/account/LocationCard';
import { NotificationsCard } from '../../../screens/account/NotificationsCard';
import { SideQuestEntries } from '../../../screens/account/SideQuestEntries';
import { WitnessRequests } from '../../../screens/account/WitnessRequests';
import { characterLine } from '../../../screens/player/PlayerTicket';
import { useSession } from '../../../session/SessionProvider';
import { rerollAllowance, rerollsLeft as rerollsLeftFor, type Doc, type Quest } from '../../../shared';
import { behindTheGlass, caseNumber, missionTag, surnameInitial } from '../dossier';
import '../../../screens/account/account.css';
import './myfile.css';

const PRECINCT = 'Blackwood Manor PD';

/** hh:mm in the pack's time zone, ticking. */
function RecClock() {
  const now = useNow(15_000);
  const time = useMemo(
    () => new Intl.DateTimeFormat(zone.locale, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone.timeZone }).format(now),
    [now],
  );
  return (
    <div className="mf-rec">
      <span className="mf-rec__dot" aria-hidden="true" />
      REC {time}
    </div>
  );
}

const firstName = (name?: string | null) => (name ?? '').trim().split(/\s+/)[0] ?? '';

export default function MyFile() {
  const { user, player, isAdmin, signOut } = useSession();
  const { me, settings, state, ready, players, activePlayers, playersById, myMotive, myGuesses, mySubmissions, globalQuests } = useGame();
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
  const others = activePlayers.filter((p) => p.id !== uid);
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
      <div className="mf-top">
        <div className="mf-top__room">Interview room B</div>
        <RecClock />
      </div>

      {player ? (
        <>
          <section className="mf-id" aria-label="Your profile">
            <div className="mf-chart">
              <div className="mf-chart__scale" aria-hidden="true">
                <span>6&apos;6&quot;</span>
                <span>6&apos;0&quot;</span>
                <span>5&apos;6&quot;</span>
              </div>
              {photo ? (
                <img className="mf-chart__photo" src={photo} alt={`${displayName}, in the interview room`} referrerPolicy="no-referrer" />
              ) : (
                <svg className="mf-chart__figure" width="200" height="290" viewBox="0 0 220 330" aria-hidden="true">
                  <circle cx="110" cy="110" r="56" />
                  <path d="M10 330c0-90 45-150 100-150s100 60 100 150z" />
                </svg>
              )}
            </div>
            <div className="mf-felt">
              <div className="mf-felt__sub">{PRECINCT}</div>
              <div className="mf-felt__name">{surnameInitial(charName)}</div>
              <div className="mf-felt__no">{uid ? caseNumber(uid) : ''}</div>
            </div>
          </section>

          <section className="mf-card mf-subject" aria-label="Subject">
            <span className="mf-clip" aria-hidden="true" />
            <div className="mf-subject__who">
              <div className="mf-label">Subject</div>
              <h2 className="mf-subject__name">{charName}</h2>
              <p className="mf-subject__line">{character ? characterLine({ name: displayName, role: character.role }) : displayName}</p>
            </div>

            <dl className={`mf-stats${features.guesses ? '' : ' mf-stats--two'}`}>
              <div className={`mf-stat mf-stat--score${(player.points ?? 0) < 0 ? ' is-neg' : ''}`}>
                <dt>Score</dt>
                <dd>{player.points ?? 0}</dd>
              </div>
              <div className="mf-stat">
                <dt>Rank</dt>
                <dd>
                  {me ? me.rank : '-'}
                  <small>/{players.length}</small>
                </dd>
              </div>
              {features.guesses ? (
                <div className="mf-stat">
                  <dt>Guesses</dt>
                  <dd>
                    {myGuesses.length}
                    {settings.guessLimit > 0 ? <small>/{settings.guessLimit}</small> : null}
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="mf-glass">
              <div className="mf-label">Behind the glass</div>
              <ul className="mf-glass__row">
                {behindTheGlass(others.map((p) => p.id)).map((tile, i) => {
                  if (tile.kind === 'you') {
                    return (
                      <li key="you" className="mf-tile mf-tile--you">
                        You
                      </li>
                    );
                  }
                  if (tile.kind === 'more') {
                    return (
                      <li key="more" className="mf-tile">
                        +{tile.count}
                      </li>
                    );
                  }
                  const p = playersById.get(tile.uid);
                  return (
                    <li key={tile.uid + i} className="mf-tile">
                      <button type="button" className="mf-tile__btn" aria-label={p?.displayName ?? 'Player'} onClick={() => navigate(`/player/${tile.uid}`)}>
                        <Avatar name={p?.displayName ?? '?'} src={p?.photoURL} size={36} uid={tile.uid} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {features.characters ? (
              <div className="mf-motive">
                <div className="mf-motive__label">Motive · not for the record</div>
                {myMotive?.text ? <p className="mf-motive__text">{myMotive.text}</p> : <p className="mf-motive__text mf-motive__text--none">The GM hasn&apos;t given you a motive yet.</p>}
              </div>
            ) : null}
          </section>

          {reward.pending ? (
            <section className="mf-card mf-reward" aria-label="Reward">
              <div>
                <div className="mf-card__title">Evidence secured</div>
                <p className="mf-muted">You have a choice waiting: destroy it or frame someone.</p>
              </div>
              <Button small variant="primary" onClick={reward.open}>
                Choose
              </Button>
            </section>
          ) : null}

          <section className="mf-card" aria-labelledby="mf-ex">
            <div className="mf-card__head">
              <h2 id="mf-ex" className="mf-card__title">
                Exhibits
              </h2>
              <Link to="/" className="mf-link">
                + Photo
              </Link>
            </div>
            {exhibits.length === 0 ? (
              <p className="mf-muted">No exhibits yet. Photos from group missions you enter are filed here.</p>
            ) : (
              <ul className="mf-exhibits">
                {exhibits.map((e) => (
                  <li key={e.submissionId}>
                    <PhotoThumb submissionId={e.submissionId} thumbPath={e.thumbPath} fill label={`Exhibit: ${e.caption}`} />
                    <div className="mf-exhibits__cap">{e.caption}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mf-card mf-missions" aria-labelledby="mf-ms">
            <div className="mf-card__head">
              <h2 id="mf-ms" className="mf-card__title">
                Tampering missions
              </h2>
              <span className="mf-mono" title={`${rerollsLeft} of ${rerollsTotal} rerolls left`}>
                {rerollsLeft} REROLLS
              </span>
            </div>
            {!gameActive ? (
              <p className="mf-muted mf-missions__note" role="status">
                {state.status === 'lobby'
                  ? `The game hasn't started yet. ${t.claim.Many} open when the ${t.gm.One} starts.`
                  : state.status === 'paused'
                    ? `The game is paused. ${t.claim.Many} open again when the ${t.gm.One} resumes.`
                    : `The game has ended. No more ${t.claim.many}.`}
              </p>
            ) : null}
            {quests.loading ? (
              <Loader className="app__loader" caption="Dealing" />
            ) : hand.length === 0 ? (
              <p className="mf-muted">None in hand. Ask the {t.gm.One} if this looks wrong.</p>
            ) : (
              <ol className="mf-list">
                {hand.map((quest) => {
                  const tag = missionTag(quest, infoFor(quest));
                  if (!tag) return null;
                  const pending = quest.status === 'submitted' ? mySubmissions.find((s) => s.kind === 'personal' && s.questId === quest.id && s.status === 'pending') : undefined;
                  return (
                    <li key={quest.id} className={`mf-mission mf-mission--${tag.tone}`}>
                      <div className="mf-mission__row">
                        <span className="mf-mission__tag" aria-hidden="true">
                          {tag.tag}
                        </span>
                        <div className="mf-mission__text">
                          <div className={`mf-mission__title${tag.tone === 'exposed' ? ' is-struck' : ''}`}>{quest.title}</div>
                          {quest.description && (tag.tone === 'open' || tag.tone === 'pending') ? (
                            <details className="mf-mission__more">
                              <summary>Details</summary>
                              <p>{quest.description}</p>
                            </details>
                          ) : null}
                          {tag.sub ? <div className="mf-mission__sub">{tag.sub}</div> : null}
                          {pending ? (
                            <button type="button" className="mf-link mf-link--btn" onClick={() => setRepicking(pending.id)}>
                              Ask someone else
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {quest.status === 'active' ? (
                        <div className="mf-mission__actions">
                          <button type="button" className="mf-btn mf-btn--fill" disabled={!gameActive} aria-label={`${t.claim.One}: ${quest.title}`} onClick={() => setClaiming(quest)}>
                            Submit
                          </button>
                          <button
                            type="button"
                            className="mf-btn mf-btn--line"
                            disabled={rerollsLeft <= 0 || state.status === 'ended'}
                            aria-label={`Reroll: ${quest.title}`}
                            title={rerollsLeft <= 0 ? 'No rerolls left' : `Reroll this ${t.quest.one}`}
                            onClick={() => setRerolling(quest)}
                          >
                            Reroll
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <div className="mf-card mf-work">
            <WitnessRequests />
          </div>
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

      <div className="mf-card mf-work">
        <HouseRules />
      </div>

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
              Edit profile
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
