import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { Avatar } from '../../components/Avatar';
import { useGame, type RankedPlayer } from '../../data/GameProvider';
import { firstName, formatPoints, playerLabel, splitStandings, tiedRanks } from '../../lib/standings';
import { useSession } from '../../session/SessionProvider';
import { StandingBadge } from './StandingBadge';
import './ranks.css';

const SPOT_CLASS = { 1: 'rk-podium__spot--left', 2: 'rk-podium__spot--centre', 3: 'rk-podium__spot--right' } as const;

/**
 * The top three as a podium: 2nd on the left, 1st in the middle on the tallest block, 3rd on the right. Tied players
 * stand on equal blocks with the shared rank. Your own block is red; a player who left is greyed out. `full` (the
 * Standings screen) adds avatars and a taller podium.
 */
export function Podium({
  players,
  meUid,
  onSelect,
  full = false,
}: {
  players: RankedPlayer[];
  meUid: string | null;
  onSelect(uid: string): void;
  full?: boolean;
}) {
  const { podium } = splitStandings(players);
  const tied = tiedRanks(players);
  if (podium.length === 0) return null;

  return (
    <ol className={`rk-podium${full ? ' rk-podium--full' : ''}`} aria-label="Podium">
      {podium.map(({ player: p, column, step }) => {
        const you = p.id === meUid;
        return (
          <li key={p.id} className={`rk-podium__spot ${SPOT_CLASS[column]}`}>
            <button
              type="button"
              className={`rk-pod${you ? ' is-you' : ''}${p.left ? ' is-left' : ''}`}
              onClick={() => onSelect(p.id)}
              aria-label={playerLabel(p, { you, tied: tied.has(p.rank) })}
            >
              <span className="rk-pod__label">
                {full ? <Avatar name={p.displayName} src={p.photoURL} size={44} you={you} uid={p.id} /> : null}
                <span className="rk-pod__name">{you ? 'You' : firstName(p.displayName)}</span>
                {p.left ? <span className="rk-pod__left">Left</span> : null}
                <StandingBadge points={p.points} />
                <span className="rk-pod__pts">{formatPoints(p.points)}</span>
              </span>
              <span className={`rk-pod__block rk-pod__block--${step}`}>{p.rank}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Home's ranks, ticket-stub style: the podium, then a wristband for 4th place onwards that scrolls sideways (it
 * starts on you if you are further down), ending in an "All" tab to the full standings. Tap a player for their record.
 */
export function RanksStrip({ onSelect }: { onSelect(uid: string): void }) {
  const { user } = useSession();
  const { players } = useGame();
  const uid = user?.uid ?? null;
  const { rest } = splitStandings(players);
  const tied = tiedRanks(players);
  const myIndex = rest.findIndex((p) => p.id === uid);
  const bandRef = useRef<HTMLOListElement>(null);

  // Bring your own cell into view, without moving the page.
  useEffect(() => {
    const band = bandRef.current;
    const cell = myIndex >= 0 ? (band?.children[myIndex] as HTMLElement | undefined) : undefined;
    if (!band || !cell) return;
    band.scrollLeft = cell.offsetLeft - (band.clientWidth - cell.offsetWidth) / 2;
  }, [myIndex]);

  if (players.length === 0) return null;

  return (
    <section className="rk-ranks" aria-label="Standings">
      <Podium players={players} meUid={uid} onSelect={onSelect} />
      {rest.length > 0 ? (
        <div className="rk-strip">
          <ol className="rk-strip__band" aria-label="Everyone else" ref={bandRef}>
            {rest.map((p) => {
              const you = p.id === uid;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`rk-wb${you ? ' is-you' : ''}${p.left ? ' is-left' : ''}`}
                    onClick={() => onSelect(p.id)}
                    aria-label={playerLabel(p, { you, tied: tied.has(p.rank) })}
                  >
                    <span className="rk-wb__who">
                      {p.left ? null : <span>{p.rank} ·</span>}
                      <span className="rk-wb__name">{you ? 'You' : firstName(p.displayName)}</span>
                      {p.left ? <span>· Left</span> : null}
                      <StandingBadge points={p.points} />
                    </span>
                    <span className="rk-wb__pts">{formatPoints(p.points)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <Link to="/standings" className="rk-strip__all" aria-label="All standings">
            <span className="rk-snap" aria-hidden="true" />
            All
          </Link>
        </div>
      ) : null}
    </section>
  );
}
