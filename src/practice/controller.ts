/**
 * The practice screen's working parts, apart from React so they can be
 * tested on their own. It opens the camera, starts the tracker, runs the
 * session, and draws the overlay every display frame.
 *
 * - ready: the camera is live and the lesson waits at its first pose (a
 *   paused engine, so fingertips are tracked but nothing is scored);
 * - running: Start began the count-in; when the last loop ends the
 *   session is saved (onFinish);
 * - watching: a pretend performer plays one loop of the move, then it's back
 *   to ready. That works without a camera too.
 */

import { isDarkCalibration } from '../calibration/sources';
import { type Camera, type CameraResult, cameraMessage } from '../camera/camera';
import { aspectOf, clampFit, type FitTransform, fitFor, frameRect, type Size, type View } from '../core/coords';
import { type EngineView, PracticeEngine } from '../engine/practiceEngine';
import type { Env, MetronomeLike } from '../env';
import { compile, type LessonMotion } from '../lessons/compile';
import type { LessonDef } from '../lessons/schema';
import { localDay } from '../progression/days';
import type { SessionRecord } from '../progression/types';
import type { Ctx2D } from '../render/ctx';
import { drawOverlay, type Sprites } from '../render/overlayRenderer';
import { DEFAULT_SCORING, type ScoringParams } from '../scoring/scorer';
import type { Settings } from '../state/settings';
import { SyntheticTracker } from '../tracking/synthetic/syntheticTracker';
import type { FingertipTracker } from '../tracking/types';

export type Phase = 'opening' | 'loading' | 'ready' | 'running' | 'watching' | 'problem' | 'finished';

export interface Hud {
  countIn: number | null;
  loop: number;
  loops: number;
  progress: number;
  accuracy: number;
  combo: number;
  lagMs: number | null;
  paused: boolean;
  tempo: number;
}

export interface ControllerState {
  phase: Phase;
  /** What went wrong (phase "problem"). */
  message: string | null;
  /** Whether the camera is live (Watch works without it). */
  hasCamera: boolean;
  hud: Hud | null;
  /** The lesson's coaching words for this moment, while the move plays (practice or Watch). */
  cue: string | null;
}

export interface ControllerDeps {
  env: Env;
  lesson: LessonDef;
  settings: Settings;
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  /** The canvas's CSS size and the device pixel ratio, read every frame. */
  layout(): { size: Size; dpr: number };
  onFinish(record: SessionRecord): void;
}

export const DARK_NEEDS_CALIBRATION =
  'Dark mode needs to learn your gloves first: Settings → Calibrate Dark mode. It takes about ten seconds.';

/**
 * Before calibration: hands about as big as they look at arm's length from a
 * laptop camera (the library is written for hands a sixth of the frame tall).
 */
export const UNCALIBRATED_FIT: FitTransform = { center: { x: 0, y: 0 }, scale: 1.6 };

/** The frame size Watch assumes when there's no camera. */
const NOMINAL_FRAME = { width: 1280, height: 720 };
/** How often the HUD's numbers are pushed to React. */
const HUD_INTERVAL_MS = 100;
/** Wrist to middle knuckle, for a hand of the library's nominal size: the scoring scale before one is measured. */
const NOMINAL_HAND_SCALE = 0.07;

export class PracticeController {
  private state: ControllerState = { phase: 'opening', message: null, hasCamera: false, hud: null, cue: null };
  private readonly listeners = new Set<() => void>();
  private readonly motion: LessonMotion;
  private readonly ctx: Ctx2D | null;
  private readonly sprites: Sprites;
  private camera: Camera | null = null;
  private engine: PracticeEngine | null = null;
  private watch: PracticeEngine | null = null;
  private metronome: MetronomeLike | null = null;
  private view: View;
  private tempo: number;
  private startedAt = 0;
  private lastHud = Number.NEGATIVE_INFINITY;
  private frameId: number | null = null;
  private stopVideoFrames: (() => void) | null = null;
  private stopCameraEnded: (() => void) | null = null;
  private disposed = false;

  constructor(private readonly deps: ControllerDeps) {
    this.motion = compile(deps.lesson);
    this.ctx = deps.env.context2d(deps.canvas);
    this.sprites = deps.env.sprites();
    this.view = deps.settings.view;
    this.tempo = deps.settings.tempo;
  }

  // ── React's side ─────────────────────────────────────────────────────────

  getState = (): ControllerState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<ControllerState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  // ── Starting up ──────────────────────────────────────────────────────────

  /** Opens the camera and starts the tracker; the render loop runs from here on. */
  async open(): Promise<void> {
    this.loop();
    this.set({ phase: 'opening', message: null });
    const result: CameraResult = await this.deps.env.openCamera(this.deps.settings.cameraId);
    if (this.disposed) {
      if (result.ok) result.camera.stop();
      return;
    }
    if (!result.ok) {
      this.set({ phase: 'problem', message: result.message, hasCamera: false });
      return;
    }
    const camera = result.camera;
    this.camera = camera;
    if (this.dark() && !isDarkCalibration(this.deps.settings.darkCalibration)) {
      this.set({ phase: 'problem', message: DARK_NEEDS_CALIBRATION, hasCamera: true });
      return;
    }
    try {
      await this.deps.env.attach(this.deps.video, camera);
      this.set({ phase: 'loading', hasCamera: true });
      const tracker = this.deps.env.createTracker(this.deps.settings);
      await tracker.init();
      if (this.disposed) {
        tracker.dispose();
        return;
      }
      this.engine = this.makeEngine(tracker, this.deps.lesson.timing.defaultLoops);
      this.engine.pause(this.deps.env.now());
    } catch (error) {
      this.set({ phase: 'problem', message: `Hand tracking couldn't start: ${String(error)}` });
      return;
    }
    this.stopCameraEnded = camera.onEnded(() => {
      this.stopFeeding();
      this.engine?.dispose();
      this.engine = null;
      this.set({ phase: 'problem', message: cameraMessage('not-found'), hasCamera: false });
    });
    this.stopVideoFrames = this.deps.env.videoFrames(this.deps.video, t => {
      void this.engine?.feed({
        video: this.deps.video,
        t,
        width: this.frameSize().width,
        height: this.frameSize().height,
      });
    });
    this.set({ phase: 'ready' });
  }

  private frameSize(): Size {
    const video = this.deps.video;
    if (video.videoHeight > 0) return { width: video.videoWidth, height: video.videoHeight };
    return this.camera ? { width: this.camera.width, height: this.camera.height } : NOMINAL_FRAME;
  }

  private dark(): boolean {
    return this.deps.settings.tracker === 'dark';
  }

  private fit(): FitTransform {
    const { darkCalibration } = this.deps.settings;
    // Dark mode measured the hands in the dark, with the gloves on
    const handFit =
      this.dark() && isDarkCalibration(darkCalibration) ? darkCalibration.fit : this.deps.settings.handFit;
    const fit = handFit ? fitFor(handFit.center, handFit.span, this.deps.lesson.nominalSpan) : UNCALIBRATED_FIT;
    return clampFit(fit, this.motion.bounds, aspectOf(this.frameSize()));
  }

  private scoring(): ScoringParams {
    return {
      ...DEFAULT_SCORING,
      ...this.deps.lesson.scoring,
      // In the dark a light can't say which finger it is: score the pattern
      ...(this.dark() ? { identity: 'pattern' as const } : {}),
    };
  }

  private makeEngine(tracker: FingertipTracker, loops: number): PracticeEngine {
    const fit = this.fit();
    return new PracticeEngine(
      {
        lesson: this.deps.lesson,
        motion: this.motion,
        fit,
        tempo: this.tempo,
        difficulty: this.deps.settings.difficulty,
        loops,
        scoring: this.scoring(),
        fallbackScale: NOMINAL_HAND_SCALE * fit.scale,
      },
      tracker,
      this.deps.env.now()
    );
  }

  // ── The performer's controls ─────────────────────────────────────────────

  /** Starts the count-in. */
  start(): void {
    if (this.state.phase !== 'ready' || !this.engine) return;
    const now = this.deps.env.now();
    this.engine.resume(now);
    this.startedAt = this.deps.env.wallClock();
    if (this.deps.settings.metronome) this.metronome = this.deps.env.metronome();
    this.set({ phase: 'running' });
  }

  /** Plays the move once with a pretend performer. */
  startWatching(): void {
    if (this.state.phase !== 'ready' && this.state.phase !== 'problem') return;
    let watch: PracticeEngine | null = null;
    const tracker = new SyntheticTracker({ poseAt: t => watch!.expectedAt(t), noise: 0.002 });
    watch = this.makeEngine(tracker, 1);
    this.watch = watch;
    this.set({ phase: 'watching' });
  }

  stopWatching(): void {
    this.watch?.dispose();
    this.watch = null;
    this.set({ phase: this.engine ? 'ready' : 'problem', cue: null });
  }

  togglePause(): void {
    const engine = this.engine;
    if (this.state.phase !== 'running' || !engine) return;
    const now = this.deps.env.now();
    if (engine.clock.paused) engine.resume(now);
    else engine.pause(now);
    this.pushHud(now, true);
  }

  /** Pauses (e.g. when the window is hidden); does nothing unless a session is running. */
  pause(): void {
    if (this.state.phase === 'running' && this.engine && !this.engine.clock.paused) this.togglePause();
  }

  setTempo(tempo: number): void {
    this.tempo = tempo;
    const now = this.deps.env.now();
    this.engine?.setTempo(tempo, now);
    this.watch?.setTempo(tempo, now);
    this.pushHud(now, true);
  }

  setView(view: View): void {
    this.view = view;
  }

  // ── Every display frame ──────────────────────────────────────────────────

  private loop = (): void => {
    if (this.disposed) return;
    this.frameId = this.deps.env.frames.request(this.loop);
    this.tick(this.deps.env.now());
  };

  /** One display frame: feed Watch's pretend performer, draw, update the HUD, and finish if it's over. */
  tick(now: number): void {
    const watch = this.watch;
    if (watch) {
      void watch.feed({ video: this.deps.video, t: now, ...NOMINAL_FRAME });
      const view = watch.view(now);
      this.draw(view);
      this.showCue(view.beat);
      if (view.finished) this.stopWatching();
      return;
    }
    const engine = this.engine;
    if (!engine) {
      this.ctx?.clearRect(0, 0, this.deps.layout().size.width, this.deps.layout().size.height);
      return;
    }
    const view = engine.view(now);
    this.draw(view);
    if (this.state.phase !== 'running') return;
    this.showCue(view.beat);
    this.metronome?.update(view.beat, this.motion.periodBeats);
    this.pushHud(now, false, view);
    if (view.finished) this.finish();
  }

  /** The lesson's cue for `beat`, none during the count-in; React hears only when it changes. */
  private showCue(beat: number): void {
    const cue = beat < 0 ? null : this.motion.cueAt(beat);
    if (cue !== this.state.cue) this.set({ cue });
  }

  private draw(view: EngineView): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { size, dpr } = this.deps.layout();
    drawOverlay(
      ctx,
      {
        view: this.view,
        rect: frameRect(this.watch ? NOMINAL_FRAME : this.frameSize(), size, 'cover'),
        size,
        dpr,
        palette: this.deps.settings.palette,
        activeSlots: this.deps.lesson.activeSlots as never,
        targets: view.targets,
        ghost: this.deps.settings.showGhost ? view.ghost : [],
        radius: view.radius,
        hits: view.hits,
        tips: view.tips,
        trail: view.trail,
        skeleton: this.deps.settings.showSkeleton ? view.skeleton : undefined,
        lights: this.deps.settings.showSkeleton ? view.lights : undefined,
      },
      this.sprites
    );
  }

  private pushHud(now: number, force: boolean, view = this.engine?.view(now)): void {
    if (!view || (!force && now - this.lastHud < HUD_INTERVAL_MS)) return;
    this.lastHud = now;
    this.set({
      hud: {
        countIn: view.countIn,
        loop: view.loop,
        loops: view.loops,
        progress: view.progress,
        accuracy: view.live.accuracy,
        combo: view.live.combo,
        lagMs: view.live.lagMs,
        paused: view.paused,
        tempo: this.tempo,
      },
    });
  }

  private finish(): void {
    const engine = this.engine!;
    const summary = engine.summary();
    const lesson = this.deps.lesson;
    this.set({ phase: 'finished', cue: null });
    this.deps.onFinish({
      id: this.deps.env.randomId(),
      lessonId: lesson.id,
      lessonVersion: lesson.version,
      startedAt: this.startedAt,
      day: localDay(this.startedAt),
      durationMs: Math.round(summary.durationMs),
      tracker: this.dark() ? 'leds' : 'landmarks',
      tempo: this.tempo,
      difficulty: this.deps.settings.difficulty,
      accuracy: summary.accuracy,
      grade: summary.grade,
      stars: summary.stars,
      maxCombo: summary.maxCombo,
      meanLagMs: summary.meanLagMs,
      perFinger: summary.perFinger,
    });
    this.dispose();
  }

  private stopFeeding(): void {
    this.stopVideoFrames?.();
    this.stopVideoFrames = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frameId !== null) this.deps.env.frames.cancel(this.frameId);
    this.stopFeeding();
    this.stopCameraEnded?.();
    this.engine?.dispose();
    this.watch?.dispose();
    this.metronome?.dispose();
    this.camera?.stop();
  }
}
