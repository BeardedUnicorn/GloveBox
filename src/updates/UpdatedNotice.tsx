import { useUpdatedNotice } from './useUpdatedNotice';
import { APP_VERSION } from './version';
import './updates.css';

export interface UpdatedNoticeProps {
  /** Opens Settings → What's new. */
  onShowWhatsNew: () => void;
  /** The running version (APP_VERSION). */
  version?: string;
}

/** "Updated to GloveBox X — see what's new": once, after an update. */
export function UpdatedNotice({ onShowWhatsNew, version = APP_VERSION }: UpdatedNoticeProps) {
  const { notice, dismiss } = useUpdatedNotice(version);
  if (notice === null) return null;
  return (
    <div className="toast updated-notice" role="status">
      <span>
        Updated to GloveBox {notice.to}
        <span className="faint"> (from {notice.from})</span>
      </span>
      <button
        type="button"
        className="btn small primary"
        onClick={() => {
          dismiss();
          onShowWhatsNew();
        }}
      >
        See what's new
      </button>
      <button type="button" className="btn small ghost" onClick={dismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
