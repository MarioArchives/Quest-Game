// Your night in points, as an open page: everyone's points through the night in red pen on chart paper (yours in ink,
// your three biggest swings ringed), and the table under it racing from the first round to the close on the same
// clock, so the lines and the bars reach each minute together.
import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react';
import type { CaseLine } from '../../../../functions/src/shared/packs/mystery/caseClosed.ts';
import { standingOf } from '../../../../functions/src/shared/standing.ts';
import { ledgerLabels } from '../../../lib/ledgerLabels';
import { t as terms } from '../../../pack';
import { Masthead } from './art';
import { chartDomain, lastLine, seriesOf, signed, spreadLabels, stepPath, swings, tableAt } from './chart';
import { Chip, type MugPerson } from './Mugshot';
import type { Edition, Pose } from './Paper';

export interface RacePlayer {
  uid: string;
  name: string;
  person: MugPerson;
}

const W = 350;
const H = 300;
const L = 30;
const R = 52;
const T = 12;
const B = 20;
const RACE_MS = 8000;
const LABELS = ledgerLabels(terms, 'them');

/** Plays the clock from `from` to `to` once `play` turns true (instantly with reduced motion); the end otherwise. */
function useClock(from: number, to: number, play: boolean): number {
  const [now, setNow] = useState(play ? from : to);
  useEffect(() => {
    if (!play || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setNow(to);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const step = (ms: number) => {
      start ??= ms + 400;
      const k = Math.min(1, Math.max(0, (ms - start) / RACE_MS));
      setNow(from + (to - from) * k);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    setNow(from);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [from, to, play]);
  return now;
}

export function PointsPage({
  timeline,
  players,
  me,
  from,
  to,
  lines,
  kicker,
  headline,
  time,
  pose,
  edition,
  play,
  landing,
}: {
  timeline: readonly CaseLine[];
  players: RacePlayer[];
  me: string | null;
  from: number;
  to: number;
  lines: { confidantAbove: number | null; poiBelow: number | null };
  kicker: string;
  headline: string;
  time: (ms: number) => string;
  pose: Pose;
  edition: Edition;
  play: boolean;
  landing: boolean;
}) {
  const now = useClock(from, to, play);
  const series = useMemo(() => new Map(players.map((p) => [p.uid, seriesOf(timeline, p.uid, from)])), [players, timeline, from]);
  const [lo, hi] = useMemo(() => chartDomain([...series.values()].flat().map((s) => s.points), lines), [series, lines]);
  const pw = W - L - R;
  const ph = H - T - B;
  const x = (ms: number) => L + ((Math.min(Math.max(ms, from), to) - from) / Math.max(1, to - from)) * pw;
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * ph;
  const finals = players.map((p) => ({ uid: p.uid, name: p.name, points: series.get(p.uid)?.at(-1)?.points ?? 0 }));
  const names = spreadLabels(
    finals.map((f) => ({ ...f, y: y(f.points) })),
    11,
  );
  const rings = me ? swings(timeline, me) : [];
  const order = [...players.filter((p) => p.uid !== me), ...players.filter((p) => p.uid === me)];
  const ended = now >= to;
  const hours: number[] = [];
  for (let h = Math.ceil(from / 3_600_000) * 3_600_000; h <= to; h += 3_600_000) hours.push(h);

  const rows = tableAt(timeline, players, now);
  const span = Math.max(Math.abs(lo), Math.abs(hi));
  const zero = 50;
  const last = lastLine(timeline, now);
  const nameOf = (uid: string) => players.find((p) => p.uid === uid)?.name ?? 'Someone';
  const what = last ? (last.reason === 'adjust' && last.note ? `The GM: ${last.note}` : LABELS[last.reason]) : 'Everyone on 0';
  const rowH = 23;
  const clip = `cc-clip-${useId().replace(/[^\w-]/g, '')}`;

  return (
    <article
      className={`cc-open${landing ? ' is-landing' : ''}`}
      style={{ '--x': `${pose.x}px`, '--y': `${pose.y}px`, '--r': `${pose.r}deg` } as CSSProperties}
      lang="en-GB"
    >
      <Masthead issue={edition.issue} edition="p. 7" date={edition.date(to)} strap="Detective profiles" />
      <p className="cc-kick">{kicker}</p>
      <h3 className="cc-hl">{headline}</h3>
      <div className="cc-open__chart">
        <svg className="cc-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Points through the night">
          <rect width={W} height={H} className="cc-chart__bg" />
          {Array.from({ length: (hi - lo) / 5 + 1 }, (_, i) => lo + i * 5).map((v) => (
            <line key={v} x1={L} x2={L + pw} y1={y(v)} y2={y(v)} className={`cc-chart__grid${v === 0 ? ' is-zero' : ''}`} />
          ))}
          {lines.confidantAbove !== null ? <line x1={L} x2={L + pw} y1={y(lines.confidantAbove)} y2={y(lines.confidantAbove)} className="cc-chart__line cc-chart__line--conf" /> : null}
          {lines.poiBelow !== null ? <line x1={L} x2={L + pw} y1={y(lines.poiBelow)} y2={y(lines.poiBelow)} className="cc-chart__line cc-chart__line--poi" /> : null}
          {[hi, 0, lo].map((v) => (
            <text key={v} x={L - 5} y={y(v) + 3} className="cc-chart__v">
              {signed(v).replace('±', '')}
            </text>
          ))}
          {hours.map((h) => (
            <text key={h} x={x(h)} y={H - 6} className="cc-chart__hr">
              {time(h)}
            </text>
          ))}
          <clipPath id={clip}>
            <rect x="0" y="0" width={ended ? W : x(now)} height={H} />
          </clipPath>
          <g clipPath={`url(#${clip})`}>
            {order.map((p) => (
              <path key={p.uid} d={stepPath(series.get(p.uid) ?? [{ t: from, points: 0 }], x, y, to)} className={`cc-chart__pen${p.uid === me ? ' is-me' : ''}`} />
            ))}
          </g>
          {!ended && now > from ? <line className="cc-chart__now" x1={x(now)} x2={x(now)} y1={T} y2={T + ph} /> : null}
          {names.map((n) => (
            <text key={n.uid} x={L + pw + 5} y={n.y + 3.5} className={`cc-chart__name${n.uid === me ? ' is-me' : ''}${ended ? ' is-on' : ''}`}>
              {n.name} {signed(n.points).replace('±', '')}
            </text>
          ))}
          {rings.map((r) => (
            <g key={r.t} className={`cc-chart__ring${now >= r.t ? ' is-on' : ''}`}>
              <ellipse cx={x(r.t)} cy={y(r.points)} rx="15" ry="10" transform={`rotate(-10 ${x(r.t)} ${y(r.points)})`} />
              <text x={x(r.t)} y={y(r.points) + (r.delta < 0 ? 24 : -15)}>
                {signed(r.delta)}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <p className="cc-open__sub">The table, minute by minute</p>
      <div className="cc-race">
        <div className="cc-race__head">
          <b className="cc-race__clock">{time(now)}</b>
          <p className="cc-race__at">
            {last ? (
              <>
                <b>
                  {time(last.t)} · {nameOf(last.uid)} {signed(last.delta)}
                </b>
                {what}
              </>
            ) : (
              <>
                <b>{time(from)} · The crawl begins</b>
                {what}
              </>
            )}
          </p>
        </div>
        <div className="cc-race__rows" style={{ height: players.length * rowH }}>
          {players.map((p) => {
            const i = rows.findIndex((r) => r.uid === p.uid);
            const v = rows[i]?.points ?? 0;
            const w = (Math.abs(v) / Math.max(1, span)) * 50;
            const standing = standingOf(v, lines);
            return (
              <div key={p.uid} className={`cc-race__row${p.uid === me ? ' is-me' : ''}`} style={{ top: i * rowH }}>
                <span className="cc-race__rank">{i + 1}</span>
                <Chip person={p.person} />
                <span className="cc-race__name">{p.name}</span>
                <span className="cc-race__track">
                  <i className="cc-race__zero" style={{ left: `${zero}%` }} />
                  <i
                    className={`cc-race__bar${standing ? ` is-${standing}` : ''}`}
                    style={{ left: `${v >= 0 ? zero : zero - w}%`, width: `${w}%` }}
                  />
                </span>
                <b className={`cc-race__v${v < 0 ? ' is-neg' : ''}`}>{signed(Math.round(v)).replace('±', '')}</b>
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}
