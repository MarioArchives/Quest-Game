// My file's tampering missions before the case opens: the hand stays face down, so nobody sees theirs (or anyone
// else's, over a shoulder) until the game starts. The twine still runs across the page, and in the missions' place one
// upright tag hangs from its middle: the torch tour's offer while it stands, otherwise a plain tag saying they're sealed
// (and till when, once the GM has set a start time).
import { useOpening } from '../../../data/useOpening';
import { clockTime } from '../../../lib/time';
import { t, zone } from '../../../pack';
import { HangTag } from '../tour/HangTag';
import { TourOffer, useTourOffer } from '../tour/TourOffer';
import './missionline.css';

/** As wide as the offer, so either hangs the same. */
const WIDTH = 150;

export function SealedLine({ count }: { count: number }) {
  const offer = useTourOffer();
  const opening = useOpening();
  return (
    <section className="ml" aria-labelledby="ml-title">
      <div className="ml-head">
        <h2 id="ml-title" className="ml-head__title">
          {t.quest.Many} · {count}
        </h2>
        <span className="ml-head__rerolls">Sealed</span>
      </div>
      <p className="ml-note" role="status">
        The game hasn&apos;t started yet. Your {t.quest.many} are dealt face down and open with the case.
      </p>
      <div className="ml-line ml-seal">
        <svg className="ml-twine" viewBox="0 0 390 24" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M-6 8 Q195 26 396 8" vectorEffect="non-scaling-stroke" />
        </svg>
        <TourOffer line />
        {offer ? null : (
          <HangTag width={WIDTH} className="ml-seal__tag">
            <p className="tr-ht__no">
              <span>Sealed</span>
              <span>{opening ? clockTime(opening.opensAtMs, zone) : ''}</span>
            </p>
            <p className="tr-ht__t">Face down until the case opens.</p>
          </HangTag>
        )}
      </div>
    </section>
  );
}
