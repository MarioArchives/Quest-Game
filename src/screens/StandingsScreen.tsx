import { Link, useNavigate } from 'react-router';
import { AshtonLoader } from '../components/AshtonLoader';
import { Icon } from '../components/Icon';
import { useGame } from '../data/GameProvider';
import { firstName, formatPoints, playerLabel, splitStandings, tiedRanks } from '../lib/standings';
import { useSession } from '../session/SessionProvider';
import { Podium } from './home/RanksStrip';
import './home/ranks.css';

/** The full leaderboard: the podium, then a wristband for everyone else. Tap a player for their record. */
export default function StandingsScreen() {
  const { user } = useSession();
  const { ready, players } = useGame();
  const navigate = useNavigate();

  if (!ready) return <AshtonLoader className="app__loader" caption="Loading" />;

  const uid = user?.uid ?? null;
  const open = (id: string) => navigate(`/player/${id}`);
  const { rest } = splitStandings(players);
  const tied = tiedRanks(players);

  return (
    <>
      <div className="rk-top">
        <Link to="/" className="rk-back" aria-label="Back to Home">
          <Icon name="chevron" size={20} strokeWidth={2.4} className="rk-back__icon" />
          Home
        </Link>
        {players.length > 0 ? (
          <span className="section-head__meta">
            {players.length} {players.length === 1 ? 'player' : 'players'}
          </span>
        ) : null}
      </div>

      {players.length === 0 ? (
        <div className="empty">
          <h3>Nobody on the board</h3>
          <p>Players show up here once the GM lets them in.</p>
        </div>
      ) : (
        <>
          <Podium players={players} meUid={uid} onSelect={open} full />
          {rest.length > 0 ? (
            <ol className="rk-bands" aria-label="Everyone else">
              {rest.map((p) => {
                const you = p.id === uid;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`rk-band${you ? ' is-you' : ''}${p.left ? ' is-left' : ''}`}
                      onClick={() => open(p.id)}
                      aria-label={playerLabel(p, { you, tied: tied.has(p.rank) })}
                    >
                      <span className="rk-band__strap">
                        <span className="rk-band__rank">{p.rank}</span>
                        <span className="rk-band__who">
                          <span className="rk-band__name">{you ? 'You' : firstName(p.displayName)}</span>
                          {p.left ? (
                            <span className="rk-band__tag">
                              Left
                              <span className="rk-band__frozen">
                                {' · '}
                                <span className="rk-band__score">score </span>frozen
                              </span>
                            </span>
                          ) : null}
                        </span>
                        <span className="rk-band__pts">{formatPoints(p.points)}</span>
                      </span>
                      {p.left ? (
                        // Cut off: the strap ends in a snipped, detached tail.
                        <svg className="rk-band__cut" width="44" height="30" viewBox="0 0 44 30" aria-hidden="true">
                          <path className="rk-band__snip" d="M2 8l5 4M2 22l5-4" />
                          <path className="rk-band__end" d="M14 1H36L43 15L36 29H14L18 22L14 15L18 8Z" />
                        </svg>
                      ) : (
                        <>
                          <span className="rk-band__snap" aria-hidden="true" />
                          <svg className="rk-band__tail" width="24" height="30" viewBox="0 0 24 30" aria-hidden="true">
                            <path d="M0 1H16L23 15L16 29H0" />
                          </svg>
                        </>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : null}
        </>
      )}
    </>
  );
}
