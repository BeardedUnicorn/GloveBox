import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useParams } from 'react-router';
import { CalibrationRunner } from '../../calibration/runner';
import { darkSource, litSource } from '../../calibration/sources';
import { useEnv } from '../../envContext';
import { appStore, useApp } from '../../state/appStore';

const TITLES = { lit: 'Calibrate Lit mode', dark: 'Calibrate Dark mode' } as const;

/** Calibration for either mode: `/calibrate/lit` or `/calibrate/dark`. */
export function CalibrateScreen() {
  const { mode: param } = useParams();
  const mode = param === 'dark' ? 'dark' : 'lit';
  const env = useEnv();
  const settings = useApp(state => state.settings);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [runner, setRunner] = useState<CalibrationRunner | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: one calibration per visit; settings are read when it starts
  useEffect(() => {
    const canvas = canvasRef.current!;
    const made = new CalibrationRunner({
      env,
      settings,
      source:
        mode === 'dark'
          ? darkSource(env.grabber())
          : litSource(env.createTracker({ ...settings, tracker: 'lit' }), settings.swapHandedness),
      video: videoRef.current!,
      canvas,
      layout() {
        const stage = stageRef.current!;
        const size = { width: stage.clientWidth, height: stage.clientHeight };
        canvas.width = Math.round(size.width * window.devicePixelRatio);
        canvas.height = Math.round(size.height * window.devicePixelRatio);
        return { size, dpr: window.devicePixelRatio };
      },
      onResult: result => appStore.getState().updateSettings(result),
    });
    setRunner(made);
    void made.open();
    return () => made.dispose();
  }, [mode]);

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
        {runner && <RunnerView runner={runner} title={TITLES[mode]} />}
      </div>
    </div>
  );
}

function RunnerView({ runner, title }: { runner: CalibrationRunner; title: string }) {
  const state = useSyncExternalStore(runner.subscribe, runner.getState);
  const view = state.view;
  return (
    <>
      <div className="hud hud-top">
        <Link to="/settings" className="btn ghost small" aria-label="Back to settings">
          ←
        </Link>
        <strong>{title}</strong>
        {view && <span className="chip">{view.stepLabel}</span>}
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
        {state.phase === 'running' && !view && <p>Looking…</p>}
        {state.phase === 'running' && view && (
          <>
            <p>{view.instruction}</p>
            {view.hint && <p className="muted">{view.hint}</p>}
            <div className="progress" aria-label="Step progress">
              <span style={{ width: `${Math.round(view.progress * 100)}%` }} />
            </div>
            {view.done && (
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
