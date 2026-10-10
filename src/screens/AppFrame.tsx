import { Suspense, useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { AshtonLoader } from '../components/AshtonLoader';
import { Avatar } from '../components/Avatar';
import { Icon, type IconName } from '../components/Icon';
import { useClosePhotoViewer } from '../components/PhotoViewer';
import { useGame } from '../data/GameProvider';
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
  const { state, me, witnessRequests } = useGame();
  const { pathname } = useLocation();
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

  // Friends waiting for this player to witness a claim: a red dot on Account.
  const waiting = player ? witnessRequests.length : 0;
  const tabs: Tab[] = [
    { to: '/', label: 'Home', icon: 'home', end: true },
    { to: '/map', label: 'Map', icon: 'map' },
    {
      to: '/account',
      label: 'Account',
      icon: 'user',
      dot: waiting > 0,
      dotLabel: `${waiting} witness ${waiting === 1 ? 'request' : 'requests'} waiting`,
    },
  ];
  if (isAdmin) tabs.push({ to: '/gm', label: 'GM', icon: 'gm' });
  if (state.status === 'ended') tabs.push({ to: '/wrap', label: 'Wrap', icon: 'wrap' });

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
          <NavLink key={tab.to} to={tab.to} end={tab.end} className={({ isActive }) => `tabbar__tab${isActive ? ' is-active' : ''}`}>
            <span className="tabbar__icon">
              <Icon name={tab.icon} size={22} />
              {tab.dot ? <span className="tabbar__dot" aria-hidden="true" /> : null}
            </span>
            <span>{tab.label}</span>
            {tab.dot ? <span className="visually-hidden">{`, ${tab.dotLabel}`}</span> : null}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
