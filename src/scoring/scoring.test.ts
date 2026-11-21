import { describe, expect, test } from 'vitest';
import { LessonClock } from '../core/lessonClock';
import { SLOTS, type Pose10, type Slot } from '../core/types';
import type { TipSample, TrackerFrame } from '../tracking/types';
import { DIFFICULTY_RADIUS, gradeFor, starsFor } from './grade';
import { COMBO_SCORE, credit, DEFAULT_SCORING, Scorer, type ScorerOptions } from './scorer';

describe('the lesson clock', () => {
  test('counts beats at the tempo, from a count-in', () => {
    const clock = new LessonClock(120, 1000, 1, -4);
    expect(clock.beatAt(1000)).toBe(-4);
    expect(clock.beatAt(3000)).toBe(0);
    expect(clock.beatAt(500)).toBe(-5); // before the start it runs backward
    expect(clock.msPerBeat).toBe(500);
    expect(clock.tempo).toBe(1);
  });

  test('a tempo change keeps the beat continuous and remembers the past', () => {
    const clock = new LessonClock(60, 0);
    clock.setTempo(0.5, 2000);
    expect(clock.beatAt(2000)).toBe(2);
    expect(clock.beatAt(4000)).toBe(3);
    expect(clock.beatAt(1000)).toBe(1); // before the change: the old tempo
    expect(clock.msPerBeat).toBe(2000);
  });

  test('pausing stops the beat; resuming picks up where it was', () => {
    const clock = new LessonClock(60, 0);
    clock.pause(1000);
    clock.pause(1500); // already paused
    expect(clock.paused).toBe(true);
    expect(clock.beatAt(5000)).toBe(1);
    clock.setTempo(2, 5000); // remembered for the resume
    expect(clock.beatAt(5500)).toBe(1);
    clock.resume(6000);
    clock.resume(6500); // already running
    expect(clock.paused).toBe(false);
    expect(clock.beatAt(7000)).toBe(3);
  });

  test('keeps a bounded history', () => {
    const clock = new LessonClock(60, 0);
    for (let i = 1; i <= 100; i++) clock.setTempo(1, i * 10);
    expect(clock.beatAt(2000)).toBeCloseTo(2);
  });
});

describe('grades', () => {
  test('grade and stars by accuracy', () => {
    expect([100, 95, 94.9, 88, 75, 60, 59.9, 0].map(gradeFor)).toEqual(['S', 'S', 'A', 'A', 'B', 'C', 'D', 'D']);
    expect([100, 90, 89, 75, 74, 60, 59].map(starsFor)).toEqual([3, 3, 2, 2, 1, 1, 0]);
    expect(DIFFICULTY_RADIUS.easy).toBeGreaterThan(DIFFICULTY_RADIUS.hard);
  });

  test('credit is full inside the radius and fades over the falloff', () => {
    expect(credit(0.5, 1, 1)).toBe(1);
    expect(credit(1, 1, 1)).toBe(1);
    expect(credit(1.5, 1, 1)).toBe(0.5);
    expect(credit(3, 1, 1)).toBe(0);
    expect(credit(2, 1, 2)).toBe(0.5);
  });
});

/** Every light moving right at 0.1 stage units per second; one beat per second. */
const expectedAt = (t: number): Pose10 => SLOTS.map(slot => ({ x: (t / 1000) * 0.1 + slot * 0.05, y: 0 }));

const SCALE = 0.1; // radius = 0.5 · 0.1 = 0.05
const options = (extra: Partial<ScorerOptions> = {}): ScorerOptions => ({
  params: DEFAULT_SCORING,
  activeSlots: SLOTS,
  difficulty: 1,
  expectedAt,
  beatAt: t => t / 1000,
  periodBeats: 4,
  fallbackScale: SCALE,
  startBeat: 0,
  ...extra,
});

/** A frame where every tip is where the lesson was `lagMs` ago, shifted by `offset` in x. */
const frame = (t: number, { lagMs = 0, offset = 0, drop = [] as number[], tip = {} as Partial<TipSample> } = {}): TrackerFrame => ({
  t,
  tips: expectedAt(t - lagMs).map((p, slot) => (drop.includes(slot) ? null : { x: p!.x + offset, y: p!.y, confidence: 1, ...tip })),
  handScale: { L: SCALE, R: SCALE },
});

const play = (scorer: Scorer, from: number, to: number, make: (t: number) => TrackerFrame, step = 33) => {
  for (let t = from; t <= to; t += step) scorer.update(make(t));
};

describe('the scorer', () => {
  test('a perfect follow scores 100, S and three stars, with a combo per beat', () => {
    const scorer = new Scorer(options());
    play(scorer, 0, 5000, t => frame(t));
    const summary = scorer.summary();
    expect(summary.accuracy).toBeCloseTo(100);
    expect(summary.grade).toBe('S');
    expect(summary.stars).toBe(3);
    expect(summary.maxCombo).toBe(4);
    expect(summary.combo).toBe(4);
    expect(summary.perFinger.every(f => f !== null && f > 99)).toBe(true);
    expect(summary.durationMs).toBeGreaterThan(4900);
    expect(summary.loops).toHaveLength(2);
  });

  test('a steady lag inside the window costs nothing, and is reported', () => {
    const scorer = new Scorer(options());
    play(scorer, 0, 3000, t => frame(t, { lagMs: 100 }));
    expect(scorer.summary().accuracy).toBeCloseTo(100);
    expect(scorer.summary().meanLagMs).toBeCloseTo(100);
    const live = scorer.update(frame(3100, { lagMs: 100 }));
    expect(live.lagMs).toEqual({ L: 100, R: 100 });
  });

  test('a lag past the window costs', () => {
    const scorer = new Scorer(options());
    // 0.1 units/s × 800 ms = 0.08 behind; the window absorbs 0.018 of it, leaving 0.062 = 1.24 radii
    play(scorer, 0, 3000, t => frame(t, { lagMs: 800 }));
    expect(scorer.summary().accuracy).toBeCloseTo(76, 0);
  });

  test('exactly on the ring is full credit; out past it fades', () => {
    const scorer = new Scorer(options({ params: { ...DEFAULT_SCORING, lagWindowMs: [0, 0] } }));
    expect(scorer.update(frame(0, { offset: 0.05 })).score).toBeCloseTo(1);
    expect(scorer.update(frame(33, { offset: 0.075 })).score).toBeCloseTo(0.5);
    expect(scorer.update(frame(66, { offset: 0.2 })).score).toBe(0);
  });

  test("the radius follows the tracker's hand scale and the difficulty", () => {
    const scorer = new Scorer(options({ difficulty: 1.4, fallbackScale: 0.2 }));
    expect(scorer.radius('L')).toBeCloseTo(0.14);
    scorer.update({ ...frame(0), handScale: { R: 0.1 } });
    expect(scorer.radius('R')).toBeCloseTo(0.07);
    expect(scorer.radius('L')).toBeCloseTo(0.14);
  });

  test('a missing finger scores nothing; a predicted one counts by its confidence', () => {
    const scorer = new Scorer(options());
    const missing = scorer.update(frame(0, { drop: [0, 1, 2, 3, 4] }));
    expect(missing.perSlot.slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(missing.score).toBeCloseTo(0.5);
    const predicted = scorer.update(frame(33, { tip: { predicted: true, confidence: 0.5 } }));
    expect(predicted.score).toBeCloseTo(0.5);
    // Nobody in sight: no lag to average, and nothing earned
    expect(scorer.update(frame(66, { drop: [...SLOTS] })).lagMs).toEqual({});
    expect(scorer.summary().meanLagMs).toBe(0);
  });

  test('a hand out of sight keeps its last lag', () => {
    const scorer = new Scorer(options());
    scorer.update(frame(1000, { lagMs: 60 }));
    const out = scorer.update(frame(1033, { drop: [0, 1, 2, 3, 4], lagMs: 60 }));
    expect(out.lagMs).toEqual({ R: 60 });
  });

  test('a lag window without 0 starts each hand at the lag nearest it', () => {
    const scorer = new Scorer(options({ params: { ...DEFAULT_SCORING, lagWindowMs: [40, 100] } }));
    const out = scorer.update(frame(0, { drop: [...SLOTS] }));
    expect(out.score).toBe(0);
    expect(out.lagMs).toEqual({});
  });

  test('a target lights at the radius and stays lit until 1.2 radii', () => {
    const scorer = new Scorer(options({ params: { ...DEFAULT_SCORING, lagWindowMs: [0, 0] }, activeSlots: [5] }));
    const hit = (offset: number, t: number) => scorer.update(frame(t, { offset })).hits[5];
    expect(hit(0.055, 0)).toBe(false); // 1.1 r, not lit yet
    expect(hit(0.045, 33)).toBe(true);
    expect(hit(0.055, 66)).toBe(true); // 1.1 r, held
    expect(hit(0.065, 99)).toBe(false); // 1.3 r, let go
  });

  test('the count-in and pauses are not scored', () => {
    const scorer = new Scorer(options({ startBeat: undefined, beatAt: t => t / 1000 - 2 }));
    expect(scorer.update(frame(1000)).counted).toBe(false); // beat -1
    expect(scorer.update(frame(2600)).counted).toBe(true); // beat 0.6
    expect(scorer.update(frame(2700), true).counted).toBe(false);
    expect(scorer.summary().durationMs).toBe(100);
  });

  test('a frame no newer than the last adds nothing', () => {
    const scorer = new Scorer(options());
    scorer.update(frame(500));
    scorer.update(frame(500));
    scorer.update(frame(400));
    expect(scorer.summary().durationMs).toBe(0);
    expect(scorer.summary().accuracy).toBe(0);
    expect(scorer.summary().perFinger.every(f => f === 0)).toBe(true);
    expect(scorer.summary().meanLagMs).toBe(0);
  });

  test('a long gap between frames counts as at most 100 ms', () => {
    const scorer = new Scorer(options());
    scorer.update(frame(0));
    scorer.update(frame(5000));
    expect(scorer.summary().durationMs).toBe(100);
  });

  test('a weak beat breaks the combo', () => {
    const scorer = new Scorer(options({ params: { ...DEFAULT_SCORING, lagWindowMs: [0, 0] } }));
    play(scorer, 0, 2000, t => frame(t));
    play(scorer, 2033, 3000, t => frame(t, { offset: 0.5 }));
    play(scorer, 3033, 4500, t => frame(t));
    const { combo, maxCombo } = scorer.summary();
    expect(maxCombo).toBe(2);
    expect(combo).toBe(1);
    expect(COMBO_SCORE).toBe(0.8);
  });

  test('unused slots are left out of the score and the result', () => {
    const active: Slot[] = [5, 6];
    const scorer = new Scorer(options({ activeSlots: active }));
    const live = scorer.update(frame(0, { drop: [0, 1, 2] }));
    expect(live.perSlot.filter(s => s !== null)).toHaveLength(2);
    expect(live.score).toBe(1);
    play(scorer, 33, 1000, t => frame(t));
    expect(scorer.summary().perFinger.filter(f => f !== null)).toHaveLength(2);
  });

  describe('in pattern mode', () => {
    const pattern = (extra: Partial<ScorerOptions> = {}) =>
      new Scorer(options({ params: { ...DEFAULT_SCORING, identity: 'pattern' }, ...extra }));

    test('any light on any target counts, even with fingers swapped', () => {
      const scorer = pattern();
      const f = frame(1000);
      const swapped = { ...f, tips: [...f.tips].reverse() };
      expect(scorer.update(swapped).score).toBeCloseTo(1);
    });

    test('a target with no light left for it scores nothing', () => {
      const scorer = pattern();
      const out = scorer.update(frame(1000, { drop: [0, 1] }));
      expect(out.score).toBeCloseTo(0.8);
      expect(out.lagMs.L).toBe(out.lagMs.R);
    });

    test('no lights at all scores nothing', () => {
      const scorer = pattern();
      expect(scorer.update(frame(1000, { drop: [...SLOTS] })).score).toBe(0);
    });
  });
});
