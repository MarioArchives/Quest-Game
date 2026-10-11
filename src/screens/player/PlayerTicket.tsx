import type { CSSProperties } from 'react';
import { Avatar } from '../../components/Avatar';
import type { RankedPlayer } from '../../data/GameProvider';
import { ordinal } from '../../lib/record';

const STATUS = {
  playing: 'Status · playing',
  frozen: 'Left · score frozen',
  out: 'Out of the game',
} as const;

/** The ticket at the top of a player's pass: who, points, and a tear-off stub with their place on the board. */
export function PlayerTicket({ player, isMe, boardSize, gap }: { player: RankedPlayer; isMe: boolean; boardSize: number; gap: string | null }) {
  const out = player.left === 'out' || player.rank === 0;
  // Long words get smaller type, and the name drops below the avatar when its longest word won't fit beside it.
  const longest = Math.max(1, ...player.displayName.split(/[\s-]+/).map((w) => w.length));
  const size = longest > 10 ? 'l' : longest > 6 ? 'm' : 's';
  return (
    <section className={`pl-ticket${player.left ? ' is-left' : ''}`} aria-labelledby="pl-name">
      <div className="pl-ticket__main">
        <p className="pl-ticket__eyebrow">
          Admit one &middot; player
          {isMe ? <span className="tag tag--red pl-ticket__you">You</span> : null}
        </p>
        <div className="pl-ticket__who">
          <Avatar name={player.displayName} src={player.photoURL} size={52} you={isMe} />
          <h2 id="pl-name" className={`pl-ticket__name pl-ticket__name--${size}`} style={{ '--word': longest } as CSSProperties}>
            {player.displayName}
          </h2>
        </div>
        <p className="pl-ticket__score">
          <span className="pl-ticket__pts">{player.points ?? 0}</span>
          <span className="pl-ticket__unit">pts</span>
          {gap && !out ? <span className="pl-ticket__gap">&middot; {gap}</span> : null}
        </p>
      </div>
      <div className="pl-ticket__stub">
        <span className="pl-ticket__label">Rank</span>
        {out ? null : <Podium rank={player.rank} />}
        <span className="pl-ticket__place">{out ? 'Out' : ordinal(player.rank)}</span>
        <span className="pl-ticket__of">{out ? 'Off the board' : `of ${boardSize}`}</span>
      </div>
    </section>
  );
}

/** A tiny 2-1-3 podium; the player's step is inked when they are on it. */
function Podium({ rank }: { rank: number }) {
  return (
    <span className="pl-podium" aria-hidden="true">
      {[2, 1, 3].map((step) => (
        <span key={step} className={`pl-podium__step pl-podium__step--${step}${rank === step ? ' is-on' : ''}`}>
          {step}
        </span>
      ))}
    </span>
  );
}

/** The status wristband: red while playing, a grey cut band once they've left. */
export function Wristband({ player }: { player: RankedPlayer }) {
  const kind = player.left === 'out' ? 'out' : player.left === 'frozen' ? 'frozen' : 'playing';
  return (
    <p className={`pl-band pl-band--${kind}`}>
      <span className="pl-band__clasp" aria-hidden="true">
        <span />
      </span>
      <span className="pl-band__strap">
        <span>{STATUS[kind]}</span>
        <span className="pl-band__mark" aria-hidden="true">
          LMF 2026
        </span>
      </span>
    </p>
  );
}
