import { useMemo } from 'react';
import { stageToScreen } from '../core/coords';
import { SLOTS } from '../core/types';
import { compile } from '../lessons/compile';
import type { LessonDef } from '../lessons/schema';
import { type Palette, slotColor } from '../render/palette';

const SAMPLES = 72;
const WIDTH = 160;
const HEIGHT = 100;

/** Each light's path over one loop: a lesson's move at a glance. */
export function LessonPreview({ lesson, palette = 'rainbow' }: { lesson: LessonDef; palette?: Palette }) {
  const paths = useMemo(() => {
    const motion = compile(lesson);
    const { minX, maxX, minY, maxY } = motion.bounds;
    // Fit the move's bounds into the box, with a margin
    const scale = Math.min((WIDTH * 0.84) / (maxX - minX), (HEIGHT * 0.8) / (maxY - minY));
    // A square frame `scale` tall, centered: stage units straight to pixels
    const rect = { left: WIDTH / 2 - scale / 2, top: HEIGHT / 2 - scale / 2, width: scale, height: scale };
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const poses = Array.from({ length: SAMPLES + 1 }, (_, i) => motion.pose((i / SAMPLES) * motion.periodBeats));
    return SLOTS.filter(slot => poses[0]![slot]).map(slot => ({
      slot,
      d: poses
        .map((pose, i) => {
          const p = stageToScreen({ x: pose[slot]!.x - cx, y: pose[slot]!.y - cy }, rect, 'performer');
          return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
        })
        .join(' '),
    }));
  }, [lesson]);
  return (
    <svg className="lesson-preview" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
      {paths.map(({ slot, d }) => (
        <path key={slot} d={d} stroke={slotColor(slot, palette)} />
      ))}
    </svg>
  );
}
