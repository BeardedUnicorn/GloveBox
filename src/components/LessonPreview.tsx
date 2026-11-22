import { useId, useMemo } from 'react';
import { stageToScreen } from '../core/coords';
import { FINGERS, fingerOf, SLOTS, type Slot, type Vec2 } from '../core/types';
import { clamp, mod } from '../core/vec';
import { compile } from '../lessons/compile';
import type { LessonDef } from '../lessons/schema';
import { glowStops } from '../render/glowSprites';
import { PALETTES, type Palette, slotColor } from '../render/palette';

const WIDTH = 160;
const HEIGHT = 100;

/** Samples per beat: fine enough that a tut's eased steps stay crisp between them. */
const SAMPLES_PER_BEAT = 16;
const MIN_SAMPLES = 64;
const MAX_SAMPLES = 480;

/** Each light and the copies trailing it, drawn oldest first so the light itself is on top. */
const TRAIL = [
  { lagBeats: 0.24, r: 3.4, opacity: 0.22 },
  { lagBeats: 0.16, r: 4, opacity: 0.36 },
  { lagBeats: 0.08, r: 4.6, opacity: 0.55 },
  { lagBeats: 0, r: 5.4, opacity: 1 },
] as const;

/** A point as "x y": written once, read both as path data and as animateMotion's coordinate pairs. */
type Point = string;

const point = (p: Vec2): Point => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;

/** The trace through `points`, lifting the pen where the light is missing. */
function tracePath(points: (Point | null)[]): string {
  let down = false;
  const parts: string[] = [];
  for (const p of points) {
    if (p) parts.push(`${down ? 'L' : 'M'}${p}`);
    down = p !== null;
  }
  return parts.join(' ');
}

/** Every point, a missing one held where the light was last seen (round the loop). */
function held(points: (Point | null)[]): Point[] {
  let last = points.findLast(p => p !== null)!;
  return points.map(p => {
    last = p ?? last;
    return last;
  });
}

interface Light {
  slot: Slot;
  trace: string;
  /** animateMotion's values: where the light is at each sample, "x y;x y;…". */
  motion: string;
  /** Whether the light shows over each sample's interval; null when it never goes missing. */
  visibility: string | null;
}

/**
 * A lesson's move at a glance: each light's path over a loop, and the lights
 * playing it at the lesson's tempo, trails and all. The browser runs the
 * animation (SVG animateMotion), so the library draws nothing per frame.
 */
export function LessonPreview({ lesson, palette = 'rainbow' }: { lesson: LessonDef; palette?: Palette }) {
  const ids = useId().replace(/[^\w-]/g, '');
  const { lights, beatSeconds, loopSeconds, periodBeats } = useMemo(() => {
    const motion = compile(lesson);
    const { minX, maxX, minY, maxY } = motion.bounds;
    // Fit the move's bounds into the box, with a margin
    const scale = Math.min((WIDTH * 0.84) / (maxX - minX), (HEIGHT * 0.8) / (maxY - minY));
    // A square frame `scale` tall, centered: stage units straight to pixels
    const rect = { left: WIDTH / 2 - scale / 2, top: HEIGHT / 2 - scale / 2, width: scale, height: scale };
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const samples = clamp(Math.round(motion.periodBeats * SAMPLES_PER_BEAT), MIN_SAMPLES, MAX_SAMPLES);
    // samples + 1 poses: the last is the first again, closing the loop
    const poses = Array.from({ length: samples + 1 }, (_, i) => motion.pose((i / samples) * motion.periodBeats));
    const lights: Light[] = SLOTS.flatMap(slot => {
      const points = poses.map(pose => {
        const p = pose[slot];
        return p ? point(stageToScreen({ x: p.x - cx, y: p.y - cy }, rect, 'performer')) : null;
      });
      if (!points.some(p => p !== null)) return [];
      // One per sample's interval: the closing point only ends the last one
      const shown = points.slice(0, -1).map(p => (p ? 'visible' : 'hidden'));
      return [
        {
          slot,
          trace: tracePath(points),
          motion: held(points).join(';'),
          visibility: shown.includes('hidden') ? shown.join(';') : null,
        },
      ];
    });
    const beatSeconds = 60 / lesson.timing.bpm;
    return { lights, beatSeconds, loopSeconds: motion.periodBeats * beatSeconds, periodBeats: motion.periodBeats };
  }, [lesson]);

  const dur = `${loopSeconds.toFixed(3)}s`;
  // Starting a copy part-way through the loop puts it where the light was `lagBeats` ago
  const beginFor = (lagBeats: number) => `${(-mod(-lagBeats, periodBeats) * beatSeconds).toFixed(3)}s`;
  const glowId = (finger: number) => `${ids}-glow-${finger}`;

  return (
    <svg className="lesson-preview" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
      <defs>
        {FINGERS.map(finger => (
          <radialGradient key={finger} id={glowId(finger)}>
            {glowStops(PALETTES[palette][finger]!).map(([offset, color]) => (
              <stop key={offset} offset={offset} stopColor={color} />
            ))}
          </radialGradient>
        ))}
      </defs>
      <g className="lesson-preview-trace">
        {lights.map(({ slot, trace }) => (
          <path key={slot} d={trace} stroke={slotColor(slot, palette)} />
        ))}
      </g>
      <g className="lesson-preview-lights">
        {TRAIL.flatMap(({ lagBeats, r, opacity }) => {
          const begin = beginFor(lagBeats);
          return lights.map(({ slot, motion, visibility }) => (
            <circle key={`${slot}-${lagBeats}`} r={r} opacity={opacity} fill={`url(#${glowId(fingerOf(slot))})`}>
              <animateMotion values={motion} dur={dur} begin={begin} calcMode="linear" repeatCount="indefinite" />
              {visibility && (
                <animate
                  attributeName="visibility"
                  values={visibility}
                  dur={dur}
                  begin={begin}
                  calcMode="discrete"
                  repeatCount="indefinite"
                />
              )}
            </circle>
          ));
        })}
      </g>
    </svg>
  );
}
