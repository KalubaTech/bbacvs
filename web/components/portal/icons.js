// Line-icon set for portal UIs. Usage: <Icon name="dashboard" className="h-5 w-5" />
// All icons are 24x24 stroke-based; color follows currentColor.

const PATHS = {
  dashboard: <><path d="M3 12l9-8 9 8" /><path d="M5 10v10h5v-6h4v6h5V10" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  apps: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h5" /></>,
  registry: <><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></>,
  queue: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c1.2-3.2 3.8-5 6.5-5s5.3 1.8 6.5 5" /><path d="M16 4.5a3.5 3.5 0 010 7" /><path d="M17.5 15.5c2 .8 3.4 2.3 4 4.5" /></>,
  revoke: <><circle cx="12" cy="12" r="9" /><path d="M5.5 5.5l13 13" /></>,
  audit: <><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" /><path d="M9 12h6M9 15.5h4" /></>,
  shield: <><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" /></>,
  shieldCheck: <><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4.5" /></>,
  reports: <><path d="M4 20V8m5.5 12V4M15 20v-9m5 9V7" /></>,
  chart: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 16v-5m4 5V8m4 8v-3" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1.03 1.56V21a2 2 0 11-4 0v-.09a1.7 1.7 0 00-1.11-1.56 1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.7 1.7 0 00.34-1.87 1.7 1.7 0 00-1.56-1.03H3a2 2 0 110-4h.09a1.7 1.7 0 001.56-1.11 1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06a1.7 1.7 0 001.87.34h.01A1.7 1.7 0 0010 3.09V3a2 2 0 114 0v.09a1.7 1.7 0 001.03 1.56 1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.87v.01c.26.63.87 1.04 1.56 1.03H21a2 2 0 110 4h-.09a1.7 1.7 0 00-1.51.98z" /></>,
  bell: <><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  chevronsLeft: <path d="M11 7l-5 5 5 5M18 7l-5 5 5 5" />,
  chevronsRight: <path d="M6 7l5 5-5 5M13 7l5 5-5 5" />,
  download: <><path d="M12 3v12m0 0l-4-4m4 4l4-4" /><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></>,
  upload: <><path d="M12 15V3m0 0L8 7m4-4l4 4" /><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></>,
  filter: <path d="M4 5h16l-6.5 7.5V19l-3 2v-8.5L4 5z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M4.5 12.5l5 5 10-11" />,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 5-6" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  xCircle: <><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6m0-6l-6 6" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
  dots: <><circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" /></>,
  dotsH: <><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4m8-4v4M3 10h18" /></>,
  send: <><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></>,
  building: <><path d="M4 21V5a2 2 0 012-2h8a2 2 0 012 2v16" /><path d="M20 21V11a2 2 0 00-2-2h-2" /><path d="M8 7h2m-2 4h2m-2 4h2M2 21h20" /></>,
  bank: <><path d="M3 9l9-6 9 6" /><path d="M4 9v11m16-11v11M8 12v5m4-5v5m4-5v5M2 21h20" /></>,
  award: <><circle cx="12" cy="9" r="6" /><path d="M8.5 14L7 22l5-3 5 3-1.5-8" /></>,
  graduation: <><path d="M2 9l10-5 10 5-10 5L2 9z" /><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5" /><path d="M22 9v5" /></>,
  book: <><path d="M4 19.5A2.5 2.5 0 016.5 17H20V2H6.5A2.5 2.5 0 004 4.5v15z" /><path d="M4 19.5A2.5 2.5 0 006.5 22H20v-5" /></>,
  file: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" /><path d="M14 2v6h6" /></>,
  fileText: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" /><path d="M14 2v6h6M9 13h6M9 17h4" /></>,
  folder: <><path d="M3 7a2 2 0 012-2h4l2 3h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></>,
  alert: <><path d="M12 3L2 20h20L12 3z" /><path d="M12 10v4m0 3h.01" /></>,
  alertCircle: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5m0 3h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>,
  refresh: <><path d="M21 12a9 9 0 11-2.6-6.3" /><path d="M21 3v6h-6" /></>,
  sync: <><path d="M8 16H4v4" /><path d="M4 16a9 9 0 0015.4 2.6M16 8h4V4" /><path d="M20 8A9 9 0 004.6 5.4" /></>,
  link: <><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7" /></>,
  share: <><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.2 10.9l7.6-3.8m-7.6 6l7.6 3.8" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14h1m-4 6h1m3 0h1m-1-3h.01" /></>,
  print: <><path d="M6 9V3h12v6" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="7" rx="1" /></>,
  scale: <><path d="M12 3v18M4 7h16" /><path d="M7 7l-3 7a3.5 3.5 0 007 0L8 7m9 0l-3 7a3.5 3.5 0 007 0l-3-7" /><path d="M8 21h8" /></>,
  gavel: <><path d="M14 4l6 6m-8-4l6 6M4 20l8-8m1-5l4 4-2 2-4-4 2-2z" /><path d="M3 21h8" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4a3 3 0 016 0" /><path d="M9 11h6M9 15h4" /></>,
  clipboardCheck: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4a3 3 0 016 0" /><path d="M9 13.5l2 2 4-4.5" /></>,
  inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5 4h14l3 8v6a2 2 0 01-2 2H4a2 2 0 01-2-2v-6l3-8z" /></>,
  wallet: <><rect x="2" y="6" width="20" height="14" rx="2" /><path d="M2 10h20M16 15h2" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></>,
  logout: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5m5 5H9" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 114 2c-.8.6-1.5 1-1.5 2m0 3h.01" /></>,
  pause: <><circle cx="12" cy="12" r="9" /><path d="M10 9v6m4-6v6" /></>,
  archive: <><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8M10 12h4" /></>,
  flag: <><path d="M4 21V4" /><path d="M4 4h12l-2 4 2 4H4" /></>,
  map: <><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14m6-12v14" /></>,
  layers: <><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></>,
  trash: <><path d="M4 7h16m-2 0l-1 13a2 2 0 01-2 2H9a2 2 0 01-2-2L6 7" /><path d="M9 7V4h6v3m-5 4v7m4-7v7" /></>,
  star: <path d="M12 3l2.7 5.6 6.3.9-4.5 4.4 1 6.1-5.5-2.9-5.5 2.9 1-6.1L3 9.5l6.3-.9L12 3z" />,
  bolt: <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />,
  sparkle: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" /><path d="M19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16z" /></>,
};

export default function Icon({ name, className = "h-5 w-5", strokeWidth = 1.7 }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name] || PATHS.grid}
    </svg>
  );
}
