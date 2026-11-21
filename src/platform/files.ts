/**
 * Saving a lesson to a file the performer picks. In the app that's the
 * system Save dialog (the dialog plugin lets the fs plugin write only the
 * path chosen there); in a plain browser, a download.
 */

import { isTauri } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';

export interface FileDeps {
  isTauri(): boolean;
  save(options: { defaultPath: string; filters: { name: string; extensions: string[] }[] }): Promise<string | null>;
  writeTextFile(path: string, text: string): Promise<void>;
  download(name: string, text: string): void;
}

/** A download of `text` as `name`, from a temporary link. */
export function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export const defaultFileDeps: FileDeps = { isTauri, save, writeTextFile, download };

/** Saves `text` as `name` (or where the performer puts it): false if they cancelled. */
export async function saveTextFile(name: string, text: string, deps: FileDeps = defaultFileDeps): Promise<boolean> {
  if (!deps.isTauri()) {
    deps.download(name, text);
    return true;
  }
  const path = await deps.save({ defaultPath: name, filters: [{ name: 'GloveBox lesson', extensions: ['json'] }] });
  if (!path) return false;
  await deps.writeTextFile(path, text);
  return true;
}
