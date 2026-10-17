import { useEffect, useRef, useState } from 'react';
import { Loader } from '../../components/Loader';
import { Icon } from '../../components/Icon';
import { useGame } from '../../data/GameProvider';
import { gmSectionsFor, type GmSectionId } from '../../lib/nav';
import { features, t } from '../../pack';
import { GameSection } from './GameSection';
import { GM_DRAWER_ID, GmDrawer } from './GmDrawer';
import { GmDataProvider, useGmData } from './GmData';
import { GuessLogSection } from './GuessLogSection';
import { JoinSection } from './JoinSection';
import { PeriodicsSection } from './PeriodicsSection';
import { PoliceSection } from './PoliceSection';
import { PlayersSection } from './PlayersSection';
import { QuestsSection } from './QuestsSection';
import { ReviewSection } from './ReviewSection';
import { SettingsSection } from './SettingsSection';
import { STORY, StorySection } from './StorySection';
import { TemplatesSection } from './TemplatesSection';
import './gm.css';

export type GmSection = GmSectionId;

const LABELS: Record<GmSection, string> = {
  game: 'Game',
  joins: 'Joins',
  review: 'Review',
  quests: t.sideQuest.Many,
  story: 'Story',
  periodics: t.checkin.Many,
  police: t.policeCall.Many,
  players: 'Players',
  guesses: 'Guesses',
  templates: t.quest.Many,
  settings: 'Settings',
};

/** The sections this pack's features leave in the console. */
const SECTIONS: { id: GmSection; label: string }[] = gmSectionsFor(features, { story: STORY.length > 0 }).map((id) => ({ id, label: LABELS[id] }));

const STORAGE_KEY = 'fq:gm-section';

function loadSection(): GmSection {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (SECTIONS.some((t) => t.id === saved)) return saved as GmSection;
  } catch {
    /* private mode */
  }
  return SECTIONS[0]!.id;
}

export default function GMConsole() {
  const { ready } = useGame();
  if (!ready) return <Loader className="app__loader" caption="Loading" />;
  return (
    <GmDataProvider>
      <Console />
    </GmDataProvider>
  );
}

function Console() {
  const { globalQuests } = useGame();
  const { pendingJoins, pendingSubs } = useGmData();
  const [section, setSectionState] = useState<GmSection>(loadSection);
  const [menuOpen, setMenuOpen] = useState(false);

  const setSection = (next: GmSection) => {
    setSectionState(next);
    try {
      sessionStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  // New section: start at the top, but never yank the page on first mount.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo(0, 0);
  }, [section]);

  const counts: Partial<Record<GmSection, number>> = {
    joins: pendingJoins.length,
    review: pendingSubs.length,
    quests: globalQuests.filter((g) => g.status === 'live' || g.status === 'checking' || g.status === 'voting').length,
  };
  // The burger shows a dot when anything needs the GM (side quests running is not a chore, but checking entries is).
  const needsAttention = pendingJoins.length + pendingSubs.length + globalQuests.filter((g) => g.status === 'checking').length;
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]!;
  const currentCount = counts[section] ?? 0;

  return (
    <>
      <div className="gm-bar">
        <button
          type="button"
          className="gm-burger"
          aria-label={needsAttention > 0 ? `Menu, ${needsAttention} waiting` : 'Menu'}
          aria-expanded={menuOpen}
          aria-controls={GM_DRAWER_ID}
          aria-haspopup="dialog"
          onClick={() => setMenuOpen(true)}
        >
          <Icon name="menu" size={24} strokeWidth={2.4} />
          {needsAttention > 0 ? <span className="gm-burger__dot" aria-hidden="true" /> : null}
        </button>
        <div className="gm-bar__titles">
          <p className="eyebrow gm-bar__eyebrow">{t.gm.One} console</p>
          <h2 id="gm-section-title" className="gm-bar__title">
            {current.label}
          </h2>
        </div>
        {currentCount > 0 ? (
          <span className="gm-badge" aria-label={`${currentCount} ${section === 'quests' ? 'running' : 'waiting'}`}>
            {currentCount}
          </span>
        ) : null}
      </div>

      <div className="gm-panel" role="region" id="gm-panel" aria-labelledby="gm-section-title">
        {section === 'game' ? <GameSection go={setSection} /> : null}
        {section === 'joins' ? <JoinSection /> : null}
        {section === 'review' ? <ReviewSection /> : null}
        {section === 'quests' ? <QuestsSection /> : null}
        {section === 'story' ? <StorySection /> : null}
        {section === 'periodics' ? <PeriodicsSection /> : null}
        {section === 'police' ? <PoliceSection /> : null}
        {section === 'players' ? <PlayersSection /> : null}
        {section === 'guesses' ? <GuessLogSection /> : null}
        {section === 'templates' ? <TemplatesSection /> : null}
        {section === 'settings' ? <SettingsSection /> : null}
      </div>

      {menuOpen ? (
        <GmDrawer
          items={SECTIONS.map((s) => ({ ...s, count: counts[s.id] ?? 0, countLabel: s.id === 'quests' ? 'running' : 'waiting' }))}
          current={section}
          onChoose={(next) => {
            setSection(next);
            setMenuOpen(false);
          }}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}
    </>
  );
}
