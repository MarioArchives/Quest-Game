// The Missions folder tab (the missions-active mockups, C2): a police check-in on top when one is open for you, then
// Live, the stack of what's open (MissionStack) but for the entries you can still change, which wait below under Still
// open, then Filed tonight and what comes next (MissionFiles). A feed post's "Open in Missions" lands here with its
// mission brought to the front, or its slip scrolled to.
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { features } from '../../../pack';
import { PoliceCallCard } from '../../../screens/home/PoliceCallCard';
import { MissionFiles, slipId } from './MissionFiles';
import { MissionStack } from './MissionStack';
import { liveAside, pullForward, stackOrder } from './missionDeck';
import type { Deck } from './useMissionDeck';
import './missions.css';

/** What a link into the Missions tab carries: the mission (side quest or check-in) to bring to the front. */
export interface MissionsLinkState {
  mission?: string;
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function MissionsTab({ deck }: { deck: Deck }) {
  const location = useLocation();
  const navigate = useNavigate();
  // Null until the viewer moves a folder: the stack then follows the deadlines.
  const [held, setHeld] = useState<string[] | null>(null);
  const deadline = deck.live.map((m) => m.id);
  const order = stackOrder(deadline, held);
  const need = deck.live.filter((m) => m.needsYou).length;

  // Arrived from a feed post: its mission comes to the front once it is among the open ones, or, when it's an entry
  // you can still change, its slip scrolls into view.
  const wanted = (location.state as MissionsLinkState | null)?.mission ?? null;
  const key = deadline.join(' ');
  const inKey = deck.stillOpen.map((m) => m.id).join(' ');
  useEffect(() => {
    if (!wanted) return;
    if (key.split(' ').includes(wanted)) setHeld((h) => pullForward(stackOrder(key.split(' '), h), wanted));
    else if (inKey.split(' ').includes(wanted)) document.getElementById(slipId(wanted))?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    else return;
    void navigate(location.pathname, { replace: true, state: null });
  }, [wanted, key, inKey, navigate, location.pathname]);

  return (
    <div className="ms">
      {features.police ? <PoliceCallCard /> : null}
      {deck.live.length > 0 ? (
        <header className="ms-sec__h ms-live__h">
          <h3>Live</h3>
          <span>{liveAside(need, deck.live.length)}</span>
        </header>
      ) : null}
      <div className="ms-stackwrap" data-tour="live">
        <MissionStack missions={deck.live} order={order} onOrder={setHeld} onVote={deck.voted} entered={deck.stillOpen.length} />
      </div>
      <MissionFiles deck={deck} />
    </div>
  );
}
