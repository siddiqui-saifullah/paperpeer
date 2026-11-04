import { Icon } from './Icon';

/** Logo plus "PaperPeer": Paper in blue, Peer in maroon. */
export function Brand({ href = '#/' }: { href?: string }) {
  return (
    <a className="sb-brand" href={href}>
      <span className="logo">
        <Icon name="logo" />
      </span>
      <span className="wordmark">
        <span className="wm-paper">Paper</span>
        <span className="wm-peer">Peer</span>
      </span>
    </a>
  );
}
