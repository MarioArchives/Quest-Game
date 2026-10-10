import type { SVGProps } from 'react';

// 24px line icons: 2px stroke, round caps (same family as the mockups' inline SVGs).
const PATHS = {
  home: ['M3 11l9-7 9 7', 'M5 10v10h14V10'],
  quests: ['M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M9 8h6M9 12h6M9 16h4'],
  map: ['M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z', 'M9 4v14M15 6v14'],
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
  edit: ['M4 20h4L19 9l-4-4L4 16v4z', 'M13 7l4 4'],
  gear: ['M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', 'M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.7a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.7a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z'],
} as const;

export type IconName = keyof typeof PATHS;

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
