import { useEffect } from 'react';
import { UpdateNotes, useReleasesSince } from './UpdateNotes';
import { type AvailableUpdate, automaticCheckDue, type DownloadProgress, updates, useUpdates } from './updates';
import './updates.css';

/** The launch check waits this long, so it doesn't compete with starting up (the camera, the model). */
export const FIRST_CHECK_DELAY_MS = 10_000;

/**
 * How often to see whether the daily check is due. A timer in a hidden
 * window can be held back, so the daily check isn't one long timer: this
 * one, and the window showing again, catch up on it.
 */
export const DUE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** Checks shortly after launch and then daily, while `enabled` and the automatic checks are on. */
export function useAutomaticChecks(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const check = () => void updates.check({ manual: false });
    const checkIfOn = () => updates.get().autoCheck && check();
    const checkIfDue = () => automaticCheckDue(Date.now()) && check();
    const onVisible = () => document.visibilityState === 'visible' && checkIfDue();

    const first = window.setTimeout(checkIfOn, FIRST_CHECK_DELAY_MS);
    const hourly = window.setInterval(checkIfDue, DUE_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(hourly);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);
}

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

function Progress({ progress }: { progress: DownloadProgress | null }) {
  if (progress?.installing) {
    return (
      <div className="stack">
        <div className="progress indeterminate" role="progressbar" aria-label="Installing the update">
          <span />
        </div>
        <p className="muted">Installing… GloveBox restarts when it's done.</p>
      </div>
    );
  }
  const total = progress?.total ?? null;
  const percent = progress && total ? Math.min(100, Math.round((progress.downloaded / total) * 100)) : null;
  return (
    <div className="stack">
      <div
        className={`progress${percent === null ? ' indeterminate' : ''}`}
        role="progressbar"
        aria-label="Downloading the update"
        aria-valuenow={percent ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={percent === null ? undefined : { width: `${percent}%` }} />
      </div>
      <p className="muted">
        {progress === null
          ? 'Starting the download…'
          : `Downloading… ${megabytes(progress.downloaded)}${total ? ` of ${megabytes(total)}` : ''}`}
      </p>
    </div>
  );
}

/** "You have 0.4.0, 3 releases behind." */
function Behind({ update }: { update: AvailableUpdate }) {
  const since = useReleasesSince(update);
  return (
    <>
      You have {update.currentVersion}
      {since.length > 1 && `, ${since.length} releases behind`}.
    </>
  );
}

export interface UpdatePromptProps {
  /** While true (during practice), the dialog waits: it never interrupts a session. */
  blocked: boolean;
  /** Check on their own (at launch, then daily): off in development builds, which don't update. */
  checkAutomatically?: boolean;
}

/**
 * The update check: it runs on its own at launch and daily, and asks
 * before installing what it finds.
 */
export function UpdatePrompt({ blocked, checkAutomatically = !import.meta.env.DEV }: UpdatePromptProps) {
  useAutomaticChecks(checkAutomatically);
  const { update: state } = useUpdates();

  const installing = state.status === 'installing';
  const asking = (state.status === 'available' && state.open) || state.status === 'installFailed';
  const shown = installing || (asking && !blocked);

  // Escape is Later, except mid-install, which nothing interrupts
  useEffect(() => {
    if (!shown || installing) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && updates.later();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shown, installing]);

  if (!shown) return null;
  // The states the dialog shows all carry the update
  const { update } = state as Extract<typeof state, { update: AvailableUpdate }>;

  return (
    <div className="dialog-backdrop">
      <div className="dialog update-dialog" role="dialog" aria-modal="true" aria-labelledby="update-dialog-title">
        <h2 id="update-dialog-title">GloveBox {update.version} is available</h2>
        <p className="muted">
          <Behind update={update} /> GloveBox downloads the update, installs it and restarts. Your lessons and progress
          are kept.
        </p>
        <UpdateNotes update={update} />
        {installing && <Progress progress={state.progress} />}
        {state.status === 'installFailed' && (
          <p className="alert" role="alert">
            The update couldn't be installed. {state.error}
          </p>
        )}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={updates.later} disabled={installing}>
            Later
          </button>
          <button type="button" className="btn primary" onClick={() => void updates.install()} disabled={installing}>
            {state.status === 'installFailed' ? 'Try again' : 'Install and restart'}
          </button>
        </div>
      </div>
    </div>
  );
}
