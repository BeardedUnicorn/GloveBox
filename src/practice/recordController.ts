/**
 * Record mode's working parts, apart from React. The performer sets a
 * tempo, gets a count-in, performs; GloveBox keeps every tracked frame,
 * then offers the take back as a looping lesson to trim and save.
 */

import type { Camera } from '../camera/camera';
import { type FitTransform, fitFor, frameRect, IDENTITY_FIT, type Size } from '../core/coords';
import { type Pose10, SLOTS } from '../core/types';
import type { Env, MetronomeLike } from '../env';
import { compile, type LessonMotion } from '../lessons/compile';
import {
  type ProcessedRecording,
  processRecording,
  type RecordedFrame,
  suggestLoopBeats,
} from '../lessons/recording/process';
import { type RecordingDetails, recordingToLesson } from '../lessons/recording/toLesson';
import type { LessonDef } from '../lessons/schema';
import type { Ctx2D } from '../render/ctx';
import { drawOverlay, ghostPoses, type Sprites } from '../render/overlayRenderer';
import type { Settings } from '../state/settings';
import { TrackingPipeline } from '../tracking/pipeline';
import type { FingertipTracker, Tips10 } from '../tracking/types';

export type RecordPhase = 'opening' | 'setup' | 'counting' | 'recording' | 'review' | 'problem';

export interface RecordState {
  phase: RecordPhase;
  message: string | null;
  bpm: number;
  /** Count-in beats left. */
  countIn: number | null;
  /** Beats recorded so far, or in the take under review. */
  beats: number;
  /** The part of the take kept, in beats. */
  trim: { start: number; end: number };
}

export interface RecordDeps {
  env: Env;
  settings: Settings;
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  layout(): { size: Size; dpr: number };
  /** The span lessons are written at (the library's). */
  nominalSpan: number;
}

export const COUNT_IN_BEATS = 4;
/** A take stops itself after this long. */
export const MAX_TAKE_MS = 60_000;
const REVIEW_RADIUS = 0.022;

export class RecordController {
  private state: RecordState = {
    phase: 'opening',
    message: null,
    bpm: 80,
    countIn: null,
    beats: 0,
    trim: { start: 0, end: 0 },
  };
  private readonly listeners = new Set<() => void>();
  private readonly ctx: Ctx2D | null;
  private readonly sprites: Sprites;
  private readonly pipeline = new TrackingPipeline();
  private camera: Camera | null = null;
  private tracker: FingertipTracker | null = null;
  private tips: Tips10 | null = null;
  private frames: RecordedFrame[] = [];
  private startT = 0;
  private busy = false;
  private metronome: MetronomeLike | null = null;
  private processed: { recording: ProcessedRecording; motion: LessonMotion; reviewStart: number } | null = null;
  private frameId: number | null = null;
  private stopFrames: (() => void) | null = null;
  private disposed = false;

  constructor(private readonly deps: RecordDeps) {
    this.ctx = deps.env.context2d(deps.canvas);
    this.sprites = deps.env.sprites();
  }

  getState = (): RecordState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<RecordState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private get msPerBeat(): number {
    return 60_000 / this.state.bpm;
  }

  /** The fit the performer's hands are seen at: removed from the take, so it plays at anyone's size. */
  private fit(): FitTransform {
    const { handFit } = this.deps.settings;
    return handFit ? fitFor(handFit.center, handFit.span, this.deps.nominalSpan) : IDENTITY_FIT;
  }

  async open(): Promise<void> {
    const { env } = this.deps;
    this.set({ phase: 'opening', message: null });
    const result = await env.openCamera(this.deps.settings.cameraId);
    if (this.disposed) {
      if (result.ok) result.camera.stop();
      return;
    }
    if (!result.ok) {
      this.set({ phase: 'problem', message: result.message });
      return;
    }
    this.camera = result.camera;
    // Lit mode tells the fingers apart best, so takes always use it
    const tracker = env.createTracker({ ...this.deps.settings, tracker: 'lit' });
    try {
      await env.attach(this.deps.video, result.camera);
      await tracker.init();
    } catch (error) {
      this.set({ phase: 'problem', message: `Hand tracking couldn't start: ${String(error)}` });
      return;
    }
    if (this.disposed) {
      tracker.dispose();
      return;
    }
    this.tracker = tracker;
    this.stopFrames?.();
    this.stopFrames = env.videoFrames(this.deps.video, t => void this.track(t));
    this.set({ phase: 'setup' });
    if (this.frameId === null) this.loop();
  }

  private async track(t: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const camera = this.camera!;
    const raw = await this.tracker!.process({ video: this.deps.video, t, width: camera.width, height: camera.height });
    this.busy = false;
    if (!raw || this.disposed) return;
    this.tips = this.pipeline.push(raw).tips;
    if (this.state.phase === 'recording' && t >= this.startT) this.frames.push({ t, tips: raw.tips });
  }

  setBpm(bpm: number): void {
    if (this.state.phase === 'setup') this.set({ bpm: Math.min(200, Math.max(40, Math.round(bpm))) });
  }

  /** A count-in, then recording. */
  record(): void {
    if (this.state.phase !== 'setup' && this.state.phase !== 'review') return;
    this.frames = [];
    this.processed = null;
    this.startT = this.deps.env.now() + COUNT_IN_BEATS * this.msPerBeat;
    if (this.deps.settings.metronome) this.metronome = this.deps.env.metronome();
    this.set({ phase: 'counting', countIn: COUNT_IN_BEATS, beats: 0 });
  }

  /** Ends the take and opens it for review. */
  stop(): void {
    if (this.state.phase !== 'recording' && this.state.phase !== 'counting') return;
    this.metronome?.dispose();
    this.metronome = null;
    const last = this.frames.at(-1);
    if (!last || last.t - this.startT < this.msPerBeat) {
      this.set({ phase: 'setup', countIn: null, message: 'That take was too short: record at least one beat.' });
      return;
    }
    const beats = (last.t - this.startT) / this.msPerBeat;
    this.set({ phase: 'review', countIn: null, beats, message: null });
    const whole = this.reprocess({ start: 0, end: beats });
    if (!whole) return;
    const loop = suggestLoopBeats(whole.motion.pose, Math.floor(beats), 1);
    this.reprocess({ start: 0, end: loop });
  }

  /** Keeps beats `start` to `end` of the take. */
  setTrim(start: number, end: number): void {
    if (this.state.phase !== 'review') return;
    const s = Math.max(0, Math.min(start, this.state.beats - 1));
    const e = Math.max(s + 1, Math.min(end, this.state.beats));
    this.reprocess({ start: s, end: e });
  }

  private reprocess(trim: { start: number; end: number }) {
    const recording = processRecording(this.frames, {
      bpm: this.state.bpm,
      startMs: this.startT + trim.start * this.msPerBeat,
      endMs: this.startT + trim.end * this.msPerBeat,
      fit: this.fit(),
    });
    if (recording.activeSlots.length === 0) {
      this.processed = null;
      this.set({
        trim,
        message: 'No fingertips were seen clearly enough in that part. Try again, hands up and in view.',
      });
      return null;
    }
    const lesson = this.lesson({ name: 'Preview', tier: 1, tags: [] }, 'preview', recording);
    this.processed = { recording, motion: compile(lesson), reviewStart: this.deps.env.now() };
    this.set({ trim, message: null });
    return this.processed;
  }

  private lesson(details: Omit<RecordingDetails, 'bpm' | 'nominalSpan'>, id: string, recording: ProcessedRecording) {
    return recordingToLesson(recording, { ...details, bpm: this.state.bpm, nominalSpan: this.deps.nominalSpan }, id);
  }

  /** The take under review as a lesson; null if there's nothing to keep. */
  buildLesson(details: Omit<RecordingDetails, 'bpm' | 'nominalSpan'>, id: string): LessonDef | null {
    return this.processed ? this.lesson(details, id, this.processed.recording) : null;
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.frameId = this.deps.env.frames.request(this.loop);
    this.tick(this.deps.env.now());
  };

  tick(now: number): void {
    const { phase } = this.state;
    if (phase === 'counting' || phase === 'recording') {
      const beat = (now - this.startT) / this.msPerBeat;
      this.metronome?.update(beat, 4);
      if (beat < 0) {
        if (Math.ceil(-beat) !== this.state.countIn) this.set({ countIn: Math.ceil(-beat) });
      } else {
        if (phase === 'counting') this.set({ phase: 'recording', countIn: null });
        if (Math.floor(beat) !== Math.floor(this.state.beats)) this.set({ beats: beat });
        if (now - this.startT >= MAX_TAKE_MS) this.stop();
      }
    }
    this.draw(now);
  }

  private draw(now: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { size, dpr } = this.deps.layout();
    const camera = this.camera!;
    const processed = this.state.phase === 'review' ? this.processed : null;
    let targets: Pose10 = [];
    let ghost: Pose10[] = [];
    let activeSlots: number[] = [];
    if (processed) {
      // The take, looping, drawn back where it was performed
      const fit = this.fit();
      const at = (beat: number) =>
        processed.motion
          .pose(beat)
          .map(p => (p ? { x: fit.center.x + p.x * fit.scale, y: fit.center.y + p.y * fit.scale } : null));
      const beat = (now - processed.reviewStart) / this.msPerBeat;
      targets = at(beat);
      ghost = ghostPoses(at, beat);
      activeSlots = processed.recording.activeSlots;
    }
    drawOverlay(
      ctx,
      {
        view: this.deps.settings.view,
        rect: frameRect({ width: camera.width, height: camera.height }, size),
        size,
        dpr,
        palette: this.deps.settings.palette,
        activeSlots: activeSlots as never,
        targets,
        ghost,
        radius: { L: REVIEW_RADIUS, R: REVIEW_RADIUS },
        hits: SLOTS.map(() => false),
        tips: this.tips,
        trail: [],
      },
      this.sprites
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frameId !== null) this.deps.env.frames.cancel(this.frameId);
    this.stopFrames?.();
    this.metronome?.dispose();
    this.tracker?.dispose();
    this.camera?.stop();
  }
}
