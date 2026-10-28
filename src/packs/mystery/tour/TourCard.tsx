// "How tonight works" in My file: the torch tour kept for good, strung like the file's own tags, to take again whole
// or from one of its parts. Under the suspect file before the case opens, under your missions once it has; for players
// and GMs alike.
import { useEffect } from 'react';
import { clockTime } from '../../../lib/time';
import { zone } from '../../../pack';
import { useSession } from '../../../session/SessionProvider';
import { Strung, Tag, TagTop } from '../screens/CaseKit';
import { PlayIcon } from './HangTag';
import { PARTS, STOPS } from './stops';
import { prefetchTour, startTour, useTourMark } from './tourState';
import './hangtag.css';

export function TourCard() {
  const { user } = useSession();
  const mark = useTourMark(user?.uid ?? null);
  const toured = mark?.touredAt ? clockTime(mark.touredAt, zone) : null;

  // The heavy half is fetched while the card is on screen, so a part starts at once.
  useEffect(() => prefetchTour(), []);

  return (
    <section className="tr-tourcard-wrap" aria-labelledby="tr-tourcard-title">
      <div className="ml-head">
        <h2 id="tr-tourcard-title" className="ml-head__title">
          How tonight works
        </h2>
        <span className="ml-head__rerolls">{toured ? `toured ${toured}` : 'yours to keep'}</span>
      </div>
      <Strung className="tr-tourcard" label="How tonight works">
        <Tag>
          <TagTop left={`Torch tour · ${STOPS.length} stops`} right="3 min" />
          <h3 className="tr-tourcard__t">The tour, any time</h3>
          <p className="tr-tourcard__fine">Start at one part:</p>
          <div className="tr-parts">
            {PARTS.map((part, i) => (
              <button key={part.label} type="button" className="tr-part" onClick={(e) => startTour(i, e.currentTarget)}>
                {part.label}
              </button>
            ))}
          </div>
          <button type="button" className="cf-btn cf-btn--dark" onClick={(e) => startTour(null, e.currentTarget)}>
            <PlayIcon /> {toured ? 'Take the tour again' : 'Take the tour'}
          </button>
        </Tag>
      </Strung>
    </section>
  );
}
