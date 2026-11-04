import type { SVGProps } from 'react';

const paths = {
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  share: 'M4 12v7h16v-7M12 3v12M7 8l5-5 5 5',
  cols: 'M4 5h6v14H4zM14 5h6v14h-6z',
  tri: 'M12 4l9 16H3z',
  check: 'M5 12l4 4 10-10',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  reload: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  rotate: 'M4 9V5h4M4 5l5 5M20 15v4h-4M20 19l-5-5M14 4h4a2 2 0 0 1 2 2v4M10 20H6a2 2 0 0 1-2-2v-4',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  code: 'M8 8l-4 4 4 4M16 8l4 4-4 4',
  chevrons: 'M7 10l5-5 5 5M7 14l5 5 5-5',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18',
  terminal: 'M4 17l6-5-6-5M12 19h8',
  close: 'M6 6l12 12M18 6L6 18',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  spark: 'M12 3v5M12 16v5M3 12h5M16 12h5M5.6 5.6l3.5 3.5M14.9 14.9l3.5 3.5M18.4 5.6l-3.5 3.5M9.1 14.9l-3.5 3.5',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  page: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
  phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 15, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...rest}>
      <path d={paths[name]} stroke="currentColor" strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The Parakeet mark: a screen with a phone inside. */
export function Mark({ size = 18 }: { size?: number }) {
  const inner = { w: Math.round(size * 0.28), h: Math.round(size * 0.44), off: Math.max(2, Math.round(size * 0.11)) };
  return (
    <span aria-hidden="true" className="relative inline-block shrink-0 border-fg" style={{ width: size, height: size, borderWidth: Math.max(1.5, size / 12), borderRadius: size * 0.28 }}>
      <span className="absolute bg-fg" style={{ right: inner.off, bottom: inner.off, width: inner.w, height: inner.h, borderRadius: size / 12 }} />
    </span>
  );
}

export function Dot({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block size-1.5 shrink-0 rounded-full ${className}`} />;
}

export function Kbd({ children }: { children: string }) {
  return <span className="rounded border border-[#2a2a2f] px-1.5 font-mono text-[10.5px] leading-4 text-faint">{children}</span>;
}
