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
  /** The camera's name ("FaceTime HD Camera"); empty if the system gives none. */
  label: string;
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

/** Software cameras (OBS, Snap Camera, mmhmm…) that show something other than the room. */
const VIRTUAL = /virtual|snap camera|mmhmm|manycam|camtwist|\bndi\b|xsplit/i;
/** The computer's own camera: "FaceTime HD Camera", "MacBook Pro Camera", "iMac Camera". */
const BUILT_IN = /facetime|built-in|macbook|imac/i;

export const isVirtualCamera = (label: string): boolean => VIRTUAL.test(label);

/** The camera Automatic uses: the computer's own, else the first real one, else the first. */
export function preferredCamera(cameras: readonly CameraInfo[]): CameraInfo | undefined {
  return (
    cameras.find(camera => BUILT_IN.test(camera.label)) ??
    cameras.find(camera => !isVirtualCamera(camera.label)) ??
    cameras[0]
  );
}

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

async function open(devices: MediaDevices, deviceId?: string): Promise<CameraResult> {
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
      label: track.label ?? '',
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

/**
 * Opens the camera chosen in Settings, or with none chosen, the one
 * Automatic picks. The system offers its preferred camera first, which on a
 * Mac is whichever an app used last, often OBS's virtual one. So when that
 * comes back, GloveBox looks again (the names are visible once a camera is
 * on) and switches to a real one if there is one.
 */
export async function openCamera(devices: MediaDevices | undefined, deviceId?: string): Promise<CameraResult> {
  if (!devices?.getUserMedia) return { ok: false, problem: 'unsupported', message: MESSAGES.unsupported };
  const first = await open(devices, deviceId);
  if (deviceId || !first.ok || !isVirtualCamera(first.camera.label)) return first;
  const better = preferredCamera(await listCameras(devices));
  if (!better || better.deviceId === first.camera.deviceId) return first;
  const real = await open(devices, better.deviceId);
  if (!real.ok) return first;
  first.camera.stop();
  return real;
}

/**
 * The cameras this computer has. Until a camera has been on since launch,
 * the system hides their names and ids (a Mac lists one nameless camera), so
 * those hidden entries are left out.
 */
export async function listCameras(devices: MediaDevices | undefined): Promise<CameraInfo[]> {
  if (!devices?.enumerateDevices) return [];
  const all = await devices.enumerateDevices();
  return all
    .filter(device => device.kind === 'videoinput' && device.deviceId)
    .map((device, i) => ({ deviceId: device.deviceId, label: device.label || `Camera ${i + 1}` }));
}
