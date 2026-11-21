/**
 * The two calibrations behind one face, so one runner and one screen serve
 * both: each takes camera frames and says what to draw, how far along it is,
 * and, at the end, the settings it found.
 */

import type { Vec2 } from '../core/types';
import type { Settings } from '../state/settings';
import type { FrameGrab } from '../tracking/blob/blobTracker';
import {
  type CalibrationState,
  type DarkCalibration,
  feedCalibration,
  startCalibration,
} from '../tracking/blob/calibration';
import type { CameraFrame, FingertipTracker, Tips10, TrackerFrame } from '../tracking/types';
import { LitCalibration } from './litCalibration';

export interface CalibrationView {
  instruction: string;
  /** What's holding the step up, if anything. */
  hint: string | null;
  /** 0–1 through the current step. */
  progress: number;
  /** "Step 2 of 3". */
  stepLabel: string;
  done: boolean;
}

export interface SourceFrame {
  view: CalibrationView;
  tips: Tips10 | null;
  skeleton?: TrackerFrame['skeleton'];
  lights?: Vec2[];
  /** The settings found, once done. */
  result: Partial<Settings> | null;
}

export interface CalibrationSource {
  init(): Promise<void>;
  process(frame: CameraFrame): Promise<SourceFrame | null>;
  dispose(): void;
}

const LIT_STEPS = { hands: 1, right: 2, done: 2 } as const;

/** Lit mode: hands measured by the hand tracker, then a left/right check. */
export function litSource(tracker: FingertipTracker, swapHandedness: boolean): CalibrationSource {
  const calibration = new LitCalibration(swapHandedness);
  return {
    init: () => tracker.init(),
    async process(frame) {
      const tracked = await tracker.process(frame);
      if (!tracked) return null;
      const state = calibration.feed(tracked);
      return {
        view: {
          instruction: state.instruction,
          hint: state.hint,
          progress: state.progress,
          stepLabel: `Step ${LIT_STEPS[state.step]} of 2`,
          done: state.step === 'done',
        },
        tips: tracked.tips,
        skeleton: tracked.skeleton,
        result: state.result,
      };
    },
    dispose: () => tracker.dispose(),
  };
}

const DARK_STEPS = { room: 1, open: 2, thumbs: 3, done: 3 } as const;

/** Dark mode: the room's darkness, the gloves' lights, then which light is each thumb. */
export function darkSource(grab: FrameGrab): CalibrationSource {
  let state: CalibrationState = startCalibration();
  return {
    init: async () => {},
    async process(frame) {
      const grabbed = grab(frame);
      if (!grabbed) return null;
      state = feedCalibration(state, grabbed);
      const result: DarkCalibration | null = state.result;
      return {
        view: {
          instruction: state.instruction,
          hint: state.problem,
          progress: state.progress,
          stepLabel: `Step ${DARK_STEPS[state.step]} of 3`,
          done: state.step === 'done',
        },
        tips: null,
        lights: state.lights,
        result: result ? { darkCalibration: result } : null,
      };
    },
    dispose: () => {},
  };
}

/** A saved Dark-mode calibration this version can use. */
export function isDarkCalibration(value: unknown): value is DarkCalibration {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<DarkCalibration>;
  return v.version === 1 && typeof v.hands === 'object' && Array.isArray(v.hues) && typeof v.fit === 'object';
}
