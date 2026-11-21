import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router';
import { useEnv } from '../../envContext';
import { BUILTIN_LESSONS } from '../../lessons/builtin';
import { slugFor } from '../../lessons/recording/toLesson';
import { RecordController } from '../../practice/recordController';
import type { Tier } from '../../progression/types';
import { appStore, useApp } from '../../state/appStore';
import { TIER_NAMES } from '../progress/ProgressScreen';

/** The library's hand span: recordings are written at it, like every built-in lesson. */
const NOMINAL_SPAN = BUILTIN_LESSONS[0]!.nominalSpan;
const TIERS: Tier[] = [1, 2, 3, 4, 5];

function Review({ controller }: { controller: RecordController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const navigate = useNavigate();
  const lessons = useApp(s => s.lessons);
  const [name, setName] = useState('');
  const [tier, setTier] = useState<Tier>(1);
  const total = Math.floor(state.beats);
  const save = () => {
    const id = slugFor(name || 'My move', new Set(lessons.map(l => l.id)));
    // Saving is only offered while the take has something to keep
    const lesson = controller.buildLesson({ name, tier, tags: ['recorded'] }, id)!;
    void appStore
      .getState()
      .saveLesson(lesson)
      .then(() => navigate('/'));
  };
  return (
    <div className="stage-card panel stack" role="dialog" aria-label="Review the take">
      <h2>Your take</h2>
      <p className="muted">It plays back as a loop. Keep the part you like, name it, and save it to My moves.</p>
      <label className="field">
        <span>Starts on beat</span>
        <input
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          step={1}
          value={state.trim.start}
          aria-label="Starts on beat"
          onChange={event => controller.setTrim(Number(event.target.value), state.trim.end)}
        />
        <span className="mono">{state.trim.start + 1}</span>
      </label>
      <label className="field">
        <span>Ends after beat</span>
        <input
          type="range"
          min={1}
          max={total}
          step={1}
          value={state.trim.end}
          aria-label="Ends after beat"
          onChange={event => controller.setTrim(state.trim.start, Number(event.target.value))}
        />
        <span className="mono">{state.trim.end}</span>
      </label>
      <label className="field">
        <span>Name</span>
        <input
          type="text"
          value={name}
          placeholder="My move"
          aria-label="Name"
          onChange={e => setName(e.target.value)}
        />
      </label>
      <label className="field">
        <span>Tier</span>
        <select aria-label="Tier" value={tier} onChange={e => setTier(Number(e.target.value) as Tier)}>
          {TIERS.map(t => (
            <option key={t} value={t}>
              {t} · {TIER_NAMES[t]}
            </option>
          ))}
        </select>
      </label>
      {state.message && <p className="alert">{state.message}</p>}
      <div className="row">
        <button type="button" className="btn primary" disabled={state.message !== null} onClick={save}>
          Save to My moves
        </button>
        <button type="button" className="btn" onClick={() => controller.record()}>
          Record again
        </button>
      </div>
    </div>
  );
}

function Panel({ controller }: { controller: RecordController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  switch (state.phase) {
    case 'opening':
      return <div className="stage-message">Starting the camera…</div>;
    case 'problem':
      return (
        <div className="stage-card panel stack" role="alert">
          <p>{state.message}</p>
          <button type="button" className="btn primary" onClick={() => void controller.open()}>
            Try again
          </button>
        </div>
      );
    case 'setup':
      return (
        <div className="stage-card panel stack" role="dialog" aria-label="Record a move">
          <h2>Record a move</h2>
          <p className="muted">
            Pick a tempo, press Record, and perform after the four-beat count-in. Lit mode works best: a lit room, hands
            in view.
          </p>
          <label className="field">
            <span>Tempo (bpm)</span>
            <input
              type="number"
              min={40}
              max={200}
              value={state.bpm}
              aria-label="Tempo"
              onChange={event => controller.setBpm(Number(event.target.value))}
            />
          </label>
          {state.message && <p className="alert">{state.message}</p>}
          <button type="button" className="btn primary" onClick={() => controller.record()}>
            Record
          </button>
        </div>
      );
    case 'counting':
      return (
        <>
          <div className="stage-message count-in">{state.countIn}</div>
          <div className="stage-banner row">
            <span>Get ready…</span>
            <button type="button" className="btn small" onClick={() => controller.stop()}>
              Cancel
            </button>
          </div>
        </>
      );
    case 'recording':
      return (
        <div className="stage-banner row">
          <span className="rec-dot" aria-hidden="true" />
          <span>Recording · beat {Math.floor(state.beats) + 1}</span>
          <button type="button" className="btn small" onClick={() => controller.stop()}>
            Stop
          </button>
        </div>
      );
    case 'review':
      return <Review controller={controller} />;
  }
}

/** Record mode: perform a move on camera and keep it as a lesson. */
export function RecordScreen() {
  const env = useEnv();
  const settings = useApp(state => state.settings);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [controller, setController] = useState<RecordController | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: one controller per visit; settings are read when it starts
  useEffect(() => {
    const canvas = canvasRef.current!;
    const made = new RecordController({
      env,
      settings,
      video: videoRef.current!,
      canvas,
      nominalSpan: NOMINAL_SPAN,
      layout() {
        const stage = stageRef.current!;
        const size = { width: stage.clientWidth, height: stage.clientHeight };
        canvas.width = Math.round(size.width * window.devicePixelRatio);
        canvas.height = Math.round(size.height * window.devicePixelRatio);
        return { size, dpr: window.devicePixelRatio };
      },
    });
    setController(made);
    void made.open();
    return () => made.dispose();
  }, []);

  return (
    <div className="practice">
      <div ref={stageRef} className="stage">
        <video
          ref={videoRef}
          className={`stage-video${settings.view === 'performer' ? ' mirrored' : ''}${settings.dimVideo ? ' dimmed' : ''}`}
          muted
          playsInline
        />
        <canvas ref={canvasRef} className="stage-canvas" />
        <div className="hud hud-top">
          <Link to="/" className="btn ghost small" aria-label="Back to the library">
            ←
          </Link>
          <strong>Record</strong>
        </div>
        {controller && <Panel controller={controller} />}
      </div>
    </div>
  );
}
