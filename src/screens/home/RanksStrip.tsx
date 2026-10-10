import { Avatar } from '../../components/Avatar';
import { useGame, type RankedPlayer } from '../../data/GameProvider';
import { useSession } from '../../session/SessionProvider';

/** The leaderboard as a row you scroll sideways: rank, avatar, name, points. Tap a player for their sheet. */
export function RanksStrip({ onSelect }: { onSelect(uid: string): void }) {
  const { user } = useSession();
  const { players } = useGame();
  if (players.length === 0) return null;

  return (
    <section className="ranks" aria-label="Leaderboard">
      <ol className="ranks__list">
        {players.map((p: RankedPlayer) => {
          const you = p.id === user?.uid;
          const first = p.displayName.trim().split(/\s+/)[0] ?? p.displayName;
          return (
            <li key={p.id}>
              <button
                type="button"
                className={`rk${you ? ' rk--you' : ''}${p.left ? ' rk--left' : ''}`}
                onClick={() => onSelect(p.id)}
                aria-label={`${p.rank}. ${p.displayName}${you ? ' (you)' : ''}${p.left ? ', has left' : ''}, ${p.points} points. Open profile`}
              >
                <span className="rk__rank" aria-hidden="true">
                  {p.rank}
                </span>
                <Avatar name={p.displayName} src={p.photoURL} size={44} />
                <span className="rk__name" aria-hidden="true">
                  {you ? 'You' : first}
                </span>
                {p.left ? (
                  <span className="rk__left" aria-hidden="true">
                    Left
                  </span>
                ) : null}
                <span className="rk__points" aria-hidden="true">
                  {p.points}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
