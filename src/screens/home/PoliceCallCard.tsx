// Police check-ins (packs with police): the open call for this player, shown at the top of Home. A person of interest
// is called on a clock; a trusted confidant's tip-off opens one too. Answer the question before the clock runs out:
// pass and earn points, fail or miss and lose them. The result stays up until it is dismissed, because the call
// itself leaves the open list the moment it is answered.
import { useState, type FormEvent } from 'react';
import { answerPoliceCall, friendlyError } from '../../api';
import { Button } from '../../components/Button';
import { formatDelta } from '../../components/PointsChip';
import { useGame } from '../../data/GameProvider';
import { tsMs, useNow } from '../../data/hooks';
import { features, t } from '../../pack';
import type { Doc, PoliceCall } from '../../shared';
import { Countdown } from './SideQuestCard';
import './standing.css';

const ANSWER_MAX = 20;

interface Outcome {
  status: 'passed' | 'failed';
  points: number;
}

/** The open police check-in, or the result of the one just answered; nothing otherwise. */
export function PoliceCallCard() {
  const { myPoliceCall, state } = useGame();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  if (!features.police || state.status === 'ended') return null;
  if (myPoliceCall) return <OpenCall call={myPoliceCall} onDone={setOutcome} />;
  if (!outcome) return null;
  return (
    <section className="hero halftone police" aria-label={t.policeCall.One} role="status">
      <p className="hero__eyebrow eyebrow">{t.policeCall.One}</p>
      <h2 className="hero__title">{outcome.status === 'passed' ? 'Passed' : 'Failed'}</h2>
      <p className="police__result">{outcome.points !== 0 ? `${formatDelta(outcome.points)} points` : 'No points either way'}</p>
      <Button block onRed className="hero__cta" onClick={() => setOutcome(null)}>
        Dismiss
      </Button>
    </section>
  );
}

function OpenCall({ call, onDone }: { call: Doc<PoliceCall>; onDone(outcome: Outcome): void }) {
  const { playersById, me } = useGame();
  const now = useNow(1000);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endsAt = tsMs(call.endsAt);
  const timeUp = endsAt <= now;
  const tipper = call.kind === 'tip' && call.byUid ? (playersById.get(call.byUid)?.displayName ?? 'A player') : null;
  const clean = answer.trim();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || timeUp || clean.length < 1) return;
    setBusy(true);
    setError(null);
    try {
      const result = await answerPoliceCall({ callId: call.id, answer: clean });
      onDone(result);
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  return (
    <section className="hero halftone police" aria-label={t.policeCall.One}>
      <span className="sticker hero__sticker">{tipper ? 'Tip-off' : 'On watch'}</span>
      <p className="hero__eyebrow eyebrow">{t.policeCall.One}</p>
      {tipper ? (
        <p className="hero__desc">
          {tipper} tipped off the police{call.note ? <>: &ldquo;{call.note}&rdquo;</> : null}.
        </p>
      ) : null}
      <h2 className="hero__title police__q">{call.question}</h2>
      <p className="hero__rule">
        Answer before time runs out: +{call.passPoints} if you&apos;re right, &minus;{call.failPenalty} if you&apos;re wrong or miss it
      </p>
      <Countdown endsAt={endsAt} closedText="Time's up" />
      {me && !me.left ? (
        <form className="police__form" onSubmit={(e) => void submit(e)}>
          <label className="visually-hidden" htmlFor="police-answer">
            Your answer
          </label>
          <input
            id="police-answer"
            className="input"
            inputMode="numeric"
            autoComplete="off"
            maxLength={ANSWER_MAX}
            value={answer}
            disabled={busy || timeUp}
            placeholder="Your answer"
            onChange={(e) => setAnswer(e.target.value)}
          />
          {error ? (
            <p className="hero__blocked" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" block onRed className="hero__cta" busy={busy} disabled={timeUp || clean.length < 1}>
            {timeUp ? "Time's up" : 'Answer'}
          </Button>
        </form>
      ) : (
        <p className="hero__blocked">Only players answer.</p>
      )}
    </section>
  );
}
