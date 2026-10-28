// A suspect's mugshot as the Evening Post prints it: the booking-desk photo in grey halftone against the height
// chart, with a name plate and case number; a silhouette at their height when there is no photo. Chip is the small
// round one for the table.
import { useState } from 'react';

export interface MugPerson {
  name: string;
  photo: string | null;
  heightCm: number | null;
  caseNo: string;
}

const CHART = [190, 180, 170, 160, 150, 140];

function Silhouette({ heightCm }: { heightCm: number | null }) {
  // Taller suspects stand higher against the chart (175 cm when they didn't say).
  const lift = (180 - (heightCm ?? 175)) * 0.9;
  return (
    <g transform={`translate(0 ${lift})`}>
      <path className="cc-mug__fig" d="M12 132C12 93 30 80 50 80C70 80 88 93 88 132Z" />
      <circle className="cc-mug__head" cx="50" cy="52" r="20" />
    </g>
  );
}

export function Mugshot({ person, plate = true, className = '' }: { person: MugPerson | null; plate?: boolean; className?: string }) {
  const [broken, setBroken] = useState(false);
  const photo = person?.photo && !broken ? person.photo : null;
  return (
    <span className={`cc-mug ${className}`} role="img" aria-label={person ? `${person.name}, booking photo` : 'Unknown suspect'}>
      {photo ? <img src={photo} alt="" draggable={false} onError={() => setBroken(true)} /> : null}
      <svg viewBox="0 0 100 124" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        {CHART.map((cm) => {
          const y = 32 + (180 - cm) * 0.9;
          return (
            <g key={cm}>
              <line className="cc-mug__line" x1="0" x2="100" y1={y} y2={y} />
              <text className="cc-mug__num" x="3" y={y - 1.5}>
                {cm}
              </text>
            </g>
          );
        })}
        {photo ? null : <Silhouette heightCm={person?.heightCm ?? null} />}
        {plate ? (
          <>
            <rect className="cc-mug__plate" x="22" y="96" width="56" height="22" />
            <text className="cc-mug__name" x="50" y="106">
              {person ? person.name.toUpperCase().slice(0, 12) : '?'}
            </text>
            <text className="cc-mug__no" x="50" y="114">
              {person?.caseNo ?? 'WANTED'}
            </text>
          </>
        ) : null}
      </svg>
    </span>
  );
}

/** The small round face in the table: their photo, or the silhouette. */
export function Chip({ person }: { person: MugPerson | null }) {
  const [broken, setBroken] = useState(false);
  const photo = person?.photo && !broken ? person.photo : null;
  return (
    <span className="cc-chip" aria-hidden="true">
      {photo ? (
        <img src={photo} alt="" draggable={false} onError={() => setBroken(true)} />
      ) : (
        <svg viewBox="16 22 68 68">
          <path className="cc-mug__fig" d="M12 132C12 93 30 80 50 80C70 80 88 93 88 132Z" />
          <circle className="cc-mug__head" cx="50" cy="52" r="20" />
        </svg>
      )}
    </span>
  );
}
