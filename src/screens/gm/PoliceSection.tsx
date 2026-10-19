// GM: police check-ins (packs with police). The switchboard first (phone calls: line health, the GM's hand on it),
// then the log, read-only: open ones first, then the most recent: who was checked, why (watch, or a tip and who sent
// it), the question, by phone or in the app and how that went, and when. The server runs them.
import { useMemo } from 'react';
import { Avatar } from '../../components/Avatar';
import { Loader } from '../../components/Loader';
import { useGame } from '../../data/GameProvider';
import { tsMs, useNow, useQuery } from '../../data/hooks';
import { callChannelLine } from '../../lib/policeLine';
import { formatCountdown } from '../../lib/time';
import { t } from '../../pack';
import type { PoliceCall, PoliceCallStatus } from '../../shared';
import { clockTime, dayAndTime } from './common';
import { SwitchboardPanel } from './SwitchboardPanel';

const LIMIT = 100;

const STATUS_LABEL: Record<PoliceCallStatus, string> = {
  open: 'Open',
  passed: 'Passed',
  failed: 'Failed',
  missed: 'Missed',
  cancelled: 'Cancelled',
};

export function PoliceSection() {
  const { playersById } = useGame();
  const now = useNow(1000);
  const calls = useQuery<PoliceCall>({ path: 'policeCalls', orderBy: ['startsAt', 'desc'], limit: LIMIT });
  // Open ones first, each group newest first (the query already is).
  const sorted = useMemo(() => [...calls.data.filter((c) => c.status === 'open'), ...calls.data.filter((c) => c.status !== 'open')], [calls.data]);
  const open = calls.data.filter((c) => c.status === 'open').length;
  const nameOf = (uid: string | null) => (uid ? playersById.get(uid)?.displayName ?? 'A player who left' : 'Someone');

  return (
    <>
      <SwitchboardPanel />
      <div className="section-head">
        <h2>{t.policeCall.Many}</h2>
        <span className="section-head__meta">
          {open} open · {calls.data.length} shown
        </span>
      </div>
      {calls.error ? (
        <p className="note note--error" role="alert">
          Couldn&apos;t load the {t.policeCall.many}.
        </p>
      ) : calls.loading ? (
        <Loader size={48} />
      ) : sorted.length === 0 ? (
        <div className="empty">
          <h3>None yet</h3>
          <p>
            A {t.poi.one} is checked on a timer, and a {t.confidant.one} can tip the police off. Every {t.policeCall.one} is listed here.
          </p>
        </div>
      ) : (
        <ul className="gm-list">
          {sorted.map((c) => {
            const who = playersById.get(c.uid);
            const name = nameOf(c.uid);
            const starts = tsMs(c.startsAt);
            const ends = tsMs(c.endsAt);
            return (
              <li key={c.id} className="gm-guess">
                <Avatar name={name} src={who?.photoURL} size={36} uid={who?.id} />
                <div className="gm-entry__text">
                  <p className="gm-entry__who">
                    <strong>{name}</strong>
                    <span className={`tag ${c.status === 'passed' ? 'tag--ink' : c.status === 'open' ? 'tag--tint' : 'tag--red'}`}>{STATUS_LABEL[c.status]}</span>
                  </p>
                  <p className="gm-entry__caption">{c.question}</p>
                  <p className="gm-entry__meta">
                    {c.kind === 'tip' ? `Tip from ${nameOf(c.byUid)}${c.note ? `: “${c.note}”` : ''}` : `Watch ${t.policeCall.one}`}
                  </p>
                  {c.phone || c.fallbackReason ? <p className="gm-entry__meta">{callChannelLine(c)}</p> : null}
                  <p className="gm-entry__meta">
                    {c.answer !== null ? `Answered “${c.answer}” (expected ${c.expected})` : c.status === 'open' ? `Expects ${c.expected}` : 'No answer'}
                    {' · '}+{c.passPoints} / −{c.failPenalty}
                  </p>
                  <p className="gm-entry__meta">
                    {starts ? dayAndTime(starts) : ''}
                    {c.status === 'open' && c.channel !== 'phone' && ends ? ` · ${ends > now ? `${formatCountdown(ends, now)} left` : 'time is up'}, until ${clockTime(ends)}` : ''}
                    {c.answeredAt && tsMs(c.answeredAt) ? ` · answered ${clockTime(tsMs(c.answeredAt))}` : ''}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
