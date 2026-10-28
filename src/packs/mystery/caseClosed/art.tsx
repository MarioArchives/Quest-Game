// The desk's drawn pieces (from the case-closed mockup): Bob's figurine and passport photo, the line-up of the
// recruits, an award's rubber stamp, blacked-out lines of print and the Evening Post's masthead.
import { useId } from 'react';
import type { StampTone } from './awards';

/** Bob in miniature: hat, suit, red tie, on a little base. */
export function BobFigure({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 64" aria-hidden="true">
      <ellipse className="bob-base" cx="20" cy="59" rx="13" ry="4" />
      <Bob />
    </svg>
  );
}

/** Bob's last passport photo: the figurine against a ruled wall. */
export function BobPassport() {
  return (
    <svg viewBox="0 0 160 110" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="160" height="110" className="p-chart" />
      {Array.from({ length: 9 }, (_, i) => (
        <path key={i} className="p-rule" d={`M0 ${10 + i * 12} H160`} />
      ))}
      <svg x="52" y="10" width="56" height="89.6" viewBox="0 0 40 64">
        <Bob />
      </svg>
    </svg>
  );
}

function Bob() {
  return (
    <>
      <path className="bob-suit" d="M9 58 L11 33 Q20 27 29 33 L31 58z" />
      <path className="bob-shirt" d="M17 30 h6 l-3 9z" />
      <path className="bob-tie" d="M19 31 h2 l1 8 -2 3 -2-3z" />
      <circle className="bob-face" cx="20" cy="21" r="8" />
      <path className="bob-ink" d="M15.5 24.5 q2.2 -1.6 4.5 0 q2.3 -1.6 4.5 0" fill="none" strokeWidth="1.4" />
      <circle className="bob-eye" cx="17" cy="20" r="1" />
      <circle className="bob-eye" cx="23" cy="20" r="1" />
      <ellipse className="bob-hat" cx="20" cy="14" rx="11" ry="2.4" />
      <path className="bob-hat" d="M13 14 C13 5 27 5 27 14z" />
    </>
  );
}

/** The recruits in a police line-up, numbered, heights a little different. */
export function Lineup({ count }: { count: number }) {
  const n = Math.max(1, Math.min(count, 8));
  const step = 160 / n;
  return (
    <svg viewBox="0 0 160 110" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="160" height="110" className="p-chart" />
      <path className="p-rule" d="M0 18H160M0 30H160M0 42H160M0 54H160M0 66H160M0 78H160" />
      <rect y="90" width="160" height="20" className="p-dark" />
      <g className="p-fig">
        {Array.from({ length: n }, (_, i) => {
          const x = step * (i + 0.5);
          const top = 26 + ((i * 7) % 11);
          const w = Math.min(11, step * 0.42);
          return (
            <g key={i}>
              <circle cx={x} cy={top} r={Math.min(6, w * 0.55)} />
              <path d={`M${x - w} 90C${x - w} ${top + 13} ${x - w / 2} ${top + 8} ${x} ${top + 8}C${x + w / 2} ${top + 8} ${x + w} ${top + 13} ${x + w} 90Z`} />
            </g>
          );
        })}
      </g>
      {Array.from({ length: n }, (_, i) => (
        <text key={i} className="p-num" x={step * (i + 0.5)} y="104">
          {i + 1}
        </text>
      ))}
    </svg>
  );
}

/** Each award's icon, drawn inside its stamp (24×24 strokes). */
const ICON: Record<string, string> = {
  knife: 'M4 20L13.5 10.5M13.5 10.5L19 5l1 1-5.2 6.2M9.5 14.5l2 2',
  scales: 'M12 4v16M6 20h12M5 7h14M5 7l-3 6h6zM19 7l-3 6h6z',
  phone: 'M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  mute: 'M4 5h16v10H9l-5 4zM3 3l18 18',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  ear: 'M8 15c0-6 2-10 6-10s5 3 5 5c0 3-3 4-3 6s-1 4-3 4-3-1-3-3M11 11c0-2 1-3 2.5-3',
  coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM14.5 8.5c-.5-1-1.5-1.5-2.5-1.5-1.7 0-2.5 1.2-2.5 2.7V16h5M8 12.5h5',
  thumb: 'M7 13V3h10c1 0 1.8.7 2 1.7l1.2 6.5c.2 1.2-.7 2.3-2 2.3H13v3.5c0 1.4-1 2.5-2.3 2.5L7 13M3 3h4v10H3z',
  strings: 'M5 3h14M8 3v7M16 3v6M12 3v4M12 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4M8 11l4 2 4-4M12 13v4M12 17l-3 4M12 17l3 4',
  lips: 'M3 12c3-4 5-5 6-4 1-1 2-1 3 0 1-1 2-1 3 0 1-1 3 0 6 4-3 4-6 6-9 6s-6-2-9-6zM3 12h18',
  cup: 'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4c0 3 1.5 4.5 3 5M17 6h3c0 3-1.5 4.5-3 5M12 14v4M8 21h8M9 18h6',
  spoon: 'M12 3c2.5 0 4 2.5 4 5s-1.5 4-4 4-4-1.5-4-4 1.5-5 4-5zM12 12v9',
  peak: 'M3 19h18M4 19l5-11 4 6 2-3 5 8M16 3v6M13.5 7l2.5 2.5L18.5 7',
  rope: 'M12 2v8M9 10h6l-1 4h-4zM5 21c2-4 12-4 14 0',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5',
  pen: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
  glove: 'M7 21v-8L5 9a1.5 1.5 0 0 1 2.6-1.5L9 10V4.5a1.5 1.5 0 0 1 3 0V10M12 10V3.5a1.5 1.5 0 0 1 3 0V10M15 10V5a1.5 1.5 0 0 1 3 0v9c0 4-2 7-5 7H7',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  corkscrew: 'M12 3v4M7 3h10M12 7c-3 1 3 2 0 3s3 2 0 3 3 2 0 3v5',
  pin: 'M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12zM12 6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  heart: 'M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  tick: 'M4 12l5 5 11-11',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  apple: 'M12 7c-2-2-7-1.5-7 4 0 4 3 9 5 9 1 0 1.3-.6 2-.6s1 .6 2 .6c2 0 5-5 5-9 0-5.5-5-6-7-4zM12 7c0-2 1-3.5 3-4',
};

/** An award's rubber stamp: its name round a ring, its icon in the middle, in the award's ink. */
export function Stamp({ name, tone, icon, size = 50 }: { name: string; tone: StampTone; icon: string; size?: number }) {
  const id = `cc-ring-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg className={`cc-stamp cc-stamp--${tone}`} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={name}>
      <circle className="cc-stamp__ink" cx="32" cy="32" r="30" strokeWidth="2.6" />
      <circle className="cc-stamp__ink" cx="32" cy="32" r="20.5" strokeWidth="1.2" />
      <path id={id} d="M32 32 m-25.2 0 a25.2 25.2 0 1 1 50.4 0 a25.2 25.2 0 1 1 -50.4 0" fill="none" />
      <text>
        <textPath href={`#${id}`} startOffset="25%" textAnchor="middle">
          ★ {name} ★
        </textPath>
      </text>
      <g className="cc-stamp__ink" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="translate(21.2 21.2) scale(0.9)">
        <path d={ICON[icon] ?? ICON.star} />
      </g>
    </svg>
  );
}

/** A deterministic random run from a seed (FNV-1a, then mulberry), so the black bars sit the same every time. */
function seeded(seed: string): () => number {
  let x = 2166136261;
  for (const c of seed) x = Math.imul(x ^ c.charCodeAt(0), 16777619);
  return () => {
    x += 0x6d2b79f5;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Redacted print: `lines` black bars, the last one short. */
export function Redacted({ lines, seed }: { lines: number; seed: string }) {
  const r = seeded(seed);
  return (
    <p className="cc-redact" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <i key={i} style={{ width: `${i === lines - 1 ? 30 + Math.round(r() * 50) : 100}%` }} />
      ))}
    </p>
  );
}

/** The Evening Post's head: the folio (issue, edition, date), the masthead between rules, and the strap. */
export function Masthead({ issue, edition, date, strap }: { issue: string; edition: string; date: string; strap: string }) {
  return (
    <>
      <p className="cc-folio">
        <span>
          No. {issue} · {edition}
        </span>
        <span>{date}</span>
      </p>
      <p className="cc-mast">Evening Post</p>
      <p className="cc-strap">
        <span>The Northern Quarter</span>
        <span>{strap}</span>
        <span>40p</span>
      </p>
    </>
  );
}
