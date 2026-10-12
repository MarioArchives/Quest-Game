import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader } from './Loader';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  small?: boolean;
  block?: boolean;
  /** A callable is in flight: shows the 24px loader and blocks clicks. */
  busy?: boolean;
  /** Use on a red surface (no hard shadow). */
  onRed?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  small = false,
  block = false,
  busy = false,
  onRed = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    variant !== 'secondary' ? `btn--${variant}` : '',
    small ? 'btn--small' : '',
    block ? 'btn--block' : '',
    busy ? 'btn--busy' : '',
    onRed ? 'btn--on-red' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button {...rest} type={type} className={classes} disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy ? <Loader size={24} label="Working" on={variant === 'primary' ? 'ink' : variant === 'danger' ? 'red' : 'paper'} /> : icon}
      <span className="btn__label">{children}</span>
    </button>
  );
}
