// The print itself (from the UI mocks' booking desk): glowing on the livescan's screen as it's read, or pressed in ink
// on the booked file and the player's file. Made up from the player (./fingerprint.ts): nothing is ever read.
import { useId } from 'react';
import { FINGER, PRINT_H, PRINT_W, type Print } from './fingerprint';
import './print.css';

/**
 * The print in its fingertip, revealed from the top down to `reveal` (0–1) with the scan line on its edge (`glow`), or
 * pressed in ink (`ink`) with ragged edges that fade out.
 */
export function PrintArt({ print, tone, reveal = 1, className }: { print: Print; tone: 'glow' | 'ink'; reveal?: number; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const y = Math.min(1, Math.max(0, reveal)) * PRINT_H;
  return (
    <svg className={`bk-print bk-print--${tone}${className ? ` ${className}` : ''}`} viewBox={`0 0 ${PRINT_W} ${PRINT_H}`} aria-hidden="true">
      <defs>
        <clipPath id={`f${uid}`}>
          <path d={FINGER} />
        </clipPath>
        <clipPath id={`r${uid}`}>
          <rect x="0" y="0" width={PRINT_W} height={y} />
        </clipPath>
        {tone === 'ink' ? (
          <>
            <filter id={`i${uid}`} x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={print.ridgeCount} result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.6" />
            </filter>
            <radialGradient id={`g${uid}`} cx="50%" cy="46%" r="58%">
              <stop offset="55%" stopColor="#fff" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <mask id={`m${uid}`}>
              <rect width={PRINT_W} height={PRINT_H} fill={`url(#g${uid})`} />
            </mask>
          </>
        ) : null}
      </defs>
      {tone === 'glow' ? <path className="bk-print__ghost" d={FINGER} /> : null}
      <g clipPath={tone === 'glow' ? `url(#r${uid})` : undefined}>
        <g clipPath={`url(#f${uid})`} mask={tone === 'ink' ? `url(#m${uid})` : undefined}>
          <g className="bk-print__ridges" filter={tone === 'ink' ? `url(#i${uid})` : undefined}>
            {print.ridges.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        </g>
      </g>
      {tone === 'glow' && reveal > 0 && reveal < 1 ? <rect className="bk-print__scan" x="0" y={y - 2} width={PRINT_W} height="4" /> : null}
    </svg>
  );
}
