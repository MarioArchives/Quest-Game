import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Loader } from '../components/Loader';
import { Icon } from '../components/Icon';
import { useGame, type RankedPlayer } from '../data/GameProvider';
import { tsMs } from '../data/hooks';
import { standingGap } from '../lib/record';
import { useSession } from '../session/SessionProvider';
import { dayDate } from './player/format';
import { GuessCard } from './player/GuessPanel';
import { PhotoGrid } from './player/PhotoGrid';
import { PlayerTicket, Wristband } from './player/PlayerTicket';
import { PointsReceipt } from './player/PointsReceipt';
import { AchievedList, SideQuestWins } from './player/QuestTickets';
import { RecordCard } from './player/RecordCard';
import { TipOff } from './home/TipOff';
import { usePlayerData, type PlayerData } from './player/usePlayerData';
import './player/player.css';
import { features, t } from '../pack';

const TABS = ['overview', 'photos', 'quests', 'points'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { overview: 'Overview', photos: 'Photos', quests: t.quest.Many, points: 'Points' };

/** One player's pass: status, photos, quests done and failed, side quests won, points history, and the guess. */
export default function PlayerScreen() {
  const { uid = '' } = useParams();
  const { ready, playersById, allPlayers } = useGame();
  const player = playersById.get(uid);
  // The players snapshot can land after game/state: give it a moment before calling a link dead.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setWaited(true), 4000);
    return () => window.clearTimeout(id);
  }, []);

  if (!ready || (!player && allPlayers.length === 0 && !waited)) return <Loader className="app__loader" caption="Loading" />;

  if (!player) {
    return (
      <>
        <BackLink />
        <div className="pl-missing">
          <h2 className="pl-missing__title">No such player</h2>
          <p className="muted">That link doesn&apos;t match anyone in the game.</p>
          <Link className="btn btn--primary" to="/">
            Back to Home
          </Link>
        </div>
      </>
    );
  }

  return <PlayerPass key={player.id} player={player} />;
}

function BackLink() {
  const navigate = useNavigate();
  return (
    <div className="pl-top">
      <Link
        to="/"
        className="pl-back"
        onClick={(event) => {
          // Back where they came from (the ranks, the standings, a feed post), or Home on a fresh deep link.
          if (window.history.length > 1) {
            event.preventDefault();
            navigate(-1);
          }
        }}
      >
        <Icon name="chevron" size={22} strokeWidth={2.4} className="pl-back__icon" />
        Back
      </Link>
      <p className="pl-top__title" aria-hidden="true">
        Player pass
      </p>
    </div>
  );
}

function PlayerPass({ player }: { player: RankedPlayer }) {
  const { user, player: mePlayer } = useSession();
  const { players } = useGame();
  const data = usePlayerData(player);
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? '') ? (raw as Tab) : 'overview';
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  const isMe = player.id === user?.uid;
  const name = player.displayName;
  const joinedMs = tsMs(player.joinedAt);

  const select = (next: Tab, focus = false) => {
    setParams(next === 'overview' ? {} : { tab: next }, { replace: true });
    if (focus) tabRefs.current[next]?.focus();
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.indexOf(tab);
    const next =
      event.key === 'ArrowRight'
        ? TABS[(i + 1) % TABS.length]
        : event.key === 'ArrowLeft'
          ? TABS[(i - 1 + TABS.length) % TABS.length]
          : event.key === 'Home'
            ? TABS[0]
            : event.key === 'End'
              ? TABS[TABS.length - 1]
              : null;
    if (!next) return;
    event.preventDefault();
    select(next, true);
  };

  const counts: Record<Tab, number | null> = {
    overview: null,
    photos: data.photos.length,
    quests: data.achieved.length + data.wins.length,
    points: data.ledgerLoading ? null : data.ledger.length,
  };

  // Same rules as the server: not yourself, only while you play, and never someone who has left.
  const guess = !features.guesses || isMe || !mePlayer ? null : player.left ? (
    <p className="note pl-note">{name} has left the game, so their {t.quest.many} can&apos;t be guessed.</p>
  ) : mePlayer.left ? null : (
    <GuessCard target={player} />
  );

  const tip = features.police ? <TipOff target={player} /> : null;

  return (
    <>
      <BackLink />
      <PlayerTicket player={player} isMe={isMe} boardSize={players.length} gap={standingGap(players, player.id)} />
      <Wristband player={player} />

      <div className="pl-tabs" role="tablist" aria-label={`${name}'s pass`}>
        {TABS.map((id) => (
          <button
            key={id}
            ref={(el) => {
              tabRefs.current[id] = el;
            }}
            type="button"
            role="tab"
            id={`pl-tab-${id}`}
            className="pl-tab"
            aria-selected={tab === id}
            aria-controls="pl-panel"
            tabIndex={tab === id ? 0 : -1}
            onClick={() => select(id)}
            onKeyDown={onTabKey}
          >
            {TAB_LABEL[id]}
            {counts[id] !== null ? <span className="pl-tab__n">{counts[id]}</span> : null}
          </button>
        ))}
      </div>

      <div className="pl-panel" role="tabpanel" id="pl-panel" aria-labelledby={`pl-tab-${tab}`} tabIndex={0}>
        {tab === 'overview' ? (
          <Overview player={player} data={data} joined={joinedMs ? dayDate(joinedMs) : null} guess={guess} tip={tip} onTab={(to) => select(to, true)} />
        ) : tab === 'photos' ? (
          <Section id="pl-photos" title="Photos" meta={`${data.photos.length} approved`}>
            {data.photos.length === 0 ? (
              <Empty>No approved photos yet. Photos added to approved {t.quest.many}{features.sideQuests ? ` and ${t.sideQuest.one.replace(/ /g, '-')} entries` : ''} land here.</Empty>
            ) : (
              <PhotoGrid photos={data.photos} owner={name} reactions={data.reactions} />
            )}
          </Section>
        ) : tab === 'quests' ? (
          <>
            <Section id="pl-done" title={`${t.quest.Many} achieved`} meta={`${data.achieved.length} done`}>
              {data.achieved.length === 0 ? <Empty>No {t.quest.many} achieved yet.</Empty> : <AchievedList quests={data.achieved} />}
            </Section>
            {features.sideQuests ? (
              <Section id="pl-won" title={`${t.sideQuest.Many} won`} meta={`${data.wins.length} of ${data.record.sideQuests.entered} entered`}>
                {data.wins.length === 0 && data.alsoEntered.length === 0 ? <Empty>No {t.sideQuest.many} won yet.</Empty> : null}
                <SideQuestWins wins={data.wins} entered={data.alsoEntered} />
              </Section>
            ) : null}
          </>
        ) : (
          <Section id="pl-points" title="Points" meta={`${player.points ?? 0} pts`}>
            <PointsTab player={player} data={data} />
          </Section>
        )}
      </div>
    </>
  );
}

function Overview({
  player,
  data,
  joined,
  guess,
  tip,
  onTab,
}: {
  player: RankedPlayer;
  data: PlayerData;
  joined: string | null;
  guess: ReactNode;
  tip: ReactNode;
  onTab(tab: Tab): void;
}) {
  const quests = data.achieved.length;
  const points = data.ledger.length;
  return (
    <>
      <RecordCard record={data.record} joined={joined} loading={data.ledgerLoading} />
      {guess}
      {tip}

      <Section id="pl-ov-photos" title="Photos" meta={`${data.photos.length} approved`}>
        {data.photos.length === 0 ? (
          <Empty>No approved photos yet.</Empty>
        ) : (
          <PhotoGrid photos={data.photos} owner={player.displayName} reactions={data.reactions} limit={4} onMore={() => onTab('photos')} />
        )}
      </Section>

      <Section id="pl-ov-quests" title={`${t.quest.Many} achieved`} action={quests > 0 ? <AllLink count={quests} what={t.quest.many} onClick={() => onTab('quests')} /> : null}>
        {quests === 0 ? <Empty>No {t.quest.many} achieved yet.</Empty> : <AchievedList quests={data.achieved.slice(0, 3)} />}
      </Section>

      {features.sideQuests && data.wins.length > 0 ? (
        <Section id="pl-ov-won" title={`${t.sideQuest.Many} won`} meta={`${data.wins.length} of ${data.record.sideQuests.entered} entered`}>
          <SideQuestWins wins={data.wins.slice(0, 2)} />
        </Section>
      ) : null}

      <Section id="pl-ov-points" title="Points" action={points > 0 ? <AllLink count={points} what="points lines" onClick={() => onTab('points')} /> : null}>
        <PointsTab player={player} data={data} limit={4} />
      </Section>
    </>
  );
}

function PointsTab({ player, data, limit }: { player: RankedPlayer; data: PlayerData; limit?: number }) {
  if (data.ledgerError) return <p className="note note--error">Couldn&apos;t load the points history.</p>;
  if (data.ledgerLoading) return <p className="muted pl-empty">Loading the points history…</p>;
  if (data.ledger.length === 0) return <Empty>No points yet.</Empty>;
  return <PointsReceipt entries={data.ledger} balance={player.points ?? 0} subsById={data.subsById} limit={limit} />;
}

function Section({ id, title, meta, action, children }: { id: string; title: string; meta?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="pl-sec" aria-labelledby={id}>
      <div className="pl-sec__head">
        <h3 id={id} className="pl-sec__title">
          {title}
        </h3>
        {action ?? (meta ? <span className="pl-sec__meta">{meta}</span> : null)}
      </div>
      {children}
    </section>
  );
}

function AllLink({ count, what, onClick }: { count: number; what: string; onClick(): void }) {
  return (
    <button type="button" className="pl-all" aria-label={`All ${count} ${what}`} onClick={onClick}>
      All {count}
      <Icon name="chevron" size={16} strokeWidth={2.4} />
    </button>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="muted pl-empty">{children}</p>;
}
