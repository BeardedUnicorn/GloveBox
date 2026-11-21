import { afterEach, describe, expect, test, vi } from 'vitest';
import { calibrateRendered, OPEN_LEFT, OPEN_RIGHT } from '../../test/darkCalibration';
import { twoHands } from '../../test/syntheticHands';
import { renderLeds } from '../synthetic/ledFrameRenderer';
import { createBlobWorkerHandler, type WorkerRequest, type WorkerResponse } from './workerProtocol';

const calibration = calibrateRendered();
const frame = renderLeds(twoHands(OPEN_LEFT, OPEN_RIGHT));

const frameRequest = (id: number, over: Partial<Extract<WorkerRequest, { type: 'frame' }>> = {}): WorkerRequest => ({
  type: 'frame',
  id,
  t: 0,
  width: frame.width,
  height: frame.height,
  buffer: frame.data.slice().buffer,
  prior: null,
  ...over,
});

describe("the worker's messages", () => {
  const setup = () => {
    const posted: WorkerResponse[] = [];
    const handle = createBlobWorkerHandler(message => posted.push(message));
    return { posted, send: (data: WorkerRequest) => handle({ data }) };
  };

  test('a frame before the calibration is an error', () => {
    const { posted, send } = setup();
    send(frameRequest(1));
    expect(posted).toEqual([
      { type: 'error', id: 1, message: 'The Dark-mode worker got a frame before its calibration.' },
    ]);
  });

  test('init, then each frame answered with its tips; reset starts over', () => {
    const { posted, send } = setup();
    send({ type: 'reset' });
    send({ type: 'init', calibration });
    send(frameRequest(7));
    send({ type: 'reset' });
    expect(posted[0]).toEqual({ type: 'ready' });
    expect(posted[1]).toMatchObject({ type: 'result', id: 7 });
    const result = posted[1] as Extract<WorkerResponse, { type: 'result' }>;
    expect(result.frame.tips.filter(tip => tip !== null)).toHaveLength(10);
  });

  test("a frame the pipeline can't read is an error for that frame", () => {
    const { posted, send } = setup();
    send({ type: 'init', calibration });
    send(frameRequest(3, { width: -1 }));
    expect(posted[1]).toMatchObject({ type: 'error', id: 3 });
  });
});

describe('the worker entry', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('answers through its own postMessage', async () => {
    const posted: unknown[] = [];
    const scope: { postMessage(m: unknown): void; onmessage: ((e: { data: WorkerRequest }) => void) | null } = {
      postMessage: message => posted.push(message),
      onmessage: null,
    };
    vi.stubGlobal('self', scope);
    await import('./blob.worker');
    scope.onmessage!({ data: { type: 'init', calibration } });
    expect(posted).toEqual([{ type: 'ready' }]);
  });
});
