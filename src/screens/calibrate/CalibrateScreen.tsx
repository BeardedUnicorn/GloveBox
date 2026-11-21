import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { LitCalibration, type LitCalibrationState } from '../../calibration/litCalibration';
import { CalibrationRunner } from '../../calibration/runner';
import { useEnv } from '../../envContext';
import { appStore, useApp } from '../../state/appStore';

/** Lit-mode calibration: measures the performer's hands and checks which hand is which. */
export function CalibrateScreen() {
  const env = useEnv();
  const settings = useApp(state => state.settings);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [runner, setRunner] = useState<CalibrationRunner<LitCalibrationState> | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: one calibration per visit; settings are read when it starts
  useEffect(() => {
    const calibration = new LitCalibration(settings.swapHandedness);
    const canvas = canvasRef.current!;
    const made = new CalibrationRunner<LitCalibrationState>({
      env,
      // Lit mode's tracker, whatever the practice mode is
      settings: { ...settings, tracker: 'lit' },
      video: videoRef.current!,
      canvas,
      layout() {
        const stage = stageRef.current!;
        const size = { width: stage.clientWidth, height: stage.clientHeight };
        canvas.width = Math.round(size.width * window.devicePixelRatio);
        canvas.height = Math.round(size.height * window.devicePixelRatio);
        return { size, dpr: window.devicePixelRatio };
      },
      feed(frame) {
        const state = calibration.feed(frame);
        if (state.result) appStore.getState().updateSettings(state.result);
        return state;
      },
    });
    setRunner(made);
    void made.open();
    return () => made.dispose();
  }, []);

  return (
    <div className="practice">
      <div ref={stageRef} className="stage">
        <video
          ref={videoRef}
          className={`stage-video${settings.view === 'performer' ? ' mirrored' : ''}`}
          muted
          playsInline
        />
        <canvas ref={canvasRef} className="stage-canvas" />
        {runner && <RunnerView runner={runner} />}
      </div>
    </div>
  );
}

function RunnerView({ runner }: { runner: CalibrationRunner<LitCalibrationState> }) {
  const state = useSyncExternalStore(runner.subscribe, runner.getState);
  const step = state.step;
  return (
    <>
      <div className="hud hud-top">
        <Link to="/settings" className="btn ghost small" aria-label="Back to settings">
          ←
        </Link>
        <strong>Calibrate</strong>
      </div>
      <div className="stage-card panel stack calibration-card" role="status">
        {state.phase === 'opening' && <p>Starting the camera…</p>}
        {state.phase === 'problem' && (
          <>
            <p role="alert">{state.message}</p>
            <button type="button" className="btn primary" onClick={() => void runner.open()}>
              Try again
            </button>
          </>
        )}
        {state.phase === 'running' && (
          <>
            <p>{step?.instruction ?? 'Hold both hands up, palms to the camera, fingers spread wide. Keep still.'}</p>
            {step?.hint && <p className="muted">{step.hint}</p>}
            <div className="progress" aria-label="Hold progress">
              <span style={{ width: `${Math.round((step?.progress ?? 0) * 100)}%` }} />
            </div>
            {step?.step === 'done' && (
              <Link className="btn primary" to="/">
                Start practicing
              </Link>
            )}
          </>
        )}
      </div>
    </>
  );
}
