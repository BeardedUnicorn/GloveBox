/**
 * Progress: streaks and totals, a practice calendar, how each finger is
 * doing, the tiers, and every lesson's best. Everything shown comes from
 * deriveProgress (src/progression/derive.ts).
 */

import type { CSSProperties } from 'react';
import { FINGER_NAMES, FINGERS, HANDS, type Slot, slotName, slotOf } from '../../core/types';
import { addDays, type Day, daysBetween, localDay, weekday } from '../../progression/days';
import type { Progress } from '../../progression/derive';
import type { CatalogEntry, Tier } from '../../progression/types';
import { TIERS } from '../../progression/unlocks';
import { formatDay, formatDuration, percent, plural, starsText } from './format';
import './progress.css';

export const TIER_NAMES: Record<Tier, string> = {
  1: 'Foundations',
  2: 'Flails & whips',
  3: 'Tutting',
  4: 'Tech & contours',
  5: 'Combos',
};

/** How many weeks the practice calendar shows, ending with this one. */
export const CALENDAR_WEEKS = 20;

export interface ProgressScreenProps {
  progress: Progress;
  catalog: readonly CatalogEntry[];
  /** The day the calendar ends on; today by default. */
  today?: Day;
}

export function ProgressScreen({ progress, catalog, today = localDay(Date.now()) }: ProgressScreenProps) {
  const { streak, totals } = progress;
  return (
    <section className="progress-screen" aria-labelledby="progress-title">
      <h1 id="progress-title">Progress</h1>
      <dl className="progress-cards">
        <Stat label="Current streak" value={plural(streak.current, 'day')} />
        <Stat label="Longest streak" value={plural(streak.longest, 'day')} />
        <Stat label="Practice time" value={formatDuration(totals.practiceMs)} />
        <Stat label="Sessions" value={String(totals.sessions)} />
        <Stat label="Lessons played" value={String(totals.lessonsPlayed)} />
      </dl>
      <PracticeCalendar byDay={progress.practiceByDay} today={today} />
      <div className="progress-columns">
        <FingerAccuracy values={progress.fingerAccuracy} />
        <TierList progress={progress} />
      </div>
      <LessonTable progress={progress} catalog={catalog} />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel progress-stat">
      <dt className="muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** 0 none, then under 5, 15 and 30 minutes, then 30 or more. */
export function calendarLevel(ms: number): 0 | 1 | 2 | 3 | 4 {
  if (ms <= 0) return 0;
  const minutes = ms / 60_000;
  if (minutes < 5) return 1;
  if (minutes < 15) return 2;
  if (minutes < 30) return 3;
  return 4;
}

function PracticeCalendar({ byDay, today }: { byDay: Readonly<Record<Day, number>>; today: Day }) {
  // Columns are weeks, Sunday on top; the last column is this week
  const start = addDays(today, -(weekday(today) + 7 * (CALENDAR_WEEKS - 1)));
  const days = Array.from({ length: CALENDAR_WEEKS * 7 }, (_, i) => addDays(start, i));
  const practiced = days.filter(day => (byDay[day] ?? 0) > 0).length;
  return (
    <section className="panel progress-calendar" aria-labelledby="calendar-title">
      <div className="row">
        <h2 id="calendar-title">Practice calendar</h2>
        <span className="spacer" />
        <span className="muted">
          {plural(practiced, 'day')} practiced in the last {CALENDAR_WEEKS} weeks
        </span>
      </div>
      <figure className="calendar-grid" aria-label={`Practice over the last ${CALENDAR_WEEKS} weeks`}>
        {days.map(day => {
          if (daysBetween(today, day) > 0) return <span key={day} className="calendar-cell future" aria-hidden />;
          const ms = byDay[day] ?? 0;
          const label = `${formatDay(day)}: ${ms > 0 ? formatDuration(ms) : 'no practice'}`;
          return (
            <span
              key={day}
              className="calendar-cell"
              data-level={calendarLevel(ms)}
              role="img"
              aria-label={label}
              title={label}
            />
          );
        })}
      </figure>
    </section>
  );
}

function FingerAccuracy({ values }: { values: readonly (number | null)[] }) {
  const known = values.flatMap((value, slot) => (value === null ? [] : [{ slot, value }]));
  const weakest = known.reduce<{ slot: number; value: number } | null>(
    (low, entry) => (low === null || entry.value < low.value ? entry : low),
    null
  );
  return (
    <section className="panel progress-fingers" aria-labelledby="fingers-title">
      <h2 id="fingers-title">Fingers</h2>
      <p className="muted">
        {weakest === null
          ? 'Play a lesson to see how each finger does.'
          : `Weakest lately: ${slotName(weakest.slot as Slot)} (${percent(weakest.value)}).`}
      </p>
      <div className="finger-hands">
        {HANDS.map(hand => (
          <div key={hand} className="stack finger-hand">
            <h3>{hand === 'L' ? 'Left hand' : 'Right hand'}</h3>
            {FINGERS.map(finger => {
              const slot = slotOf(hand, finger);
              // fingerAccuracy always has all ten slots
              const value = values[slot] as number | null;
              const name = FINGER_NAMES[finger];
              return (
                <div key={finger} className="finger-row">
                  <span className="finger-name">{name}</span>
                  <meter
                    className="finger-bar"
                    min={0}
                    max={100}
                    value={value ?? 0}
                    aria-label={`${slotName(slot)} accuracy`}
                    aria-valuetext={value === null ? 'no data yet' : percent(value)}
                    style={{ '--bar-color': `var(--light-${name})` } as CSSProperties}
                  />
                  <span className="finger-value mono">{value === null ? '—' : percent(value)}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function TierList({ progress }: { progress: Progress }) {
  return (
    <section className="panel progress-tiers" aria-labelledby="tiers-title">
      <h2 id="tiers-title">Tiers</h2>
      <ol className="tier-list">
        {TIERS.map(tier => {
          const { unlocked, starsEarned, starsPossible } = progress.tiers[tier];
          return (
            <li key={tier} className="tier-row">
              <div className="row">
                <strong>
                  {tier}. {TIER_NAMES[tier]}
                </strong>
                <span className="chip">{unlocked ? 'Unlocked' : 'Locked'}</span>
                <span className="spacer" />
                <span className="muted">
                  {starsPossible === 0 ? 'No lessons yet' : `${starsEarned} / ${starsPossible} ★`}
                </span>
              </div>
              <meter
                className="tier-meter"
                min={0}
                // A tier with nothing to earn shows an empty bar
                max={Math.max(starsPossible, 1)}
                value={starsEarned}
                aria-label={`Tier ${tier} stars`}
              />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The latest sessions' accuracy as a small line, 0–100% bottom to top. */
export function Sparkline({ history }: { history: readonly { accuracy: number }[] }) {
  const points = history.slice(-20);
  const last = points.at(-1);
  if (!last) return <span className="faint">Not played yet</span>;
  const width = 96;
  const height = 24;
  const x = (i: number) => (points.length === 1 ? width / 2 : (i * width) / (points.length - 1));
  const y = (accuracy: number) => height - (accuracy / 100) * height;
  return (
    <svg
      className="sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Accuracy over ${plural(points.length, 'session')}, latest ${percent(last.accuracy)}`}
    >
      {points.length > 1 && (
        <polyline points={points.map((p, i) => `${x(i)},${y(p.accuracy)}`).join(' ')} fill="none" />
      )}
      <circle cx={x(points.length - 1)} cy={y(last.accuracy)} r={2.5} />
    </svg>
  );
}

function LessonTable({ progress, catalog }: { progress: Progress; catalog: readonly CatalogEntry[] }) {
  return (
    <section className="panel progress-lessons" aria-labelledby="lessons-title">
      <h2 id="lessons-title">Lessons</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Lesson</th>
            <th scope="col">Tier</th>
            <th scope="col">Best</th>
            <th scope="col">Stars</th>
            <th scope="col">Plays</th>
            <th scope="col">Recent accuracy</th>
          </tr>
        </thead>
        <tbody>
          {catalog.map(entry => {
            const lesson = progress.lessons[entry.id];
            const stars = lesson?.stars ?? 0;
            return (
              <tr key={entry.id}>
                <th scope="row">
                  {entry.name} {!progress.isUnlocked(entry.id) && <span className="chip">Locked</span>}
                </th>
                <td>{entry.origin === 'builtin' ? TIER_NAMES[entry.tier] : 'My Moves'}</td>
                <td>{lesson ? `${lesson.bestGrade} · ${percent(lesson.bestAccuracy)}` : '—'}</td>
                <td>
                  <span className="lesson-stars" role="img" aria-label={`${stars} of 3 stars`}>
                    {starsText(stars)}
                  </span>
                </td>
                <td className="mono">{lesson?.plays ?? 0}</td>
                <td>
                  <Sparkline history={lesson?.history ?? []} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
