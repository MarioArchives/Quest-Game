// The interview room (from the UI mocks' booking desk), where the booking opens once the GM has let them in: a desk in
// the dark, a man behind it, and a lamp that swings round into their face: "Who are you?". Then on to their particulars.
import { useEffect, useId, useState } from 'react';
import { buzz, lessMotion } from './feel';

type RoomPhase = 'dark' | 'lit' | 'turning' | 'asked' | 'ready';
const ROOM_ORDER: RoomPhase[] = ['dark', 'lit', 'turning', 'asked', 'ready'];
/** How long each phase lasts before the next. */
const ROOM_NEXT: Partial<Record<RoomPhase, [RoomPhase, number]>> = {
  dark: ['lit', 700],
  lit: ['turning', 2200],
  // The lamp takes 0.6s to swing round, then a second of glare before the question (typing from 4.5s in).
  turning: ['asked', 1600],
};
const QUESTION = 'Who are you?';
const KEY_MS = 95;

/** The man behind the desk, a little smaller than life, sitting on its back edge. */
const HIM = 'translate(195 522) scale(0.84) translate(-195 -522)';
/** Plank seams down the desk, which the tilt draws together into the distance. */
const SEAMS = Array.from({ length: 15 }, (_, i) => `M${-290 + i * 70} 264V900`).join('');

function Sunglasses({ className }: { className: string }) {
  return (
    <g className={className}>
      <path className="bk-int__temples" d="M158 250L150 256M232 250L240 256M191 251Q195 246.5 199 251" />
      <rect x="158" y="244" width="33" height="21" rx="7" />
      <rect x="199" y="244" width="33" height="21" rx="7" />
      <path className="bk-int__sheen" d="M163 250L171 246.5M204 250L212 246.5" />
    </g>
  );
}

/**
 * Lights off, then the desk lamp clicks on over the case files, with the man behind the desk in shadow; then the lamp
 * swings round to face you, the screen whites out, he's gone, and the question hangs there. Tap early and the lamp
 * turns at once.
 */
export function InterviewRoom({ onDone }: { onDone(): void }) {
  const [phase, setPhase] = useState<RoomPhase>(() => (lessMotion() ? 'ready' : 'dark'));
  const [typed, setTyped] = useState(() => (lessMotion() ? QUESTION.length : 0));
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const at = (p: RoomPhase) => ROOM_ORDER.indexOf(phase) >= ROOM_ORDER.indexOf(p);
  const asked = at('asked');

  useEffect(() => {
    const next = ROOM_NEXT[phase];
    if (!next) return;
    const timer = window.setTimeout(() => setPhase(next[0]), next[1]);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === 'lit') buzz(8);
    else if (phase === 'turning') buzz(16);
  }, [phase]);

  // The question types out a key at a time; a second after the last key, the way on.
  useEffect(() => {
    if (!asked) return;
    if (typed < QUESTION.length) {
      const timer = window.setTimeout(() => {
        buzz(4);
        setTyped((n) => n + 1);
      }, KEY_MS);
      return () => window.clearTimeout(timer);
    }
    if (phase !== 'asked') return;
    const timer = window.setTimeout(() => setPhase('ready'), 1000);
    return () => window.clearTimeout(timer);
  }, [asked, typed, phase]);

  const cls = ['bk-scene bk-int', at('lit') && 'is-lit', at('turning') && 'is-turned', at('asked') && 'is-asked', at('ready') && 'is-ready'];
  return (
    <section
      className={cls.filter(Boolean).join(' ')}
      aria-label="Interview room"
      onClick={() => {
        if (phase === 'dark' || phase === 'lit') setPhase('turning');
      }}
    >
      {/* Three layers over one stage: the wall and the man, then the desk tilted back in perspective, then the lamp and
          its glare standing up in front. */}
      <div className="bk-scene__stage">
      <svg className="bk-scene__layer" viewBox="0 0 390 844" aria-hidden="true">
        <defs>
          <linearGradient id={`wall${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a2d30" />
            <stop offset="1" stopColor="#1b1d1f" />
          </linearGradient>
          <linearGradient id={`desk${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6e4c31" />
            <stop offset="1" stopColor="#3d2919" />
          </linearGradient>
          <linearGradient id={`shade${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#1a1c1e" />
            <stop offset="0.6" stopColor="#3d4247" />
            <stop offset="1" stopColor="#202326" />
          </linearGradient>
          <radialGradient id={`hole${id}`}>
            <stop offset="0" stopColor="#000" />
            <stop offset="0.5" stopColor="#000" stopOpacity="0.92" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`spill${id}`}>
            <stop offset="0" stopColor="#000" stopOpacity="0.55" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`soft${id}`}>
            <stop offset="0" stopColor="#000" stopOpacity="0.3" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`beam${id}`} gradientUnits="userSpaceOnUse" x1="145" y1="579" x2="310" y2="670">
            <stop offset="0" stopColor="#ffe7aa" stopOpacity="0.5" />
            <stop offset="1" stopColor="#ffe7aa" stopOpacity="0.04" />
          </linearGradient>
          <radialGradient id={`bulb${id}`}>
            <stop offset="0" stopColor="#fff" />
            <stop offset="0.4" stopColor="#fff6d6" />
            <stop offset="0.85" stopColor="#ffd98a" />
            <stop offset="1" stopColor="#c8952e" />
          </radialGradient>
          <radialGradient id={`flare${id}`} gradientUnits="userSpaceOnUse" cx="104" cy="560" r="620">
            <stop offset="0" stopColor="#fff" />
            <stop offset="0.05" stopColor="#fffdf3" />
            <stop offset="0.22" stopColor="#fff4d8" stopOpacity="0.85" />
            <stop offset="0.5" stopColor="#f8e9c6" stopOpacity="0.4" />
            <stop offset="1" stopColor="#f4e7c8" stopOpacity="0" />
          </radialGradient>
          <filter id={`blur${id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <filter id={`haze${id}`} x="-50%" y="-20%" width="200%" height="140%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
          <filter id={`glow${id}`} x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* What the dark hides: everything, bar a faint glow on the wall behind him once the lamp is on... */}
          <mask id={`wallDark${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="390" height="844">
            <rect width="390" height="844" fill="#fff" />
            <ellipse className="bk-int__pool" cx="195" cy="330" rx="210" ry="220" fill={`url(#soft${id})`} />
          </mask>
          {/* ...and on the desk (in its flat plan), the pool of lamplight on the files and its spill around. */}
          <mask id={`deskDark${id}`} maskUnits="userSpaceOnUse" x="-300" y="200" width="1000" height="760">
            <rect x="-300" y="200" width="1000" height="760" fill="#fff" />
            <g className="bk-int__pool">
              <ellipse cx="200" cy="560" rx="380" ry="340" fill={`url(#spill${id})`} />
              <ellipse cx="295" cy="548" rx="180" ry="200" fill={`url(#hole${id})`} />
            </g>
          </mask>
        </defs>

        {/* The wall, and the man in front of it. */}
        <rect width="390" height="844" fill={`url(#wall${id})`} />
        <g className="bk-int__him bk-int__man" transform={HIM}>
          <path d="M40 522C42 430 92 374 158 358Q195 350 232 358C298 374 348 430 350 522Z" />
          <path d="M175 296L215 296L219 362L171 362Z" />
          <ellipse cx="195" cy="258" rx="45" ry="56" />
          <ellipse cx="150" cy="264" rx="7" ry="12" />
          <ellipse cx="240" cy="264" rx="7" ry="12" />
          <path className="bk-int__collar" d="M170 358L195 404L220 358L209 352L195 378L181 352Z" />
          <path d="M191 378L199 378L204 440L195 452L186 440Z" />
          <Sunglasses className="bk-int__specs" />
          <path className="bk-int__cig" d="M207 290L226 295.3" />
          <path className="bk-int__ash" d="M226 295.3L229.5 296.3" />
        </g>
        <rect className="bk-int__dark" width="390" height="844" fill="#040405" mask={`url(#wallDark${id})`} />
      </svg>

      {/* The desk top, drawn flat and deep, then tilted back by CSS so it lands under him at the back. */}
      <svg className="bk-scene__layer bk-int__desk" viewBox="0 0 390 844" aria-hidden="true">
        <rect x="-300" y="262" width="1000" height="640" fill={`url(#desk${id})`} />
        <path d="M-300 263H700" stroke="#5a3f2b" strokeWidth="3" />
        <path className="bk-int__seams" d={SEAMS} />
        <path className="bk-int__grain" d="M-300 380C-100 372 200 390 700 378M-300 520C0 512 300 530 700 518M-300 700C0 690 300 712 700 700" />
        <g className="bk-int__files" transform="translate(295 548) scale(1.15) translate(-112 -652)">
          <rect x="32" y="596" width="160" height="112" rx="3" fill="#c9a974" transform="rotate(-10 112 652)" />
          <rect x="46" y="588" width="150" height="110" fill="#ece8dc" transform="rotate(-2 112 652)" />
          <g transform="rotate(5 112 652)">
            <rect x="40" y="588" width="50" height="12" rx="2" fill="#d9bd7e" />
            <rect x="32" y="598" width="160" height="112" rx="2" fill="#d9bd7e" />
          </g>
          <g transform="rotate(-4 112 652)">
            <rect x="124" y="586" width="56" height="12" rx="2" fill="#e6cf98" />
            <rect x="30" y="596" width="164" height="114" rx="2" fill="#e6cf98" stroke="#b89a62" />
            <text x="40" y="613" fontSize="8.5" fill="#5b4a33" letterSpacing="1">
              CASE No. 0417
            </text>
            {[64, 92, 80, 70, 88].map((w, i) => (
              <rect key={i} x="40" y={621 + i * 8} width={w} height="2" fill="#8e7550" opacity="0.55" />
            ))}
            <g transform="rotate(-12 100 678)">
              <rect x="54" y="666" width="96" height="23" fill="none" stroke="#8f2a22" strokeWidth="2.5" />
              <text x="102" y="682.5" fontSize="12" fill="#8f2a22" letterSpacing="1.5" textAnchor="middle">
                CLASSIFIED
              </text>
            </g>
            <g transform="rotate(9 168 628)">
              <rect x="146" y="600" width="44" height="52" fill="#f4f1ea" />
              <rect x="150" y="604" width="36" height="34" fill="#2c3134" />
              <circle cx="168" cy="616" r="6" fill="#5e666b" />
              <path d="M156 638C158 627 178 627 180 638Z" fill="#5e666b" />
              <path d="M162 596V608" stroke="#9aa0a3" strokeWidth="2" />
            </g>
          </g>
        </g>
        <g transform="translate(169 772) scale(1.05) rotate(-7) translate(-228 -798)">
          <rect x="166" y="718" width="124" height="160" fill="#efebe0" />
          <text x="178" y="738" fontSize="10" fill="#8f2a22" letterSpacing="2">
            TOP SECRET
          </text>
          {[96, 80, 100, 72, 90, 60].map((w, i) => (
            <rect key={i} x="178" y={748 + i * 9} width={w} height="2" fill="#6b6455" opacity="0.5" />
          ))}
        </g>

        <rect className="bk-int__dark" x="-300" y="200" width="1000" height="760" fill="#040405" mask={`url(#deskDark${id})`} />
      </svg>

      {/* Standing up in front: the stacks at the back of the desk and the ashtray (both in shadow), the lamp, his smoke,
          and the glare. */}
      <svg className="bk-scene__layer" viewBox="0 0 390 844" aria-hidden="true">
        <g className="bk-int__stack">
          {['#332b1d', '#3b3a37', '#372f20', '#3a3426', '#3b3a37', '#332b1d', '#372f20', '#3b3a37', '#3a3426'].map((fill, i) => (
            <rect key={i} x={12 + ((i * 7) % 5)} y={566 - (i + 1) * 6} width="112" height="6" fill={fill} />
          ))}
          <rect x="40" y="508" width="34" height="5" fill="#2a1210" />
          {['#372f20', '#3b3a37', '#332b1d', '#3b3a37', '#3a3426', '#372f20'].map((fill, i) => (
            <rect key={`r${i}`} x={306 + ((i * 3) % 4)} y={552 - (i + 1) * 6} width="78" height="6" fill={fill} />
          ))}
        </g>
        <g className="bk-int__ashtray">
          <ellipse cx="262" cy="556" rx="24" ry="7" fill="#101213" />
          <ellipse cx="262" cy="555" rx="17" ry="4.5" fill="#060707" />
          <path d="M254 554L266 551" stroke="#3a3833" strokeWidth="2.5" />
        </g>
        <polygon className="bk-int__beam" points="159,548 130,610 208,744 384,694 374,588" fill={`url(#beam${id})`} filter={`url(#blur${id})`} />

        {/* The lamp: an anglepoise, its shade down over the files to start with. */}
        <g className="bk-int__lamp">
          <ellipse cx="56" cy="714" rx="40" ry="11" fill="#1c1e20" />
          <ellipse cx="56" cy="710" rx="30" ry="6" fill="#2b2e31" />
          <path d="M56 708L32 612M32 612L104 560" stroke="#2a2d30" strokeWidth="6" strokeLinecap="round" />
          <path d="M50 700L28 618M38 606L100 562" stroke="#596066" strokeWidth="1" />
          <circle cx="32" cy="612" r="6.5" fill="#3a3e42" />
        </g>
        <g className="bk-int__shade">
          <path d="M94 556C94 547 114 547 114 556L138 604C125 613 83 613 70 604Z" fill={`url(#shade${id})`} />
          <ellipse cx="104" cy="605" rx="34" ry="8" fill="#121315" />
          <ellipse className="bk-int__mouth" cx="104" cy="605" rx="31" ry="6.5" fill="#fff1c4" filter={`url(#glow${id})`} />
        </g>
        <circle cx="104" cy="560" r="5.5" fill="#3a3e42" />

        {/* Smoke off the cigarette, and its tip. */}
        <g className="bk-int__him" transform={HIM}>
          <g className="bk-int__smoke" filter={`url(#haze${id})`}>
            <path d="M231 294C223 280 239 270 231 256C223 242 237 232 230 218" />
            <path d="M231 294C239 282 225 272 233 258C241 244 227 234 235 220" />
            <path d="M231 294C225 284 235 276 229 264C223 252 233 242 227 230" />
          </g>
          <circle className="bk-int__ember" cx="230.6" cy="296.6" r="2.2" fill="#ff7a30" filter={`url(#glow${id})`} />
        </g>

        {/* Turned on you: the lamp face-on, and its glare over everything. */}
        <g className="bk-int__face">
          <circle cx="104" cy="560" r="38" fill="#1a1c1e" stroke="#3a3e42" strokeWidth="2" />
          <circle cx="104" cy="560" r="31" fill={`url(#bulb${id})`} />
        </g>
        <g className="bk-int__glare">
          <rect width="390" height="844" fill="#f4e7c8" opacity="0.6" />
          <g className="bk-int__flare">
            <circle cx="104" cy="560" r="620" fill={`url(#flare${id})`} />
            <ellipse cx="104" cy="560" rx="230" ry="2.5" fill="#fff" opacity="0.8" />
          </g>
        </g>
      </svg>
      </div>

      <p className="bk-int__rec" aria-hidden="true">
        Rec · Interview room B
      </p>
      {/* For the keyboard: on to the question at once (it shows only when focused). */}
      {at('ready') ? null : (
        <button
          type="button"
          className="bk-skip"
          onClick={(e) => {
            e.stopPropagation();
            setTyped(QUESTION.length);
            setPhase('ready');
          }}
        >
          Skip the scene
        </button>
      )}
      {asked ? (
        <h1 className="bk-int__q">
          <span className="bk-sr">{QUESTION}</span>
          <span aria-hidden="true">
            {QUESTION.slice(0, typed)}
            <span className="bk-caret" />
            <span className="bk-rest">{QUESTION.slice(typed)}</span>
          </span>
        </h1>
      ) : null}
      {at('ready') ? (
        <button
          type="button"
          className="bk-go bk-int__next"
          onClick={(e) => {
            e.stopPropagation();
            onDone();
          }}
        >
          Next <span aria-hidden="true">→</span>
        </button>
      ) : null}
    </section>
  );
}
