/** A processed recording as a lesson the library can keep. */

import type { Tier } from '../../progression/types';
import { type LessonDef, lessonSchema } from '../schema';
import type { ProcessedRecording } from './process';

export interface RecordingDetails {
  name: string;
  tier: Tier;
  tags: string[];
  bpm: number;
  nominalSpan: number;
}

/** "My Wave!" → "my-wave", unique against `taken` ("my-wave-2"…). */
export function slugFor(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'my-move';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

export function recordingToLesson(recording: ProcessedRecording, details: RecordingDetails, id: string): LessonDef {
  return lessonSchema.parse({
    schemaVersion: 1,
    id,
    version: 1,
    name: details.name.trim() || 'My move',
    description: 'Recorded in GloveBox.',
    tier: details.tier,
    tags: details.tags,
    origin: 'recorded',
    timing: { bpm: details.bpm, beatsPerLoop: recording.beats, defaultLoops: 4, countInBeats: 4 },
    activeSlots: recording.activeSlots,
    nominalSpan: details.nominalSpan,
    motion: { kind: 'track', track: recording.track },
  });
}
