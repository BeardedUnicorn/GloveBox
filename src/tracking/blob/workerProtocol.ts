/**
 * The messages between the page and the Dark-mode worker (blob.worker.ts),
 * and the worker's side of them. The page sends the calibration once, then
 * each grabbed frame with its pixels transferred, not copied; the worker
 * answers each frame with its tips.
 */

import type { Pose10 } from '../../core/types';
import type { TrackerFrame } from '../types';
import { BlobPipeline, type PipelineOptions } from './blobPipeline';
import type { DarkCalibration } from './calibration';

export type WorkerRequest =
  | { type: 'init'; calibration: DarkCalibration; options?: Partial<PipelineOptions> }
  | { type: 'frame'; id: number; t: number; width: number; height: number; buffer: ArrayBuffer; prior: Pose10 | null }
  | { type: 'reset' };

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; id: number; frame: TrackerFrame }
  /** `id` is the frame's, or null for init. */
  | { type: 'error'; id: number | null; message: string };

/** The worker's message handler: answers through `post`. */
export function createBlobWorkerHandler(
  post: (message: WorkerResponse) => void
): (event: { data: WorkerRequest }) => void {
  let pipeline: BlobPipeline | null = null;
  return ({ data: request }) => {
    switch (request.type) {
      case 'init':
        pipeline = new BlobPipeline(request.calibration, request.options);
        post({ type: 'ready' });
        return;
      case 'reset':
        pipeline?.reset();
        return;
      case 'frame': {
        if (pipeline === null) {
          post({ type: 'error', id: request.id, message: 'The Dark-mode worker got a frame before its calibration.' });
          return;
        }
        const data = new Uint8ClampedArray(request.buffer);
        try {
          const frame = pipeline.process(
            { data, width: request.width, height: request.height },
            request.t,
            request.prior
          );
          post({ type: 'result', id: request.id, frame });
        } catch (error) {
          post({ type: 'error', id: request.id, message: String(error) });
        }
      }
    }
  };
}
