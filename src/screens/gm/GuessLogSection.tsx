import { Avatar } from '../../components/Avatar';
import { useGame } from '../../data/GameProvider';
import { tsMs, useNow, useQuery } from '../../data/hooks';
import { formatAgo } from '../../lib/time';
import { t } from '../../pack';
import type { Guess } from '../../shared';
import { dayAndTime } from './common';

const LIMIT = 200;

export function GuessLogSection() {
  const { playersById, templatesById } = useGame();
  const now = useNow(30_000);
  const guesses = useQuery<Guess>({ path: 'guesses', orderBy: ['createdAt', 'desc'], limit: LIMIT });
  const hits = guesses.data.filter((g) => g.correct).length;

  return (
    <>
      <div className="section-head">
        <h2>Guess log</h2>
        <span className="section-head__meta">
          {guesses.data.length} guesses · {hits} hits
        </span>
      </div>
      {guesses.error ? (
        <p className="note note--error" role="alert">
          Couldn&apos;t load the guesses.
        </p>
      ) : guesses.loading ? null : guesses.data.length === 0 ? (
        <div className="empty">
          <h3>No guesses yet</h3>
          <p>Every guess, right or wrong, is listed here.</p>
        </div>
      ) : (
        <ul className="gm-list">
          {guesses.data.map((g) => {
            const from = playersById.get(g.guesserUid);
            const to = playersById.get(g.targetUid);
            const title = templatesById.get(g.templateId)?.title ?? `A ${t.quest.one} that no longer exists`;
            return (
              <li key={g.id} className="gm-guess">
                <span className={`gm-guess__mark${g.correct ? ' is-hit' : ''}`} role="img" aria-label={g.correct ? 'Correct' : 'Wrong'}>
                  {g.correct ? '✓' : '✗'}
                </span>
                <div className="gm-guess__text">
                  <p className="gm-guess__who">
                    <Avatar name={from?.displayName ?? '?'} src={from?.photoURL} size={22} uid={from?.id} />
                    <strong>{from?.displayName ?? 'A player'}</strong>
                    <span aria-hidden="true">→</span>
                    <span className="visually-hidden">guessed</span>
                    <Avatar name={to?.displayName ?? '?'} src={to?.photoURL} size={22} uid={to?.id} />
                    <strong>{to?.displayName ?? 'a player'}</strong>
                  </p>
                  <p className="gm-guess__quest">{title}</p>
                  <p className="gm-guess__time" title={dayAndTime(tsMs(g.createdAt))}>
                    {formatAgo(tsMs(g.createdAt), now)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {guesses.data.length >= LIMIT ? <p className="gm-hint">Showing the latest {LIMIT}.</p> : null}
    </>
  );
}
