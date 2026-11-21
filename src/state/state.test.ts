import { describe, expect, test, vi } from 'vitest';
import { BUILTIN_LESSONS } from '../lessons/builtin';
import type { LessonDef } from '../lessons/schema';
import { createLocalStorage } from '../storage/localStorageStorage';
import type { Storage } from '../storage/types';
import { session, lesson as storedLesson } from '../test/storageContract';
import { allLessons, appStore, catalogOf, createAppStore, lessonById, SETTINGS_KEY, useApp } from './appStore';
import { DEFAULT_SETTINGS, parseSettings, TEMPOS } from './settings';

const NOW = new Date(2026, 10, 21, 12).getTime();
const myLesson: LessonDef = { ...BUILTIN_LESSONS[0]!, id: 'my-rolls', name: 'My rolls', origin: 'recorded' };

describe('settings', () => {
  test('nothing saved means every default', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('garbage')).toEqual(DEFAULT_SETTINGS);
  });

  test('each saved field is kept if it reads, defaulted if it does not', () => {
    const settings = parseSettings({
      tracker: 'dark',
      view: 'sideways',
      tempo: 0.75,
      handFit: { center: { x: 0, y: 0 }, span: 0.2 },
      darkCalibration: { thresholds: [1, 2] },
      unknownField: 1,
    });
    expect(settings.tracker).toBe('dark');
    expect(settings.view).toBe('performer');
    expect(settings.tempo).toBe(0.75);
    expect(settings.handFit?.span).toBe(0.2);
    expect(settings.darkCalibration).toEqual({ thresholds: [1, 2] });
    expect(settings).not.toHaveProperty('unknownField');
    expect(TEMPOS).toContain(1);
  });
});

describe('the app store', () => {
  test('starts empty and not ready', () => {
    const store = createAppStore();
    expect(store.getState()).toMatchObject({ ready: false, loadError: null, userLessons: [], sessions: [] });
    expect(store.getState().progress.totals.sessions).toBe(0);
  });

  test('loads settings, lessons and sessions, skipping lessons that no longer read', async () => {
    const storage = createLocalStorage(null);
    await storage.settings.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, difficulty: 'hard' });
    await storage.lessons.save(storedLesson({ id: 'my-rolls', def: myLesson }));
    await storage.lessons.save(storedLesson({ id: 'broken', def: { nope: true } }));
    await storage.sessions.add(session({ lessonId: 'finger-rolls', stars: 3, accuracy: 95, grade: 'S' }));

    const store = createAppStore();
    await store.getState().init(storage, () => NOW);
    const state = store.getState();
    expect(state.ready).toBe(true);
    expect(state.settings.difficulty).toBe('hard');
    expect(state.userLessons.map(l => l.id)).toEqual(['my-rolls']);
    expect(state.sessions).toHaveLength(1);
    expect(state.progress.lessons['finger-rolls']?.stars).toBe(3);
    expect(allLessons(state)).toHaveLength(BUILTIN_LESSONS.length + 1);
    expect(state.lessons.map(l => l.id)).toEqual(allLessons(state).map(l => l.id));
    expect(lessonById(state, 'my-rolls')?.name).toBe('My rolls');
    expect(lessonById(state, 'tut-box')?.tier).toBe(3);
    expect(catalogOf([myLesson])).toEqual([{ id: 'my-rolls', name: 'My rolls', tier: 1, origin: 'recorded' }]);
  });

  test('a storage that fails to load says why', async () => {
    const storage = createLocalStorage(null);
    storage.sessions.list = () => Promise.reject(new Error('disk on fire'));
    const store = createAppStore();
    await store.getState().init(storage);
    expect(store.getState()).toMatchObject({ ready: true, loadError: 'Error: disk on fire' });
  });

  test('settings change at once and save behind', async () => {
    const storage = createLocalStorage(null);
    const store = createAppStore();
    await store.getState().init(storage);
    store.getState().updateSettings({ view: 'receiver' });
    expect(store.getState().settings.view).toBe('receiver');
    await vi.waitFor(async () =>
      expect((await storage.settings.get<{ view: string }>(SETTINGS_KEY))?.view).toBe('receiver')
    );
  });

  test('a settings save that fails only warns', async () => {
    const storage: Storage = createLocalStorage(null);
    storage.settings.set = () => Promise.reject(new Error('read-only'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = createAppStore();
    await store.getState().init(storage);
    store.getState().updateSettings({ palette: 'colorblind' });
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    warn.mockRestore();
  });

  test('before loading, changes stay in memory', async () => {
    const store = createAppStore();
    store.getState().updateSettings({ metronome: false });
    await store.getState().addSession(session());
    await store.getState().saveLesson(myLesson);
    await store.getState().removeLesson('nothing');
    expect(store.getState().settings.metronome).toBe(false);
    expect(store.getState().sessions).toHaveLength(1);
    expect(store.getState().userLessons).toHaveLength(1);
  });

  test('a new session is saved and counted in progress', async () => {
    const storage = createLocalStorage(null);
    const store = createAppStore();
    await store.getState().init(storage, () => NOW);
    await store.getState().addSession(session({ lessonId: 'slow-circles', accuracy: 80, stars: 2, grade: 'B' }));
    expect(await storage.sessions.list()).toHaveLength(1);
    expect(store.getState().progress.lessons['slow-circles']?.plays).toBe(1);
  });

  test('saving a lesson adds or replaces it; removing takes it out', async () => {
    const storage = createLocalStorage(null);
    const store = createAppStore();
    await store.getState().init(storage, () => NOW);
    await store.getState().saveLesson(myLesson);
    await store.getState().saveLesson({ ...myLesson, name: 'Renamed' });
    await store.getState().saveLesson({ ...myLesson, id: 'imported-wave', origin: 'imported' });
    expect(store.getState().userLessons.map(l => [l.id, l.name])).toEqual([
      ['imported-wave', 'My rolls'],
      ['my-rolls', 'Renamed'],
    ]);
    expect((await storage.lessons.get('imported-wave'))?.origin).toBe('imported');
    expect((await storage.lessons.get('my-rolls'))?.createdAt).toBe(NOW);
    await store.getState().removeLesson('my-rolls');
    expect(store.getState().userLessons.map(l => l.id)).toEqual(['imported-wave']);
    expect(await storage.lessons.get('my-rolls')).toBeNull();
  });

  test('the shared store and its hook exist', () => {
    expect(appStore.getState().ready).toBe(false);
    expect(typeof useApp).toBe('function');
  });
});
