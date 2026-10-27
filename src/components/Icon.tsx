import type { SVGProps } from 'react';

// 24px line icons: 2px stroke, round caps (same family as the mockups' inline SVGs).
const PATHS = {
  home: ['M3 11l9-7 9 7', 'M5 10v10h14V10'],
  /** A magnifying glass with a glint. */
  search: ['M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z', 'M15.3 15.3L21 21', 'M7.5 9.5a3 3 0 0 1 3-3'],
  quests: ['M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M9 8h6M9 12h6M9 16h4'],
  map: ['M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z', 'M9 4v14M15 6v14'],
  folder: ['M3 6.5h6.5l2 2H21V19H3z', 'M3 11h18'],
  notebook: ['M6.5 3h12v18h-12z', 'M9.5 3v18', 'M12.5 8h3.5M12.5 12h3.5M12.5 16h2.5', 'M4.5 7h3M4.5 12h3M4.5 17h3'],
  ranks: ['M6 20v-8M12 20V5M18 20v-5'],
  gm: ['M12 3l8 3v6c0 4.5-3.2 7.7-8 9-4.8-1.3-8-4.5-8-9V6l8-3z', 'M9 12l2 2 4-4'],
  wrap: ['M4 5h16v14H4z', 'M10 9l5 3-5 3V9z'],
  camera: ['M4 8h3l2-3h6l2 3h3v11H4z', 'M12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z'],
  refresh: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 4v7h-7'],
  lock: ['M6 11h12v10H6z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  pin: ['M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z', 'M12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z'],
  megaphone: ['M3 10v4h4l7 4V6L7 10H3z', 'M17.5 9a4 4 0 0 1 0 6'],
  check: ['M5 12l5 5L19 7'],
  close: ['M6 6l12 12M18 6L6 18'],
  send: ['M4 12l16-8-6 16-3-7-7-1z'],
  trash: ['M5 7h14', 'M9 7V4h6v3', 'M7 7l1 13h8l1-13'],
  chevron: ['M9 6l6 6-6 6'],
  chevronDown: ['M6 9l6 6 6-6'],
  user: ['M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M4 21c0-4 3.5-6 8-6s8 2 8 6'],
  image: ['M4 5h16v14H4z', 'M4 16l5-5 4 4 3-3 4 4', 'M9 9.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z'],
  logout: ['M10 4H5v16h5', 'M15 8l4 4-4 4', 'M19 12H9'],
  comment: ['M4 5h16v11H9l-5 4V5z'],
  plus: ['M12 5v14M5 12h14'],
  menu: ['M4 7h16M4 12h16M4 17h16'],
  ballot: ['M5 4h14v16H5z', 'M9 9l2 2 4-4', 'M9 16h6'],
  trophy: ['M8 4h8v6a4 4 0 0 1-8 0V4z', 'M8 6H4v2a3 3 0 0 0 4 2.8', 'M16 6h4v2a3 3 0 0 1-4 2.8', 'M12 14v4M8 20h8'],
  /** A clock face (the start time's countdown). */
  clock: ['M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', 'M12 8v4.5l3 1.8'],
  edit: ['M4 20h4L19 9l-4-4L4 16v4z', 'M13 7l4 4'],
  /** A telephone handset (the trusted confidant's pin and the tip line). */
  phone: ['M6.6 3.5h2.9l1.8 4.7-1.9 1.7a14 14 0 0 0 4.7 4.7l1.7-1.9 4.7 1.8v2.9a2 2 0 0 1-2 2C10.5 19.4 4.6 13.5 4.6 5.5a2 2 0 0 1 2-2Z'],
  /** An open eye (the person of interest's pin: being watched). */
  eye: ['M2.5 12C5 7.5 8.3 5.5 12 5.5s7 2 9.5 6.5c-2.5 4.5-5.8 6.5-9.5 6.5S5 16.5 2.5 12Z', 'M9.8 12a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0'],
  gear: ['M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z','M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.7a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.7a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z'],
} as const;

export type IconName = keyof typeof PATHS;

/** True for a name the icon set has (a pack's brand names icons as plain strings). */
export const isIconName = (name: string | undefined): name is IconName => name !== undefined && Object.prototype.hasOwnProperty.call(PATHS, name);

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 24, strokeWidth = 2, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
