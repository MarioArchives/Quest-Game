import { Suspense, useEffect, useRef, type MouseEvent } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { Loader } from '../components/Loader';
import { Avatar } from '../components/Avatar';
import { Icon, isIconName, type IconName } from '../components/Icon';
import { useClosePhotoViewer } from '../components/PhotoViewer';
import { RewardSheetProvider } from '../components/RewardSheet';
import look from '@pack';
import { chipCountdown, spokenCountdown } from '../lib/countdown';
import { litTab, tabLabels, tabStep, tabsFor, type TabId } from '../lib/nav';
import { brand, features, pack, t } from '../pack';
import { useGame } from '../data/GameProvider';
import { useTabSwipe } from '../data/useTabSwipe';
import { canTurn, startTurn, turning } from '../data/tabTurn';
import { useOpening } from '../data/useOpening';
import { useTabBadges } from '../data/useTabBadges';
import { refreshPush } from '../data/usePush';
import { useSession } from '../session/SessionProvider';
import { TipLine } from './home/TipLine';
import { VoteLayer, VoteTakeoverProvider, useVoteTakeover } from './vote/VoteLayer';
import './AppFrame.css';

interface Tab {
  to: string;
  label: string;
  icon: IconName;
  /** A red dot on the tab: something is waiting for you here. */
  dot?: boolean;
  dotLabel?: string;
}

const LABELS = tabLabels(brand.tabs, { gm: t.gm.One, wrap: t.wrap.One });
/** The pack has its own Feed screen and tab. */
const FEED_TAB = Boolean(look.screens?.feed);
/** The pack hosts the map in a screen of its own (a folder tab under Home), so there is no Map tab. */
const OWN_MAP = Boolean(look.screens?.map);

const TITLES: Record<string, string> = {
  '/': pack.name,
  // A pack's feed is the game's second home: it keeps the game's name.
  '/feed': pack.name,
  '/account': LABELS.account,
  '/map': OWN_MAP ? pack.name : LABELS.map,
  '/gm': `${t.gm.One} console`,
  '/wrap': `Your ${t.wrap.one.toLowerCase()}`,
  '/join': 'Join the game',
  '/standings': 'Standings',
};

/** A tab's icon: the pack's own if it draws one, else the engine's. */
const iconFor = (id: TabId, fallback: IconName): IconName => {
  const own = brand.tabIcons?.[id];
  return isIconName(own) ? own : fallback;
};

/** Every tab the frame can show; tabsFor picks which ones and in what order. */
const TABS: Record<TabId, Tab> = {
  home: {
    to: '/',
    label: LABELS.home,
    icon: iconFor('home', 'home'),
    dotLabel: FEED_TAB ? 'something to enter or answer' : 'new posts',
  },
  feed: { to: '/feed', label: LABELS.feed, icon: iconFor('feed', 'comment'), dotLabel: 'new posts' },
  map: { to: '/map', label: LABELS.map, icon: iconFor('map', 'map') },
  account: { to: '/account', label: LABELS.account, icon: iconFor('account', 'user'), dotLabel: 'something needs you' },
  gm: { to: '/gm', label: LABELS.gm, icon: iconFor('gm', 'gm'), dotLabel: 'work waiting' },
  wrap: { to: '/wrap', label: LABELS.wrap, icon: iconFor('wrap', 'wrap'), dotLabel: 'the game is over, see your wrap' },
};

export function AppFrame() {
  return (
    <RewardSheetProvider>
      <VoteTakeoverProvider>
        <Frame />
      </VoteTakeoverProvider>
    </RewardSheetProvider>
  );
}

function Frame() {
  const { showing: voting } = useVoteTakeover();
  const { player, user, isAdmin } = useSession();
  const { state, me } = useGame();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const badges = useTabBadges(pathname, FEED_TAB);
  // The one place that opens the game at zero (see useOpening); a player's chip counts down to the start meanwhile.
  const opening = useOpening();
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  const closePhoto = useClosePhotoViewer();

  // Tokens rotate: a device that switched notifications on re-registers each time the app starts.
  useEffect(() => {
    void refreshPush();
  }, []);

  const title = TITLES[pathname] ?? (pathname.startsWith('/player/') ? 'Player' : pack.name);

  useEffect(() => {
    document.title = title === pack.name ? pack.name : `${title} · ${pack.name}`;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // New screen: back to the top, and screen readers start at its content.
    closePhoto();
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname, title, closePhoto]);

  // A red dot says something is waiting there: new posts (Home, or the pack's Feed, when Home then says a side quest or
  // a check-in needs you), something for you (Account), GM work, the wrap.
  const dots: Record<TabId, boolean> = {
    home: badges.home,
    feed: badges.feed,
    map: false,
    account: badges.account,
    gm: badges.gm,
    wrap: badges.wrap,
  };
  const lit = litTab(pathname, OWN_MAP);
  // With a feed tab, Home's dot points to what needs you there, so it goes while you are on it.
  if (FEED_TAB && lit === 'home') dots.home = false;
  const tabs = tabsFor({ features, isAdmin, ended: state.status === 'ended', feed: FEED_TAB, ownMap: OWN_MAP }).map((id) => ({ ...TABS[id], id, dot: dots[id] }));

  useTabSwipe(mainRef, tabs, lit, pathname !== '/map');

  // A tap on another tab turns the page too (in a pack that does), just without a finger.
  const tapTab = (e: MouseEvent<HTMLAnchorElement>, tab: (typeof tabs)[number]) => {
    if (brand.tabSwipe !== 'turn' || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !canTurn()) return;
    const step = tabStep(tabs.map((x) => x.id), lit, tab.id);
    if (step === 0) return;
    e.preventDefault();
    if (turning()) return; // mid-turn: the tap would pull the screen out from under it
    const turn = startTurn({ to: tab.to, dir: step, navigate });
    if (turn) void turn.play();
    else navigate(tab.to);
  };

  const displayName = player?.displayName ?? user?.displayName ?? 'You';
  const photo = player?.photoURL ?? user?.photoURL ?? null;

  return (
    <>
    <div className={`app${pathname === '/map' ? ' app--fill' : ''}`} inert={voting !== null}>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>
        Skip to content
      </a>
      <header className="appbar">
        <h1 className="appbar__title">{title}</h1>
        <div className="appbar__right">
          {player && opening ? (
            <span className="appbar__score">
              <TipLine />
              <span
                className={`chip appbar__points appbar__points--count${opening.stage === 'final' ? ' appbar__points--final' : ''}`}
                aria-label={`Starts in ${spokenCountdown(opening.remainingMs)}`}
              >
                <Icon name="clock" size={15} strokeWidth={2.4} />
                {chipCountdown(opening.remainingMs)}
              </span>
            </span>
          ) : player ? (
            <span className="appbar__score">
              <TipLine />
              <span className="chip appbar__points" aria-label={`${player.points} points${me ? `, rank ${me.rank}` : ''}`}>
                {player.points} pts{me ? ` · #${me.rank}` : ''}
              </span>
            </span>
          ) : (
            <span className="chip appbar__points">{t.gm.One}</span>
          )}
          <Link to="/account" className="appbar__avatar" aria-label="Your account">
            <Avatar name={displayName} src={photo} size={38} you uid={user?.uid} />
          </Link>
        </div>
      </header>

      <main id="main" className="app__main" ref={mainRef} tabIndex={-1}>
        <Suspense fallback={<Loader className="app__loader" caption="Loading" />}>
          <Outlet />
        </Suspense>
      </main>

      <nav className="tabbar" aria-label="Main" data-count={tabs.length}>
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            onClick={(e) => tapTab(e, tab)}
            aria-label={tab.dot ? `${tab.label}, ${tab.dotLabel}` : undefined}
            className={`tabbar__tab${tab.id === lit ? ' is-active' : ''}`}
            aria-current={tab.id === lit ? 'page' : undefined}
          >
            <span className="tabbar__icon">
              <Icon name={tab.icon} size={22} />
              {tab.dot ? <span className="tabbar__dot" aria-hidden="true" /> : null}
            </span>
            <span>{tab.label}</span>
          </Link>
        ))}
      </nav>
    </div>
    <VoteLayer />
    </>
  );
}
