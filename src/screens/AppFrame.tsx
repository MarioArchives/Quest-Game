import { Suspense, useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { Loader } from '../components/Loader';
import { Avatar } from '../components/Avatar';
import { Icon, isIconName, type IconName } from '../components/Icon';
import { useClosePhotoViewer } from '../components/PhotoViewer';
import { RewardSheetProvider } from '../components/RewardSheet';
import { tabLabels, tabsFor, type TabId } from '../lib/nav';
import { brand, features, pack, t } from '../pack';
import { useGame } from '../data/GameProvider';
import { useTabBadges } from '../data/useTabBadges';
import { refreshPush } from '../data/usePush';
import { useSession } from '../session/SessionProvider';
import './AppFrame.css';

interface Tab {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
  /** A red dot on the tab: something is waiting for you here. */
  dot?: boolean;
  dotLabel?: string;
}

const LABELS = tabLabels(brand.tabs, { gm: t.gm.One, wrap: t.wrap.One });

const TITLES: Record<string, string> = {
  '/': pack.name,
  '/account': LABELS.account,
  '/map': LABELS.map,
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
  home: { to: '/', label: LABELS.home, icon: iconFor('home', 'home'), end: true, dotLabel: 'new posts' },
  map: { to: '/map', label: LABELS.map, icon: iconFor('map', 'map') },
  account: { to: '/account', label: LABELS.account, icon: iconFor('account', 'user'), dotLabel: 'something needs you' },
  gm: { to: '/gm', label: LABELS.gm, icon: iconFor('gm', 'gm'), dotLabel: 'work waiting' },
  wrap: { to: '/wrap', label: LABELS.wrap, icon: iconFor('wrap', 'wrap'), dotLabel: 'the game is over, see your wrap' },
};

export function AppFrame() {
  const { player, user, isAdmin } = useSession();
  const { state, me } = useGame();
  const { pathname } = useLocation();
  const badges = useTabBadges(pathname);
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  const closePhoto = useClosePhotoViewer();

  // Tokens rotate: a device that switched notifications on re-registers each time the app starts.
  useEffect(() => {
    void refreshPush();
  }, []);

  const title = TITLES[pathname] ?? (pathname.startsWith('/player/') ? 'Player' : pack.name);

  useEffect(() => {
    document.title = pathname === '/' ? pack.name : `${title} · ${pack.name}`;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // New screen: back to the top, and screen readers start at its content.
    closePhoto();
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname, title, closePhoto]);

  // A red dot says something is waiting there: new posts (Home), something for you (Account), GM work, the wrap.
  const dots: Record<TabId, boolean> = {
    home: badges.home,
    map: false,
    account: badges.account,
    gm: badges.gm,
    wrap: badges.wrap,
  };
  const tabs = tabsFor({ features, isAdmin, ended: state.status === 'ended' }).map((id) => ({ ...TABS[id], dot: dots[id] }));

  const displayName = player?.displayName ?? user?.displayName ?? 'You';
  const photo = player?.photoURL ?? user?.photoURL ?? null;

  return (
    <RewardSheetProvider>
    <div className={`app${pathname === '/map' ? ' app--fill' : ''}`}>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>
        Skip to content
      </a>
      <header className="appbar">
        <h1 className="appbar__title">{title}</h1>
        <div className="appbar__right">
          {player ? (
            <span className="chip appbar__points" aria-label={`${player.points} points${me ? `, rank ${me.rank}` : ''}`}>
              {player.points} pts{me ? ` · #${me.rank}` : ''}
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
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            aria-label={tab.dot ? `${tab.label}, ${tab.dotLabel}` : undefined}
            className={({ isActive }) => `tabbar__tab${isActive ? ' is-active' : ''}`}
          >
            <span className="tabbar__icon">
              <Icon name={tab.icon} size={22} />
              {tab.dot ? <span className="tabbar__dot" aria-hidden="true" /> : null}
            </span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
    </RewardSheetProvider>
  );
}
