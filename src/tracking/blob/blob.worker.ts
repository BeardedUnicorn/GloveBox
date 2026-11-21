/**
 * The Dark-mode worker: finds the gloves' lights off the page's main
 * thread, so drawing never waits on it (workerProtocol.ts says how).
 */

import { createBlobWorkerHandler, type WorkerRequest } from './workerProtocol';

interface WorkerScope {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: WorkerRequest }) => void) | null;
}

const scope = self as unknown as WorkerScope;
scope.onmessage = createBlobWorkerHandler(message => scope.postMessage(message));
