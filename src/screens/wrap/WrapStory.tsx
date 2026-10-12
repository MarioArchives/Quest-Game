// The swipeable story shell: red poster card, progress bars, Save image / Next. Cards are plain data,
// so the player cards and the group finale share one navigation model.
import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { ProgressBars } from './ProgressBars';
import { saveCardImage } from './saveImage';
import { pack, t } from '../../pack';

export interface StoryCard {
  /** Used for the saved file name (<pack id>-<slug>.png). */
  id: string;
  /** Screen-reader name of the card. */
  label: string;
  body: ReactNode;
}

/** Taps on these never turn the page (they do their own thing). */
const INTERACTIVE = 'button, a, summary, input, select, textarea, label, [data-no-tap]';
const SWIPE_PX = 48;
const TAP_SLOP_PX = 10;
const TAP_MAX_MS = 700;

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
    </svg>
  );
}

export function WrapStory({ cards }: { cards: StoryCard[] }) {
  const toast = useToast();
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [saving, setSaving] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number; at: number; interactive: boolean } | null>(null);

  const count = cards.length;
  const current = Math.min(index, Math.max(0, count - 1));
  const card = cards[current];
  const atEnd = current >= count - 1;

  const go = useCallback(
    (delta: 1 | -1) => {
      setIndex((i) => {
        const next = Math.max(0, Math.min(count - 1, Math.min(i, count - 1) + delta));
        if (next !== i) setDir(delta);
        return next;
      });
    },
    [count],
  );

  const restart = () => {
    setDir(-1);
    setIndex(0);
  };

  // Arrow keys anywhere on the page, except while typing or while a sheet/photo viewer is open.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.body.style.overflow === 'hidden') return;
      go(event.key === 'ArrowRight' ? 1 : -1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [go]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    press.current = {
      x: event.clientX,
      y: event.clientY,
      at: Date.now(),
      interactive: Boolean((event.target as Element).closest(INTERACTIVE)),
    };
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = press.current;
    press.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.4) {
      go(dx < 0 ? 1 : -1);
      return;
    }
    if (start.interactive || Math.abs(dx) > TAP_SLOP_PX || Math.abs(dy) > TAP_SLOP_PX || Date.now() - start.at > TAP_MAX_MS) return;
    const rect = event.currentTarget.getBoundingClientRect();
    go(event.clientX - rect.left < rect.width / 2 ? -1 : 1);
  };

  const onPointerCancel = () => {
    press.current = null;
  };

  const save = async () => {
    const node = cardRef.current;
    if (!node || !card || saving) return;
    setSaving(true);
    try {
      const result = await saveCardImage(node, card.id);
      if (result === 'downloaded') toast('Saved. Check your downloads.', 'success');
    } catch {
      toast("Couldn't make the image. Try again, or take a screenshot instead.", 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!card) return null;

  return (
    <section className="wrap" aria-label={`Your ${pack.name} ${t.wrap.one.toLowerCase()}`}>
      <div
        className="wrap__stage"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div
          key={current}
          ref={cardRef}
          className={`wcard wcard--${dir > 0 ? 'fwd' : 'back'}`}
          role="group"
          aria-roledescription="slide"
          aria-label={`${current + 1} of ${count}: ${card.label}`}
        >
          <header className="wcard__top">
            <p className="w-kicker">{pack.name} &middot; Game over</p>
            <Link to="/" className="wcard__close" aria-label={`Close the ${t.wrap.one.toLowerCase()}`} data-no-capture>
              <Icon name="close" size={20} strokeWidth={2.4} />
            </Link>
          </header>
          <div className="wcard__body">{card.body}</div>
          <footer className="wcard__foot">{pack.name}</footer>
        </div>

        <ProgressBars count={count} index={current} />

        <div className="wrap__controls" data-no-capture>
          <button type="button" className="btn-icon wrap__prev" aria-label="Previous card" disabled={current === 0} onClick={() => go(-1)}>
            <Icon name="chevron" size={22} strokeWidth={2.6} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <Button className="wrap__save" busy={saving} icon={<DownloadIcon />} onClick={() => void save()}>
            Save image
          </Button>
          {atEnd ? (
            <Button variant="primary" onRed className="wrap__next" onClick={restart}>
              Start over
            </Button>
          ) : (
            <Button variant="primary" onRed className="wrap__next" aria-label="Next card" onClick={() => go(1)}>
              Next
              <Icon name="chevron" size={20} strokeWidth={2.8} />
            </Button>
          )}
        </div>
      </div>
      <p className="visually-hidden" role="status" aria-live="polite">
        Card {current + 1} of {count}: {card.label}
      </p>
    </section>
  );
}
