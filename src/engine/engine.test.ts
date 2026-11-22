import { describe, expect, test, vi } from 'vitest';
import { IDENTITY_FIT } from '../core/coords';
import { compile } from '../lessons/compile';
import { DEFAULT_SCORING } from '../scoring/scorer';
import { TEST_LESSON } from '../test/lessons';
import { SyntheticTracker } from '../tracking/synthetic/syntheticTracker';
import type { CameraFrame, FingertipTracker } from '../tracking/types';
import { type AudioLike, Metronome } from './metronome';
import { type PracticeConfig, PracticeEngine } from './practiceEngine';

const lesson = TEST_LESSON; // 72 bpm, 4 beats a loop, 4 count-in beats
const motion = compile(lesson);
const MS_PER_BEAT = 60_000 / 72;

const config = (extra: Partial<PracticeConfig> = {}): PracticeConfig => ({
  lesson,
  motion,
  fit: IDENTITY_FIT,
  tempo: 1,
  difficulty: 'normal',
  loops: 2,
  scoring: DEFAULT_SCORING,
  fallbackScale: 0.07,
  ...extra,
});

const cameraFrame = (t: number): CameraFrame => ({ video: {} as HTMLVideoElement, t, width: 1280, height: 720 });

/** A performer who follows the engine's own targets exactly. */
function follower() {
  let engine: PracticeEngine | null = null;
  const tracker = new SyntheticTracker({ poseAt: t => engine!.expectedAt(t) });
  return { tracker, bind: (e: PracticeEngine) => (engine = e) };
}

async function playThrough(engine: PracticeEngine, from: number, to: number, step = 33) {
  for (let t = from; t <= to; t += step) await engine.feed(cameraFrame(t));
}

describe('a practice session', () => {
  test('counts in, then plays the loops and finishes', async () => {
    const { tracker, bind } = follower();
    const engine = bind(new PracticeEngine(config(), tracker, 0));
    const start = engine.view(0);
    expect(start.countIn).toBe(4);
    expect(start.loop).toBe(1);
    expect(start.progress).toBe(0);
    expect(start.tips).toBeNull();
    expect(start.live).toEqual({ accuracy: 0, score: null, combo: 0, lagMs: null });
    expect(start.ghost).toHaveLength(16);

    const end = (4 + 8) * MS_PER_BEAT;
    await playThrough(engine, 0, end);
    const during = engine.view(9 * MS_PER_BEAT);
    expect(during.countIn).toBeNull();
    expect(during.loop).toBe(2);
    expect(during.live.accuracy).toBeGreaterThan(99);
    expect(during.live.score).toBeCloseTo(1);
    expect(during.live.lagMs).toBe(0);
    expect(during.tips?.filter(Boolean)).toHaveLength(10);
    expect(during.trail.length).toBe(10);

    const done = engine.view(end + 10);
    expect(done.finished).toBe(true);
    expect(done.loop).toBe(2);
    expect(done.progress).toBe(1);
    expect(done.ghost).toEqual([]);
    expect(engine.summary().grade).toBe('S');

    // Nothing is scored once it's finished
    const before = engine.summary().durationMs;
    await engine.feed(cameraFrame(end + 100));
    expect(engine.summary().durationMs).toBe(before);
  });

  test('targets are fitted to the performer', () => {
    const fit = { center: { x: 0.1, y: -0.05 }, scale: 2 };
    const engine = new PracticeEngine(config({ fit }), new SyntheticTracker({ poseAt: () => [] }), 0);
    const raw = motion.pose(-4)[5]!;
    const shown = engine.view(0).targets[5]!;
    expect(shown.x).toBeCloseTo(0.1 + raw.x * 2);
    expect(shown.y).toBeCloseTo(-0.05 + raw.y * 2);
  });

  test("slots the lesson doesn't use have no target", () => {
    const rightThumb = { ...lesson, activeSlots: [5] };
    const engine = new PracticeEngine(
      config({ lesson: rightThumb, motion: compile(rightThumb) }),
      new SyntheticTracker({ poseAt: () => [] }),
      0
    );
    const targets = engine.view(0).targets;
    expect(targets.filter(Boolean)).toHaveLength(1);
    expect(targets[0]).toBeNull();
  });

  test('a frame that arrives while the last is still being tracked is dropped', async () => {
    let release: () => void = () => {};
    const process = vi.fn(
      () =>
        new Promise<null>(resolve => {
          release = () => resolve(null);
        })
    );
    const tracker: FingertipTracker = { kind: 'landmarks', init: async () => {}, process, dispose: vi.fn() };
    const engine = new PracticeEngine(config(), tracker, 0);
    const first = engine.feed(cameraFrame(0));
    await engine.feed(cameraFrame(16));
    release();
    await first;
    expect(process).toHaveBeenCalledTimes(1);
    // A tracker that couldn't read the frame leaves nothing to draw
    expect(engine.view(20).tips).toBeNull();
    engine.dispose();
    expect(tracker.dispose).toHaveBeenCalled();
  });

  test('gives the tracker the lesson, so it can find lost fingers', () => {
    const setLessonPrior = vi.fn();
    const tracker: FingertipTracker = {
      kind: 'leds',
      init: async () => {},
      process: async () => null,
      dispose() {},
      setLessonPrior,
    };
    const engine = new PracticeEngine(config(), tracker, 0);
    const prior = setLessonPrior.mock.calls[0]![0] as (t: number) => unknown;
    expect(prior(500)).toEqual(engine.expectedAt(500));
  });

  test('pausing holds the beat and scores nothing; tempo changes are smooth', async () => {
    const { tracker, bind } = follower();
    const engine = bind(new PracticeEngine(config(), tracker, 0));
    await playThrough(engine, 4 * MS_PER_BEAT, 5 * MS_PER_BEAT);
    const t = 5 * MS_PER_BEAT;
    engine.pause(t);
    expect(engine.view(t + 5000).paused).toBe(true);
    expect(engine.view(t + 5000).beat).toBeCloseTo(1);
    const scored = engine.summary().durationMs;
    await playThrough(engine, t + 100, t + 1000);
    expect(engine.summary().durationMs).toBe(scored);
    engine.resume(t + 1000);
    engine.setTempo(0.5, t + 1000);
    expect(engine.view(t + 1000 + 2 * MS_PER_BEAT).beat).toBeCloseTo(2);
    expect(engine.clock.tempo).toBe(0.5);
  });

  test('a lag shows up live', async () => {
    let engine: PracticeEngine | null = null;
    const tracker = new SyntheticTracker({ poseAt: t => engine!.expectedAt(t), lagMs: 120 });
    engine = new PracticeEngine(config(), tracker, 0);
    await playThrough(engine, 4 * MS_PER_BEAT, 6 * MS_PER_BEAT);
    expect(engine.view(6 * MS_PER_BEAT).live.lagMs).toBe(120);
  });
});

function fakeAudio() {
  const clicks: number[] = [];
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const audio = {
    currentTime: 1,
    destination: {} as AudioNode,
    createOscillator: () => {
      const oscillator = {
        frequency: param(),
        connect: (node: unknown) => node,
        start: vi.fn(),
        stop: vi.fn(),
      };
      return new Proxy(oscillator, {
        get(target, key) {
          if (key === 'start') return () => clicks.push(target.frequency.value);
          return target[key as keyof typeof target];
        },
      }) as unknown as OscillatorNode;
    },
    createGain: () => ({ gain: param(), connect: (node: unknown) => node }) as unknown as GainNode,
    close: vi.fn(async () => {}),
  };
  return { audio: audio as AudioLike & { close: ReturnType<typeof vi.fn> }, clicks };
}

describe('the metronome', () => {
  test('clicks once per beat, higher on the first beat of each loop', () => {
    const { audio, clicks } = fakeAudio();
    const make = vi.fn(() => audio);
    const metronome = new Metronome(make);
    for (const beat of [-1, -0.5, 0, 0.4, 1, 2, 3, 4]) metronome.update(beat, 4);
    expect(clicks).toEqual([1175, 1760, 1175, 1175, 1175, 1760]);
    expect(make).toHaveBeenCalledTimes(1);
    metronome.dispose();
    expect(audio.close).toHaveBeenCalled();
    metronome.dispose();
  });

  test('joining mid-beat waits for the next one', () => {
    const { audio, clicks } = fakeAudio();
    const metronome = new Metronome(() => audio);
    metronome.update(2.5, 4);
    expect(clicks).toEqual([]);
    metronome.update(3, 4);
    expect(clicks).toEqual([1175]);
  });

  test('uses Web Audio by default', () => {
    const { audio } = fakeAudio();
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function makeAudioContext() {
        return audio;
      })
    );
    new Metronome().click(true);
    expect(AudioContext).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
