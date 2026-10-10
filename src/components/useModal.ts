import { useEffect, useRef, type RefObject } from 'react';

let openModals = 0;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal behaviour for a panel: scroll lock, focus moves in and is restored on close,
 * Tab is trapped inside and Escape closes (unless locked).
 */
export function useModal(panelRef: RefObject<HTMLElement | null>, onClose: () => void, locked = false): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    openModals += 1;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      // Only the top-most modal reacts: ignore keys when focus is in a different modal.
      const active = document.activeElement;
      if (active && active !== document.body && !panel.contains(active)) return;
      if (event.key === 'Escape' && !lockedRef.current) {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      // Skip tabindex=-1 elements (the visually hidden file inputs are only ever clicked by a button).
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.tabIndex >= 0);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      openModals = Math.max(0, openModals - 1);
      if (openModals === 0) document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, [panelRef]);
}
