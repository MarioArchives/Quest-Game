// The crawl, as an open page of the Evening Post: every bar pinned on a paper map and strung together with red yarn,
// where Bob died marked in red pen, and your points at each bar listed underneath.
import { useId, type CSSProperties } from 'react';
import { Masthead } from './art';
import { project, scaleBar, yarnPath } from './crawl';
import type { Edition, Pose } from './Paper';
import { AREAS, PARK, ROADS } from './streets';
import { signed } from './chart';

export interface CrawlStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Your points there; null when it can't be told (no time on the stop, or the GM). */
  points: number | null;
}

const W = 334;
const H = 430;

export function CrawlPage({
  stops,
  kicker,
  headline,
  death,
  pose,
  edition,
  at,
  landing,
}: {
  stops: CrawlStop[];
  kicker: string;
  headline: string;
  /** The stop where the crawl was at the time of death, and the time. */
  death: { stopId: string; time: string } | null;
  pose: Pose;
  edition: Edition;
  at: number;
  landing: boolean;
}) {
  const p = project(stops, W, H, 46);
  const pins = stops.map(p.at);
  const bar = scaleBar(p.k, 110);
  const deathAt = death ? stops.findIndex((s) => s.id === death.stopId) : -1;
  const f = (n: number) => n.toFixed(1);
  const glossy = `cc-pin-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <article
      className={`cc-open${landing ? ' is-landing' : ''}`}
      style={{ '--x': `${pose.x}px`, '--y': `${pose.y}px`, '--r': `${pose.r}deg` } as CSSProperties}
      lang="en-GB"
    >
      <Masthead issue={edition.issue} edition="p. 6" date={edition.date(at)} strap="Detective profiles" />
      <p className="cc-kick">{kicker}</p>
      <h3 className="cc-hl">{headline}</h3>
      <div className="cc-open__map">
        <svg className="cc-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="The crawl, pinned on the map">
          <defs>
            <radialGradient id={glossy} cx="35%" cy="30%" r="75%">
              <stop offset="0" className="cc-map__g0" />
              <stop offset="0.45" className="cc-map__g1" />
              <stop offset="1" className="cc-map__g2" />
            </radialGradient>
          </defs>
          <rect width={W} height={H} className="cc-map__land" />
          <ellipse cx={f(p.at(PARK)[0])} cy={f(p.at(PARK)[1])} rx={20} ry={12} className="cc-map__park" />
          {ROADS.map((road, i) => (
            <path key={i} className="cc-map__road" d={`M${road.map(([lat, lng]) => p.at({ lat, lng }).map(f).join(' ')).join(' L')}`} />
          ))}
          {AREAS.map((a) => {
            const [x, y] = p.at(a);
            return (
              <text key={a.name} x={f(x)} y={f(y)} className="cc-map__area">
                {a.name}
              </text>
            );
          })}
          {pins.map(([x, y], i) => (
            <g key={`sh-${stops[i].id}`} className="cc-map__shadow" style={{ '--i': i } as CSSProperties}>
              <path d={`M${f(x)} ${f(y)}L${f(x + 9)} ${f(y + 4)}`} className="cc-map__needle-sh" />
              <ellipse cx={f(x + 15)} cy={f(y + 7)} rx="8.5" ry="5" className="cc-map__pin-sh" />
            </g>
          ))}
          <path d={yarnPath(pins)} className="cc-map__yarn" pathLength={1} />
          {pins.map(([x, y], i) => (
            <g key={stops[i].id} className="cc-map__pin" style={{ '--i': i } as CSSProperties}>
              <circle cx={f(x)} cy={f(y)} r="1.4" className="cc-map__hole" />
              <line x1={f(x)} y1={f(y)} x2={f(x - 7)} y2={f(y - 13.5)} className="cc-map__needle" />
              <path d={`M${f(x - 11)} ${f(y - 12.5)}l4 -3.5 4 3.5z`} className="cc-map__collar" />
              <circle cx={f(x - 8.5)} cy={f(y - 19.5)} r="9" className="cc-map__head" fill={`url(#${glossy})`} />
              <ellipse cx={f(x - 11.5)} cy={f(y - 22.5)} rx="3.3" ry="2.1" transform={`rotate(-35 ${f(x - 11.5)} ${f(y - 22.5)})`} className="cc-map__glint" />
            </g>
          ))}
          {death && deathAt >= 0 ? (
            <text x={f(pins[deathAt][0] + 13)} y={f(pins[deathAt][1] + 4)} className="cc-map__death">
              ✝ Bob, {death.time}
            </text>
          ) : null}
          <path d={`M10 ${H - 14}v5h${f(bar.px)}v-5`} className="cc-map__bar" />
          <text x={f(10 + bar.px + 6)} y={H - 9} className="cc-map__scale">
            {bar.label}
          </text>
        </svg>
      </div>
      <ol className="cc-open__stops">
        {stops.map((s, i) => (
          <li key={s.id} style={{ '--i': i } as CSSProperties}>
            <b>{i + 1}</b>
            <span>{s.name}</span>
            {s.points === null ? null : <i className={s.points < 0 ? 'is-neg' : ''}>{signed(s.points)}</i>}
          </li>
        ))}
      </ol>
    </article>
  );
}
