// The GM console as case files (E4·1) in four manila folder tabs across the top, no burger (design/mockups/mystery/
// gm-console.html, option A): Tonight (the case strip and the jobs that need the GM, strung as tags with their
// buttons), Suspects (nudges, police check-ins with the switchboard, the guess log, frames on file), Missions (the
// group mission, the story and random drops, periodic missions) and Setup (settings as folds, the deck, the route,
// reset). Where a folder says "All …" or "Open …", the engine's own section opens inside the tab, with a way back.
import { useRef, useState, type KeyboardEvent } from 'react';
import { Loader } from '../../../components/Loader';
import { useGame } from '../../../data/GameProvider';
import { GmDataProvider } from '../../../screens/gm/GmData';
import { GuessLogSection } from '../../../screens/gm/GuessLogSection';
import { PeriodicsSection } from '../../../screens/gm/PeriodicsSection';
import { PlayersSection } from '../../../screens/gm/PlayersSection';
import { PoliceSection } from '../../../screens/gm/PoliceSection';
import { StorySection } from '../../../screens/gm/StorySection';
import { TemplatesSection } from '../../../screens/gm/TemplatesSection';
import '../../../screens/gm/gm.css';
import { useLines, type LockerNav, type SubView } from './LockerParts';
import { Missions } from './LockerMissions';
import { Setup } from './LockerSetup';
import { Suspects } from './LockerSuspects';
import { Tonight, useTonightJobs } from './LockerTonight';
import { LOCKER_TABS, stepTab, type LockerTab } from './lockerLib';
import './gmlocker.css';

const LABEL: Record<LockerTab, string> = { tonight: 'Tonight', suspects: 'Suspects', missions: 'Missions', setup: 'Setup' };

/** The tab this browser tab last had open (a reload keeps the GM's place). */
const STORAGE_KEY = 'gl-tab';

function loadTab(): LockerTab {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if ((LOCKER_TABS as readonly string[]).includes(saved ?? '')) return saved as LockerTab;
  } catch {
    /* private mode */
  }
  return 'tonight';
}

export default function GmLocker() {
  const { ready } = useGame();
  if (!ready) return <Loader className="app__loader" caption="Loading" />;
  return (
    <GmDataProvider>
      <Locker />
    </GmDataProvider>
  );
}

function Locker() {
  const lines = useLines();
  const jobs = useTonightJobs(lines);
  const [tab, setTabState] = useState<LockerTab>(loadTab);
  const [sub, setSub] = useState<SubView | null>(null);
  const tabRefs = useRef<Partial<Record<LockerTab, HTMLButtonElement | null>>>({});

  const choose = (next: LockerTab) => {
    setTabState(next);
    setSub(null);
    try {
      sessionStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };
  const nav: LockerNav = {
    open: (view) => {
      setSub(view);
      window.scrollTo(0, 0);
    },
    tab: (next) => {
      choose(next);
      window.scrollTo(0, 0);
    },
  };
  // Arrow keys, Home and End move along the tabs (and open the one they land on).
  const onKey = (event: KeyboardEvent, id: LockerTab) => {
    const next = stepTab(LOCKER_TABS, id, event.key);
    if (!next) return;
    event.preventDefault();
    choose(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="gl">
      <div className="gl-tabs" role="tablist" aria-label="GM console">
        {LOCKER_TABS.map((id) => (
          <button
            key={id}
            ref={(el) => {
              tabRefs.current[id] = el;
            }}
            type="button"
            role="tab"
            id={`gl-tab-${id}`}
            className="gl-tabs__tab"
            aria-selected={tab === id}
            aria-controls="gl-panel"
            tabIndex={tab === id ? 0 : -1}
            onClick={() => choose(id)}
            onKeyDown={(event) => onKey(event, id)}
          >
            {LABEL[id]}
            {id === 'tonight' && jobs.length > 0 ? (
              <>
                <span className="gl-count" aria-hidden="true">
                  {jobs.length}
                </span>
                <span className="visually-hidden">, {jobs.length} need you</span>
              </>
            ) : null}
          </button>
        ))}
      </div>

      <div className="gl-panel" role="tabpanel" id="gl-panel" aria-labelledby={`gl-tab-${tab}`}>
        {sub ? (
          <div className="gl-sub">
            <button
              type="button"
              className="gl-back"
              onClick={() => {
                setSub(null);
                window.scrollTo(0, 0);
              }}
            >
              ← Back to {LABEL[tab]}
            </button>
            <div className="gl-sub__body">
              {sub === 'players' ? <PlayersSection /> : null}
              {sub === 'police' ? <PoliceSection /> : null}
              {sub === 'guesses' ? <GuessLogSection /> : null}
              {sub === 'story' ? <StorySection /> : null}
              {sub === 'periodics' ? <PeriodicsSection /> : null}
              {sub === 'templates' ? <TemplatesSection /> : null}
            </div>
          </div>
        ) : tab === 'tonight' ? (
          <Tonight jobs={jobs} lines={lines} nav={nav} />
        ) : tab === 'suspects' ? (
          <Suspects lines={lines} nav={nav} />
        ) : tab === 'missions' ? (
          <Missions nav={nav} />
        ) : (
          <Setup nav={nav} />
        )}
      </div>
    </div>
  );
}
