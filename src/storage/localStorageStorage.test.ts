import { afterEach, describe, expect, test, vi } from 'vitest';
import { session, storageContract } from '../test/storageContract';
import { createLocalStorage, type KeyValueStore, pageLocalStorage } from './localStorageStorage';

class MapStore implements KeyValueStore {
  readonly items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}

storageContract('localStorage', now => createLocalStorage(new MapStore(), now));
storageContract('memory only (no localStorage)', now => createLocalStorage(null, now));

describe('localStorage storage', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('keeps data under glovebox: keys, where the next visit finds it', async () => {
    const store = new MapStore();
    await createLocalStorage(store).settings.set('view', 'receiver');
    await createLocalStorage(store).sessions.add(session());
    expect([...store.items.keys()].sort()).toEqual(['glovebox:kv:view', 'glovebox:sessions']);
    const later = createLocalStorage(store);
    expect(await later.settings.get('view')).toBe('receiver');
    expect(await later.sessions.list()).toEqual([session()]);
  });

  test('something unreadable in the store counts as nothing', async () => {
    const store = new MapStore();
    store.setItem('glovebox:kv:view', '{not json');
    store.setItem('glovebox:sessions', 'oops');
    const storage = createLocalStorage(store);
    expect(await storage.settings.get('view')).toBeNull();
    expect(await storage.sessions.list()).toEqual([]);
  });

  test('a store that throws is worked around from memory', async () => {
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const storage = createLocalStorage(throwing);
    expect(await storage.settings.get('view')).toBeNull();
    await storage.settings.set('view', 'performer');
    expect(await storage.settings.get('view')).toBe('performer');
  });

  test("the page's localStorage, when there is one", () => {
    const store = new MapStore();
    vi.stubGlobal('localStorage', store);
    expect(pageLocalStorage()).toBe(store);
    vi.stubGlobal('localStorage', undefined);
    expect(pageLocalStorage()).toBeNull();
  });

  test('a localStorage that throws when touched counts as none', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    try {
      expect(pageLocalStorage()).toBeNull();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  test('uses the page localStorage by default', async () => {
    const store = new MapStore();
    vi.stubGlobal('localStorage', store);
    await createLocalStorage().settings.set('k', 1);
    expect(store.items.get('glovebox:kv:k')).toBe('1');
  });
});
