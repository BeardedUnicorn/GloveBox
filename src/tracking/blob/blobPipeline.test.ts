import { describe, expect, test } from 'vitest';
import { emptyPose } from '../../core/types';
import { calibrateRendered, OPEN_LEFT, OPEN_RIGHT } from '../../test/darkCalibration';
import { twoHands } from '../../test/syntheticHands';
import { renderLeds } from '../synthetic/ledFrameRenderer';
import { BlobPipeline } from './blobPipeline';

const calibration = calibrateRendered();
const open = twoHands(OPEN_LEFT, OPEN_RIGHT);

describe('the Dark-mode pipeline', () => {
  test('reports the ten tips, each hand’s size and every light', () => {
    const pipeline = new BlobPipeline(calibration);
    const frame = pipeline.process(renderLeds(open), 0, null);
    expect(frame.tips.every(tip => tip !== null && tip.confidence === 1 && !tip.predicted)).toBe(true);
    expect(frame.handScale).toEqual({ L: calibration.hands.L.span, R: calibration.hands.R.span });
    expect(frame.lights).toHaveLength(10);
  });

  test('a hidden light coasts, then is dropped', () => {
    const pipeline = new BlobPipeline(calibration);
    pipeline.process(renderLeds(open), 0, null);
    const hidden = [...open];
    hidden[3] = null;
    const coasting = pipeline.process(renderLeds(hidden, { frameIndex: 1 }), 100, null);
    expect(coasting.tips[3]).toMatchObject({ predicted: true });
    expect(coasting.tips[3]!.confidence).toBeCloseTo(2 / 3);
    expect(pipeline.process(renderLeds(hidden, { frameIndex: 2 }), 500, null).tips[3]).toBeNull();
  });

  test('scales light sizes to a different frame size', () => {
    const pipeline = new BlobPipeline(calibration);
    const small = pipeline.process(renderLeds(open, { width: 160, height: 90, radius: 1, bloom: 1.5 }), 0, null);
    expect(small.tips.filter(tip => tip !== null)).toHaveLength(10);
    const back = pipeline.process(renderLeds(open), 33, null);
    expect(back.tips.filter(tip => tip !== null)).toHaveLength(10);
  });

  test('reset forgets every track', () => {
    const pipeline = new BlobPipeline(calibration);
    pipeline.process(renderLeds(open), 0, null);
    pipeline.reset();
    expect(pipeline.process(renderLeds(emptyPose()), 33, null).tips.every(tip => tip === null)).toBe(true);
  });
});
