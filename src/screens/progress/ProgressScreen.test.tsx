import { render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { addDays } from '../../progression/days';
import { deriveProgress } from '../../progression/derive';
import type { CatalogEntry, SessionRecord } from '../../progression/types';
import { session } from '../../test/storageContract';
import { formatDay, formatDuration, plural, starsText } from './format';
import { CALENDAR_WEEKS, calendarLevel, ProgressScreen, Sparkline } from './ProgressScreen';

const TODAY = '2026-11-21'; // a Saturday

const catalog: CatalogEntry[] = [
  { id: 'roll', name: 'Finger roll', tier: 1, origin: 'builtin' },
  { id: 'wave', name: 'Ten-light wave', tier: 1, origin: 'builtin' },
  { id: 'circle', name: 'Mirrored circle', tier: 2, origin: 'builtin' },
  { id: 'mine', name: 'My move', tier: 3, origin: 'recorded' },
];

const nulls = () => new Array(10).fill(null);

function played(overrides: Partial<SessionRecord>): SessionRecord {
  return session({ perFinger: nulls(), ...overrides });
}

const sessions = [
  played({ id: 'a', lessonId: 'roll', day: '2026-11-20', startedAt: 1, accuracy: 72, grade: 'C', stars: 1 }),
  played({
    id: 'b',
    lessonId: 'roll',
    day: TODAY,
    startedAt: 2,
    accuracy: 91.4,
    grade: 'A',
    stars: 3,
    durationMs: 40 * 60_000,
    perFinger: [90, 85, null, null, null, 62, 70, null, null, 99],
  }),
];

function renderProgress(list = sessions, today = TODAY) {
  const progress = deriveProgress(list, catalog, TODAY);
  return render(<ProgressScreen progress={progress} catalog={catalog} today={today} />);
}

describe('the Progress screen', () => {
  test('shows streaks and totals', () => {
    renderProgress();
    expect(screen.getByRole('heading', { level: 1, name: 'Progress' })).toBeInTheDocument();
    const stat = (label: string) => screen.getByText(label).nextSibling?.textContent;
    expect(stat('Current streak')).toBe('2 days');
    expect(stat('Longest streak')).toBe('2 days');
    expect(stat('Practice time')).toBe('41 min');
    expect(stat('Sessions')).toBe('2');
    expect(stat('Lessons played')).toBe('1');
  });

  test('the calendar shows 20 weeks ending this week, shaded by practice', () => {
    renderProgress();
    const calendar = screen.getByRole('figure', { name: `Practice over the last ${CALENDAR_WEEKS} weeks` });
    // Saturday is the week's last day, so every cell is a past or present day
    expect(within(calendar).getAllByRole('img')).toHaveLength(CALENDAR_WEEKS * 7);
    expect(within(calendar).getByRole('img', { name: 'Sat, Nov 21: 40 min' })).toHaveAttribute('data-level', '4');
    expect(within(calendar).getByRole('img', { name: 'Fri, Nov 20: 1 min' })).toHaveAttribute('data-level', '1');
    expect(within(calendar).getByRole('img', { name: 'Thu, Nov 19: no practice' })).toHaveAttribute('data-level', '0');
    expect(screen.getByText('2 days practiced in the last 20 weeks')).toBeInTheDocument();
  });

  test("days after today in this week aren't shown as days", () => {
    const { container } = renderProgress(sessions, '2026-11-18'); // a Wednesday
    expect(container.querySelectorAll('.calendar-cell.future')).toHaveLength(3);
  });

  test('without a day given, the calendar ends today', () => {
    // The day after the fixtures' TODAY, a Sunday: the first day of a new week's column
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 22, 0, 30));
    try {
      // No `today` prop: renderProgress always passes one (undefined falls back to TODAY)
      const { container } = render(
        <ProgressScreen progress={deriveProgress(sessions, catalog, TODAY)} catalog={catalog} />
      );
      expect(screen.getByRole('img', { name: 'Sun, Nov 22: no practice' })).toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'Sat, Nov 21: 40 min' })).toBeInTheDocument();
      expect(container.querySelectorAll('.calendar-cell.future')).toHaveLength(6);
    } finally {
      vi.useRealTimers();
    }
  });

  test('each finger has a meter, and the weakest is named', () => {
    renderProgress();
    expect(screen.getByText('Weakest lately: right thumb (62%).')).toBeInTheDocument();
    const thumb = screen.getByRole('meter', { name: 'left thumb accuracy' }) as HTMLMeterElement;
    expect(thumb.value).toBe(90);
    expect(thumb).toHaveAttribute('aria-valuetext', '90%');
    expect(thumb.style.getPropertyValue('--bar-color')).toBe('var(--light-thumb)');
    const ring = screen.getByRole('meter', { name: 'left ring accuracy' }) as HTMLMeterElement;
    expect(ring.value).toBe(0);
    expect(ring).toHaveAttribute('aria-valuetext', 'no data yet');
    expect(
      within(screen.getByRole('heading', { name: 'Left hand' }).parentElement as HTMLElement).getAllByRole('meter')
    ).toHaveLength(5);
  });

  test('before any practice, the fingers wait for a lesson', () => {
    renderProgress([]);
    expect(screen.getByText('Play a lesson to see how each finger does.')).toBeInTheDocument();
  });

  test('the tiers show their stars and whether they are open', () => {
    renderProgress();
    const tiers = screen.getByRole('region', { name: 'Tiers' });
    const items = within(tiers).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent('1. Foundations');
    expect(items[0]).toHaveTextContent('Unlocked');
    expect(items[0]).toHaveTextContent('3 / 6 ★');
    // 3 of 6 is less than 60%: tracers stay locked
    expect(items[1]).toHaveTextContent('Locked');
    // No built-in lesson in tier 3 here
    expect(items[2]).toHaveTextContent('No lessons yet');
    const tier1 = within(tiers).getByRole('meter', { name: 'Tier 1 stars' }) as HTMLMeterElement;
    expect([tier1.value, tier1.max]).toEqual([3, 6]);
    const tier3 = within(tiers).getByRole('meter', { name: 'Tier 3 stars' }) as HTMLMeterElement;
    expect([tier3.value, tier3.max]).toEqual([0, 1]);
  });

  test("each lesson's best, stars, plays and trend; unplayed and locked lessons say so", () => {
    renderProgress();
    const row = (name: string) =>
      screen.getByRole('rowheader', { name: new RegExp(name) }).closest('tr') as HTMLElement;
    const roll = row('Finger roll');
    expect(roll).toHaveTextContent('Foundations');
    expect(roll).toHaveTextContent('A · 91%');
    expect(within(roll).getByRole('img', { name: '3 of 3 stars' })).toHaveTextContent('★★★');
    expect(within(roll).getByRole('img', { name: 'Accuracy over 2 sessions, latest 91%' })).toBeInTheDocument();

    const circle = row('Mirrored circle');
    expect(circle).toHaveTextContent('Locked');
    expect(circle).toHaveTextContent('—');
    expect(circle).toHaveTextContent('Not played yet');
    expect(within(circle).getByRole('img', { name: '0 of 3 stars' })).toHaveTextContent('☆☆☆');

    const mine = row('My move');
    expect(mine).toHaveTextContent('My Moves');
    expect(mine).not.toHaveTextContent('Locked');
  });
});

describe('the sparkline', () => {
  test('one session is a dot in the middle', () => {
    const { container } = render(<Sparkline history={[{ accuracy: 50 }]} />);
    expect(container.querySelector('polyline')).toBeNull();
    expect(container.querySelector('circle')).toHaveAttribute('cx', '48');
    expect(screen.getByRole('img', { name: 'Accuracy over 1 session, latest 50%' })).toBeInTheDocument();
  });

  test('shows the latest 20 sessions, 0% at the bottom and 100% at the top', () => {
    const history = Array.from({ length: 25 }, (_, i) => ({ accuracy: i < 5 ? 0 : 100 }));
    const { container } = render(<Sparkline history={history} />);
    expect(container.querySelector('polyline')?.getAttribute('points')?.split(' ')).toHaveLength(20);
    expect(container.querySelector('polyline')?.getAttribute('points')).toMatch(/^0,0 /);
  });
});

describe('formatting', () => {
  test('durations', () => {
    expect(formatDuration(45_400)).toBe('45 s');
    expect(formatDuration(12 * 60_000 + 59_000)).toBe('12 min');
    expect(formatDuration(120 * 60_000)).toBe('2 h');
    expect(formatDuration(65 * 60_000)).toBe('1 h 5 min');
  });

  test('counts, stars and days', () => {
    expect(plural(1, 'day')).toBe('1 day');
    expect(plural(0, 'day')).toBe('0 days');
    expect(starsText(2)).toBe('★★☆');
    expect(formatDay('2026-03-08')).toBe('Sun, Mar 8');
  });

  test('calendar shades', () => {
    expect([0, 1, 4 * 60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000].map(calendarLevel)).toEqual([0, 1, 1, 2, 3, 4]);
    expect(addDays(TODAY, 0)).toBe(TODAY);
  });
});
