import { Link, useParams } from 'react-router';
import { FINGER_NAMES, SLOTS, type Slot } from '../../core/types';
import { BUILTIN_LESSONS } from '../../lessons/builtin';
import { slotColor } from '../../render/palette';
import { lessonById, useApp } from '../../state/appStore';
import { lagText } from '../practice/PracticeScreen';
import { formatDuration, percent, starsText } from '../progress/format';

const GRADE_WORDS = { S: 'Flawless', A: 'Great', B: 'Good', C: 'Getting there', D: 'Keep at it' } as const;

/** Where to go next: the next built-in lesson, if it's open. */
function useNextLesson(lessonId: string) {
  const isUnlocked = useApp(state => state.progress.isUnlocked);
  const index = BUILTIN_LESSONS.findIndex(lesson => lesson.id === lessonId);
  const next = index >= 0 ? BUILTIN_LESSONS[index + 1] : undefined;
  return next && isUnlocked(next.id) ? next : null;
}

function Hand({ label, slots, perFinger }: { label: string; slots: readonly Slot[]; perFinger: (number | null)[] }) {
  const palette = useApp(state => state.settings.palette);
  return (
    <div className="stack hand-result">
      <h4>{label}</h4>
      {slots.map(slot => {
        const value = perFinger[slot] as number | null;
        return (
          <div key={slot} className="finger-row">
            <span className="finger-name">{FINGER_NAMES[slot % 5]}</span>
            {value === null ? (
              <span className="faint">not in this move</span>
            ) : (
              <>
                <span className="finger-bar" aria-label={`${label} ${FINGER_NAMES[slot % 5]} ${percent(value)}`}>
                  <span style={{ width: `${Math.round(value)}%`, background: slotColor(slot, palette) }} />
                </span>
                <span className="mono">{percent(value)}</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ResultsScreen() {
  const { sessionId = '' } = useParams();
  const session = useApp(state => state.sessions.find(s => s.id === sessionId));
  const lesson = useApp(state => (session ? lessonById(state, session.lessonId) : undefined));
  const next = useNextLesson(session?.lessonId ?? '');
  if (!session) {
    return (
      <div className="screen-message panel stack">
        <p>That session isn't saved here.</p>
        <Link className="btn" to="/">
          Back to the library
        </Link>
      </div>
    );
  }
  return (
    <div className="results stack">
      <section className="panel results-hero">
        <div className={`grade grade-${session.grade}`} aria-label={`Grade ${session.grade}`}>
          {session.grade}
        </div>
        <div className="stack">
          <h1>{GRADE_WORDS[session.grade]}</h1>
          <p className="muted">{lesson?.name ?? session.lessonId}</p>
          <div className="stars big" aria-label={`${session.stars} of 3 stars`}>
            {starsText(session.stars)}
          </div>
        </div>
        <dl className="results-stats">
          <div>
            <dt>Accuracy</dt>
            <dd>{percent(session.accuracy)}</dd>
          </div>
          <div>
            <dt>Best combo</dt>
            <dd>{session.maxCombo} beats</dd>
          </div>
          <div>
            <dt>Timing</dt>
            <dd>{lagText(session.meanLagMs)}</dd>
          </div>
          <div>
            <dt>Practiced</dt>
            <dd>{formatDuration(session.durationMs)}</dd>
          </div>
        </dl>
      </section>
      <section className="panel row hands-result">
        <Hand label="Left hand" slots={SLOTS.slice(0, 5)} perFinger={session.perFinger} />
        <Hand label="Right hand" slots={SLOTS.slice(5)} perFinger={session.perFinger} />
      </section>
      <div className="row">
        <Link className="btn primary" to={`/practice/${session.lessonId}`}>
          Again
        </Link>
        {next && (
          <Link className="btn" to={`/practice/${next.id}`}>
            Next: {next.name}
          </Link>
        )}
        <Link className="btn ghost" to="/">
          Library
        </Link>
      </div>
    </div>
  );
}
