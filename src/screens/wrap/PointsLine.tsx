// "Your points across the night": an SVG line from Wrap.pointsSeries (cumulative points over time).
import { dayAndTime } from '../../lib/time';
import { zone } from '../../pack';

interface SeriesPoint {
  t: number;
  points: number;
}

const W = 320;
const H = 230;
const PAD_L = 14;
const PAD_R = 14;
const PAD_T = 40;
const PAD_B = 38;
/** Dots on every change up to this many points; beyond it only the last and the peak get one. */
const MAX_DOTS = 36;

const clock = (ms: number) => dayAndTime(ms, zone);

export function PointsLine({ series }: { series: SeriesPoint[] }) {
  const pts = series
    .filter((p) => Number.isFinite(p.points))
    .sort((a, b) => a.t - b.t);
  if (pts.length === 0) pts.push({ t: 0, points: 0 });

  const values = pts.map((p) => p.points);
  const minY = Math.min(0, ...values);
  const maxY = Math.max(0, ...values);
  const span = maxY - minY || 1;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const t0 = pts[0]!.t;
  const t1 = pts[pts.length - 1]!.t;
  const timed = t0 > 0 && t1 > t0;
  const xAt = (i: number, t: number) => {
    if (pts.length === 1) return PAD_L;
    const f = timed ? (t - t0) / (t1 - t0) : i / (pts.length - 1);
    return PAD_L + f * plotW;
  };
  const yAt = (points: number) => PAD_T + (1 - (points - minY) / span) * plotH;

  const coords = pts.map((p, i) => ({ x: xAt(i, p.t), y: yAt(p.points), ...p }));
  const baseline = yAt(0);
  const last = coords[coords.length - 1]!;
  const peak = coords.reduce((best, c) => (c.points > best.points ? c : best), coords[0]!);
  const flat = coords.every((c) => c.points === 0);

  const line =
    coords.length === 1
      ? `M${PAD_L} ${baseline} H${W - PAD_R}`
      : coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');

  const dots = coords.length <= MAX_DOTS ? coords : [peak, last];
  const labelAnchor = last.x > W * 0.55 ? 'end' : 'start';
  const labelX = labelAnchor === 'end' ? Math.min(W - 2, last.x + 6) : Math.max(2, last.x - 6);
  const summary = flat
    ? 'No points scored yet.'
    : `Points over the night: ${coords.length - 1} changes, peaking at ${peak.points} and ending on ${last.points}.`;

  return (
    <figure className="w-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} focusable="false">
        <line className="w-chart__base" x1={PAD_L} x2={W - PAD_R} y1={baseline} y2={baseline} />
        <text className="w-chart__tick" x={W - PAD_R} y={baseline + 14} textAnchor="end">
          0 pts
        </text>
        <path className="w-chart__line" d={line} />
        {dots.map((c, i) => (
          <circle key={`${c.t}-${i}`} className="w-chart__dot" cx={c.x} cy={c.y} r={c === last ? 6 : 4} />
        ))}
        {flat ? null : (
          <text className="w-chart__val" x={labelX} y={Math.max(22, last.y - 14)} textAnchor={labelAnchor}>
            {last.points}
          </text>
        )}
        <text className="w-chart__axis" x={PAD_L} y={H - 12}>
          {t0 > 0 ? `Joined ${clock(t0)}` : 'Start'}
        </text>
        {timed ? (
          <text className="w-chart__axis" x={W - PAD_R} y={H - 12} textAnchor="end">
            {clock(t1)}
          </text>
        ) : null}
      </svg>
      <figcaption className="w-chart__cap">
        {flat
          ? 'No points yet. The line stayed flat on zero.'
          : peak.points > last.points
            ? `Peaked at ${peak.points}, finished on ${last.points}.`
            : `${coords.length - 1} ${coords.length - 1 === 1 ? 'change' : 'changes'} on the way to ${last.points}.`}
      </figcaption>
    </figure>
  );
}
