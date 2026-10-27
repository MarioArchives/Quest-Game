import { useMemo, useState, type ReactNode } from 'react';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { EvidenceSheet, type EvidenceTarget } from '../../components/EvidenceSheet';
import { Icon } from '../../components/Icon';
import { PhotoThumb } from '../../components/PhotoViewer';
import { useGame } from '../../data/GameProvider';
import { useBallot } from '../../data/useBallot';
import { tsMs, useNow } from '../../data/hooks';
import { gmChecks, judgingOf, submitRule, voteReward } from '../../lib/judging';
import { formatCountdown } from '../../lib/time';
import { useSession } from '../../session/SessionProvider';
import { EntryVideo, TaggedLine } from '../../components/EntryVideo';
import { noLeavesNoYes, type Doc, type GlobalQuest, type Judgement, type Submission } from '../../shared';
import { t } from '../../pack';

export function Countdown({ endsAt, closedText }: { endsAt: number; closedText: string }) {
  const now = useNow(1000);
  const text = formatCountdown(endsAt, now);
  const over = text === 'closed';
  return (
    <p className="hero__clock">
      <span className="hero__time" role="timer" aria-live="off">
        {over ? closedText : text}
      </span>
      {over ? null : <span className="hero__left">left</span>}
    </p>
  );
}

export function Pips({ filled, total }: { filled: number; total: number }) {
  const pips = Math.min(Math.max(total, 1), 14);
  const on = Math.min(filled, pips);
  return (
    <span className="pips" aria-hidden="true">
      {Array.from({ length: pips }, (_, i) => (
        <span key={i} className={`pip${i < on ? ' pip--on' : ''}`} />
      ))}
    </span>
  );
}

/** Voting first, then entries being checked, then live. */
const CARD_ORDER: Record<string, number> = { voting: 0, checking: 1, live: 2 };

/** The side quests that are open right now: entering while live, waiting while the GM checks, voting after. */
export function SideQuestCards() {
  const { globalQuests, state, settings } = useGame();
  const open = globalQuests
    .filter((g) => g.status === 'live' || g.status === 'checking' || g.status === 'voting')
    .sort((a, b) => (CARD_ORDER[a.status] ?? 9) - (CARD_ORDER[b.status] ?? 9));

  if (open.length === 0) {
    // Nothing to promise while the game is not running (lobby, paused or over).
    if (state.status !== 'active') return null;
    return (
      <section className="quiet" aria-label={t.sideQuest.One}>
        <p className="eyebrow">{t.sideQuest.One}</p>
        <p className="quiet__title">None open right now</p>
        <p className="quiet__note">
          They drop at random, roughly every {Math.round((settings.globalIntervalMin / 60) * 10) / 10}&ndash;
          {Math.round((settings.globalIntervalMax / 60) * 10) / 10} hours. Everyone enters, the {t.gm.One} checks the entries, then everyone votes.
        </p>
      </section>
    );
  }
  return (
    <>
      {open.map((quest) =>
        // A Submit mission is scored when it closes: it has no vote to show.
        quest.status === 'voting' && judgingOf(quest) === 'submit' ? null : quest.status === 'voting' ? (
          <VotingCard key={quest.id} quest={quest} />
        ) : quest.status === 'checking' ? (
          <CheckingCard key={quest.id} quest={quest} />
        ) : (
          <LiveCard key={quest.id} quest={quest} />
        ),
      )}
    </>
  );
}

/**
 * A side quest's entries so far: who is in (uids), and your own entry still in play. Entries are sealed until voting,
 * and other players can't read sealed submissions, so "who is in" comes from the feed: each entry puts a bare post
 * (type approved, no points) naming this side quest on it.
 */
export function useEntered(quest: Doc<GlobalQuest>): { entered: Set<string>; mine: Doc<Submission> | undefined } {
  const { approved, mySubmissions, feed } = useGame();
  const mine = mySubmissions.find((s) => s.kind === 'global' && s.questId === quest.id && s.status !== 'rejected');
  const entered = useMemo(() => {
    const started = tsMs(quest.startsAt);
    const set = new Set<string>();
    for (const post of feed) {
      if (post.type === 'approved' && post.uid && post.submissionId && post.points == null && post.questTitle === quest.title && tsMs(post.createdAt) >= started) {
        set.add(post.uid);
      }
    }
    for (const s of approved) if (s.kind === 'global' && s.questId === quest.id) set.add(s.uid);
    if (mine) set.add(mine.uid);
    return set;
  }, [feed, approved, mine, quest.id, quest.title, quest.startsAt]);
  return { entered, mine };
}

/**
 * The cards below each take an optional `eyebrow` (the line above the title, e.g. a pack's "No. 4 · Story mission");
 * without one they say what they always have.
 */
export function LiveCard({ quest, eyebrow }: { quest: Doc<GlobalQuest>; eyebrow?: ReactNode }) {
  const { player } = useSession();
  const { state, activePlayers, playersById } = useGame();
  const [sheet, setSheet] = useState<EvidenceTarget | null>(null);
  const { entered, mine } = useEntered(quest);
  const active = state.status === 'active';
  const names = [...entered].map((uid) => playersById.get(uid)).filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <>
      <section className="hero halftone" aria-label={`Live ${t.sideQuest.one}`}>
        <span className="sticker hero__sticker">Live now</span>
        <p className="hero__eyebrow eyebrow">{eyebrow ?? <>{t.sideQuest.One} &middot; everyone plays</>}</p>
        <h2 className="hero__title">{quest.title}</h2>
        {quest.description ? <p className="hero__desc">{quest.description}</p> : null}
        <p className="hero__rule">
          <LiveRule quest={quest} />
        </p>
        <div className="hero__row">
          <Countdown endsAt={tsMs(quest.endsAt)} closedText="Time's up" />
          <div className="hero__entries">
            <Pips filled={entered.size} total={Math.max(activePlayers.length, entered.size)} />
            <p>
              {entered.size} of {Math.max(activePlayers.length, entered.size)} entered
            </p>
          </div>
        </div>
        {names.length > 0 ? (
          <ul className="hero__who" aria-label="Who has entered">
            {names.map((p) => (
              <li key={p.id} className="hero__who-item">
                <Avatar name={p.displayName} src={p.photoURL} size={26} uid={p.id} />
                <span>{p.id === player?.id ? 'You' : (p.displayName.trim().split(/\s+/)[0] ?? p.displayName)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {mine ? (
          <div className="hero__mine">
            {mine.thumbPath ? <PhotoThumb submissionId={mine.id} thumbPath={mine.thumbPath} label="Open your entry" size={52} /> : null}
            <div className="hero__mine-text">
              <span className="tag tag--tint">{mine.status === 'sealed' ? 'Hidden until voting' : 'Your entry'}</span>
              <p>{mine.caption ? mine.caption : mine.thumbPath ? 'Your photo is in.' : 'Your entry is in.'}</p>
            </div>
          </div>
        ) : null}
        {player ? (
          mine ? (
            <Button
              block
              onRed
              className="hero__cta"
              icon={<Icon name="edit" size={20} strokeWidth={2.2} />}
              disabled={!active}
              onClick={() => setSheet({ mode: 'evidence', submission: mine as Doc<Submission>, title: quest.title })}
            >
              You&apos;re in &middot; edit until entries close
            </Button>
          ) : (
            <Button
              variant="primary"
              block
              onRed
              className="hero__cta"
              icon={<Icon name="camera" size={22} strokeWidth={2.2} />}
              disabled={!active}
              onClick={() => setSheet({ mode: 'enter', quest })}
            >
              Enter
            </Button>
          )
        ) : null}
        {player && !active ? <p className="hero__blocked">Entries open while the game is running.</p> : null}
        {!player ? <p className="hero__blocked">Only players can enter.</p> : null}
      </section>
      {sheet ? <EvidenceSheet target={sheet} onClose={() => setSheet(null)} /> : null}
    </>
  );
}

/** The live card's rule line, by how the mission is judged. */
function LiveRule({ quest }: { quest: Doc<GlobalQuest> }) {
  const { settings } = useGame();
  if (judgingOf(quest) === 'submit') return <>Enter with a photo or a comment. {submitRule(quest, settings)}</>;
  return gmChecks(quest) ? (
    <>
      Enter with a photo or a comment. Entries stay hidden until voting. When time is up the {t.gm.One} checks them, then everyone votes &middot; {voteReward(quest)}
    </>
  ) : (
    <>
      Enter with a photo or a comment. Entries stay hidden until voting. When time is up everyone votes &middot; {voteReward(quest)}
    </>
  );
}

/** Time is up and the GM is checking the entries; late entries still count until the GM starts the vote. */
export function CheckingCard({ quest, eyebrow }: { quest: Doc<GlobalQuest>; eyebrow?: ReactNode }) {
  const { player } = useSession();
  const { mySubmissions, state } = useGame();
  const [entering, setEntering] = useState(false);
  // Your entry still in play, else the latest one that was thrown out.
  const mine =
    mySubmissions.find((s) => s.kind === 'global' && s.questId === quest.id && s.status !== 'rejected') ??
    mySubmissions.find((s) => s.kind === 'global' && s.questId === quest.id);
  const rejected = mine?.status === 'rejected';
  // Not accepted at the check: they can try again. Disqualified as fraud: no second go.
  // A long-running mission's entries are closed for good: it waits for its vote.
  const waiting = quest.longRun === true;
  const canEnter = !waiting && Boolean(player) && !player?.left && (!mine || (rejected && mine.checked === 'rejected'));

  return (
    <section className="hero halftone" aria-label={`${t.sideQuest.One} entries being checked`}>
      <span className="sticker hero__sticker">{waiting ? 'Entries closed' : 'Time’s up'}</span>
      <p className="hero__eyebrow eyebrow">{eyebrow ?? <>{t.sideQuest.One} &middot; {waiting ? 'vote later' : 'checking'}</>}</p>
      <h2 className="hero__title">{quest.title}</h2>
      {quest.description ? <p className="hero__desc">{quest.description}</p> : null}
      <p className="hero__rule">
        {waiting ? <>Entries are closed. The vote opens later &middot; {voteReward(quest)}</> : <>The {t.gm.One} is checking the entries and starts the vote when ready. Late entries still count until then &middot; {voteReward(quest)}</>}
      </p>
      {mine ? (
        <div className="hero__mine">
          {mine.thumbPath ? <PhotoThumb submissionId={mine.id} thumbPath={mine.thumbPath} label="Open your entry" size={52} /> : null}
          <div className="hero__mine-text">
            <span className={`tag ${rejected ? 'tag--red' : 'tag--tint'}`}>
              {rejected ? (mine.checked === 'rejected' ? 'Not accepted' : 'Disqualified') : 'Hidden until voting'}
            </span>
            <p>{rejected ? (mine.reviewNote ? `${t.gm.One}: ${mine.reviewNote}` : 'It won’t go to the vote.') : 'Your entry is in.'}</p>
          </div>
        </div>
      ) : null}
      {canEnter ? (
        <Button
          variant="primary"
          block
          onRed
          className="hero__cta"
          icon={<Icon name="camera" size={22} strokeWidth={2.2} />}
          disabled={state.status !== 'active'}
          onClick={() => setEntering(true)}
        >
          {rejected ? 'Enter again' : 'Enter late'}
        </Button>
      ) : null}
      {entering ? <EvidenceSheet target={{ mode: 'enter', quest }} onClose={() => setEntering(false)} /> : null}
    </section>
  );
}

/** `onVote` hears of each vote counted from this card (e.g. so a pack's tab can stop asking for one). */
export function VotingCard({ quest, eyebrow, onVote }: { quest: Doc<GlobalQuest>; eyebrow?: ReactNode; onVote?: (submissionId: string) => void }) {
  const { user, player } = useSession();
  const { approved, playersById } = useGame();
  const uid = user?.uid ?? null;
  const entries = useMemo(
    () =>
      approved
        .filter((s) => s.kind === 'global' && s.questId === quest.id)
        // A steady order, so the grid doesn't reshuffle by who entered first.
        .sort((a, b) => a.id.localeCompare(b.id)),
    [approved, quest.id],
  );
  // Your own vote is read from your vote doc (votes are secret from everyone else); a new one shows at once.
  const ballot = useBallot(quest, entries);
  const yesNo = ballot.style === 'yesno';
  // At least one yes: a no that would finish the ballot without one can't be cast.
  const listed = entries.map((e) => ({ id: e.id, uid: e.uid }));
  const noBlocked = (entryId: string) => yesNo && !!uid && noLeavesNoYes(ballot.judged, listed, uid, entryId);
  const needsYes = entries.some((e) => e.uid !== uid && ballot.judged[e.id] !== 'no' && noBlocked(e.id));

  const vote = (entry: Doc<Submission>, judgement?: Judgement) => {
    void ballot.vote(entry.id, judgement);
    onVote?.(entry.id);
  };

  return (
    <section className="hero halftone" aria-label={`${t.sideQuest.One} voting`}>
      <span className="sticker hero__sticker">Vote now</span>
      <p className="hero__eyebrow eyebrow">{eyebrow ?? <>{t.sideQuest.One} &middot; secret ballot</>}</p>
      <h2 className="hero__title">{quest.title}</h2>
      {quest.description ? <p className="hero__desc">{quest.description}</p> : null}
      <div className="hero__row">
        {quest.votingEndsAt ? <Countdown endsAt={tsMs(quest.votingEndsAt)} closedText="Counting" /> : null}
        <p className="hero__rule hero__rule--right">
          {yesNo ? 'Most yes (less no)' : 'Most votes'} wins +{quest.bonusPoints}
          {(quest.fastestBonus ?? 0) > 0 ? <>, the fastest entry +{quest.fastestBonus}</> : null}
          <br />
          Ties all win
        </p>
      </div>
      {entries.length === 0 ? (
        <p className="hero__blocked">Nobody entered this one.</p>
      ) : (
        <ul className="entries">
          {entries.map((entry) => {
            const who = playersById.get(entry.uid);
            const own = entry.uid === uid;
            const picked = ballot.pick === entry.id;
            const said = ballot.judged[entry.id];
            const name = who?.displayName ?? 'A player';
            return (
              <li key={entry.id} className={`entry${picked || said === 'yes' ? ' is-picked' : ''}`}>
                {entry.videoPath ? (
                  <EntryVideo videoPath={entry.videoPath} thumbPath={entry.thumbPath} label={`${name}'s video`} />
                ) : entry.thumbPath ? (
                  <PhotoThumb submissionId={entry.id} thumbPath={entry.thumbPath} fill label={`Open ${name}'s entry`} />
                ) : (
                  <p className="entry__words">{entry.caption}</p>
                )}
                <p className="entry__who">
                  <Avatar name={name} src={who?.photoURL} size={22} uid={who?.id} />
                  <span>{own ? 'You' : name}</span>
                </p>
                {(entry.thumbPath || entry.videoPath) && entry.caption ? <p className="entry__caption">{entry.caption}</p> : null}
                <TaggedLine uid={entry.taggedUid} />
                {player ? (
                  yesNo ? (
                    <div className="entry__judge">
                      {(['no', 'yes'] as const).map((j) => (
                        <Button
                          key={j}
                          small
                          variant={said === j ? 'primary' : 'secondary'}
                          disabled={own || (j === 'no' && noBlocked(entry.id))}
                          aria-pressed={said === j}
                          onClick={() => vote(entry, j)}
                        >
                          {j === 'yes' ? 'Yes' : 'No'}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <Button
                      small
                      block
                      variant={picked ? 'primary' : 'secondary'}
                      className="entry__vote"
                      disabled={own}
                      aria-pressed={picked}
                      onClick={() => vote(entry)}
                    >
                      {own ? 'Your entry' : picked ? 'Your vote' : 'Vote'}
                    </Button>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {needsYes ? (
        <p className="hero__blocked" role="status">
          Say yes to at least one entry.
        </p>
      ) : null}
    </section>
  );
}
