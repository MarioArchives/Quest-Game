// The Board: two tabs. Feed is the engine's home (group missions and game updates, minus its ranks strip),
// Standings is "bars from zero".
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Avatar } from '../../../components/Avatar';
import { Loader } from '../../../components/Loader';
import { useGame } from '../../../data/GameProvider';
import { standingBars } from '../../../lib/standingBars';
import Dashboard from '../../../screens/Dashboard';
import { useSession } from '../../../session/SessionProvider';
import './board.css';

type BoardTab = 'feed' | 'standings';
const STORAGE_KEY = 'board-tab';

function savedTab(): BoardTab {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === 'standings' ? 'standings' : 'feed';
  } catch {
    return 'feed';
  }
}

export default function Board() {
  const [tab, setTab] = useState<BoardTab>(savedTab);
  const choose = (next: BoardTab) => {
    setTab(next);
    try {
      sessionStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* no storage: the tab just isn't remembered */
    }
  };
  return (
    <>
      <div className="bd-tabs" role="tablist" aria-label="Board">
        {(['feed', 'standings'] as const).map((id) => (
          <button key={id} type="button" role="tab" id={`bd-tab-${id}`} aria-selected={tab === id} aria-controls="bd-panel" className="bd-tab" onClick={() => choose(id)}>
            {id === 'feed' ? 'Feed' : 'Standings'}
          </button>
        ))}
      </div>
      <div id="bd-panel" role="tabpanel" aria-labelledby={`bd-tab-${tab}`} className="bd-panel">
        {tab === 'feed' ? (
          <div className="bd-feed">
            <Dashboard />
          </div>
        ) : (
          <Standings />
        )}
      </div>
    </>
  );
}

function Standings() {
  const { user } = useSession();
  const { ready, players } = useGame();
  const navigate = useNavigate();
  if (!ready) return <Loader className="app__loader" caption="Loading" />;

  const bars = standingBars(players, user?.uid ?? null, { minWidth: 52, maxWidth: 118 });
  if (bars.length === 0) {
    return (
      <div className="empty">
        <h3>Nobody on the board</h3>
        <p>Suspects show up here once the GM lets them in.</p>
      </div>
    );
  }
  return (
    <section className="st" aria-label="Standings">
      <div className="st__heads" aria-hidden="true">
        <span className="st__head st__head--clear">In the clear</span>
        <span className="st__head st__head--suspect">Under suspicion</span>
      </div>
      <ol className="st__rows" style={{ ['--rows' as string]: bars.length }}>
        {bars.map((b) => {
          const icon = (
            <Avatar name={b.name} src={b.photoURL} size={34} uid={b.uid} className={`st__icon st__icon--${b.side}${b.me ? ' st__icon--me' : ''}`} />
          );
          const bar = (
            <span className={`st__bar st__bar--${b.side}`} style={{ width: b.width }}>
              {b.label}
            </span>
          );
          return (
            <li key={b.uid} className="st__li">
              <button type="button" className="st__row" aria-label={`${b.me ? 'You' : b.name}, ${b.label}`} onClick={() => navigate(`/player/${b.uid}`)}>
                <span className="st__side st__side--left">
                  {b.side === 'plus' ? (
                    <>
                      {icon}
                      {bar}
                    </>
                  ) : null}
                </span>
                <span className="st__side st__side--right">
                  {b.side === 'minus' ? (
                    <>
                      {bar}
                      {icon}
                    </>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
