// Open periodic missions on the Board as big kraft tags strung under the folder tabs (E4·1): name and number, the
// fine, an ANSWER NOW stamp, the prompt, a big clock, fingerprints for who has answered, who it is still waiting on,
// and Answer (a photo or a comment, once).
import { useState } from 'react';
import { EvidenceSheet } from '../../../components/EvidenceSheet';
import { useGame } from '../../../data/GameProvider';
import { tsMs, useNow } from '../../../data/hooks';
import { formatCountdown } from '../../../lib/time';
import { useAnswers, useOpenCheckins } from '../../../screens/home/CheckinCard';
import { Pips } from '../../../screens/home/SideQuestCard';
import type { Checkin, Doc } from '../../../shared';
import { Stamp, Strung, Tag, TagTop } from './CaseKit';

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function RollCallTags() {
  const { state } = useGame();
  const open = useOpenCheckins();
  if (state.status === 'ended' || open.length === 0) return null;
  return (
    <Strung className="tl__calls" label="Open periodic missions">
      {open.map((c) => (
        <RollCallTag key={c.id} checkin={c} />
      ))}
    </Strung>
  );
}

function RollCallTag({ checkin }: { checkin: Doc<Checkin> }) {
  const { activePlayers, me } = useGame();
  const answers = useAnswers(checkin.id);
  const now = useNow(1000);
  const [answering, setAnswering] = useState(false);

  const answered = new Set(answers.map((a) => a.uid));
  const mine = me ? answers.find((a) => a.uid === me.id) : undefined;
  const endsAt = tsMs(checkin.endsAt);
  const timeUp = endsAt <= now;
  const total = Math.max(activePlayers.length, answered.size);
  const waiting = activePlayers.filter((p) => !answered.has(p.id));

  return (
    <Tag tilt={-0.4} className="tl__call">
      <TagTop left={`${checkin.name} · No. ${checkin.number}`} right={checkin.penalty > 0 ? `−${checkin.penalty} if you don’t` : 'No fine'} />
      <Stamp tone="bad">{timeUp ? 'Time’s up' : 'Answer now'}</Stamp>
      <p className="tl__callprompt">{checkin.prompt}</p>
      <div className="tl__callrow">
        <span className="tl__callclock" role="timer" aria-label={`${timeUp ? 'No time' : formatCountdown(endsAt, now)} left`}>
          {timeUp ? '00:00' : formatCountdown(endsAt, now)}
        </span>
        <div className="tl__callprints">
          <Pips filled={answered.size} total={total} />
          <span>
            {answered.size} of {total} answered
          </span>
        </div>
      </div>
      {waiting.length > 0 && waiting.length <= 8 && !timeUp ? (
        <p className="tl__callwait">Still waiting on {waiting.map((p) => (p.id === me?.id ? 'you' : first(p.displayName))).join(', ')}</p>
      ) : null}
      {me && !me.left ? (
        mine ? (
          <div className="tl__callmine">
            <Stamp tone="good">Present</Stamp>
            <span>{mine.caption ? `“${mine.caption}”` : 'Your photo is in.'}</span>
          </div>
        ) : (
          <button type="button" className="cf-btn cf-btn--go tl__callanswer" disabled={timeUp} onClick={() => setAnswering(true)}>
            {timeUp ? 'Time’s up' : 'Answer · photo or comment'}
          </button>
        )
      ) : (
        <p className="tl__callwait">Only players answer.</p>
      )}
      {answering ? <EvidenceSheet target={{ mode: 'checkin', checkin }} onClose={() => setAnswering(false)} /> : null}
    </Tag>
  );
}
