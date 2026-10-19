// The stack (option E): one folder per open mission inside the Missions folder, soonest deadline in front. Each
// folder's tab shows its name and clock and keeps its place however the stack is shuffled; swipe the front folder to
// send it to the back, or tap a tab to pull one forward (the tabs are a tablist, so the arrow keys do it too). The
// front folder holds the whole mission and its button.
import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { EvidenceSheet, type EvidenceTarget } from '../../../components/EvidenceSheet';
import { Icon } from '../../../components/Icon';
import { useGame } from '../../../data/GameProvider';
import { tsMs, useNow } from '../../../data/hooks';
import { judgingOf, skipFine } from '../../../lib/judging';
import { tabClock } from '../../../lib/missionTabs';
import { formatCountdown } from '../../../lib/time';
import { pack, t } from '../../../pack';
import { useAnswers } from '../../../screens/home/CheckinCard';
import { CheckingCard, Pips, VotingCard, useEntered } from '../../../screens/home/SideQuestCard';
import { useSession } from '../../../session/SessionProvider';
import { Paperclip } from './CaseKit';
import { checkinRule, missionRule, sendBack, STACK_MAX, tabSlots } from './missionDeck';
import type { DeckMission } from './useMissionDeck';

/** How far the front folder must be dragged to go to the back. */
const SWIPE_PX = 70;
const LEAVE_MS = 200;

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * `missions` in deadline order; `order` is the stack, front first (missionDeck's stackOrder). `onOrder` takes the new
 * order after a swipe, a tab or a key.
 */
export function MissionStack({ missions, order, onOrder, onVote }: { missions: DeckMission[]; order: string[]; onOrder(next: string[]): void; onVote(): void }) {
  const byId = new Map(missions.map((m) => [m.id, m]));
  const shown = order.slice(0, STACK_MAX).filter((id) => byId.has(id));
  const more = order.length - shown.length;
  const deadline = missions.map((m) => m.id);
  const slots = tabSlots(deadline, shown);
  const front = shown[0] ? byId.get(shown[0])! : null;

  // ---- the swipe ----
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const drag = useRef<{ x: number; y: number; on: boolean } | null>(null);
  const dragged = useRef(false);
  const canSwipe = order.length > 1;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!canSwipe || leaving || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag.current = { x: e.clientX, y: e.clientY, on: false };
    dragged.current = false;
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.on) {
      if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.2) {
        d.on = true;
        dragged.current = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* a pointer the browser no longer tracks: the swipe works without the capture */
        }
      } else if (Math.abs(my) > 10) {
        drag.current = null; // a scroll, not a swipe
        return;
      } else {
        return;
      }
    }
    setDx(mx);
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.on) return;
    const mx = e.clientX - d.x;
    if (Math.abs(mx) < SWIPE_PX) return setDx(0);
    if (reducedMotion()) {
      setDx(0);
      return onOrder(sendBack(order));
    }
    // Off it goes the way it was flung, then it is filed at the back and the next one is in front.
    setLeaving(true);
    setDx(Math.sign(mx) * (e.currentTarget.offsetWidth + 40));
    window.setTimeout(() => {
      onOrder(sendBack(order));
      setLeaving(false);
      setDx(0);
    }, LEAVE_MS);
  };

  // ---- the tabs: a tablist in deadline (left to right) order ----
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const byPlace = [...shown].sort((a, b) => (slots.get(a) ?? 0) - (slots.get(b) ?? 0));
  const pull = (id: string, focus = false) => {
    onOrder([id, ...order.filter((x) => x !== id)]);
    if (focus) window.requestAnimationFrame(() => tabRefs.current.get(id)?.focus());
  };
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const i = byPlace.indexOf(shown[0] ?? '');
    const last = byPlace.length - 1;
    const next =
      event.key === 'ArrowRight' ? (i + 1) % byPlace.length : event.key === 'ArrowLeft' ? (i - 1 + byPlace.length) % byPlace.length : event.key === 'Home' ? 0 : event.key === 'End' ? last : -1;
    if (next < 0 || byPlace.length < 2) return;
    event.preventDefault();
    pull(byPlace[next]!, true);
  };

  if (!front) return <EmptyStack />;

  const layers = shown.length;
  const style = { '--layers': layers, '--n': layers, '--more-w': more > 0 ? '40px' : '0px', '--dx': `${dx}px`, '--tilt': `${dx / 40}deg` } as CSSProperties;
  const index = deadline.indexOf(front.id) + 1;

  return (
    <div className={`ms-stack${dx !== 0 ? ' is-dragging' : ''}${leaving ? ' is-leaving' : ''}`} style={style}>
      <div className="ms-stack__tabs" role="tablist" aria-label="Open missions: soonest deadline first">
        {/* Back to front: the last of the shown folders is the furthest back. */}
        {[...shown].reverse().map((id, k) => {
          const m = byId.get(id)!;
          const isFront = id === front.id;
          return (
            <div key={id} role="presentation" className={`ms-f ms-f--${k % 2 ? 'mid' : 'back'}${isFront ? ' ms-f--front' : ''}`} style={{ '--k': k } as CSSProperties}>
              <button
                ref={(el) => {
                  if (el) tabRefs.current.set(id, el);
                  else tabRefs.current.delete(id);
                }}
                type="button"
                role="tab"
                id={`ms-tab-${id}`}
                className="ms-tab"
                style={{ '--slot': slots.get(id) ?? 0 } as CSSProperties}
                aria-selected={isFront}
                aria-controls="ms-front"
                aria-label={`${m.kicker}, ${m.title}`}
                tabIndex={isFront ? 0 : -1}
                onClick={() => pull(id)}
                onKeyDown={onTabKey}
              >
                <span className="ms-tab__name">{m.name}</span>
                <TabTime m={m} />
              </button>
            </div>
          );
        })}
      </div>
      {/* Past the stack's limit, the rest wait behind a "+n" tab: it sends the front folder to the back. */}
      {more > 0 ? (
        <div className="ms-f ms-f--more" style={{ '--k': 0 } as CSSProperties}>
          <button type="button" className="ms-tab ms-tab--more" onClick={() => onOrder(sendBack(order))} aria-label={`${more} more open: send the front folder to the back`}>
            +{more}
          </button>
        </div>
      ) : null}
      <div
        className="ms-f__b"
        id="ms-front"
        role="tabpanel"
        aria-labelledby={`ms-tab-${front.id}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={() => {
          drag.current = null;
          setDx(0);
        }}
        onClickCapture={(e) => {
          // The end of a swipe is not a tap on whatever was under the finger.
          if (dragged.current) {
            e.preventDefault();
            e.stopPropagation();
            dragged.current = false;
          }
        }}
      >
        <Paperclip />
        <FrontFolder key={front.id} m={front} index={index} count={missions.length} onVote={onVote} />
      </div>
      <span className="visually-hidden" aria-live="polite">
        {order.length > 1 ? `In front: ${front.kicker}, ${front.title}` : ''}
      </span>
    </div>
  );
}

/** A folder tab's clock: the time left (entries, the vote or the answer), "Check" while the GM checks. */
function TabTime({ m }: { m: DeckMission }) {
  const now = useNow(1000);
  if (m.deadlineMs === null) return <b>Check</b>;
  return <b>{m.status === 'voting' ? `Vote ${tabClock(m.deadlineMs, now)}` : tabClock(m.deadlineMs, now)}</b>;
}

/** The big clock on the front folder. */
function Clock({ endsMs }: { endsMs: number }) {
  const now = useNow(1000);
  const text = formatCountdown(endsMs, now);
  const over = text === 'closed';
  return (
    <p className="ms-clock" role="timer" aria-label={over ? 'No time left' : `${text} left`}>
      <b>{over ? '00:00' : text}</b>
      <i>{over ? 'time’s up' : 'left'}</i>
    </p>
  );
}

/** The front folder: the whole mission and its button. */
function FrontFolder({ m, index, count, onVote }: { m: DeckMission; index: number; count: number; onVote(): void }) {
  const head = (
    <p className="ms-k">
      <span>{m.kicker}</span>
      <em>
        {index} of {count} live
      </em>
    </p>
  );
  if (m.checkin) return <CheckinFront m={m} head={head} />;
  const q = m.quest!;
  const eyebrow = `${m.kicker} · ${index} of ${count} live`;
  if (q.status === 'live') return <LiveFront m={m} head={head} />;
  if (q.status === 'checking') return <CheckingCard quest={q} eyebrow={eyebrow} />;
  // A Submit mission is scored as it closes: it never has a vote to show.
  if (q.status === 'voting' && judgingOf(q) === 'vote') return <VotingCard quest={q} eyebrow={eyebrow} onVote={onVote} />;
  return (
    <>
      {head}
      <h3 className="ms-t">{q.title}</h3>
      <p className="ms-you">Being scored</p>
    </>
  );
}

/** A live group or story mission: its brief, the rule, the clock, the prints of who is in, and Enter. */
function LiveFront({ m, head }: { m: DeckMission; head: ReactNode }) {
  const quest = m.quest!;
  const { player } = useSession();
  const { state, activePlayers, settings } = useGame();
  const { entered, mine } = useEntered(quest);
  const [sheet, setSheet] = useState<EvidenceTarget | null>(null);
  const total = Math.max(activePlayers.length, entered.size);
  const active = state.status === 'active';
  const playing = Boolean(player && !player.left);

  return (
    <>
      {head}
      <h3 className="ms-t">{quest.title}</h3>
      {quest.description ? <p className="ms-desc">{quest.description}</p> : null}
      <p className="ms-rule">{missionRule(quest, skipFine(quest, settings))}</p>
      <div className="ms-row">
        <Clock endsMs={tsMs(quest.endsAt)} />
        <div className="ms-prints">
          <Pips filled={entered.size} total={total} />
          <span>
            {entered.size} of {total} in
          </span>
        </div>
      </div>
      {playing ? (
        <p className={`ms-you ${mine ? 'ok' : 'hot'}`}>{mine ? (mine.status === 'sealed' ? 'You’re in · hidden until voting' : 'You’re in') : 'You’re not in'}</p>
      ) : (
        <p className="ms-you">Only players enter</p>
      )}
      {playing ? (
        mine ? (
          <button type="button" className="cf-btn ms-cta" disabled={!active} onClick={() => setSheet({ mode: 'evidence', submission: mine, title: quest.title })}>
            <Icon name="edit" size={18} strokeWidth={2.2} />
            Edit your entry
          </button>
        ) : (
          <button type="button" className="cf-btn cf-btn--go ms-cta" disabled={!active} onClick={() => setSheet({ mode: 'enter', quest })}>
            <Icon name="camera" size={18} strokeWidth={2.2} />
            Enter
          </button>
        )
      ) : null}
      {playing && !active ? <p className="ms-note">Entries open while the game is running.</p> : null}
      {sheet ? <EvidenceSheet target={sheet} onClose={() => setSheet(null)} /> : null}
    </>
  );
}

/** An open periodic mission: the prompt, the fine, the clock, the prints of who has answered, and Answer. */
function CheckinFront({ m, head }: { m: DeckMission; head: ReactNode }) {
  const checkin = m.checkin!;
  const { activePlayers, me } = useGame();
  const answers = useAnswers(checkin.id);
  const now = useNow(1000);
  const [answering, setAnswering] = useState(false);
  const answered = new Set(answers.map((a) => a.uid));
  const mine = me ? answers.find((a) => a.uid === me.id) : undefined;
  const total = Math.max(activePlayers.length, answered.size);
  const timeUp = tsMs(checkin.endsAt) <= now;
  const playing = Boolean(me && !me.left);

  return (
    <>
      {head}
      <h3 className="ms-t ms-t--prompt">{checkin.prompt}</h3>
      <p className="ms-rule">{checkinRule(checkin.penalty)}</p>
      <div className="ms-row">
        <Clock endsMs={tsMs(checkin.endsAt)} />
        <div className="ms-prints">
          <Pips filled={answered.size} total={total} />
          <span>
            {answered.size} of {total} answered
          </span>
        </div>
      </div>
      {playing ? (
        mine ? (
          <p className="ms-you ok">Present · {mine.caption ? `“${mine.caption}”` : 'your photo is in'}</p>
        ) : (
          <p className="ms-you hot">{timeUp ? 'Time’s up' : 'Not answered yet'}</p>
        )
      ) : (
        <p className="ms-you">Only players answer</p>
      )}
      {playing && !mine ? (
        <button type="button" className="cf-btn cf-btn--go ms-cta" disabled={timeUp} onClick={() => setAnswering(true)}>
          <Icon name="camera" size={18} strokeWidth={2.2} />
          Answer
        </button>
      ) : null}
      {answering ? <EvidenceSheet target={{ mode: 'checkin', checkin }} onClose={() => setAnswering(false)} /> : null}
    </>
  );
}

/** Nothing open: one empty folder saying when missions come. */
function EmptyStack() {
  const { state, settings } = useGame();
  const hours = (min: number) => Math.round((min / 60) * 10) / 10;
  const story = (pack.catalogue.story?.length ?? 0) > 0;
  const text =
    state.status === 'lobby'
      ? `Missions open once the ${t.gm.One} starts the game.`
      : state.status === 'paused'
        ? `The game is paused. Missions open again when the ${t.gm.One} carries on.`
        : state.status === 'ended'
          ? 'The case is closed. Every mission is filed below.'
          : settings.autoSideQuests
            ? `Random drops land roughly every ${hours(settings.globalIntervalMin)}–${hours(settings.globalIntervalMax)} hours${story ? `, and the ${t.gm.One} opens the story’s chapters as the night goes on.` : '.'}`
            : `The ${t.gm.One} sends them as the night goes on.`;
  return (
    <div className="ms-stack ms-stack--empty" style={{ '--layers': 1, '--n': 1 } as CSSProperties}>
      <div className="ms-stack__tabs">
        <div className="ms-f ms-f--back ms-f--front" style={{ '--k': 0 } as CSSProperties}>
          <span className="ms-tab" style={{ '--slot': 0 } as CSSProperties}>
            <span className="ms-tab__name">Nothing open</span>
          </span>
        </div>
      </div>
      <div className="ms-f__b">
        <Paperclip />
        <p className="ms-k">
          <span>Open missions</span>
        </p>
        <h3 className="ms-t">Nothing open right now</h3>
        <p className="ms-desc">{text}</p>
      </div>
    </div>
  );
}
