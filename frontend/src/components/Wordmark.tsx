import { useId } from 'react';

/** The PaperPeer mark: your sheet in front, a classmate's behind, and the tick of the one who got it right. */
export function LogoMark({ size = 28 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5b5cf0" />
          <stop offset="1" stopColor="#3b2fc9" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${id})`} />
      <rect x="23" y="11" width="26" height="33" rx="4.5" fill="#fff" fillOpacity=".42" transform="rotate(8 36 27.5)" />
      <rect x="14" y="17" width="26" height="34" rx="4.5" fill="#fff" />
      <path d="M20 27h14M20 33.5h9" stroke="#4f46e5" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="42" cy="44" r="10.5" fill="#10b981" stroke="#4338ca" strokeWidth="3" />
      <path d="m37.6 44.2 3.2 3.2 5.7-6.6" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Logo plus the "PaperPeer" wordmark: Paper in the text colour, Peer in brand indigo. */
export function Brand({ href = '#/' }: { href?: string }) {
  return (
    <a className="sb-brand" href={href} aria-label="PaperPeer home">
      <LogoMark />
      <span className="wordmark">
        <span className="wm-paper">Paper</span>
        <span className="wm-peer">Peer</span>
      </span>
    </a>
  );
}
