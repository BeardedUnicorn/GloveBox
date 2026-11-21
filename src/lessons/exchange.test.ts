import { describe, expect, test } from 'vitest';
import { BUILTIN_LESSONS } from './builtin';
import { exportLesson, fileNameFor, importLesson } from './exchange';
import type { LessonDef } from './schema';

const mine: LessonDef = { ...BUILTIN_LESSONS[0]!, id: 'my-rolls', name: 'My rolls', origin: 'recorded' };

describe('sharing lessons', () => {
  test('a lesson file is named after the lesson', () => {
    expect(fileNameFor(mine)).toBe('my-rolls.glovebox.json');
  });

  test('a lesson goes out as readable JSON and comes back the same, marked imported', () => {
    const text = exportLesson(mine);
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('\n  "id": "my-rolls"');
    expect(importLesson(text, new Set())).toEqual({ ok: true, lesson: { ...mine, origin: 'imported' } });
  });

  test('a lesson whose id is taken gets a new one from its name', () => {
    const result = importLesson(exportLesson(mine), new Set(['my-rolls']));
    expect(result).toMatchObject({ ok: true, lesson: { id: 'my-rolls-2', name: 'My rolls' } });
  });

  test("a file that isn't JSON says so", () => {
    expect(importLesson('not json {', new Set())).toEqual({
      ok: false,
      error: "That file isn't a GloveBox lesson (it isn't JSON).",
    });
  });

  test("JSON that isn't a lesson says what's wrong", () => {
    const result = importLesson(JSON.stringify({ ...mine, tier: 9 }), new Set());
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/^That file isn't a GloveBox lesson \(tier: .+\)\.$/);
  });
});
