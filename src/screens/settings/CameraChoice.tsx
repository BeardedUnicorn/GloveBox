import { useEffect, useRef, useState } from 'react';
import { type Camera, type CameraInfo, cameraMessage } from '../../camera/camera';
import { useEnv } from '../../envContext';
import { appStore, useApp } from '../../state/appStore';

/**
 * The Camera setting: which camera, with a live picture from it. The camera
 * is on while Settings is open. That's also what lets the list name every
 * camera: until one has been on, the system hides their names.
 */
export function CameraChoice() {
  const env = useEnv();
  const cameraId = useApp(state => state.settings.cameraId);
  const mirrored = useApp(state => state.settings.view === 'performer');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameras, setCameras] = useState<CameraInfo[] | null>(null);
  const [opened, setOpened] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let camera: Camera | null = null;
    let stopEnded = () => {};
    setOpened('');
    setMessage(null);
    void (async () => {
      const result = await env.openCamera(cameraId);
      if (!live) {
        if (result.ok) result.camera.stop();
        return;
      }
      if (result.ok) {
        camera = result.camera;
        setOpened(camera.label);
        stopEnded = camera.onEnded(() => setMessage(cameraMessage('not-found')));
        // Switching cameras quickly can interrupt the picture starting; the next one replaces it
        await env.attach(videoRef.current!, camera).catch(() => {});
      } else {
        setMessage(result.message);
      }
      const list = await env.listCameras();
      if (live) setCameras(list);
    })();
    return () => {
      live = false;
      stopEnded();
      camera?.stop();
    };
  }, [env, cameraId]);

  const saved = cameraId !== null && !cameras?.some(camera => camera.deviceId === cameraId);
  return (
    <div className="stack camera-choice">
      <select
        aria-label="Camera"
        value={cameraId ?? ''}
        onChange={event => appStore.getState().updateSettings({ cameraId: event.target.value || null })}
      >
        <option value="">{cameraId === null && opened ? `Automatic (${opened})` : 'Automatic'}</option>
        {cameras?.map(camera => (
          <option key={camera.deviceId} value={camera.deviceId}>
            {camera.label}
          </option>
        ))}
        {saved && (
          <option value={cameraId} disabled>
            {cameras ? 'Saved camera (not connected)' : 'Saved camera'}
          </option>
        )}
      </select>
      <video
        ref={videoRef}
        aria-label="Camera preview"
        className={`camera-preview${mirrored ? ' mirrored' : ''}`}
        muted
        playsInline
      />
      {message && <p className="faint">{message}</p>}
    </div>
  );
}
