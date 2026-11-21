import { type ChangeEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { LessonPreview } from '../../components/LessonPreview';
import { useEnv } from '../../envContext';
import { exportLesson, fileNameFor, importLesson } from '../../lessons/exchange';
import type { LessonDef } from '../../lessons/schema';
import type { Tier } from '../../progression/types';
import { STARS_PER_LESSON, TIERS, UNLOCK_SHARE } from '../../progression/unlocks';
import { appStore, useApp } from '../../state/appStore';
import { starsText } from '../progress/format';
import { TIER_NAMES } from '../progress/ProgressScreen';

function MyMoveActions({ lesson }: { lesson: LessonDef }) {
  const env = useEnv();
  return (
    <div className="row my-move-actions">
      <button
        type="button"
        className="btn ghost small"
        onClick={() => void env.saveFile(fileNameFor(lesson), exportLesson(lesson))}
      >
        Export
      </button>
      <button
        type="button"
        className="btn ghost small danger"
        onClick={() => {
          if (window.confirm(`Delete "${lesson.name}"? Its practice history stays.`)) {
            void appStore.getState().removeLesson(lesson.id);
          }
        }}
      >
        Delete
      </button>
    </div>
  );
}

function ImportButton() {
  const lessons = useApp(state => state.lessons);
  const [error, setError] = useState<string | null>(null);
  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const result = importLesson(await file.text(), new Set(lessons.map(l => l.id)));
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    await appStore.getState().saveLesson(result.lesson);
  };
  return (
    <>
      <label className="btn small">
        Import
        <input type="file" accept=".json,application/json" hidden aria-label="Import a lesson" onChange={onFile} />
      </label>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function LessonCard({ lesson, locked }: { lesson: LessonDef; locked: boolean }) {
  const best = useApp(state => state.progress.lessons[lesson.id]);
  const palette = useApp(state => state.settings.palette);
  const navigate = useNavigate();
  return (
    <article className={`lesson-card${locked ? ' locked' : ''}`} aria-label={lesson.name}>
      <LessonPreview lesson={lesson} palette={palette} />
      <div className="lesson-card-body">
        <h3>{lesson.name}</h3>
        <p className="muted">{lesson.description}</p>
        <div className="row lesson-card-meta">
          <span className="chip">{lesson.timing.bpm} bpm</span>
          {best ? (
            <span className="chip" title={`Best: ${Math.round(best.bestAccuracy)}%`}>
              {best.bestGrade} · <span className="stars">{starsText(best.stars)}</span>
            </span>
          ) : (
            <span className="chip faint">New</span>
          )}
          <span className="spacer" />
          <button
            type="button"
            className="btn primary small"
            disabled={locked}
            onClick={() => navigate(`/practice/${lesson.id}`)}
          >
            {locked ? 'Locked' : best ? 'Practice' : 'Learn'}
          </button>
        </div>
        {lesson.origin !== 'builtin' && <MyMoveActions lesson={lesson} />}
      </div>
    </article>
  );
}

/** The move library: every tier, what's unlocked, and the performer's own moves. */
export function HomeScreen() {
  const lessons = useApp(state => state.lessons);
  const progress = useApp(state => state.progress);
  const builtin = lessons.filter(lesson => lesson.origin === 'builtin');
  const mine = lessons.filter(lesson => lesson.origin !== 'builtin');
  const next = builtin.find(lesson => progress.isUnlocked(lesson.id) && !progress.lessons[lesson.id]);

  return (
    <div className="library stack">
      <section className="hero panel">
        <div className="stack">
          <h1>Learn to glove</h1>
          <p className="muted">
            Your webcam is the receiver. Put each fingertip in its ring and follow the lights. Every ring glows when
            you're on it.
          </p>
        </div>
        {next && (
          <Link className="btn primary" to={`/practice/${next.id}`}>
            Next up: {next.name}
          </Link>
        )}
      </section>

      {TIERS.map((tier: Tier) => {
        const inTier = builtin.filter(lesson => lesson.tier === tier);
        const { unlocked, starsEarned, starsPossible } = progress.tiers[tier];
        const previous = tier > 1 ? progress.tiers[(tier - 1) as Tier] : null;
        const needed = previous
          ? Math.max(0, Math.ceil(previous.starsPossible * UNLOCK_SHARE) - previous.starsEarned)
          : 0;
        return (
          <section key={tier} className="tier stack" aria-label={`Tier ${tier}: ${TIER_NAMES[tier]}`}>
            <div className="row tier-head">
              <h2>
                Tier {tier} · {TIER_NAMES[tier]}
              </h2>
              <span className="chip">
                {starsEarned} / {starsPossible} ★
              </span>
              {!unlocked && (
                <span className="faint">
                  Earn {needed} more ★ in tier {tier - 1} to unlock
                </span>
              )}
            </div>
            <div className="lesson-grid">
              {inTier.map(lesson => (
                <LessonCard key={lesson.id} lesson={lesson} locked={!unlocked} />
              ))}
            </div>
          </section>
        );
      })}

      <section className="tier stack" aria-label="My moves">
        <div className="row tier-head">
          <h2>My moves</h2>
          <span className="chip">{mine.length}</span>
          <span className="spacer" />
          <ImportButton />
          <Link className="btn small" to="/record">
            Record a move
          </Link>
        </div>
        {mine.length === 0 ? (
          <p className="faint">
            Perform a move on camera and GloveBox turns it into a lesson you can practice. Up to {STARS_PER_LESSON}{' '}
            stars each, like any other.
          </p>
        ) : (
          <div className="lesson-grid">
            {mine.map(lesson => (
              <LessonCard key={lesson.id} lesson={lesson} locked={false} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
