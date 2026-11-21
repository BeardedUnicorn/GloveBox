import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { useApp } from '../state/appStore';

/** The frame around every screen but practice: the name, the streak and the way around. */
export function Shell({ children }: { children: ReactNode }) {
  const streak = useApp(state => state.progress.streak.current);
  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="GloveBox library">
          <span className="brand-dot" aria-hidden="true" />
          GloveBox
        </NavLink>
        <span className="chip streak" title="Days in a row with at least a minute of practice">
          {streak > 0 ? `🔥 ${streak}-day streak` : 'Start a streak today'}
        </span>
        <span className="spacer" />
        <nav className="row">
          <NavLink to="/" end className="btn ghost small">
            Library
          </NavLink>
          <NavLink to="/progress" className="btn ghost small">
            Progress
          </NavLink>
          <NavLink to="/record" className="btn ghost small">
            Record
          </NavLink>
          <NavLink to="/settings" className="btn ghost small">
            Settings
          </NavLink>
        </nav>
      </header>
      <main className="screen">{children}</main>
    </div>
  );
}
