import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AshtonLoader } from '../../components/AshtonLoader';
import { Icon } from '../../components/Icon';
import { useModal } from '../../components/useModal';
import { useGame } from '../../data/GameProvider';
import { GameSection } from './GameSection';
import { GmDataProvider, useGmData } from './GmData';
import { GuessLogSection } from './GuessLogSection';
import { JoinSection } from './JoinSection';
import { PlayersSection } from './PlayersSection';
import { QuestsSection } from './QuestsSection';
import { ReviewSection } from './ReviewSection';
import { SettingsSection } from './SettingsSection';
import { TemplatesSection } from './TemplatesSection';
import './gm.css';

export type GmSection = 'game' | 'joins' | 'review' | 'quests' | 'players' | 'guesses' | 'templates' | 'settings';

const SECTIONS: { id: GmSection; label: string }[] = [
  { id: 'game', label: 'Game' },
  { id: 'joins', label: 'Joins' },
  { id: 'review', label: 'Review' },
  { id: 'quests', label: 'Side quests' },
  { id: 'players', label: 'Players' },
  { id: 'guesses', label: 'Guesses' },
  { id: 'templates', label: 'Quests' },
  { id: 'settings', label: 'Settings' },
];

const STORAGE_KEY = 'fq:gm-section';
const DRAWER_ID = 'gm-drawer';

function loadSection(): GmSection {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (SECTIONS.some((t) => t.id === saved)) return saved as GmSection;
  } catch {
    /* private mode */
  }
  return 'game';
}

export default function GMConsole() {
  const { ready } = useGame();
  if (!ready) return <AshtonLoader className="app__loader" caption="Loading" />;
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
    quests: globalQuests.filter((g) => g.status === 'live' || g.status === 'voting').length,
  };
  // The burger shows a dot when anything needs the GM (side quests running is not a chore, so it is left out).
  const needsAttention = pendingJoins.length + pendingSubs.length;
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
          aria-controls={DRAWER_ID}
          aria-haspopup="dialog"
          onClick={() => setMenuOpen(true)}
        >
          <Icon name="menu" size={24} strokeWidth={2.4} />
          {needsAttention > 0 ? <span className="gm-burger__dot" aria-hidden="true" /> : null}
        </button>
        <div className="gm-bar__titles">
          <p className="eyebrow gm-bar__eyebrow">GM console</p>
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
        {section === 'players' ? <PlayersSection /> : null}
        {section === 'guesses' ? <GuessLogSection /> : null}
        {section === 'templates' ? <TemplatesSection /> : null}
        {section === 'settings' ? <SettingsSection /> : null}
      </div>

      {menuOpen ? (
        <GmDrawer
          current={section}
          counts={counts}
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

/** Side drawer: slides in from the left over a dimmed page; Escape, the overlay and the close button dismiss it. */
function GmDrawer({
  current,
  counts,
  onChoose,
  onClose,
}: {
  current: GmSection;
  counts: Partial<Record<GmSection, number>>;
  onChoose(section: GmSection): void;
  onClose(): void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  useModal(panelRef, onClose);

  return createPortal(
    <div className="gm-drawer-root">
      <div className="gm-drawer-backdrop" onClick={onClose} />
      <aside className="gm-drawer" id={DRAWER_ID} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRef} tabIndex={-1}>
        <div className="gm-drawer__head">
          <h2 id={titleId} className="gm-drawer__title">
            GM console
          </h2>
          <button type="button" className="btn-icon" aria-label="Close menu" onClick={onClose}>
            <Icon name="close" size={22} />
          </button>
        </div>
        <nav aria-label="GM console sections">
          <ul className="gm-drawer__list">
            {SECTIONS.map((item) => {
              const count = counts[item.id] ?? 0;
              const active = item.id === current;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`gm-drawer__item${active ? ' is-active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => onChoose(item.id)}
                  >
                    <span className="gm-drawer__label">{item.label}</span>
                    {count > 0 ? (
                      <span className="gm-badge" aria-label={`${count} ${item.id === 'quests' ? 'running' : 'waiting'}`}>
                        {count}
                      </span>
                    ) : null}
                    <Icon name="chevron" size={20} />
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </div>,
    document.body,
  );
}
