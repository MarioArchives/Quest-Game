// Open periodic missions (packs with checkins): everyone answers each with a photo or a comment before its clock runs
// out. Answering earns nothing; missing one costs the fine it opened with. Several series can be open at once.
import { useState } from 'react';
import { Button } from '../../components/Button';
import { EvidenceSheet } from '../../components/EvidenceSheet';
import { Icon } from '../../components/Icon';
import { useGame } from '../../data/GameProvider';
import { tsMs, useNow, useQuery } from '../../data/hooks';
import { features } from '../../pack';
import type { Checkin, CheckinAnswer, Doc } from '../../shared';
import { Countdown, Pips } from './SideQuestCard';

/** The open check-ins, oldest first. */
export function useOpenCheckins(): Doc<Checkin>[] {
  const open = useQuery<Checkin>(features.checkins ? { path: 'checkins', where: [['status', '==', 'open']] } : null);
  return [...open.data].sort((a, b) => tsMs(a.startsAt) - tsMs(b.startsAt));
}

/** One open check-in's answers so far. */
export function useAnswers(checkinId: string): Doc<CheckinAnswer>[] {
  return useQuery<CheckinAnswer>({ path: `checkins/${checkinId}/answers` }).data;
}

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Every open periodic mission, one card each. */
export function CheckinCards() {
  const { state } = useGame();
  const open = useOpenCheckins();
  if (state.status === 'ended' || open.length === 0) return null;
  return (
    <>
      {open.map((c) => (
        <CheckinCard key={c.id} checkin={c} />
      ))}
    </>
  );
}

function CheckinCard({ checkin }: { checkin: Doc<Checkin> }) {
  const { activePlayers, me } = useGame();
  const answers = useAnswers(checkin.id);
  const now = useNow(1000);
  const [answering, setAnswering] = useState(false);

  const answered = new Set(answers.map((a) => a.uid));
  const mine = me ? answers.find((a) => a.uid === me.id) : undefined;
  const timeUp = tsMs(checkin.endsAt) <= now;
  const total = Math.max(activePlayers.length, answered.size);
  const waiting = activePlayers.filter((p) => !answered.has(p.id));

  return (
    <>
      <section className="hero halftone checkin" aria-label={checkin.name}>
        <span className="sticker hero__sticker">Everyone</span>
        <p className="hero__eyebrow eyebrow">
          {checkin.name} &middot; #{checkin.number}
        </p>
        <h2 className="hero__title">{checkin.prompt}</h2>
        <p className="hero__rule">
          Answer with a photo or a comment before time runs out. No points for answering
          {checkin.penalty > 0 ? ` · −${checkin.penalty} if you don't` : ''}
        </p>
        <div className="hero__row">
          <Countdown endsAt={tsMs(checkin.endsAt)} closedText="Time's up" />
          <div className="hero__entries">
            <Pips filled={answered.size} total={total} />
            <p>
              {answered.size} of {total} answered
            </p>
          </div>
        </div>
        {waiting.length > 0 && waiting.length <= 8 && !timeUp ? (
          <p className="hero__left">Still waiting on {waiting.map((p) => (p.id === me?.id ? 'you' : first(p.displayName))).join(', ')}</p>
        ) : null}
        {me && !me.left ? (
          mine ? (
            <div className="hero__mine">
              <div className="hero__mine-text">
                <span className="tag tag--tint">Present</span>
                <p>{mine.caption ? mine.caption : 'Your photo is in.'}</p>
              </div>
            </div>
          ) : (
            <Button
              variant="primary"
              block
              onRed
              className="hero__cta"
              icon={<Icon name="camera" size={22} strokeWidth={2.2} />}
              disabled={timeUp}
              onClick={() => setAnswering(true)}
            >
              {timeUp ? "Time's up" : 'Answer'}
            </Button>
          )
        ) : (
          <p className="hero__blocked">Only players answer.</p>
        )}
      </section>
      {answering ? <EvidenceSheet target={{ mode: 'checkin', checkin }} onClose={() => setAnswering(false)} /> : null}
    </>
  );
}
