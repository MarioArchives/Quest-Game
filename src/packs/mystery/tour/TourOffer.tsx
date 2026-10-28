// The offer of the torch tour, a kraft tag tied on under the sealed case file's wax seal, hanging down the file's
// right-hand side, or, on the mission stack (no start time yet, or booked in after the case opened), hung on a brass tack
// under the folders, where it covers nothing; before the case opens it also hangs straight down from My file's twine in
// the tampering missions' place (SealedLine): "Time to kill? See tonight in 10 stops." Take the tour, or No thanks (the
// tag drops away, and with it the tour: it's the only way in). Who sees it is tourState's offerShown: a player before
// the case opens, or one who booked in after it opened; never a GM. Under the seal it is rendered inside the file's
// frame, which it measures; on the twine it sits in the line's own grid.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { tsMs } from '../../../data/hooks';
import { useGame } from '../../../data/GameProvider';
import { useSession } from '../../../session/SessionProvider';
import { ArrowIcon, HangTag } from './HangTag';
import { boxIn } from './layout';
import { STOPS } from './stops';
import { lateJoiner, offerShown, prefetchTour, startTour, useTourMark, useTourRequest, writeMark } from './tourState';
import './hangtag.css';

const WIDTH = 150;
const DROP_MS = 420;
/** On its own tack: how far down the tag hangs, so its knot sits under the tack. */
const PIN_DROP = 34;

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Whether this player is offered the tour on the Missions folder now. */
export function useTourOffer(): boolean {
  const { user, player, isAdmin } = useSession();
  const { state } = useGame();
  const mark = useTourMark(user?.uid ?? null);
  const running = useTourRequest() !== null;
  const bookedAt = player?.bookedAt ? tsMs(player.bookedAt) : null;
  const startedAt = state.startedAt ? tsMs(state.startedAt) : null;
  return offerShown({ gm: isAdmin, player: Boolean(player && !player.left), status: state.status, late: lateJoiner(bookedAt, startedAt), mark, bookedAt, running });
}

/** The player's booking, for a mark to answer (see TourMark). */
export function useBooked(): number | undefined {
  const { player } = useSession();
  return player?.bookedAt ? tsMs(player.bookedAt) : undefined;
}

/**
 * The offer, tied on under `anchor` (the wax seal, inside the positioned element this renders in), hung straight down
 * from a twine the parent draws (`line`), or without either hung on its own tack in the page's flow.
 */
export function TourOffer({ anchor, line = false }: { anchor?: '.wax'; line?: boolean }) {
  const { user } = useSession();
  const shown = useTourOffer();
  const booked = useBooked();
  const [leaving, setLeaving] = useState(false);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [height, setHeight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const uid = user?.uid ?? null;

  // The heavy half is fetched while the offer is up, so Take starts at once.
  useEffect(() => {
    if (shown) prefetchTour();
  }, [shown]);

  // Under the anchor, down the folder's right-hand side, inside its edge; or in the middle under its own tack, with the
  // room it needs kept open below the folders.
  useLayoutEffect(() => {
    const tag = ref.current;
    const frame = tag?.parentElement;
    if (line || !tag || !frame) return;
    const measure = () => {
      if (!anchor) {
        setAt({ x: Math.max(4, (frame.clientWidth - WIDTH) / 2), y: PIN_DROP });
        setHeight(PIN_DROP + tag.offsetHeight + 12);
        return;
      }
      const knot = frame.querySelector<Element>(anchor);
      if (!knot) return setAt(null);
      const k = boxIn(knot, frame);
      const x = Math.min(k.x + k.w / 2 - WIDTH / 2, frame.clientWidth - WIDTH - 4);
      setAt({ x: Math.max(4, x), y: k.y + k.h - 6 });
    };
    measure();
    const seen = new ResizeObserver(measure);
    seen.observe(frame);
    return () => seen.disconnect();
  }, [anchor, line, shown, leaving]);

  if (!uid || (!shown && !leaving)) return null;

  // Taken, the run answers the offer once it's going (TourFrame), so a tour that fails to load can be tried again.
  const take = () => void startTour();
  const later = () => {
    writeMark(uid, { offer: 'later', booked });
    if (reducedMotion()) return;
    setLeaving(true);
    window.setTimeout(() => setLeaving(false), DROP_MS);
  };

  const tag = (
    <HangTag
      width={WIDTH}
      tilt={line ? 0 : 2}
      className={`tr-offer${line ? ' tr-offer--line' : ''}${leaving ? ' is-gone' : ''}`}
      style={line ? undefined : at ? { left: at.x, top: at.y } : { visibility: 'hidden' }}
      ref={ref}
    >
      <p className="tr-ht__no">
        <span>Tour</span>
        <span>2 min</span>
      </p>
      <p className="tr-ht__t">Time to kill? See tonight in {STOPS.length} stops.</p>
      <div className="tr-ht__stack">
        <button type="button" className="tr-ht__go" onClick={take} disabled={leaving}>
          Take the tour <ArrowIcon />
        </button>
        <button type="button" className="tr-ht__later" onClick={later} disabled={leaving}>
          No thanks
        </button>
      </div>
    </HangTag>
  );
  if (anchor || line) return tag;
  return (
    <div className="tr-offer-pin" style={{ height: height || undefined }}>
      <span className="tr-offer-pin__tack" aria-hidden="true" />
      {tag}
    </div>
  );
}
