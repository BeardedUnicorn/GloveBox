/**
 * The performer's choices, kept between launches (storage key `settings`).
 * Whatever was saved is checked on the way in: a missing or unreadable
 * value falls back to its default, so an older or damaged save never
 * breaks the app.
 */

import { z } from 'zod';
import type { View } from '../core/coords';
import type { Difficulty } from '../progression/types';
import type { Palette } from '../render/palette';
import type { Delegate } from '../tracking/mediapipe/landmarker';
import type { HandFit } from '../tracking/types';

export type TrackerMode = 'lit' | 'dark';

export interface Settings {
  tracker: TrackerMode;
  view: View;
  difficulty: Difficulty;
  palette: Palette;
  /** The camera chosen in Settings; null for Automatic (camera.ts, openCamera). */
  cameraId: string | null;
  delegate: Delegate;
  tempo: number;
  showGhost: boolean;
  showSkeleton: boolean;
  metronome: boolean;
  dimVideo: boolean;
  /** Lit-mode calibration: the performer's hands. */
  handFit: HandFit | null;
  swapHandedness: boolean;
  /** Dark-mode calibration (tracking/blob/calibration.ts), kept as saved. */
  darkCalibration: unknown;
}

export const DEFAULT_SETTINGS: Settings = {
  tracker: 'lit',
  view: 'performer',
  difficulty: 'normal',
  palette: 'rainbow',
  cameraId: null,
  delegate: 'GPU',
  tempo: 1,
  showGhost: true,
  showSkeleton: false,
  metronome: true,
  dimVideo: true,
  handFit: null,
  swapHandedness: false,
  darkCalibration: null,
};

export const TEMPOS = [0.5, 0.75, 1, 1.25] as const;

const vec = z.object({ x: z.number(), y: z.number() });
const fields = {
  tracker: z.enum(['lit', 'dark']),
  view: z.enum(['performer', 'receiver']),
  difficulty: z.enum(['easy', 'normal', 'hard']),
  palette: z.enum(['rainbow', 'colorblind']),
  cameraId: z.string().nullable(),
  delegate: z.enum(['GPU', 'CPU']),
  tempo: z.number().min(0.25).max(2),
  showGhost: z.boolean(),
  showSkeleton: z.boolean(),
  metronome: z.boolean(),
  dimVideo: z.boolean(),
  handFit: z.object({ center: vec, span: z.number().positive() }).nullable(),
  swapHandedness: z.boolean(),
  darkCalibration: z.unknown(),
} satisfies Record<keyof Settings, z.ZodType>;

/** Saved settings, each field checked on its own: anything missing or wrong is its default. */
export function parseSettings(saved: unknown): Settings {
  const source = typeof saved === 'object' && saved !== null ? (saved as Record<string, unknown>) : {};
  const settings = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const [key, schema] of Object.entries(fields)) {
    const parsed = schema.safeParse(source[key]);
    if (parsed.success && parsed.data !== undefined) settings[key] = parsed.data;
  }
  return settings as unknown as Settings;
}
