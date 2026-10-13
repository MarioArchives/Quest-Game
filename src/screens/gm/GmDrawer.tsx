import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/Icon';
import { useModal } from '../../components/useModal';
import { t } from '../../pack';

/** The drawer's element id, for the burger's aria-controls. */
export const GM_DRAWER_ID = 'gm-drawer';

export interface GmDrawerItem<T extends string> {
  id: T;
  label: string;
  /** A badge when above 0, read out as "<count> <countLabel>". */
  count?: number;
  countLabel?: string;
}

/**
 * The burger's side drawer: slides in from the left over a dimmed page; Escape, the overlay and the close button
 * dismiss it. A pack's own GM screen can list its own sections.
 */
export function GmDrawer<T extends string>({
  items,
  current,
  onChoose,
  onClose,
}: {
  items: GmDrawerItem<T>[];
  current: T;
  onChoose(id: T): void;
  onClose(): void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  useModal(panelRef, onClose);

  return createPortal(
    <div className="gm-drawer-root">
      <div className="gm-drawer-backdrop" onClick={onClose} />
      <aside className="gm-drawer" id={GM_DRAWER_ID} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRef} tabIndex={-1}>
        <div className="gm-drawer__head">
          <h2 id={titleId} className="gm-drawer__title">
            {t.gm.One} console
          </h2>
          <button type="button" className="btn-icon" aria-label="Close menu" onClick={onClose}>
            <Icon name="close" size={22} />
          </button>
        </div>
        <nav aria-label={`${t.gm.One} console sections`}>
          <ul className="gm-drawer__list">
            {items.map((item) => {
              const count = item.count ?? 0;
              const active = item.id === current;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`gm-drawer__item${active ? ' is-active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => onChoose(item.id)}
                  >
                    <span className="gm-drawer__label">{item.label}</span>
                    {count > 0 ? (
                      <span className="gm-badge" aria-label={`${count} ${item.countLabel ?? 'waiting'}`}>
                        {count}
                      </span>
                    ) : null}
                    <Icon name="chevron" size={20} />
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </div>,
    document.body,
  );
}
