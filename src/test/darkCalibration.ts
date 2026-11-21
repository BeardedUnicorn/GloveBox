/**
 * A Dark-mode calibration for tests, made the way a user makes one: by the
 * three calibration steps, on rendered glove frames.
 */

import { emptyPose, type Pose10 } from '../core/types';
import { type DarkCalibration, feedCalibration, startCalibration } from '../tracking/blob/calibration';
import { type LedRenderOptions, renderLeds } from '../tracking/synthetic/ledFrameRenderer';
import { type HandPlacement, twoHands } from './syntheticHands';

export const TEST_SPAN = 0.3;
export const OPEN_LEFT: HandPlacement = { center: { x: -0.42, y: 0 }, span: TEST_SPAN };
export const OPEN_RIGHT: HandPlacement = { center: { x: 0.42, y: 0 }, span: TEST_SPAN };

/** Feeds the three steps until done (or a frame budget runs out); returns the result. */
export function calibrateRendered(render: Partial<LedRenderOptions> = {}): DarkCalibration {
  let state = startCalibration();
  let frame = 0;
  const feed = (pose: Pose10) => {
    state = feedCalibration(state, renderLeds(pose, { ...render, frameIndex: frame++ }));
  };
  while (state.step === 'room' && frame < 200) feed(emptyPose());
  while (state.step === 'open' && frame < 400) feed(twoHands(OPEN_LEFT, OPEN_RIGHT));
  let wiggle = 0;
  while (state.step === 'thumbs' && frame < 600) {
    const curl = [0.35 * (0.5 + 0.5 * Math.sin(wiggle++ * 0.7)), 0, 0, 0, 0];
    feed(twoHands({ ...OPEN_LEFT, curl }, { ...OPEN_RIGHT, curl }));
  }
  if (state.result === null) throw new Error(`calibration stopped at ${state.step}: ${state.problem}`);
  return state.result;
}
