/**
 * The webcam. `navigator.mediaDevices` comes in as a parameter, so tests can
 * grant it, refuse it, have no camera, or unplug it.
 */

export type CameraProblem = 'denied' | 'not-found' | 'in-use' | 'unsupported' | 'unknown';

export interface CameraInfo {
  deviceId: string;
  label: string;
}

export interface Camera {
  stream: MediaStream;
  track: MediaStreamTrack;
  width: number;
  height: number;
  deviceId: string;
  /** Calls `listener` when the camera goes away (unplugged, taken by the system); returns an unsubscribe. */
  onEnded(listener: () => void): () => void;
  stop(): void;
}

export type CameraResult = { ok: true; camera: Camera } | { ok: false; problem: CameraProblem; message: string };

const MESSAGES: Record<CameraProblem, string> = {
  denied:
    "GloveBox can't use your camera. On a Mac, open System Settings → Privacy & Security → Camera and turn on GloveBox, then try again.",
  'not-found': 'No camera was found. Plug one in, or pick another in Settings.',
  'in-use': 'The camera is busy in another app. Close it there and try again.',
  unsupported: "This window can't use cameras.",
  unknown: "The camera couldn't start.",
};

/** What went wrong, from getUserMedia's error. */
export function cameraProblem(error: unknown): CameraProblem {
  const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'not-found';
    case 'NotReadableError':
    case 'AbortError':
      return 'in-use';
    default:
      return 'unknown';
  }
}

export const cameraMessage = (problem: CameraProblem): string => MESSAGES[problem];

/** The constraints GloveBox asks for: the front camera, 720p at up to 60 fps, no sound. */
export function cameraConstraints(deviceId?: string): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 60 },
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
    },
  };
}

export async function openCamera(devices: MediaDevices | undefined, deviceId?: string): Promise<CameraResult> {
  if (!devices?.getUserMedia) return { ok: false, problem: 'unsupported', message: MESSAGES.unsupported };
  let stream: MediaStream;
  try {
    stream = await devices.getUserMedia(cameraConstraints(deviceId));
  } catch (error) {
    const problem = cameraProblem(error);
    return { ok: false, problem, message: MESSAGES[problem] };
  }
  const track = stream.getVideoTracks()[0]!;
  const settings = track.getSettings();
  return {
    ok: true,
    camera: {
      stream,
      track,
      width: settings.width ?? 1280,
      height: settings.height ?? 720,
      deviceId: settings.deviceId ?? '',
      onEnded(listener) {
        track.addEventListener('ended', listener);
        return () => track.removeEventListener('ended', listener);
      },
      stop() {
        for (const t of stream.getTracks()) t.stop();
      },
    },
  };
}

/** The cameras this computer has. Labels are empty until camera access is granted once. */
export async function listCameras(devices: MediaDevices | undefined): Promise<CameraInfo[]> {
  if (!devices?.enumerateDevices) return [];
  const all = await devices.enumerateDevices();
  return all
    .filter(device => device.kind === 'videoinput')
    .map((device, i) => ({ deviceId: device.deviceId, label: device.label || `Camera ${i + 1}` }));
}
