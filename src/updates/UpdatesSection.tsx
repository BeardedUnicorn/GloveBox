import { updates, useUpdates } from './updates';
import { APP_VERSION } from './version';
import './updates.css';

/** What the last check said, in a line (or the error it hit). */
function Status() {
  const { update } = useUpdates();
  switch (update.status) {
    case 'checking':
      return <p className="muted">Checking for updates…</p>;
    case 'upToDate':
      return <p className="muted">GloveBox is up to date.</p>;
    case 'checkFailed':
      return (
        <p className="alert" role="alert">
          Couldn't check for updates. {update.error}
        </p>
      );
    case 'available':
    case 'installFailed':
      return (
        <p className="row">
          <span>GloveBox {update.update.version} is available.</span>
          <button type="button" className="btn small" onClick={updates.show}>
            See what's new
          </button>
        </p>
      );
    case 'installing':
      return <p className="muted">Installing GloveBox {update.update.version}…</p>;
    default:
      return null;
  }
}

/** Settings → Updates: the version, a check now, and whether checks run on their own. */
export function UpdatesSection() {
  const { update, autoCheck, lastCheckedAt } = useUpdates();
  const busy = update.status === 'checking' || update.status === 'installing';
  return (
    <section className="panel updates-section" aria-labelledby="updates-heading">
      <h2 id="updates-heading">Updates</h2>
      <div className="field">
        <span>
          GloveBox <span className="mono">{APP_VERSION}</span>
        </span>
        <button type="button" className="btn" onClick={() => void updates.check({ manual: true })} disabled={busy}>
          Check for updates
        </button>
      </div>
      <Status />
      <label className="field">
        <span>Check for updates automatically</span>
        <input type="checkbox" checked={autoCheck} onChange={event => updates.setAutoCheck(event.target.checked)} />
      </label>
      <p className="faint">
        {lastCheckedAt === null ? 'Never checked.' : `Last checked ${new Date(lastCheckedAt).toLocaleString()}.`}
      </p>
    </section>
  );
}
