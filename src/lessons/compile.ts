/**
 * A lesson, ready to play: where every light should be at any beat. The
 * motion loops forever, before beat 0 too (the count-in shows the start).
 */

import type { Rect } from '../core/coords';
import type { Pose10 } from '../core/types';
import { mod } from '../core/vec';
import { compileGen } from './generators';
import type { LessonDef } from './schema';
import { trackPose } from './track';

export interface LessonMotion {
  /** Beats in one loop. */
  periodBeats: number;
  /** The lights at `beat` (lesson units). Slots the lesson doesn't use are null. */
  pose(beat: number): Pose10;
  /** Beats within a loop where the move hits something: tut corners, "hit" cues. */
  keyBeats: number[];
  /** Everywhere the lights go over a loop. */
  bounds: Rect;
}

/** How finely the bounds are sampled over a loop. */
const BOUNDS_SAMPLES = 240;

export function boundsOf(pose: (beat: number) => Pose10, periodBeats: number): Rect {
  const rect = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (let i = 0; i < BOUNDS_SAMPLES; i++) {
    for (const p of pose((i / BOUNDS_SAMPLES) * periodBeats)) {
      if (!p) continue;
      rect.minX = Math.min(rect.minX, p.x);
      rect.maxX = Math.max(rect.maxX, p.x);
      rect.minY = Math.min(rect.minY, p.y);
      rect.maxY = Math.max(rect.maxY, p.y);
    }
  }
  return rect;
}

export function compile(lesson: LessonDef): LessonMotion {
  const active = new Set<number>(lesson.activeSlots);
  const only = (pose: Pose10): Pose10 => pose.map((p, slot) => (active.has(slot) ? p : null));

  let periodBeats: number;
  let raw: (beat: number) => Pose10;
  let keyBeats: number[];
  if (lesson.motion.kind === 'generator') {
    const gen = compileGen(lesson.motion.spec, lesson.nominalSpan);
    periodBeats = lesson.timing.beatsPerLoop;
    raw = beat => gen.pose(mod(beat, periodBeats) / periodBeats);
    keyBeats = gen.keyPhases.map(phase => phase * periodBeats);
  } else {
    const track = lesson.motion.track;
    periodBeats = track.frames.length / track.samplesPerBeat;
    raw = beat => trackPose(track, beat * track.samplesPerBeat);
    keyBeats = [];
  }
  const cueBeats = lesson.cues.filter(cue => cue.kind === 'hit').map(cue => mod(cue.beat, periodBeats));
  const pose = (beat: number) => only(raw(beat));
  return {
    periodBeats,
    pose,
    keyBeats: [...new Set([...keyBeats, ...cueBeats])].sort((a, b) => a - b),
    bounds: boundsOf(pose, periodBeats),
  };
}
