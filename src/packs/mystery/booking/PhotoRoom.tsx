// The mugshot (from the UI mocks' booking desk). A dim room lit by one bare bulb: a big old plate camera on a wooden
// tripod (the focusing cloth over its back, a flash dish on its side) and the photographer, a silhouette, standing to
// its right under a light cord. He counts you in, reaches up and pulls the cord, the room goes darker, the flash goes
// off, and in the white a camera button opens the phone's own camera (on a computer, the webcam). The photo becomes
// their profile photo; after a while they can upload one instead, or keep the one they have.
import { useEffect, useId, useRef, useState } from 'react';
import { CameraSheet, prefersInAppCamera } from '../../../components/CameraSheet';
import { Loader } from '../../../components/Loader';
import { buzz, lessMotion } from './feel';

type Phase = 'dim' | 'count' | 'pull' | 'dark' | 'flash' | 'white';
const ORDER: Phase[] = ['dim', 'count', 'pull', 'dark', 'flash', 'white'];
/** How long each timed phase lasts before the next (the countdown moves on when it's typed). */
const NEXT: Partial<Record<Phase, [Phase, number]>> = {
  dim: ['count', 900],
  pull: ['dark', 900],
  dark: ['flash', 700],
  flash: ['white', 650],
};

/** How long the camera button waits alone before offering an upload instead (a laptop, a camera that won't open). */
const UPLOAD_AFTER_MS = 10_000;

const LINES = ['Ready?', '1... 2... 3...'];
const COUNT = LINES.join('');
/** The pause after typing character i: a beat after the question and after each count, otherwise a keystroke. */
const pauseAfter = (i: number) => (i === LINES[0]!.length - 1 ? 750 : COUNT[i] === '.' && COUNT[i + 1] !== '.' ? 650 : 85);

// Where the countdown sits, above the photographer, in the scene's units; Space Mono's advance is 0.612em.
const SAY_X = 180;
const SAY_Y = [214, 246];
const SAY_SIZE = 21;
const SAY_CH = SAY_SIZE * 0.612;

export function PhotoRoom({
  current,
  busy,
  error,
  onPhoto,
  onKeep,
}: {
  /** Their photo already on file (from Google, or an earlier booking), which they may keep instead. */
  current: string | null;
  /** The photo is being prepared and uploaded. */
  busy: boolean;
  error: string | null;
  onPhoto(photo: Blob): void;
  /** No new photo: keep the current one, or none. */
  onKeep(): void;
}) {
  const [phase, setPhase] = useState<Phase>(() => (lessMotion() ? 'white' : 'dim'));
  const [typed, setTyped] = useState(() => (lessMotion() ? COUNT.length : 0));
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const at = (p: Phase) => ORDER.indexOf(phase) >= ORDER.indexOf(p);

  useEffect(() => {
    const next = NEXT[phase];
    if (!next) return;
    const timer = window.setTimeout(() => setPhase(next[0]), next[1]);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // The countdown, a key at a time; once it's out, he pulls the cord.
  useEffect(() => {
    if (phase !== 'count') return;
    if (typed >= COUNT.length) {
      const timer = window.setTimeout(() => setPhase('pull'), 250);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(
      () => {
        if (/\d/.test(COUNT[typed]!)) buzz(12);
        setTyped((n) => n + 1);
      },
      typed === 0 ? 200 : pauseAfter(typed - 1),
    );
    return () => window.clearTimeout(timer);
  }, [phase, typed]);

  useEffect(() => {
    if (phase === 'dark') buzz(8);
    else if (phase === 'flash') buzz(40);
  }, [phase]);

  // In the white, after a while with no photo, the other ways out.
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (phase !== 'white') return;
    const timer = window.setTimeout(() => setLate(true), UPLOAD_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);
  const took = (file: Blob | undefined) => {
    if (file) onPhoto(file);
  };
  // On a computer the webcam opens here (CameraSheet); a phone opens its own camera from the file input.
  const [camera, setCamera] = useState(false);
  const inApp = prefersInAppCamera();
  const fileRef = useRef<HTMLInputElement>(null);

  const first = LINES[0]!.slice(0, Math.min(typed, LINES[0]!.length));
  const second = LINES[1]!.slice(0, Math.max(0, typed - LINES[0]!.length));
  const onSecond = typed >= LINES[0]!.length;
  const cls = ['bk-scene bk-ph', at('count') && 'is-count', at('pull') && 'is-pull', at('dark') && 'is-dark', at('flash') && 'is-flash', at('white') && 'is-white'];

  return (
    <section
      className={cls.filter(Boolean).join(' ')}
      aria-label="The photographer’s room"
      onClick={() => {
        // Tap during the countdown and he gets on with it.
        if (phase === 'dim' || phase === 'count') {
          setTyped(COUNT.length);
          setPhase('pull');
        }
      }}
    >
      <p className="bk-sr" aria-live="polite">
        {typed >= COUNT.length ? 'Ready? 1, 2, 3.' : ''}
      </p>
      <div className="bk-scene__stage">
        <svg className="bk-scene__layer" viewBox="0 0 390 844" aria-hidden="true">
          <defs>
            <radialGradient id={`wall${id}`} gradientUnits="userSpaceOnUse" cx="150" cy="210" r="430">
              <stop offset="0" stopColor="#3d3f40" />
              <stop offset="0.55" stopColor="#25272a" />
              <stop offset="1" stopColor="#141517" />
            </radialGradient>
            <linearGradient id={`floor${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#24201b" />
              <stop offset="1" stopColor="#0e0c0a" />
            </linearGradient>
            <radialGradient id={`glow${id}`}>
              <stop offset="0" stopColor="#ffe2a8" stopOpacity="0.42" />
              <stop offset="1" stopColor="#ffe2a8" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`glass${id}`} cx="0.4" cy="0.38">
              <stop offset="0" stopColor="#3b4a56" />
              <stop offset="0.6" stopColor="#141b21" />
              <stop offset="1" stopColor="#07090b" />
            </radialGradient>
            <radialGradient id={`dish${id}`} cx="0.45" cy="0.42">
              <stop offset="0" stopColor="#e9e8e2" />
              <stop offset="0.55" stopColor="#a6a8a6" />
              <stop offset="1" stopColor="#555a5d" />
            </radialGradient>
            <radialGradient id={`burst${id}`}>
              <stop offset="0" stopColor="#fff" />
              <stop offset="0.35" stopColor="#fffdf2" stopOpacity="0.95" />
              <stop offset="1" stopColor="#fff8e6" stopOpacity="0" />
            </radialGradient>
            <filter id={`soft${id}`} x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>

          {/* The room: wall, floor, and the bare bulb hanging over it all. */}
          <rect width="390" height="640" fill={`url(#wall${id})`} />
          <rect y="640" width="390" height="204" fill={`url(#floor${id})`} />
          <path d="M0 641H390" stroke="#2f2b26" strokeWidth="3" />
          <path className="bk-ph__boards" d="M0 700H390M0 770H390" />
          <circle className="bk-ph__glow" cx="150" cy="196" r="190" fill={`url(#glow${id})`} />
          <path d="M150 0V178" stroke="#0b0b0c" strokeWidth="2" />
          <rect x="143" y="172" width="14" height="13" rx="2" fill="#1d1e1f" />
          <circle className="bk-ph__bulb" cx="150" cy="196" r="12" fill="#fff3d0" filter={`url(#soft${id})`} />
          <circle className="bk-ph__bulb" cx="150" cy="196" r="9" fill="#fffaf0" />

          {/* The light cord, on the photographer's right. */}
          <g className="bk-ph__cord">
            <path d="M380 0V313" stroke="#8d8a80" strokeWidth="1.5" />
            <circle cx="380" cy="318" r="4.5" fill="#c9a974" />
          </g>

          {/* The photographer. */}
          <g className="bk-ph__man">
            <ellipse cx="282" cy="342" rx="28" ry="33" />
            <path d="M270 368H294V394H270Z" />
            <path d="M226 412C228 398 250 392 282 391C314 392 336 398 338 412L344 590H220Z" />
            <path d="M224 586L242 776H270L282 640L294 776H322L340 586Z" />
            <ellipse cx="254" cy="778" rx="17" ry="6" />
            <ellipse cx="310" cy="778" rx="17" ry="6" />
            <path className="bk-ph__limb" d="M232 410L216 546" />
            <g className="bk-ph__arm">
              <path className="bk-ph__limb" d="M334 408V513" />
              <circle cx="334" cy="516" r="10" />
            </g>
          </g>

          {/* The camera: a wooden plate camera on a tripod, the black cloth hanging over its back, a flash dish on its side. */}
          <g className="bk-ph__camera">
            <path d="M120 560L124 812" stroke="#2e2016" strokeWidth="6" strokeLinecap="round" />
            <path
              d="M58 420C60 380 90 366 120 364C150 366 180 380 182 420L190 600C178 612 168 596 156 610C144 622 132 600 120 612C108 624 96 600 84 612C72 622 62 604 50 600Z"
              fill="#121314"
            />
            <path className="bk-ph__folds" d="M84 420C86 480 80 540 84 610M156 420C154 480 160 540 156 610M120 380C118 440 122 520 120 612" />
            <path d="M120 560L52 800M120 560L188 800" stroke="#4a3322" strokeWidth="7" strokeLinecap="round" />
            <rect x="104" y="546" width="32" height="18" rx="2" fill="#3a2a1c" />
            <rect x="72" y="430" width="96" height="120" rx="5" fill="#6b4a2f" stroke="#3f2a1a" strokeWidth="3" />
            <rect x="86" y="444" width="68" height="92" rx="2" fill="#2a1e15" />
            <circle cx="120" cy="490" r="31" fill="#a07a35" stroke="#5e4520" strokeWidth="2" />
            <circle cx="120" cy="490" r="24" fill="#1b1713" />
            <circle cx="120" cy="490" r="18" fill={`url(#glass${id})`} />
            <ellipse cx="113" cy="483" rx="6" ry="3.5" fill="#fff" opacity="0.3" transform="rotate(-30 113 483)" />
            <path d="M72 468L48 436" stroke="#5c6164" strokeWidth="3" strokeLinecap="round" />
            <circle cx="40" cy="420" r="26" fill={`url(#dish${id})`} stroke="#8d9194" strokeWidth="2" />
            <circle cx="40" cy="420" r="6" fill="#f4f2ea" />
          </g>

          {/* He reaches for the cord: the room goes darker, then the flash. */}
          <rect className="bk-ph__dark" width="390" height="844" fill="#000" />
          <circle className="bk-ph__burst" cx="40" cy="420" r="60" fill={`url(#burst${id})`} />

          {/* The countdown, typed above him. */}
          <text className="bk-ph__say" x={SAY_X} y={SAY_Y[0]} fontSize={SAY_SIZE}>
            {first}
          </text>
          <text className="bk-ph__say" x={SAY_X} y={SAY_Y[1]} fontSize={SAY_SIZE}>
            {second}
          </text>
          {at('count') && !at('flash') ? (
            <rect
              className="bk-ph__caret"
              x={SAY_X + (onSecond ? second.length : first.length) * SAY_CH}
              y={SAY_Y[onSecond ? 1 : 0]! - SAY_SIZE * 0.82}
              width={SAY_CH * 0.9}
              height={SAY_SIZE * 1.05}
            />
          ) : null}
        </svg>
      </div>

      <div className="bk-ph__white" aria-hidden="true" />
      {/* For the keyboard: on to the flash at once (it shows only when focused). */}
      {at('pull') ? null : (
        <button
          type="button"
          className="bk-skip"
          onClick={(e) => {
            e.stopPropagation();
            setTyped(COUNT.length);
            setPhase('pull');
          }}
        >
          Skip the countdown
        </button>
      )}
      {at('white') ? (
        busy ? (
          <div className="bk-ph__busy" role="status">
            <Loader size={40} label="Developing your photo" on="paper" />
            <span>Developing…</span>
          </div>
        ) : (
          <>
            {inApp ? (
              <button
                type="button"
                className="bk-ph__shoot"
                onClick={(e) => {
                  e.stopPropagation();
                  setCamera(true);
                }}
              >
                <ShootIcon />
                <span className="bk-sr">Take your photo</span>
              </button>
            ) : (
              <label className="bk-ph__shoot" onClick={(e) => e.stopPropagation()}>
                <input
                  className="bk-sr"
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={(e) => {
                    took(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <ShootIcon />
                <span className="bk-sr">Take your photo</span>
              </label>
            )}
            <div className="bk-ph__alts" onClick={(e) => e.stopPropagation()}>
              {error ? (
                <p className="bk-ph__error" role="alert">
                  {error}
                </p>
              ) : null}
              {late || error ? (
                <>
                  <label className="bk-ph__alt">
                    {/* No capture here: a file or the photo library, which a laptop can do too. */}
                    <input
                      ref={fileRef}
                      className="bk-sr"
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        took(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                    Upload a photo instead
                  </label>
                  <button type="button" className="bk-ph__alt" onClick={onKeep}>
                    {current ? 'Keep my current photo' : 'No photo for now'}
                  </button>
                </>
              ) : null}
            </div>
          </>
        )
      ) : null}
      {camera ? (
        <CameraSheet
          title="Your photograph"
          facing="user"
          onClose={() => setCamera(false)}
          onCapture={(photo) => {
            setCamera(false);
            took(photo);
          }}
          onUseFile={() => {
            setCamera(false);
            setLate(true);
            window.setTimeout(() => fileRef.current?.click(), 0);
          }}
        />
      ) : null}
    </section>
  );
}

function ShootIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="12.8" r="3.6" />
    </svg>
  );
}
