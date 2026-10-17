// Another player's file at /player/:uid, in the case-file look (E4·1): their suspect folder (mugshot, case number,
// character, stats, an ACTIVE or LEFT stamp and their typed record), the guess as a strung "accusation" tag, and the
// exhibits and points-history folders. None of the private parts (motive, missions).
import { useEffect, useId, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { formatDelta } from '../../../components/PointsChip';
import { Icon } from '../../../components/Icon';
import { Loader } from '../../../components/Loader';
import { useGame, type RankedPlayer } from '../../../data/GameProvider';
import { tsMs, useNow } from '../../../data/hooks';
import { exhibitsFor } from '../../../lib/exhibits';
import { formatAgo } from '../../../lib/time';
import { features, t } from '../../../pack';
import { dayTime, firstName, LEDGER_LABELS } from '../../../screens/player/format';
import { GuessPanel } from '../../../screens/player/GuessPanel';
import { characterLine } from '../../../screens/player/PlayerTicket';
import { usePlayerData, type PlayerData } from '../../../screens/player/usePlayerData';
import { useSession } from '../../../session/SessionProvider';
import { Folder, Stamp, Strung, Tag, TagTop } from './CaseKit';
import { TipOff, useTipOffApplies } from '../../../screens/home/TipOff';
import { ExhibitsFolder, StandingStamp, Stat, SuspectHead } from './FileParts';
import '../../../screens/player/player.css';
import './playerfile.css';

export default function PlayerFile() {
  const { uid = '' } = useParams();
  const { user } = useSession();
  const { ready, playersById, allPlayers } = useGame();
  const player = playersById.get(uid);
  // The players snapshot can land after game/state: give it a moment before calling a link dead.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setWaited(true), 4000);
    return () => window.clearTimeout(id);
  }, []);

  // Your own file is My file.
  if (user && uid === user.uid) return <Navigate to="/account" replace />;
  if (!ready || (!player && allPlayers.length === 0 && !waited)) return <Loader className="app__loader" caption="Loading" />;

  if (!player) {
    return (
      <div className="mf">
        <BackLink />
        <Folder tab="No such file" label="No such player" className="pf-missing">
          <h2 className="cf-title">No such player</h2>
          <p className="mf-desc">That link doesn&apos;t match anyone in the game.</p>
          <Link className="cf-btn cf-btn--go" to="/">
            Back to the board
          </Link>
        </Folder>
      </div>
    );
  }
  return <Pass key={player.id} player={player} />;
}

function BackLink() {
  const navigate = useNavigate();
  return (
    <div className="pl-top">
      <Link
        to="/"
        className="pl-back"
        onClick={(event) => {
          // Back where they came from (the standings, a feed post), or the board on a fresh deep link.
          if (window.history.length > 1) {
            event.preventDefault();
            navigate(-1);
          }
        }}
      >
        <Icon name="chevron" size={22} strokeWidth={2.4} className="pl-back__icon" />
        Back
      </Link>
    </div>
  );
}

function Pass({ player }: { player: RankedPlayer }) {
  const { player: mePlayer } = useSession();
  const { players, approved, globalQuests } = useGame();
  const data = usePlayerData(player);
  const name = player.displayName;
  const character = features.characters ? player.character : null;
  const charName = character?.name?.trim() || name;
  const out = player.left === 'out' || player.rank === 0;
  const exhibits = exhibitsFor(player.id, approved, globalQuests);

  return (
    <div className="mf">
      <BackLink />
      <Folder tab={`Suspect file · ${firstName(name)}`} clip="tab" label={`${name}'s profile`} className="mf-suspect">
        <SuspectHead
          photo={player.photoURL ?? null}
          name={charName}
          displayName={name}
          uid={player.id}
          line={character ? `${characterLine({ name: character.name, role: character.role })} · played by ${firstName(name)}` : name}
        >
          <StandingStamp points={player.points} />
          {player.left ? <p className="pf-status">{out ? 'Out of the game' : 'Left · score frozen'}</p> : null}
        </SuspectHead>
        <dl className="mf-stats">
          <Stat label="Score" score negative={(player.points ?? 0) < 0}>
            {player.points ?? 0}
          </Stat>
          <Stat label="Rank">
            {out ? '-' : player.rank}
            {out ? null : <small>/{players.length}</small>}
          </Stat>
          <Stat label="Done">{data.record.completed}</Stat>
        </dl>
        <RecordRows data={data} stamp={player.left ? (out ? 'Out' : 'Left') : 'Active'} />
      </Folder>

      {/* Same rules as the server: only while you play, and never someone who has left. */}
      {features.guesses && mePlayer && !mePlayer.left ? (
        player.left ? (
          <p className="pf-note">
            {name} has left the game, so their {t.quest.many} can&apos;t be guessed.
          </p>
        ) : (
          <GuessCard target={player} />
        )
      ) : null}

      <TipOffTag target={player} />

      <ExhibitsFolder exhibits={exhibits} empty={`No exhibits yet. Photos from ${t.sideQuest.many} they enter are filed here.`} />
      <Statement player={player} data={data} />
    </div>
  );
}

/** The tip-off to the police as a strung tag (a police pack, not yourself, not someone who has left). */
function TipOffTag({ target }: { target: RankedPlayer }) {
  const applies = useTipOffApplies(target);
  if (!applies) return null;
  return (
    <Strung className="pf-accuse" label="Tip off the police">
      <Tag>
        <TagTop left="Tip-off · Form 7" />
        <TipOff target={target} />
      </Tag>
    </Strung>
  );
}

/** The guess as a strung accusation form: folded until the player opens it, then the engine's guess panel. */
function GuessCard({ target }: { target: RankedPlayer }) {
  const { settings, myGuesses } = useGame();
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const first = firstName(target.displayName);
  const cap = settings.guessLimit;
  const left = cap > 0 ? Math.max(0, cap - myGuesses.length) : null;
  return (
    <Strung className="pf-accuse" label={`Guess ${first}'s ${t.quest.one}`}>
      <Tag>
        <TagTop left="Accusation · Form 3" right={left !== null ? `${left} of ${cap} left` : undefined} />
        <Stamp tone="bad">
          Guess {first}&apos;s {t.quest.one}
        </Stamp>
        <button type="button" className="pf-guess__toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
          <span>{open ? 'Fold the form away' : 'Fill in the form'}</span>
          <Icon name="chevronDown" size={20} strokeWidth={2.4} className={`pf-guess__chev${open ? ' is-open' : ''}`} />
        </button>
        <div id={bodyId} className="pf-guess__body">
          {open ? (
            <GuessPanel target={target} headed={false} />
          ) : (
            <p className="cf-text pf-guess__teaser">
              Pick the {t.quest.one} you think {first} holds from the whole list. Right: {first} −{settings.exposePenalty}, you +{settings.correctGuessReward} · Wrong: you −
              {settings.wrongGuessCost}
            </p>
          )}
        </div>
      </Tag>
    </Strung>
  );
}

function Row({ label, value, sub = false, bad = false }: { label: string; value: number | string; sub?: boolean; bad?: boolean }) {
  return (
    <div className={`pf-row${sub ? ' pf-row--sub' : ''}${bad ? ' is-bad' : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Missions done and failed, group missions, guesses: typed label and value rows, with the file's status stamp. */
function RecordRows({ data, stamp }: { data: PlayerData; stamp: 'Active' | 'Left' | 'Out' }) {
  const { record, ledgerLoading } = data;
  // Everything but "completed" comes from the points ledger, so it waits for it.
  const n = (value: number) => (ledgerLoading ? '–' : value);
  const { failed } = record;
  return (
    <section className="pf-record" aria-labelledby="pf-rec">
      <div className="pf-record__head">
        <h3 id="pf-rec" className="cf-meta">
          Record
        </h3>
        <Stamp tone={stamp === 'Active' ? 'active' : 'filed'}>{stamp}</Stamp>
      </div>
      <dl className="pf-rows">
        <Row label="Missions completed" value={record.completed} />
        <Row label="Missions failed" value={n(failed.total)} bad={failed.total > 0} />
        {!ledgerLoading && failed.total > 0 ? (
          <>
            {features.guesses ? <Row label="Exposed by a guess" value={failed.exposed} sub /> : null}
            <Row label="Rejected" value={failed.rejected} sub />
            <Row label="Overruled" value={failed.fraud} sub />
          </>
        ) : null}
        {features.sideQuests ? (
          <>
            <Row label="Group missions entered" value={record.sideQuests.entered} />
            <Row label="Group missions won" value={n(record.sideQuests.won)} />
          </>
        ) : null}
        {features.guesses ? (
          <>
            <Row label="Guesses right" value={n(record.guesses.right)} />
            <Row label="Guesses wrong" value={n(record.guesses.wrong)} />
          </>
        ) : null}
      </dl>
    </section>
  );
}

/** Their points ledger as a statement, newest first. */
function Statement({ player, data }: { player: RankedPlayer; data: PlayerData }) {
  const now = useNow(30_000);
  return (
    <Folder tab={`Points history · ${player.points ?? 0} pts`} label="Points history" clip={false}>
      {data.ledgerError ? (
        <p className="mf-muted">Couldn&apos;t load the points history.</p>
      ) : data.ledgerLoading ? (
        <p className="mf-muted">Loading the points history…</p>
      ) : data.ledger.length === 0 ? (
        <p className="mf-muted">No points yet.</p>
      ) : (
        <ol className="pf-ledger">
          {data.ledger.map((e) => {
            const ms = tsMs(e.createdAt);
            const more = e.note || ((e.reason === 'quest' || e.reason === 'global-win' || e.reason === 'global-entry') && e.ref ? data.subsById.get(e.ref)?.questTitle : null);
            return (
              <li key={e.id} className="pf-line">
                <span className="pf-line__what">
                  <strong>{LEDGER_LABELS[e.reason] ?? 'Points'}</strong>
                  {more ? <span className="pf-line__more">{more}</span> : null}
                  {ms ? (
                    <time className="pf-line__ago" dateTime={new Date(ms).toISOString()} title={dayTime(ms)}>
                      {formatAgo(ms, now)}
                    </time>
                  ) : null}
                </span>
                <span className={`pf-line__delta${e.delta < 0 ? ' is-neg' : ''}`}>
                  {formatDelta(e.delta)}
                  <span className="visually-hidden"> points</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Folder>
  );
}
