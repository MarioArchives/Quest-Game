// Guessing a player's mission as a typed police form, Form 3 (option A, "Charge sheet"). On their file a strung tag
// is the form: Suspect, Charge and what's On file (your earlier charges on them, struck through when dismissed). The
// Charge line opens the full-height sheet, where it's a search that types back: matches drop under the line with words
// like it beneath, and an empty line is the whole book A–Z. Pick one, read the terms, sign and hold to file. Upheld:
// the form is stamped, with the points and the Board post everyone else sees. Dismissed: back on the file with a
// toast, the charge kept and struck through, and the button waiting out the cool-down.
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { guessQuest, toApiError } from '../../../api';
import { BottomSheet } from '../../../components/BottomSheet';
import { Icon } from '../../../components/Icon';
import { Loader } from '../../../components/Loader';
import { formatDelta } from '../../../components/PointsChip';
import { useToast } from '../../../components/Toast';
import { useGame, type RankedPlayer } from '../../../data/GameProvider';
import { tsMs, useNow, useQuery } from '../../../data/hooks';
import { guessCooldownRemaining } from '../../../lib/guess';
import { clockTime } from '../../../lib/time';
import { features, t, zone } from '../../../pack';
import { firstName } from '../../../screens/player/format';
import type { Doc, Guess, LedgerEntry, QuestTemplate } from '../../../shared';
import { splitProof, surnameInitial } from '../dossier';
import { IndexCard, Stamp, Strung, Tag, TagTop } from './CaseKit';
import { highlight, indexCharges, queryWords, searchCharges, wordsLike, type ChargeIndex, type Piece } from './chargeSearch';
import { Row as BoardPost } from './TimelineFeed';
import './chargesheet.css';

/** How long a press must be held to file. */
const HOLD_MS = 1200;
const MIN = 60_000;

/** The form's state for one suspect: guesses left, the cool-down, and your charges on them so far. */
function useCharges(target: RankedPlayer) {
  const { settings, myGuesses, state } = useGame();
  const now = useNow(5_000);
  // A rate-limit answer from the server wins over our own estimate until it passes.
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const local = guessCooldownRemaining(
    myGuesses.map((g) => ({ targetUid: g.targetUid, createdAt: tsMs(g.createdAt) })),
    target.id,
    now,
    settings.guessCooldownMin,
  );
  const remaining = Math.max(local, retryAt ? retryAt - now : 0);
  const cap = settings.guessLimit;
  const used = myGuesses.length;
  const left = cap > 0 ? Math.max(0, cap - used) : null;
  const active = state.status === 'active';
  const usedUp = cap > 0 && used >= cap;
  return {
    now,
    cap,
    used,
    left,
    remaining,
    // The charge's own time plus the cool-down, as the form shows them (the button wakes up by itself).
    againAt: now + remaining,
    onHim: myGuesses.filter((g) => g.targetUid === target.id),
    blocked: !active ? 'closed' : usedUp ? 'used-up' : remaining > 0 ? 'cooling' : null,
    setRetryAt,
  } as const;
}

type Charges = ReturnType<typeof useCharges>;

/** The form's button while no charge can be filed. */
function blockedLabel(blocked: Charges['blocked'], first: string, againAt: number): string {
  if (blocked === 'cooling') return `Charge ${first} again at ${clockTime(againAt, zone)}`;
  return blocked === 'used-up' ? 'No guesses left' : 'Only while the game is running';
}

/** What each of your guesses did to your score, from your own points ledger (by guess id). */
function useMyGuessPoints(): Map<string, number> {
  const { me } = useGame();
  const ledger = useQuery<LedgerEntry>(me ? { path: 'pointsLedger', where: [['uid', '==', me.id]] } : null);
  return useMemo(() => {
    const byGuess = new Map<string, number>();
    for (const e of ledger.data) {
      if ((e.reason === 'guess-correct' || e.reason === 'guess-wrong') && e.ref) byGuess.set(e.ref, (byGuess.get(e.ref) ?? 0) + e.delta);
    }
    return byGuess;
  }, [ledger.data]);
}

function suspectOf(target: RankedPlayer) {
  const character = features.characters ? target.character : null;
  const name = character?.name?.trim() || target.displayName;
  return { name: surnameInitial(name) || name, first: firstName(target.displayName), played: Boolean(character?.name?.trim()) };
}

/** The accusation tag on another player's file. */
export function ChargeTag({ target }: { target: RankedPlayer }) {
  const { settings, templatesById } = useGame();
  const charges = useCharges(target);
  const points = useMyGuessPoints();
  const [open, setOpen] = useState(false);
  const suspect = suspectOf(target);
  const { first } = suspect;
  const { cap, left, onHim, blocked, againAt, remaining } = charges;
  const latest = onHim[0];
  const titleOf = (g: Doc<Guess>) => templatesById.get(g.templateId)?.title ?? `A ${t.quest.one}`;
  const pointsOf = (g: Doc<Guess>) => points.get(g.id) ?? (g.correct ? settings.correctGuessReward : -settings.wrongGuessCost);
  const timeOf = (g: Doc<Guess>) => clockTime(tsMs(g.createdAt), zone);
  // Waiting out the cool-down on a charge just filed: it stays on the Charge line, stamped.
  const pending = remaining > 0 && latest ? latest : null;

  return (
    <Strung className="pf-accuse" label={`Charge ${first}`} tour="form3">
      <Tag>
        <TagTop
          left="Accusation · Form 3"
          right={left !== null ? <span className={left <= 1 ? 'cs-hot' : undefined}>{`${left} of ${cap} left`}</span> : undefined}
        />
        <Stamp tone="bad">Charge {first}</Stamp>
        <dl className="cs-form">
          <div className="cs-line">
            <dt>Suspect</dt>
            <dd>
              {suspect.name} <small>· {first}</small>
            </dd>
          </div>
          <div className="cs-line cs-line--charge">
            <dt>Charge</dt>
            <dd>
              {pending ? (
                <>
                  <span className={pending.correct ? undefined : 'cs-strike'}>{titleOf(pending)}</span> <small>{timeOf(pending)}</small>
                  <span className={`cs-mini cs-mini--${pending.correct ? 'good' : 'bad'}`}>{pending.correct ? 'Upheld' : 'Dismissed'}</span>
                </>
              ) : blocked ? (
                <span className="cs-blank">{blocked === 'used-up' ? 'no guesses left' : '—'}</span>
              ) : (
                // The red button below does the same for keyboards and screen readers.
                <button type="button" className="cs-blankbtn" tabIndex={-1} aria-hidden="true" onClick={() => setOpen(true)}>
                  <span className="cs-blank">tap to type a charge</span>
                  <i className="cs-caret" />
                </button>
              )}
            </dd>
          </div>
          {onHim.length > 0 ? (
            <div className="cs-line">
              <dt>On file</dt>
              <dd className="cs-onfile">
                <ul>
                  {onHim.map((g) => (
                    <li key={g.id}>
                      {g.correct ? titleOf(g) : <s>{titleOf(g)}</s>} <small>
                        {timeOf(g)} · {formatDelta(pointsOf(g))}
                        {g.correct ? ' · upheld' : ''}
                      </small>
                      {g.correct ? null : <span className="visually-hidden"> (dismissed)</span>}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
        </dl>
        {blocked ? (
          <button type="button" className="cf-btn cs-btn cs-btn--off" disabled>
            {blockedLabel(blocked, first, againAt)}
          </button>
        ) : (
          <button type="button" className="cf-btn cf-btn--red cs-btn" onClick={() => setOpen(true)}>
            <Icon name="edit" size={18} strokeWidth={2.2} />
            Type a charge
          </button>
        )}
        <p className="cs-fine">
          {pending && !pending.correct
            ? `Nobody else sees these, ${first} included. ${first} could still be dealt a dismissed one later.`
            : `Right: you +${settings.correctGuessReward}, ${first} −${settings.exposePenalty} · Wrong: you −${settings.wrongGuessCost}`}
        </p>
      </Tag>
      {open ? <ChargeSheet target={target} charges={charges} points={points} onClose={() => setOpen(false)} /> : null}
    </Strung>
  );
}

type Step = { step: 'search' } | { step: 'sign'; charge: Doc<QuestTemplate> } | { step: 'upheld'; charge: Doc<QuestTemplate>; before: Set<string>; at: number };

/** The form, full height: search for the charge, sign and file it, and the verdict when it's upheld. */
function ChargeSheet({ target, charges, points, onClose }: { target: RankedPlayer; charges: Charges; points: Map<string, number>; onClose(): void }) {
  const toast = useToast();
  const { personalTemplates, settings, myGuesses, me } = useGame();
  const suspect = suspectOf(target);
  const { first } = suspect;
  const [step, setStep] = useState<Step>({ step: 'search' });
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  // Every mission still in the deck: you guess from the whole book, not just theirs.
  const index = useMemo(() => indexCharges(personalTemplates.filter((tpl) => tpl.active)), [personalTemplates]);
  const { cap, used, left } = charges;

  const file = async (charge: Doc<QuestTemplate>) => {
    const before = new Set(myGuesses.map((g) => g.id));
    setBusy(true);
    try {
      const { correct } = await guessQuest({ targetUid: target.id, templateId: charge.id });
      // The server starts the cool-down; mirror it until our guesses catch up.
      charges.setRetryAt(Date.now() + settings.guessCooldownMin * MIN);
      setBusy(false);
      if (correct) {
        setStep({ step: 'upheld', charge, before, at: Date.now() });
      } else {
        onClose();
        toast(`Not one of ${first}'s. You lose ${settings.wrongGuessCost}.`, 'info');
      }
    } catch (err) {
      const apiErr = toApiError(err);
      if (apiErr.retryAt) charges.setRetryAt(apiErr.retryAt);
      setBusy(false);
      toast(apiErr.message, 'error');
    }
  };

  const subtitle = step.step === 'upheld' ? 'Charge upheld' : left !== null ? `${first} · ${left} of ${cap} guesses left` : first;
  return (
    <BottomSheet title="Form 3 · Accusation" subtitle={subtitle} onClose={onClose} locked={busy}>
      <div className={`cs-sheet cs-sheet--${step.step}`}>
        {step.step === 'search' ? (
          <SearchStep
            index={index}
            suspect={suspect}
            query={query}
            onQuery={setQuery}
            onPick={(charge) => setStep({ step: 'sign', charge })}
          />
        ) : step.step === 'sign' ? (
          <SignStep
            charge={step.charge}
            suspect={suspect}
            signer={firstName(me?.displayName ?? '')}
            terms={{ used, cap, cooldownMin: settings.guessCooldownMin, right: settings.correctGuessReward, exposed: settings.exposePenalty, wrong: settings.wrongGuessCost }}
            blocked={charges.blocked ? blockedLabel(charges.blocked, first, charges.againAt) : null}
            busy={busy}
            onChange={() => setStep({ step: 'search' })}
            onFile={() => void file(step.charge)}
          />
        ) : (
          <UpheldStep step={step} target={target} suspect={suspect} signer={firstName(me?.displayName ?? '')} charges={charges} points={points} onClose={onClose} />
        )}
      </div>
    </BottomSheet>
  );
}

type Suspect = ReturnType<typeof suspectOf>;

function SuspectLine({ suspect }: { suspect: Suspect }) {
  return (
    <div className="cs-line">
      <dt>Suspect</dt>
      <dd>
        {suspect.name} {suspect.played ? <small>· played by {suspect.first}</small> : null}
      </dd>
    </div>
  );
}

function Marked({ pieces }: { pieces: Piece[] }) {
  return (
    <>
      {pieces.map((p, i) =>
        p.hit ? (
          <mark key={i} className="cs-hl">
            {p.text}
          </mark>
        ) : (
          p.text
        ),
      )}
    </>
  );
}

/** Frame 2: the Charge line types back. */
function SearchStep({
  index,
  suspect,
  query,
  onQuery,
  onPick,
}: {
  index: ChargeIndex<Doc<QuestTemplate>>;
  suspect: Suspect;
  query: string;
  onQuery(q: string): void;
  onPick(charge: Doc<QuestTemplate>): void;
}) {
  const inputId = useId();
  const countId = useId();
  const input = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => searchCharges(index, query), [index, query]);
  const like = useMemo(() => wordsLike(index, query), [index, query]);
  const typed = queryWords(query).length > 0;
  const total = index.charges.length;

  // The sheet takes focus as it opens; the line takes it straight back, so typing can start.
  useEffect(() => {
    const id = window.requestAnimationFrame(() => input.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, []);

  const shown = query.trim();
  return (
    <>
      <dl className="cs-form cs-form--big" data-tour="cs-search">
        <SuspectLine suspect={suspect} />
        <div className="cs-line">
          <dt>
            <label htmlFor={inputId}>Charge</label>
          </dt>
          <dd>
            <input
              ref={input}
              id={inputId}
              className="cs-input"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="any word from it"
              aria-describedby={countId}
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              // The keyboard's search key puts the keyboard away, so more of the list shows.
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
          </dd>
        </div>
      </dl>
      <div className="cs-scroll">
        <p className="cs-count" id={countId} aria-live="polite">
          <span>
            {!typed ? `All ${total} ${t.quest.many}, A–Z` : hits.length === 0 ? `None of ${total} match “${shown}”` : `${hits.length} of ${total} match “${shown}”`}
          </span>
          {hits.length > 0 ? <span aria-hidden="true">Tap one</span> : null}
        </p>
        {total === 0 ? (
          <p className="cs-fine">The {t.quest.one} book is empty.</p>
        ) : typed && hits.length === 0 ? (
          <p className="cs-fine">Try another word from it, or clear the line for all {total}.</p>
        ) : null}
        {hits.length > 0 ? (
          <ul className="cs-hits" data-tour="cs-hits">
            {hits.map((c) => {
              const { what, proof } = splitProof(c.description ?? '');
              const marks = (text: string) => highlight(text, typed ? query : '');
              // The proof line only when that's where the word is.
              const inProof = typed && proof && !marks(`${c.title} ${what}`).some((p) => p.hit) && marks(proof).some((p) => p.hit);
              return (
                <li key={c.id}>
                  <button type="button" className="cs-hit" onClick={() => onPick(c)}>
                    <b>
                      <Marked pieces={marks(c.title)} />
                    </b>
                    <span>
                      <Marked pieces={marks(what)} />
                      {inProof ? (
                        <>
                          {' Proof: '}
                          <Marked pieces={marks(proof)} />
                        </>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {like.length > 0 ? (
          <div className="cs-like">
            <span id={`${countId}-like`}>Words like it</span>
            <ul aria-labelledby={`${countId}-like`}>
              {like.map((l) => (
                <li key={l.word}>
                  <button
                    type="button"
                    onClick={() => {
                      onQuery(l.word);
                      input.current?.focus();
                    }}
                  >
                    {l.word} <b>{l.count}</b>
                    <span className="visually-hidden"> {l.count === 1 ? t.quest.one : t.quest.many}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </>
  );
}

interface Terms {
  used: number;
  cap: number;
  cooldownMin: number;
  right: number;
  exposed: number;
  wrong: number;
}

/** Frame 3: the charge in full, the terms, your signature and the hold to file. */
function SignStep({
  charge,
  suspect,
  signer,
  terms,
  blocked,
  busy,
  onChange,
  onFile,
}: {
  charge: Doc<QuestTemplate>;
  suspect: Suspect;
  signer: string;
  terms: Terms;
  /** Why no charge can be filed just now (the server said wait, say), or null. */
  blocked: string | null;
  busy: boolean;
  onChange(): void;
  onFile(): void;
}) {
  const now = useNow(15_000);
  const { first } = suspect;
  const heading = useRef<HTMLElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const { used, cap } = terms;
  return (
    <div className="cs-scroll">
      <dl className="cs-form cs-form--big">
        <SuspectLine suspect={suspect} />
        <div className="cs-line">
          <dt>Charge</dt>
          <dd>
            <div className="cs-chargehead">
              <strong className="cs-title" ref={heading} tabIndex={-1}>
                {charge.title}
              </strong>
              <button type="button" className="cs-change" onClick={onChange} disabled={busy}>
                Change
              </button>
            </div>
            <p className="cs-desc">{charge.description || 'No description.'}</p>
          </dd>
        </div>
      </dl>
      <IndexCard className="cs-terms" tour="cs-terms">
        <h4>Terms · read before you sign</h4>
        <dl>
          <div>
            <dt>Uses</dt>
            <dd>{cap > 0 ? `guess ${used + 1} of ${cap}. You’ll have ${Math.max(0, cap - used - 1)} left.` : 'one guess; there’s no limit on them.'}</dd>
          </div>
          <div>
            <dt className="cs-ok">Upheld</dt>
            <dd>
              you +{terms.right}, {first} −{terms.exposed}. It goes on the Board and {first} is dealt a fresh one.
            </dd>
          </div>
          <div>
            <dt className="cs-bad">Dismissed</dt>
            <dd>
              you −{terms.wrong}. No post; {first} isn’t told.
            </dd>
          </div>
          {terms.cooldownMin > 0 ? (
            <div>
              <dt>Then</dt>
              <dd>
                no more charges on {first} for {terms.cooldownMin} min.
              </dd>
            </div>
          ) : null}
        </dl>
      </IndexCard>
      <p className="cs-sign" data-tour="cs-sign">
        <span>Signed</span>
        <em>{signer}</em>
        <span>{clockTime(now, zone)}</span>
      </p>
      {blocked ? (
        <button type="button" className="cf-btn cs-btn cs-btn--off" disabled>
          {blocked}
        </button>
      ) : (
        <HoldToFile busy={busy} onFile={onFile} />
      )}
    </div>
  );
}

/**
 * Press and hold to file, because a guess can't be taken back. A tap (or Enter, or a screen reader's activate) arms it
 * instead, and a second one within a few seconds files.
 */
function HoldToFile({ busy, onFile }: { busy: boolean; onFile(): void }) {
  const hintId = useId();
  const [holding, setHolding] = useState(false);
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | null>(null);
  const disarm = useRef<number | null>(null);
  // The hold already filed it: the click that ends the press is not a tap.
  const filed = useRef(false);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
      if (disarm.current) window.clearTimeout(disarm.current);
    },
    [],
  );

  const release = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  const press = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (busy || event.button !== 0) return;
    filed.current = false;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      filed.current = true;
      setHolding(false);
      setArmed(false);
      onFile();
    }, HOLD_MS);
  };
  const click = () => {
    if (filed.current) {
      filed.current = false;
      return;
    }
    if (busy) return;
    if (disarm.current) window.clearTimeout(disarm.current);
    if (armed) {
      setArmed(false);
      onFile();
      return;
    }
    setArmed(true);
    disarm.current = window.setTimeout(() => setArmed(false), 4000);
  };

  return (
    <>
      <button
        type="button"
        data-tour="cs-file"
        className={`cs-hold${holding ? ' is-holding' : ''}${armed ? ' is-armed' : ''}`}
        style={{ '--hold-ms': `${HOLD_MS}ms` } as CSSProperties}
        disabled={busy}
        aria-busy={busy || undefined}
        aria-describedby={hintId}
        onPointerDown={press}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        onContextMenu={(event) => event.preventDefault()}
        onClick={click}
      >
        {busy ? (
          // Filing: the bee where the hold ring was.
          <Loader size={26} label="Filing the charge" />
        ) : (
          <svg className="cs-hold__ring" viewBox="0 0 26 26" aria-hidden="true" focusable="false">
            <circle cx="13" cy="13" r="10" className="cs-hold__track" />
            <circle cx="13" cy="13" r="10" className="cs-hold__arc" pathLength={1} transform="rotate(-90 13 13)" />
          </svg>
        )}
        <span aria-live="polite">{busy ? 'Filing…' : armed ? 'Tap again to file' : 'Hold to file the charge'}</span>
      </button>
      <span id={hintId} className="visually-hidden">
        Or press twice to file.
      </span>
    </>
  );
}

/** Frame 4: stamped, the points, and the Board post everyone else sees. */
function UpheldStep({
  step,
  target,
  suspect,
  signer,
  charges,
  points,
  onClose,
}: {
  step: Extract<Step, { step: 'upheld' }>;
  target: RankedPlayer;
  suspect: Suspect;
  signer: string;
  charges: Charges;
  points: Map<string, number>;
  onClose(): void;
}) {
  const { settings, myGuesses, feed } = useGame();
  const { first } = suspect;
  const result = useRef<HTMLDivElement>(null);
  useEffect(() => result.current?.focus(), []);
  // The guess just filed is the one we hadn't seen before; its post on the Board carries its id.
  const guess = myGuesses.find((g) => !step.before.has(g.id) && g.targetUid === target.id);
  const post = guess ? feed.find((f) => f.type === 'exposed' && f.ref === guess.id) : undefined;
  const mine = (guess ? points.get(guess.id) : undefined) ?? settings.correctGuessReward;
  const theirs = typeof post?.points === 'number' ? post.points : -settings.exposePenalty;
  const at = guess ? tsMs(guess.createdAt) || step.at : step.at;
  const { left, cap, againAt } = charges;

  return (
    <div className="cs-scroll">
      <div className="cs-stampwrap" data-tour="cs-upheld">
        <dl className="cs-form cs-form--big">
          <SuspectLine suspect={suspect} />
          <div className="cs-line">
            <dt>Charge</dt>
            <dd className="cs-title">{step.charge.title}</dd>
          </div>
          <div className="cs-line">
            <dt>Signed</dt>
            <dd>
              {signer} <small>· {clockTime(at, zone)}</small>
            </dd>
          </div>
        </dl>
        <Stamp tone="good" className="cs-bigstamp">
          Upheld
        </Stamp>
      </div>
      <div className="cs-result" ref={result} tabIndex={-1} data-tour="cs-result">
        <b>{formatDelta(mine)}</b>
        <span>
          to you · {first} {formatDelta(theirs)}
          <br />
          it’s left {first}’s hand; a fresh one is dealt
        </span>
      </div>
      {post ? (
        <>
          <p className="cs-count">
            <span>On the Board now</span>
          </p>
          <Strung className="cs-post" label="On the Board now" tour="cs-post">
            <BoardPost item={post} ms={tsMs(post.createdAt) || at} />
          </Strung>
        </>
      ) : null}
      <p className="cs-fine">
        {left !== null ? `${left} of ${cap} guesses left · ` : ''}
        {settings.guessCooldownMin > 0 ? `charge ${first} again from ${clockTime(againAt, zone)}` : `you can charge ${first} again`}
      </p>
      <button type="button" className="cf-btn cf-btn--dark cs-btn" onClick={onClose}>
        Back to {first}’s file
      </button>
    </div>
  );
}
