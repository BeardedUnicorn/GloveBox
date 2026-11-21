/** The running app's version (package.json's, via vite.config.ts), and comparing versions. */

export const APP_VERSION: string = __APP_VERSION__;

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

export const isVersion = (value: unknown): value is string => typeof value === 'string' && VERSION.test(value);

/** Negative when `a` is older than `b`, positive when newer, 0 when the same (both X.Y.Z). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = pa[i]! - pb[i]!;
    if (diff !== 0) return diff;
  }
  return 0;
}
