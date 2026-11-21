/** A Ctx2D that records what's drawn, for renderer tests. */

import type { Ctx2D } from '../render/ctx';

export type Call = [name: string, ...args: unknown[]];

export interface FakeCtx extends Ctx2D {
  calls: Call[];
  /** The calls of one kind. */
  named(name: string): unknown[][];
  /** Each value a property was set to, in order. */
  sets: Record<string, unknown[]>;
}

const METHODS = [
  'save',
  'restore',
  'setTransform',
  'clearRect',
  'beginPath',
  'moveTo',
  'lineTo',
  'arc',
  'stroke',
  'fill',
  'fillText',
  'drawImage',
] as const;

export function fakeCtx(): FakeCtx {
  const calls: Call[] = [];
  const sets: Record<string, unknown[]> = {};
  const values: Record<string, unknown> = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    strokeStyle: '#000',
    fillStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
  };
  const ctx = {
    calls,
    sets,
    named: (name: string) => calls.filter(call => call[0] === name).map(call => call.slice(1)),
    createRadialGradient: (...args: number[]) => {
      const stops: [number, string][] = [];
      calls.push(['createRadialGradient', ...args]);
      return { stops, addColorStop: (offset: number, color: string) => stops.push([offset, color]) };
    },
  } as unknown as FakeCtx;
  for (const method of METHODS) {
    (ctx as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => calls.push([method, ...args]);
  }
  for (const key of Object.keys(values)) {
    Object.defineProperty(ctx, key, {
      get: () => values[key],
      set: value => {
        values[key] = value;
        const seen = sets[key] ?? [];
        seen.push(value);
        sets[key] = seen;
      },
    });
  }
  return ctx;
}
