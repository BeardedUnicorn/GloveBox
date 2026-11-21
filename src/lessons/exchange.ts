/** Lessons as `.glovebox.json` files, to share. */

import { slugFor } from './recording/toLesson';
import { type LessonDef, parseLesson } from './schema';

export const fileNameFor = (lesson: LessonDef): string => `${lesson.id}.glovebox.json`;

export const exportLesson = (lesson: LessonDef): string => `${JSON.stringify(lesson, null, 2)}\n`;

/**
 * A lesson from a file's text, ready to keep: marked imported, and given a
 * new id if one in the library already has it. Or why it can't be read.
 */
export function importLesson(
  text: string,
  taken: ReadonlySet<string>
): { ok: true; lesson: LessonDef } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't a GloveBox lesson (it isn't JSON)." };
  }
  const parsed = parseLesson(json);
  if (!parsed.ok) return { ok: false, error: `That file isn't a GloveBox lesson (${parsed.error}).` };
  const lesson = parsed.lesson;
  const id = taken.has(lesson.id) ? slugFor(lesson.name, taken) : lesson.id;
  return { ok: true, lesson: { ...lesson, id, origin: 'imported' } };
}
