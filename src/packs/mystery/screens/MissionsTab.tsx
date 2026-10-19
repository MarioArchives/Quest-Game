// The Missions folder tab (option E, "the stack"): a police check-in on top when one is open for you, the stack of
// open missions (MissionStack), and the night's three kinds below as index dividers (MissionDividers). A feed post's
// "Open in Missions" lands here with its mission brought to the front.
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { features } from '../../../pack';
import { PoliceCallCard } from '../../../screens/home/PoliceCallCard';
import { MissionDividers } from './MissionDividers';
import { MissionStack } from './MissionStack';
import { pullForward, stackOrder } from './missionDeck';
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
  const deadline = deck.open.map((m) => m.id);
  const order = stackOrder(deadline, held);
  const stackRef = useRef<HTMLDivElement>(null);

  const pull = (id: string) => {
    setHeld(pullForward(order, id));
    const top = stackRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) stackRef.current?.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
  };

  // Arrived from a feed post: its mission comes to the front, once it is among the open ones.
  const wanted = (location.state as MissionsLinkState | null)?.mission ?? null;
  const key = deadline.join(' ');
  useEffect(() => {
    if (!wanted || !key.split(' ').includes(wanted)) return;
    setHeld((h) => pullForward(stackOrder(key.split(' '), h), wanted));
    void navigate(location.pathname, { replace: true, state: null });
  }, [wanted, key, navigate, location.pathname]);

  return (
    <div className="ms">
      {features.police ? <PoliceCallCard /> : null}
      <div ref={stackRef} className="ms-stackwrap">
        <MissionStack missions={deck.open} order={order} onOrder={setHeld} onVote={deck.voted} />
      </div>
      {deck.open.length > 1 ? <p className="ms-hint">Swipe the front folder away; tap a tab to pull it forward</p> : null}
      <MissionDividers deck={deck} onPull={pull} />
    </div>
  );
}
