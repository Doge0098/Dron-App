import type { SVGProps } from 'react';

const PATHS = {
  drone: (
    <>
      <circle cx="5" cy="5" r="2.5" />
      <circle cx="19" cy="5" r="2.5" />
      <circle cx="5" cy="19" r="2.5" />
      <circle cx="19" cy="19" r="2.5" />
      <path d="M7 7l3 3m4 0l3-3M7 17l3-3m4 0l3 3" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1.2" />
    </>
  ),
  cloud: (
    <>
      <path d="M7 18h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.1 9.1 4.5 4.5 0 0 0 7 18z" />
      <path d="M8 21l1-2m3 2l1-2m3 2l1-2" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  shape: (
    <>
      <path d="M4 7l6-3 9 4-2 10-11 2z" />
      <circle cx="4" cy="7" r="1.3" />
      <circle cx="10" cy="4" r="1.3" />
      <circle cx="19" cy="8" r="1.3" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
      <path d="M4 21.5V5.5M8 7h8M8 11h6" />
    </>
  ),
  pen: (
    <>
      <path d="M4 20c3-1 4-4 7-4s3 3 6 2" />
      <path d="M14.5 4.5l5 5L11 18l-5 1 1-5z" />
    </>
  ),
  polygon: <path d="M12 3l8 6-3 11H7L4 9z" />,
  rectangle: <rect x="4" y="6" width="16" height="12" rx="1.5" />,
  circle: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="1.2" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13l9 5 9-5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  locate: (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  play: <path d="M8 5l11 7-11 7z" />,
  pause: <path d="M8 5h3v14H8zM13 5h3v14h-3z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  undo: <path d="M9 7L4 12l5 5M4 12h10a6 6 0 0 1 0 12h-2" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  home: <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  wind: <path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7" />,
  alert: (
    <>
      <path d="M12 3l9.5 17h-19z" />
      <path d="M12 10v4.5M12 17.5v.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20.5c.8-3.9 3.8-6.2 7.5-6.2s6.7 2.3 7.5 6.2" />
    </>
  ),
  phone: <path d="M6.5 3.5h3l1.6 4.2-2 1.3a11.5 11.5 0 0 0 5.9 5.9l1.3-2 4.2 1.6v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z" />,
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, ...props }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}
