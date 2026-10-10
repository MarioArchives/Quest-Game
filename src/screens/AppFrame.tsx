import { Suspense, useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { AshtonLoader } from '../components/AshtonLoader';
import { Avatar } from '../components/Avatar';
import { Icon, type IconName } from '../components/Icon';
import { useClosePhotoViewer } from '../components/PhotoViewer';
import { useGame } from '../data/GameProvider';
import { useTabBadges } from '../data/useTabBadges';
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

const TITLES: Record<string, string> = {
  '/': 'Festival Quest',
  '/account': 'Account',
  '/map': 'Map',
  '/gm': 'GM console',
  '/wrap': 'Your wrap',
  '/join': 'Join the game',
};

export function AppFrame() {
  const { player, user, isAdmin } = useSession();
  const { state, me } = useGame();
  const { pathname } = useLocation();
  const badges = useTabBadges(pathname);
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  const closePhoto = useClosePhotoViewer();

  const title = TITLES[pathname] ?? 'Festival Quest';

  useEffect(() => {
    document.title = pathname === '/' ? 'Festival Quest' : `${title} · Festival Quest`;
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
  const tabs: Tab[] = [
    { to: '/', label: 'Home', icon: 'home', end: true, dot: badges.home, dotLabel: 'new posts' },
    { to: '/map', label: 'Map', icon: 'map' },
    { to: '/account', label: 'Account', icon: 'user', dot: badges.account, dotLabel: 'something needs you' },
  ];
  if (isAdmin) tabs.push({ to: '/gm', label: 'GM', icon: 'gm', dot: badges.gm, dotLabel: 'work waiting' });
  if (state.status === 'ended') tabs.push({ to: '/wrap', label: 'Wrap', icon: 'wrap', dot: badges.wrap, dotLabel: 'the game is over, see your wrap' });

  const displayName = player?.displayName ?? user?.displayName ?? 'You';
  const photo = player?.photoURL ?? user?.photoURL ?? null;

  return (
    <div className="app">
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
            <span className="chip appbar__points">GM</span>
          )}
          <Link to="/account" className="appbar__avatar" aria-label="Your account">
            <Avatar name={displayName} src={photo} size={38} you />
          </Link>
        </div>
      </header>

      <main id="main" className="app__main" ref={mainRef} tabIndex={-1}>
        <Suspense fallback={<AshtonLoader className="app__loader" caption="Loading" />}>
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
  );
}
