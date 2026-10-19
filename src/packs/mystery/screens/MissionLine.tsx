// My file's tampering missions on a line (the tampering-missions mockups, option A): a twine runs across the page and
// one full-width kraft tag hangs from it at a time. Swipe along it (a scroll-snap carousel), or use the arrows or the
// pegs under it: one per mission, ticked, crossed, waiting or blank, so they show the whole hand at a glance too. It
// opens once on news this phone hasn't seen (an approval, an exposure), otherwise on the first to do. Submit opens the
// claim sheet; Reroll turns the tag over to ask first. The tags are as tall as the tallest, so the page below holds still.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { friendlyError, rerollQuest } from '../../../api';
import { Avatar } from '../../../components/Avatar';
import { ChangeWitnessSheet } from '../../../components/ChangeWitnessSheet';
import { ClaimSheet } from '../../../components/ClaimSheet';
import { EvidenceSheet, type EvidenceTarget } from '../../../components/EvidenceSheet';
import { Icon } from '../../../components/Icon';
import { Loader } from '../../../components/Loader';
import { useToast } from '../../../components/Toast';
import { useGame } from '../../../data/GameProvider';
import { tsMs, useNow, useStorageUrl } from '../../../data/hooks';
import { clockTime, formatAgo } from '../../../lib/time';
import { t, zone } from '../../../pack';
import type { Doc, Quest, QuestStatus, Submission } from '../../../shared';
import { splitProof } from '../dossier';
import { Stamp, tiltFor, type StampTone } from './CaseKit';
import { handCounts, newsKey, openingIndex, readSeenNews, replacementIndex, writeSeenNews, type LineTone } from './missionLine';
import './missionline.css';

const TONE: Partial<Record<QuestStatus, LineTone>> = { active: 'open', submitted: 'pending', done: 'done', exposed: 'exposed' };
const STAMP: Record<LineTone, StampTone> = { done: 'good', pending: 'warm', open: 'plain', exposed: 'bad' };

const firstName = (name?: string | null) => (name ?? '').trim().split(/\s+/)[0] ?? '';

interface LineTag {
  quest: Doc<Quest>;
  number: number;
  tone: LineTone;
  /** The approved claim (done) or the one waiting on its witness (pending). */
  claim?: Doc<Submission>;
  /** The witness who saw it, the one asked, or the player who exposed it. */
  whoUid: string | null;
  who: string;
  /** Approved, sent or exposed, in ms (0 for a to do). */
  at: number;
  dealtAt: number;
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** From one tag's centre to the next: a tag's width plus the gap. */
function stepOf(track: HTMLElement): number {
  const first = track.firstElementChild as HTMLElement | null;
  if (!first) return 1;
  return first.offsetWidth + (parseFloat(getComputedStyle(track).columnGap) || 0) || 1;
}

export function MissionLine({ uid, hand, rerollsLeft, rerollsTotal }: { uid: string; hand: Doc<Quest>[]; rerollsLeft: number; rerollsTotal: number }) {
  const { settings, state, playersById, mySubmissions } = useGame();
  const toast = useToast();
  const now = useNow(30_000);
  const trackRef = useRef<HTMLDivElement>(null);
  const pegsRef = useRef<HTMLOListElement>(null);
  const frame = useRef(0);
  const [cur, setCur] = useState(0);
  /** The tag turned over to ask about a reroll. */
  const [over, setOver] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<Doc<Quest> | null>(null);
  const [repicking, setRepicking] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<EvidenceTarget | null>(null);
  const focusAfter = useRef<string | null>(null);
  const follow = useRef<string | null>(null);
  const opened = useRef(false);

  const gameActive = state.status === 'active';
  const ended = state.status === 'ended';

  const tags = useMemo<LineTag[]>(() => {
    const nameOf = (id: string | null) => firstName(playersById.get(id ?? '')?.displayName);
    return hand.flatMap((quest, i) => {
      const tone = TONE[quest.status];
      if (!tone) return [];
      const claim =
        tone === 'done'
          ? quest.submissionId
            ? mySubmissions.find((s) => s.id === quest.submissionId)
            : mySubmissions.find((s) => s.kind === 'personal' && s.questId === quest.id && s.status === 'approved')
          : tone === 'pending'
            ? mySubmissions.find((s) => s.kind === 'personal' && s.questId === quest.id && s.status === 'pending')
            : undefined;
      const whoUid = tone === 'done' ? (claim?.reviewedBy ?? claim?.witnessUid ?? null) : tone === 'pending' ? (claim?.witnessUid ?? null) : tone === 'exposed' ? (quest.exposedBy ?? null) : null;
      const at =
        tone === 'done' ? tsMs(quest.completedAt ?? claim?.reviewedAt) : tone === 'pending' ? tsMs(claim?.createdAt) : tone === 'exposed' ? tsMs(quest.exposedAt) : 0;
      return [{ quest, number: i + 1, tone, claim, whoUid, who: nameOf(whoUid), at, dealtAt: tsMs(quest.assignedAt) }];
    });
  }, [hand, mySubmissions, playersById]);
  const latest = useRef(tags);
  latest.current = tags;
  const last = Math.max(0, tags.length - 1);
  const at = Math.min(cur, last);

  // Where an arrow or a peg sent the line: the smooth scroll on the way there passes the tags in between (and starts
  // nearer the old one), so it doesn't move the tag in front until it arrives, or a touch takes over.
  const heading = useRef<number | null>(null);
  const headingTimer = useRef(0);
  const letGo = () => {
    heading.current = null;
    window.clearTimeout(headingTimer.current);
  };

  const goTo = (i: number) => {
    const track = trackRef.current;
    const next = Math.max(0, Math.min(i, latest.current.length - 1));
    setCur(next);
    if (!track) return;
    const smooth = !reducedMotion();
    letGo();
    if (smooth) {
      heading.current = next;
      headingTimer.current = window.setTimeout(letGo, 1000);
    }
    track.scrollTo({ left: next * stepOf(track), behavior: smooth ? 'smooth' : 'auto' });
  };

  // The tag in front follows the scroll (a swipe, a fling, the keyboard or a focused button pulling one into view).
  const onScroll = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const track = trackRef.current;
      if (!track) return;
      const i = Math.max(0, Math.min(Math.round(track.scrollLeft / stepOf(track)), latest.current.length - 1));
      if (heading.current !== null) {
        if (i !== heading.current) return;
        letGo();
      }
      setCur(i);
    });
  };
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      window.clearTimeout(headingTimer.current);
    },
    [],
  );

  // Opens once, on news this phone hasn't seen yet, otherwise the first to do; then that news counts as seen.
  useLayoutEffect(() => {
    if (opened.current || tags.length === 0) return;
    opened.current = true;
    const items = tags.map((tag) => ({ id: tag.quest.id, tone: tag.tone, at: tag.at }));
    const first = openingIndex(items, readSeenNews(uid));
    const track = trackRef.current;
    if (track) track.scrollLeft = first * stepOf(track);
    setCur(first);
    writeSeenNews(uid, items.map(newsKey).filter((key): key is string => key !== null));
  }, [tags, uid]);

  // After a swap, the fresh tag (on the end of the line) comes to the front once it arrives.
  useEffect(() => {
    if (!follow.current) return;
    const i = tags.findIndex((tag) => tag.quest.id === follow.current);
    if (i < 0) return;
    follow.current = null;
    goTo(i);
  }, [tags]); // eslint-disable-line react-hooks/exhaustive-deps

  // A hand too long for its pegs scrolls them: keep the current one in view (sideways only, never the page).
  useEffect(() => {
    const row = pegsRef.current;
    const peg = row?.children[at] as HTMLElement | undefined;
    if (!row || !peg || row.scrollWidth <= row.clientWidth) return;
    const left = peg.offsetLeft;
    if (left < row.scrollLeft) row.scrollLeft = left;
    else if (left + peg.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollLeft = left + peg.offsetWidth - row.clientWidth;
  }, [at, tags.length]);

  // A tag turned over turns back when you move along the line.
  const front = tags[at]?.quest.id;
  useEffect(() => {
    if (over && over !== front) setOver(null);
  }, [front, over]);

  // Focus follows the tag over and back: the face it lands on stays hidden until halfway through the turn, so if it
  // can't take focus yet, it gets it then.
  useEffect(() => {
    const target = focusAfter.current;
    focusAfter.current = null;
    if (!target) return;
    const land = () => {
      const el = trackRef.current?.querySelector<HTMLElement>(target);
      el?.focus({ preventScroll: true });
      return !el || document.activeElement === el;
    };
    if (land()) return;
    const timer = window.setTimeout(land, 300);
    return () => window.clearTimeout(timer);
  }, [over]);

  const turnOver = (id: string) => {
    setSwapError(null);
    focusAfter.current = `[data-quest="${id}"] .ml-back__title`;
    setOver(id);
  };
  const turnBack = (id: string) => {
    focusAfter.current = `[data-quest="${id}"] .ml-reroll`;
    setOver(null);
  };
  const swap = async (quest: Doc<Quest>) => {
    setSwapping(true);
    setSwapError(null);
    try {
      const { questId } = await rerollQuest({ questId: quest.id });
      toast(`Fresh ${t.quest.one} dealt.`, 'success');
      setOver(null);
      follow.current = questId;
      const i = latest.current.findIndex((tag) => tag.quest.id === questId);
      if (i >= 0) {
        follow.current = null;
        goTo(i);
      }
    } catch (err) {
      setSwapError(friendlyError(err));
    } finally {
      setSwapping(false);
    }
  };

  const clock = (ms: number) => (ms ? clockTime(ms, zone) : '');
  const rerollWord = (n: number) => (n === 1 ? 'reroll' : 'rerolls');
  const counts = handCounts(
    tags.map((tag) => ({ tone: tag.tone, witness: tag.tone === 'pending' ? tag.who : null })),
    `with ${t.witness.many}`,
  );
  const repick = repicking ? mySubmissions.find((s) => s.id === repicking && s.status === 'pending') : undefined;

  return (
    <section className="ml" aria-roledescription="carousel" aria-labelledby="ml-title">
      <div className="ml-head">
        <h2 id="ml-title" className="ml-head__title">
          {t.quest.Many} · {tags.length}
        </h2>
        <span className="ml-head__rerolls" title={`${rerollsLeft} of ${rerollsTotal} rerolls left`}>
          {rerollsLeft > 0 ? `${rerollsLeft} ${rerollWord(rerollsLeft)} left` : 'No rerolls left'}
        </span>
      </div>
      {!gameActive ? (
        <p className="ml-note" role="status">
          {state.status === 'lobby'
            ? `The game hasn't started yet. ${t.claim.Many} open when the ${t.gm.One} starts.`
            : state.status === 'paused'
              ? `The game is paused. ${t.claim.Many} open again when the ${t.gm.One} resumes.`
              : `The game has ended. No more ${t.claim.many}.`}
        </p>
      ) : null}

      {tags.length === 0 ? (
        <p className="ml-quiet">None in hand. Ask the {t.gm.One} if this looks wrong.</p>
      ) : (
        <>
          <div className="ml-line">
            <div className="ml-track" ref={trackRef} onScroll={onScroll} onPointerDown={letGo} onWheel={letGo}>
              {tags.map((tag, i) => {
                const { quest, tone, claim, who } = tag;
                const id = quest.id;
                const isOver = over === id;
                const { what, proof } = splitProof(quest.description ?? '');
                const struck = tone === 'exposed' ? ' is-struck' : '';
                const replaced = tone === 'exposed' ? replacementIndex(tags.map((x) => ({ id: x.quest.id, dealtAt: x.dealtAt })), { id, at: tag.at }) : -1;
                const points = claim?.pointsAwarded ?? quest.points ?? settings.questPoints;
                return (
                  <div key={id} className="ml-item" data-quest={id} role="group" aria-roledescription="slide" aria-label={`No. ${tag.number} of ${tags.length}`} inert={i !== at}>
                    <div className="ml-tw" style={{ transform: `rotate(${tiltFor(id) * 2}deg)` }}>
                      <div className={`ml-flip${isOver ? ' is-over' : ''}`}>
                        <article className={`ml-tag ml-tag--${tone}`} inert={isOver}>
                          <span className="ml-eye" aria-hidden="true" />
                          <div className="ml-top">
                            <span>
                              No. {tag.number}
                              {tag.dealtAt ? ` · dealt ${clock(tag.dealtAt)}` : ''}
                            </span>
                            <span>
                              {tone === 'open'
                                ? 'To do'
                                : tag.at
                                  ? `${tone === 'done' ? 'Approved' : tone === 'pending' ? 'Sent' : 'Exposed'} ${clock(tag.at)}`
                                  : ''}
                            </span>
                          </div>
                          <Stamp tone={STAMP[tone]}>
                            {tone === 'done'
                              ? who
                                ? `Done · ${who} saw it`
                                : 'Done'
                              : tone === 'pending'
                                ? `With your ${t.witness.one}${who ? ` · ${who}` : ''}`
                                : tone === 'exposed'
                                  ? who
                                    ? `Exposed by ${who}`
                                    : 'Exposed'
                                  : 'To do'}
                          </Stamp>
                          <h3 className={`ml-title${struck}`}>{quest.title}</h3>
                          {what && what !== quest.title ? <p className={`ml-what${struck}`}>{what}</p> : null}
                          {proof && (tone === 'open' || tone === 'pending') ? (
                            <p className="ml-proof">
                              <b>Proof</b> {proof}
                            </p>
                          ) : null}

                          {tone === 'open' ? (
                            <div className="ml-foot cf-btns">
                              <button type="button" className="cf-btn cf-btn--go" disabled={!gameActive} aria-label={`${t.claim.One}: ${quest.title}`} onClick={() => setClaiming(quest)}>
                                Submit
                              </button>
                              <button
                                type="button"
                                className="cf-btn ml-btn2 ml-reroll"
                                disabled={rerollsLeft <= 0 || ended}
                                aria-label={`Reroll: ${quest.title}, ${rerollsLeft} left`}
                                onClick={() => turnOver(id)}
                              >
                                Reroll
                                <small>{rerollsLeft} left</small>
                              </button>
                            </div>
                          ) : tone === 'pending' ? (
                            <div className="ml-foot">
                              <div className="ml-wait">
                                <Avatar name={who || '?'} src={playersById.get(tag.whoUid ?? '')?.photoURL ?? null} size={30} uid={tag.whoUid ?? undefined} />
                                <p>
                                  <b>{who ? `Waiting on ${who}` : `Waiting on your ${t.witness.one}`}</b>
                                  {tag.at ? <span>Sent {formatAgo(tag.at, now)}</span> : null}
                                </p>
                              </div>
                              {claim ? (
                                <button type="button" className="mf-link mf-link--btn" onClick={() => setRepicking(claim.id)}>
                                  Ask someone else
                                </button>
                              ) : null}
                            </div>
                          ) : tone === 'done' ? (
                            <div className="ml-foot">
                              {claim && (!ended || claim.thumbPath) ? (
                                <div className="ml-ev">
                                  <Print claim={claim} />
                                  {!ended ? (
                                    <button
                                      type="button"
                                      className="cf-btn cf-btn--dark"
                                      onClick={() => setEvidence({ mode: 'evidence', submission: claim, title: quest.title })}
                                    >
                                      {claim.thumbPath || claim.caption ? 'Edit your post' : 'Add a photo or note'}
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                              <div className="cf-foot">
                                <span className="ml-small">{claim?.thumbPath || claim?.caption ? `On your post in the ${t.feed.one}` : `Shows on your post in the ${t.feed.one}`}</span>
                                <span className="cf-pts cf-pts--pos">+{points}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="ml-foot">
                              <p className="ml-small">
                                {who ? `${who} guessed it.` : 'Someone guessed it.'}
                                {replaced >= 0 ? ` A fresh one was dealt in its place: No. ${tags[replaced]!.number}, ${tags[replaced]!.quest.title}.` : ''}
                              </p>
                              <div className="cf-foot">
                                <span className="ml-small">{tag.at ? `Guessed at ${clock(tag.at)}` : ''}</span>
                                {settings.exposePenalty ? <span className="cf-pts cf-pts--neg">−{settings.exposePenalty}</span> : null}
                              </div>
                            </div>
                          )}
                        </article>

                        {tone === 'open' ? (
                          <article className="ml-tag ml-tag--back" inert={!isOver} aria-labelledby={`ml-back-${id}`}>
                            <span className="ml-eye" aria-hidden="true" />
                            <div className="ml-top">
                              <span>
                                No. {tag.number} · {quest.title}
                              </span>
                              <span>Back of the tag</span>
                            </div>
                            <h3 id={`ml-back-${id}`} className="ml-back__title" tabIndex={-1}>
                              Swap it?
                            </h3>
                            <p className="ml-what">
                              <strong>{quest.title}</strong> goes back in the deck and you get a fresh one at random. The new one goes on the end of the line.
                            </p>
                            <p className="ml-tokens">
                              <span className="ml-tokens__row" aria-hidden="true">
                                {Array.from({ length: rerollsLeft }, (_, k) => (
                                  <span key={k} className={`ml-tok${k === rerollsLeft - 1 ? ' ml-tok--spend' : ''}`} />
                                ))}
                              </span>
                              <b>
                                {rerollsLeft} {rerollWord(rerollsLeft)} left · {Math.max(0, rerollsLeft - 1)} after this
                              </b>
                            </p>
                            {swapError && isOver ? (
                              <p className="ml-error" role="alert">
                                {swapError}
                              </p>
                            ) : null}
                            <div className="ml-foot cf-btns">
                              <button type="button" className="cf-btn" disabled={swapping} onClick={() => turnBack(id)}>
                                Keep it
                              </button>
                              <button type="button" className="cf-btn cf-btn--go" disabled={swapping} aria-busy={swapping || undefined} onClick={() => void swap(quest)}>
                                {swapping ? <Loader size={24} label={`Swapping ${quest.title}`} /> : null}
                                {swapping ? 'Swapping…' : 'Swap it'}
                              </button>
                            </div>
                          </article>
                        ) : null}
                      </div>
                    </div>
                    <svg className="ml-string" width="16" height="42" viewBox="0 0 16 42" aria-hidden="true" focusable="false">
                      <path d="M0 0.5 L8 40 L16 0.5" />
                      <circle cx="8" cy="0.8" r="3.2" />
                    </svg>
                  </div>
                );
              })}
            </div>
            <svg className="ml-twine" viewBox="0 0 390 24" preserveAspectRatio="none" aria-hidden="true" focusable="false">
              <path d="M-6 8 Q195 26 396 8" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>

          <div className="ml-nav">
            <button type="button" className="ml-arrow ml-arrow--prev" aria-label={`Previous ${t.quest.one}`} disabled={at === 0} onClick={() => goTo(at - 1)}>
              <Icon name="chevron" size={20} strokeWidth={2.6} />
            </button>
            <ol className="ml-pegs" ref={pegsRef} aria-label={`Your ${t.quest.many}`}>
              {tags.map((tag, i) => (
                <li key={tag.quest.id}>
                  <button
                    type="button"
                    className={`ml-peg ml-peg--${tag.tone}`}
                    aria-current={i === at ? 'true' : undefined}
                    aria-label={`No. ${tag.number}, ${tag.quest.title}: ${PEG_STATE[tag.tone]}`}
                    onClick={() => goTo(i)}
                  >
                    <b>{tag.number}</b>
                    <PegMark tone={tag.tone} />
                  </button>
                </li>
              ))}
            </ol>
            <button type="button" className="ml-arrow ml-arrow--next" aria-label={`Next ${t.quest.one}`} disabled={at >= last} onClick={() => goTo(at + 1)}>
              <Icon name="chevron" size={20} strokeWidth={2.6} />
            </button>
          </div>
          <p className="ml-count" aria-live="polite">
            {[`No. ${tags[at]?.number ?? 1} of ${tags.length}`, ...counts].join(' · ')}
          </p>
        </>
      )}

      {claiming ? <ClaimSheet quest={claiming} onClose={() => setClaiming(null)} /> : null}
      {repick ? <ChangeWitnessSheet submission={repick} onClose={() => setRepicking(null)} /> : null}
      {evidence ? <EvidenceSheet target={evidence} onClose={() => setEvidence(null)} /> : null}
    </section>
  );
}

const PEG_STATE: Record<LineTone, string> = {
  open: 'to do',
  pending: `with your ${t.witness.one}`,
  done: 'done',
  exposed: 'exposed',
};

/** The peg's mark: the file's [ ] [~] [✓] [x] as glyphs. */
function PegMark({ tone }: { tone: LineTone }) {
  if (tone === 'open') return <span className="ml-peg__box" aria-hidden="true" />;
  return (
    <svg className={`ml-mk ml-mk--${tone}`} width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {tone === 'done' ? (
        <path d="M5 12.5l4.5 4.5L19 7" strokeWidth="3.4" />
      ) : tone === 'exposed' ? (
        <path d="M6 6l12 12M18 6L6 18" strokeWidth="3.4" />
      ) : (
        <>
          <circle cx="12" cy="12" r="8.5" strokeWidth="2.6" />
          <path d="M12 7.5V12l3 2" strokeWidth="2.6" />
        </>
      )}
    </svg>
  );
}

/** The print on a done tag: your photo, or an empty dashed slot asking for one. */
function Print({ claim }: { claim: Doc<Submission> }) {
  const thumb = useStorageUrl(claim.thumbPath);
  if (claim.thumbPath) {
    return <span className="ml-print ml-print--photo">{thumb ? <img src={thumb} alt="Your photo" /> : null}</span>;
  }
  return (
    <span className="ml-print" aria-hidden="true">
      <Icon name={claim.caption ? 'comment' : 'camera'} size={22} />
      <em>{claim.caption ? 'Note added' : 'No photo yet'}</em>
    </span>
  );
}
