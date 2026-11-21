import { afterEach, describe, expect, test, vi } from 'vitest';
import { calibrateRendered, OPEN_LEFT, OPEN_RIGHT } from '../../test/darkCalibration';
import { twoHands } from '../../test/syntheticHands';
import { renderLeds } from '../synthetic/ledFrameRenderer';
import type { CameraFrame } from '../types';
import { BlobTracker, createBlobWorker, createVideoGrabber, type GrabCanvas, type WorkerLike } from './blobTracker';
import type { GrabbedFrame } from './detect';
import { createBlobWorkerHandler, type WorkerRequest, type WorkerResponse } from './workerProtocol';

const calibration = calibrateRendered();
const open = twoHands(OPEN_LEFT, OPEN_RIGHT);
const rendered = renderLeds(open);
const video = {} as HTMLVideoElement;
const cameraFrame = (t = 0, width = 1280, height = 720): CameraFrame => ({ video, t, width, height });

describe('in the page', () => {
  test('tracks the frames it grabs', async () => {
    const tracker = new BlobTracker({ calibration, grab: () => rendered });
    expect(tracker.kind).toBe('leds');
    expect(await tracker.process(cameraFrame())).toBeNull(); // not started yet
    await tracker.init();
    const frame = await tracker.process(cameraFrame(10));
    expect(frame!.t).toBe(10);
    expect(frame!.tips.filter(tip => tip !== null)).toHaveLength(10);
    tracker.dispose();
    expect(await tracker.process(cameraFrame(20))).toBeNull();
  });

  test("a frame that can't be grabbed gives nothing", async () => {
    const tracker = new BlobTracker({ calibration, grab: () => null });
    await tracker.init();
    expect(await tracker.process(cameraFrame())).toBeNull();
  });

  test("asks the lesson's prior for the frame's time", async () => {
    const tracker = new BlobTracker({ calibration, grab: () => rendered });
    await tracker.init();
    const prior = vi.fn(() => open);
    tracker.setLessonPrior(prior);
    await tracker.process(cameraFrame(42));
    expect(prior).toHaveBeenCalledWith(42);
    tracker.setLessonPrior(null);
  });
});

/** A worker that runs the real handler, and lets a test answer in its own time. */
function fakeWorker({ answer = true } = {}) {
  const sent: { message: WorkerRequest; transfer?: Transferable[] }[] = [];
  const worker: WorkerLike & { reply(message: WorkerResponse): void } = {
    onmessage: null,
    terminate: vi.fn(),
    postMessage(message, transfer) {
      sent.push({ message, transfer });
      if (answer) handler({ data: message });
    },
    reply(message) {
      worker.onmessage?.({ data: message });
    },
  };
  const handler = createBlobWorkerHandler(message => worker.reply(message));
  return { worker, sent };
}

describe('in a worker', () => {
  test('starts the worker, then sends each frame (pixels transferred) and gets its tips', async () => {
    const { worker, sent } = fakeWorker();
    const tracker = new BlobTracker({ calibration, grab: () => rendered, worker });
    await tracker.init();
    expect(sent[0]!.message).toMatchObject({ type: 'init' });
    tracker.setLessonPrior(() => open);
    const frame = await tracker.process(cameraFrame(5));
    expect(frame!.tips.filter(tip => tip !== null)).toHaveLength(10);
    const request = sent[1]!;
    expect(request.message).toMatchObject({ type: 'frame', id: 1, t: 5, prior: open });
    expect(request.transfer).toHaveLength(1);
    // The grabbed pixels were copied, not given away
    expect(rendered.data.byteLength).toBeGreaterThan(0);
    tracker.dispose();
    expect(worker.terminate).toHaveBeenCalled();
  });

  test("a frame the worker couldn't read gives nothing; stray answers are ignored", async () => {
    const { worker } = fakeWorker({ answer: false });
    const tracker = new BlobTracker({ calibration, grab: () => rendered, worker });
    const started = tracker.init();
    worker.reply({ type: 'ready' });
    worker.reply({ type: 'ready' });
    await started;
    const pending = tracker.process(cameraFrame());
    worker.reply({ type: 'result', id: 99, frame: { t: 0, tips: [], handScale: {} } });
    worker.reply({ type: 'error', id: 1, message: 'bad frame' });
    expect(await pending).toBeNull();
    worker.reply({ type: 'error', id: null, message: 'late' });
  });

  test("a worker that can't start rejects init", async () => {
    const { worker } = fakeWorker({ answer: false });
    const tracker = new BlobTracker({ calibration, grab: () => rendered, worker });
    const started = tracker.init();
    worker.reply({ type: 'error', id: null, message: 'no calibration' });
    await expect(started).rejects.toThrow('no calibration');
  });

  test('closing it answers waiting frames with nothing and stops a start under way', async () => {
    const { worker } = fakeWorker({ answer: false });
    const tracker = new BlobTracker({ calibration, grab: () => rendered, worker });
    const started = tracker.init();
    const pending = tracker.process(cameraFrame());
    tracker.dispose();
    await expect(started).rejects.toThrow(/closed before it started/);
    expect(await pending).toBeNull();
  });
});

describe('creating the worker', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('a module worker from blob.worker.ts', () => {
    const made: { url: URL; options: WorkerOptions }[] = [];
    vi.stubGlobal(
      'Worker',
      class {
        constructor(url: URL, options: WorkerOptions) {
          made.push({ url, options });
        }
      }
    );
    createBlobWorker();
    expect(made[0]!.url.href).toMatch(/blob\.worker\.ts$/);
    expect(made[0]!.options).toEqual({ type: 'module' });
  });
});

describe('grabbing camera frames', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A canvas that records what's drawn and hands back pixels of the right size. */
  function fakeCanvas(log: string[], { context = true } = {}) {
    return (width: number, height: number): GrabCanvas => {
      log.push(`canvas ${width}×${height}`);
      return {
        getContext: (_id, options) => {
          log.push(`context ${options.willReadFrequently}`);
          if (!context) return null;
          return {
            drawImage: (_image, dx, dy, dw, dh) => log.push(`draw ${dx},${dy} ${dw}×${dh}`),
            getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          };
        },
      };
    };
  }

  test('320 wide by default, keeping the camera’s shape, reusing the canvas', () => {
    const log: string[] = [];
    const grab = createVideoGrabber({ createCanvas: fakeCanvas(log) });
    const first = grab(cameraFrame()) as GrabbedFrame;
    expect(first).toMatchObject({ width: 320, height: 180 });
    expect(first.data).toHaveLength(320 * 180 * 4);
    grab(cameraFrame());
    // A 4:3 camera needs a new canvas
    expect(grab(cameraFrame(0, 640, 480))).toMatchObject({ width: 320, height: 240 });
    expect(log).toEqual([
      'canvas 320×180',
      'context true',
      'draw 0,0 320×180',
      'draw 0,0 320×180',
      'canvas 320×240',
      'context true',
      'draw 0,0 320×240',
    ]);
  });

  test("nothing while the video has no size, or when the canvas can't be drawn on", () => {
    const log: string[] = [];
    expect(createVideoGrabber({ createCanvas: fakeCanvas(log) })(cameraFrame(0, 0, 0))).toBeNull();
    expect(
      createVideoGrabber({ width: 64, createCanvas: fakeCanvas(log, { context: false }) })(cameraFrame())
    ).toBeNull();
    expect(log).toEqual(['canvas 64×36', 'context true']);
  });

  test('draws on an OffscreenCanvas by default', () => {
    const sizes: number[][] = [];
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor(width: number, height: number) {
          sizes.push([width, height]);
        }
        getContext() {
          return null;
        }
      }
    );
    expect(createVideoGrabber({ width: 32 })(cameraFrame())).toBeNull();
    expect(sizes).toEqual([[32, 18]]);
  });
});
