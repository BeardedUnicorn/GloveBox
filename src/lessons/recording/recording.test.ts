import { describe, expect, test } from 'vitest';
import { IDENTITY_FIT } from '../../core/coords';
import { SLOTS } from '../../core/types';
import type { TipSample } from '../../tracking/types';
import { compile } from '../compile';
import { closeSeam, processRecording, type RecordedFrame, sampleAt, smooth, suggestLoopBeats } from './process';
import { recordingToLesson, slugFor } from './toLesson';

const v = (x: number, y: number) => ({ x, y });
const tip = (x: number, y = 0): TipSample => ({ x, y, confidence: 1 });

/** A take: `seconds` long at 30 fps; slot 5 circles once a second, slot 6 is seen only early on. */
function take(seconds = 4): RecordedFrame[] {
  return Array.from({ length: seconds * 30 }, (_, i) => {
    const t = i * (1000 / 30);
    const angle = (2 * Math.PI * t) / 1000;
    return {
      t,
      tips: SLOTS.map(slot =>
        slot === 5 ? tip(0.1 * Math.cos(angle), 0.1 * Math.sin(angle)) : slot === 6 && t < 500 ? tip(0.3) : null
      ),
    };
  });
}

describe('sampling a take', () => {
  const frames: RecordedFrame[] = [
    { t: 0, tips: SLOTS.map(() => tip(0)) },
    { t: 100, tips: SLOTS.map(() => tip(1)) },
    { t: 600, tips: SLOTS.map(() => tip(2)) },
  ];

  test('interpolates between frames, exactly on a frame, and not across a long gap', () => {
    expect(sampleAt(frames, 0, 50, 300)).toEqual(v(0.5, 0));
    expect(sampleAt(frames, 0, 100, 300)).toEqual(v(1, 0));
    expect(sampleAt(frames, 0, 300, 300)).toBeNull();
    expect(sampleAt(frames, 0, 300, 600)).toEqual(v(1.4, 0));
    expect(sampleAt(frames, 0, 900, 300)).toBeNull(); // after the last frame
    expect(sampleAt(frames, 0, -10, 300)).toBeNull(); // before the first
  });

  test('skips frames where the light was missing', () => {
    const gappy: RecordedFrame[] = [
      { t: 0, tips: SLOTS.map(() => tip(0)) },
      { t: 50, tips: SLOTS.map(() => null) },
      { t: 100, tips: SLOTS.map(() => tip(1)) },
    ];
    expect(sampleAt(gappy, 3, 75, 300)).toEqual(v(0.75, 0));
  });
});

describe('smoothing and the seam', () => {
  test('a Gaussian evens out a spike and keeps gaps', () => {
    const series = [v(0, 0), v(0, 0), v(1, 0), v(0, 0), null, v(0, 0)];
    const out = smooth(series, 1);
    expect(out[2]!.x).toBeLessThan(0.6);
    expect(out[4]).toBeNull();
    expect(smooth(series, 0)).toBe(series);
  });

  test('the last samples ease toward the start, so the loop has no jump', () => {
    const series = [v(0, 0), v(0.1, 0), v(0.2, 0), v(0.3, 0), v(0.9, 0), v(1, 0)];
    const closed = closeSeam(series, 2);
    // From the last sample, one more step lands on the first
    expect(closed.at(-1)!.x).toBeCloseTo(-0.1);
    expect(closed[3]).toEqual(v(0.3, 0));
  });

  test('a seam with gaps at either end, or too few samples, is left alone', () => {
    const gap = [null, v(0, 0), v(1, 0), v(2, 0)];
    expect(closeSeam(gap, 1)).toBe(gap);
    const short = [v(0, 0), v(1, 0)];
    expect(closeSeam(short, 1)).toBe(short);
    // A missing second sample means no step to allow for; a gap inside the tail stays a gap
    const noStep = closeSeam([v(0, 0), null, v(5, 0), null, v(1, 0)], 2);
    expect(noStep[3]).toBeNull();
    expect(noStep[4]!.x).toBeCloseTo(0);
  });
});

describe('processing a take', () => {
  test('resamples to beats, keeps the lights seen enough, and removes the fit', () => {
    const fit = { center: v(0.05, 0), scale: 2 };
    const recording = processRecording(take(), { bpm: 60, startMs: 0, endMs: 4000, fit, seamSamples: 1, smoothing: 0 });
    expect(recording.beats).toBe(4);
    expect(recording.track.frames).toHaveLength(32);
    expect(recording.activeSlots).toEqual([5]);
    // Lesson units: (0.1 · cos 0 − 0.05) / 2 at the start (lightly smoothed)
    expect(recording.track.frames[0]![5]![0]).toBeCloseTo(0.025, 4);
    expect(recording.track.frames[0]![6]).toBeNull();
  });

  test('the result plays back as a lesson that loops', () => {
    const recording = processRecording(take(), { bpm: 60, startMs: 0, endMs: 2000, fit: IDENTITY_FIT });
    const lesson = recordingToLesson(
      recording,
      { name: '  My circle ', tier: 2, tags: ['circles'], bpm: 60, nominalSpan: 0.17 },
      'my-circle'
    );
    expect(lesson).toMatchObject({ id: 'my-circle', name: 'My circle', origin: 'recorded', tier: 2, activeSlots: [5] });
    const motion = compile(lesson);
    expect(motion.periodBeats).toBe(2);
    expect(motion.pose(0.5)[5]).not.toBeNull();
    expect(suggestLoopBeats(motion.pose, 2, 1)).toBeGreaterThanOrEqual(1);
  });

  test('an unnamed move gets a name', () => {
    const recording = processRecording(take(1), { bpm: 120, startMs: 0, endMs: 1000, fit: IDENTITY_FIT, smoothing: 0 });
    expect(recordingToLesson(recording, { name: ' ', tier: 1, tags: [], bpm: 120, nominalSpan: 0.17 }, 'x').name).toBe(
      'My move'
    );
  });

  test('a take too short still makes two samples', () => {
    const recording = processRecording(take(1), { bpm: 60, startMs: 0, endMs: 10, fit: IDENTITY_FIT });
    expect(recording.track.frames).toHaveLength(2);
  });
});

describe('suggesting a loop', () => {
  test('picks the beat count where the move returns to its start', () => {
    // A move that repeats every 3 beats
    const poseAt = (beat: number) => SLOTS.map(slot => (slot === 0 ? v(Math.sin((2 * Math.PI * beat) / 3), 0) : null));
    expect(suggestLoopBeats(poseAt, 7)).toBe(3);
  });

  test('a move with no light in common at both ends takes the whole take', () => {
    const poseAt = (beat: number) => SLOTS.map(slot => (slot === 0 && beat === 0 ? v(0, 0) : null));
    expect(suggestLoopBeats(poseAt, 5)).toBe(5);
  });
});

describe('naming a recorded move', () => {
  test('a slug from the name, unique among the lessons there are', () => {
    expect(slugFor('My Wave!', new Set())).toBe('my-wave');
    expect(slugFor('My Wave', new Set(['my-wave', 'my-wave-2']))).toBe('my-wave-3');
    expect(slugFor('✨', new Set())).toBe('my-move');
  });
});
