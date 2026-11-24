/**
 * One practice session. It owns the lesson's clock, the tracker, the
 * smoothing pipeline and the scorer, and knows nothing of React or the DOM:
 * the practice screen feeds it camera frames as they arrive and asks it what
 * to draw on each display frame.
 */

import { applyFit, type FitTransform } from '../core/coords';
import { LessonClock } from '../core/lessonClock';
import type { Hand, Pose10 } from '../core/types';
import type { LessonMotion } from '../lessons/compile';
import type { LessonDef } from '../lessons/schema';
import type { Difficulty } from '../progression/types';
import { ghostPoses } from '../render/overlayRenderer';
import { DIFFICULTY_RADIUS } from '../scoring/grade';
import { type FrameScore, Scorer, type ScoreSummary, type ScoringParams } from '../scoring/scorer';
import { TrackingPipeline } from '../tracking/pipeline';
import type { CameraFrame, FingertipTracker, Tips10, TrackerFrame } from '../tracking/types';

export interface PracticeConfig {
  lesson: LessonDef;
  motion: LessonMotion;
  /** The lesson fitted to the performer's hands and the screen. */
  fit: FitTransform;
  tempo: number;
  difficulty: Difficulty;
  /** Loops to play before the session ends. */
  loops: number;
  scoring: ScoringParams;
  /** The hand scale to assume until one is measured, stage units. */
  fallbackScale: number;
}

export interface EngineView {
  t: number;
  beat: number;
  /** Beats left in the count-in (3, 2, 1), or null once the lesson is under way. */
  countIn: number | null;
  /** The loop being played (1-based), and how many there are. */
  loop: number;
  loops: number;
  /** 0–1 through the whole session. */
  progress: number;
  paused: boolean;
  finished: boolean;
  targets: Pose10;
  ghost: Pose10[];
  radius: Record<Hand, number>;
  hits: boolean[];
  tips: Tips10 | null;
  trail: Tips10[];
  skeleton: TrackerFrame['skeleton'];
  lights: TrackerFrame['lights'];
  /** The running result: accuracy so far (0–100), this frame's credit (0–1), the combo and the lag. */
  live: { accuracy: number; score: number | null; combo: number; lagMs: number | null };
}

/** Display frames of the performer's own trail. */
const TRAIL_FRAMES = 10;

export class PracticeEngine {
  readonly clock: LessonClock;
  private readonly scorer: Scorer;
  /** Smoothed, for drawing. */
  private readonly display = new TrackingPipeline();
  /** Unsmoothed (gap-hold only), for scoring: smoothing's delay must not count as the performer's lag. */
  private readonly scoring = new TrackingPipeline({ oneEuro: null });
  private readonly endBeat: number;
  private busy = false;
  private latest: { frame: TrackerFrame; score: FrameScore } | null = null;
  private trail: Tips10[] = [];
  private finished = false;
  private fit: FitTransform;

  constructor(
    private readonly config: PracticeConfig,
    private readonly tracker: FingertipTracker,
    startT: number
  ) {
    const { lesson, motion } = config;
    this.fit = config.fit;
    this.clock = new LessonClock(lesson.timing.bpm, startT, config.tempo, -lesson.timing.countInBeats);
    this.endBeat = config.loops * motion.periodBeats;
    this.scorer = new Scorer({
      params: config.scoring,
      activeSlots: lesson.activeSlots as never,
      difficulty: DIFFICULTY_RADIUS[config.difficulty],
      expectedAt: t => this.expectedAt(t),
      beatAt: t => this.clock.beatAt(t),
      periodBeats: motion.periodBeats,
      fallbackScale: config.fallbackScale,
    });
    tracker.setLessonPrior?.(t => this.expectedAt(t));
  }

  /** Where every light should be at time t, on the performer's stage. */
  expectedAt(t: number): Pose10 {
    return this.poseAtBeat(this.clock.beatAt(t));
  }

  private poseAtBeat(beat: number): Pose10 {
    return this.config.motion.pose(beat).map(p => (p ? applyFit(p, this.fit) : null));
  }

  /** Tracks and scores one camera frame. Frames that arrive while the last is still being tracked are dropped. */
  async feed(frame: CameraFrame): Promise<void> {
    if (this.busy || this.finished) return;
    this.busy = true;
    try {
      const raw = await this.tracker.process(frame);
      if (!raw) return;
      const smoothed = this.display.push(raw);
      const score = this.scorer.update(this.scoring.push(raw), this.clock.paused);
      this.latest = { frame: smoothed, score };
      this.trail = [...this.trail.slice(-(TRAIL_FRAMES - 1)), smoothed.tips];
    } finally {
      this.busy = false;
    }
  }

  /** What to draw at time t. Past the last loop, the session is finished and stops scoring. */
  view(t: number): EngineView {
    const beat = this.clock.beatAt(t);
    if (beat >= this.endBeat) this.finished = true;
    const shown = Math.min(beat, this.endBeat);
    const summary = this.scorer.summary();
    const lags = Object.values(this.latest?.score.lagMs ?? {});
    return {
      t,
      beat,
      countIn: beat < 0 ? Math.ceil(-beat) : null,
      loop: Math.min(this.config.loops, Math.floor(Math.max(0, shown) / this.config.motion.periodBeats) + 1),
      loops: this.config.loops,
      progress: Math.max(0, shown) / this.endBeat,
      paused: this.clock.paused,
      finished: this.finished,
      targets: this.poseAtBeat(shown),
      ghost: this.finished ? [] : ghostPoses(b => this.poseAtBeat(b), shown),
      radius: { L: this.scorer.radius('L'), R: this.scorer.radius('R') },
      hits: this.latest?.score.hits ?? new Array(10).fill(false),
      tips: this.latest?.frame.tips ?? null,
      trail: this.trail,
      skeleton: this.latest?.frame.skeleton,
      lights: this.latest?.frame.lights,
      live: {
        accuracy: summary.accuracy,
        score: this.latest?.score.counted ? this.latest.score.score : null,
        combo: summary.combo,
        lagMs: lags.length > 0 ? lags.reduce((a, b) => a + b, 0) / lags.length : null,
      },
    };
  }

  /** Refits the lesson to the performer's hands (measured again on the Ready screen). */
  setFit(fit: FitTransform): void {
    this.fit = fit;
  }

  /** The last tracked frame (smoothed), or null before the tracker has seen one. */
  latestFrame(): TrackerFrame | null {
    return this.latest?.frame ?? null;
  }

  setTempo(tempo: number, t: number): void {
    this.clock.setTempo(tempo, t);
  }

  pause(t: number): void {
    this.clock.pause(t);
  }

  resume(t: number): void {
    this.clock.resume(t);
  }

  summary(): ScoreSummary {
    return this.scorer.summary();
  }

  dispose(): void {
    this.finished = true;
    this.tracker.dispose();
  }
}
