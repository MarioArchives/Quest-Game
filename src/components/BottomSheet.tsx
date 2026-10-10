import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useModal } from './useModal';
import './BottomSheet.css';

export interface BottomSheetProps {
  title: string;
  onClose(): void;
  children: ReactNode;
  /** Small line under the title (for example "550 pts · Rank 2"). */
  subtitle?: ReactNode;
  /** Left of the title (an avatar). */
  lead?: ReactNode;
  /** Stops backdrop/Escape from closing (while a callable or upload is in flight). */
  locked?: boolean;
}

/** Modal bottom sheet: focus moves in, Escape / backdrop / the close button dismiss it, focus returns. */
export function BottomSheet({ title, onClose, children, subtitle, lead, locked = false }: BottomSheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useModal(panelRef, onClose, locked);

  return createPortal(
    <div className="sheet-root">
      <div className="sheet-backdrop" onClick={() => !locked && onClose()} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRef} tabIndex={-1}>
        <div className="sheet__head">
          {lead}
          <div className="sheet__titles">
            <h2 id={titleId} className="sheet__title">
              {title}
            </h2>
            {subtitle ? <p className="sheet__subtitle">{subtitle}</p> : null}
          </div>
          <button type="button" className="btn-icon" aria-label="Close" onClick={onClose} disabled={locked}>
            <Icon name="close" size={22} />
          </button>
        </div>
        <div className="sheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
