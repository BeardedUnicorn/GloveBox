import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { View } from '../../core/coords';
import { useEnv } from '../../envContext';
import type { LessonDef } from '../../lessons/schema';
import { type ControllerState, type Hud, PracticeController } from '../../practice/controller';
import type { SessionRecord } from '../../progression/types';
import { appStore, lessonById, useApp } from '../../state/appStore';
import { TEMPOS } from '../../state/settings';

/** "on the beat", "120 ms behind", "40 ms ahead". */
export function lagText(lagMs: number | null): string {
  if (lagMs === null) return '';
  if (Math.abs(lagMs) < 30) return 'on the beat';
  return `${Math.round(Math.abs(lagMs))} ms ${lagMs > 0 ? 'behind' : 'ahead'}`;
}

const tempoLabel = (tempo: number) => `${tempo}×`;

export function HudBar({ lesson, hud }: { lesson: LessonDef; hud: Hud | null }) {
  return (
    <div className="hud hud-top">
      <Link to="/" className="btn ghost small" aria-label="Back to the library">
        ←
      </Link>
      <strong>{lesson.name}</strong>
      {hud && (
        <>
          <span className="chip">
            Loop {hud.loop} / {hud.loops}
          </span>
          <output className="chip accuracy" aria-label="Accuracy">
            {Math.round(hud.accuracy)}%
          </output>
          {hud.combo > 1 && <span className="chip combo">{hud.combo} beat combo</span>}
          <span className="muted">{lagText(hud.lagMs)}</span>
        </>
      )}
    </div>
  );
}

function Controls({
  controller,
  state,
  view,
  onView,
}: {
  controller: PracticeController;
  state: ControllerState;
  view: View;
  onView(view: View): void;
}) {
  const settingsTempo = useApp(s => s.settings.tempo);
  const [tempo, setTempo] = useState(settingsTempo);
  const choose = (value: number) => {
    setTempo(value);
    controller.setTempo(value);
    appStore.getState().updateSettings({ tempo: value });
  };
  return (
    <div className="hud hud-bottom">
      <fieldset className="segmented" aria-label="Tempo">
        {TEMPOS.map(value => (
          <button
            key={value}
            type="button"
            className={`btn small${value === tempo ? ' primary' : ''}`}
            aria-pressed={value === tempo}
            onClick={() => choose(value)}
          >
            {tempoLabel(value)}
          </button>
        ))}
      </fieldset>
      <fieldset className="segmented" aria-label="View">
        {(['performer', 'receiver'] as const).map(value => (
          <button
            key={value}
            type="button"
            className={`btn small${value === view ? ' primary' : ''}`}
            aria-pressed={value === view}
            onClick={() => onView(value)}
          >
            {value === 'performer' ? 'Mirror' : 'Receiver'}
          </button>
        ))}
      </fieldset>
      <span className="spacer" />
      {state.phase === 'running' && (
        <button type="button" className="btn small" onClick={() => controller.togglePause()}>
          {state.hud?.paused ? 'Resume' : 'Pause'}
        </button>
      )}
      {state.hud && (
        <div
          className="progress session-progress"
          role="progressbar"
          aria-label="Session progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(state.hud.progress * 100)}
        >
          <span style={{ width: `${Math.round(state.hud.progress * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

function Overlay({
  controller,
  state,
  lesson,
}: {
  controller: PracticeController;
  state: ControllerState;
  lesson: LessonDef;
}) {
  switch (state.phase) {
    case 'opening':
      return <div className="stage-message">Starting the camera…</div>;
    case 'loading':
      return <div className="stage-message">Loading hand tracking…</div>;
    case 'ready':
      return (
        <div className="stage-card panel stack" role="dialog" aria-label="Ready">
          <h2>{lesson.name}</h2>
          <p className="muted">{lesson.description}</p>
          <p>Hold your hands up so each fingertip sits in its ring, then press Start (or Space).</p>
          <div className="row">
            <button type="button" className="btn primary" onClick={() => controller.start()}>
              Start
            </button>
            <button type="button" className="btn" onClick={() => controller.startWatching()}>
              Watch it first
            </button>
          </div>
        </div>
      );
    case 'problem':
      return (
        <div className="stage-card panel stack" role="alert">
          <p>{state.message}</p>
          <div className="row">
            <button type="button" className="btn primary" onClick={() => void controller.open()}>
              Try again
            </button>
            <button type="button" className="btn" onClick={() => controller.startWatching()}>
              Watch it
            </button>
          </div>
        </div>
      );
    case 'watching':
      return (
        <div className="stage-banner row">
          <span>Watching the move…</span>
          <button type="button" className="btn small" onClick={() => controller.stopWatching()}>
            Stop
          </button>
        </div>
      );
    case 'running':
      if (state.hud?.paused) return <div className="stage-message big">Paused</div>;
      if (state.hud?.countIn) return <div className="stage-message count-in">{state.hud.countIn}</div>;
      return null;
    case 'finished':
      return <div className="stage-message">Saving…</div>;
  }
}

/** One run of a lesson: camera, overlay, HUD and controls. */
function PracticeSession({ lesson }: { lesson: LessonDef }) {
  const env = useEnv();
  const navigate = useNavigate();
  const settings = useApp(state => state.settings);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View>(settings.view);
  const [controller, setController] = useState<PracticeController | null>(null);

  const finish = useCallback(
    (record: SessionRecord) => {
      void appStore
        .getState()
        .addSession(record)
        .then(() => navigate(`/results/${record.id}`));
    },
    [navigate]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: one controller per mounted session; settings are read when it starts
  useEffect(() => {
    const canvas = canvasRef.current!;
    const made = new PracticeController({
      env,
      lesson,
      settings,
      video: videoRef.current!,
      canvas,
      layout() {
        const stage = stageRef.current!;
        const dpr = window.devicePixelRatio;
        const size = { width: stage.clientWidth, height: stage.clientHeight };
        const width = Math.round(size.width * dpr);
        const height = Math.round(size.height * dpr);
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        return { size, dpr };
      },
      onFinish: finish,
    });
    setController(made);
    void made.open();
    const onVisibility = () => document.visibilityState === 'hidden' && made.pause();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      made.dispose();
    };
  }, [lesson]);

  return (
    <div className="practice">
      <div ref={stageRef} className="stage">
        <video
          ref={videoRef}
          className={`stage-video${view === 'performer' ? ' mirrored' : ''}${settings.dimVideo ? ' dimmed' : ''}`}
          muted
          playsInline
        />
        <canvas ref={canvasRef} className="stage-canvas" />
        {controller && <ControllerView controller={controller} lesson={lesson} view={view} onView={setView} />}
      </div>
    </div>
  );
}

function ControllerView({
  controller,
  lesson,
  view,
  onView,
}: {
  controller: PracticeController;
  lesson: LessonDef;
  view: View;
  onView(view: View): void;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const navigate = useNavigate();
  const changeView = (next: View) => {
    onView(next);
    controller.setView(next);
    appStore.getState().updateSettings({ view: next });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') navigate('/');
      if (event.key !== ' ') return;
      event.preventDefault();
      if (controller.getState().phase === 'ready') controller.start();
      else controller.togglePause();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller, navigate]);

  return (
    <>
      <HudBar lesson={lesson} hud={state.hud} />
      <Overlay controller={controller} state={state} lesson={lesson} />
      <Controls controller={controller} state={state} view={view} onView={changeView} />
    </>
  );
}

export function PracticeScreen() {
  const { lessonId = '' } = useParams();
  const lesson = useApp(state => lessonById(state, lessonId));
  const unlocked = useApp(state => state.progress.isUnlocked(lessonId));
  if (!lesson) {
    return (
      <div className="screen-message panel stack">
        <p>There's no lesson called "{lessonId}".</p>
        <Link className="btn" to="/">
          Back to the library
        </Link>
      </div>
    );
  }
  if (!unlocked) {
    return (
      <div className="screen-message panel stack">
        <p>{lesson.name} unlocks once you've earned more stars in the tier before it.</p>
        <Link className="btn" to="/">
          Back to the library
        </Link>
      </div>
    );
  }
  return <PracticeSession key={lesson.id} lesson={lesson} />;
}
