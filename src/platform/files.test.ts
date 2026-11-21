import { afterEach, describe, expect, test, vi } from 'vitest';
import { download, type FileDeps, saveTextFile } from './files';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const deps = (overrides: Partial<FileDeps> = {}): FileDeps => ({
  isTauri: () => false,
  save: vi.fn(async () => '/Users/me/my-wave.glovebox.json'),
  writeTextFile: vi.fn(async () => {}),
  download: vi.fn(),
  ...overrides,
});

describe('saving a file', () => {
  test('in a browser, it downloads', async () => {
    const d = deps();
    expect(await saveTextFile('my-wave.glovebox.json', '{}', d)).toBe(true);
    expect(d.download).toHaveBeenCalledWith('my-wave.glovebox.json', '{}');
    expect(d.save).not.toHaveBeenCalled();
  });

  test('in the app, it asks where with the Save dialog, then writes there', async () => {
    const d = deps({ isTauri: () => true });
    expect(await saveTextFile('my-wave.glovebox.json', '{"a":1}', d)).toBe(true);
    expect(d.save).toHaveBeenCalledWith({
      defaultPath: 'my-wave.glovebox.json',
      filters: [{ name: 'GloveBox lesson', extensions: ['json'] }],
    });
    expect(d.writeTextFile).toHaveBeenCalledWith('/Users/me/my-wave.glovebox.json', '{"a":1}');
    expect(d.download).not.toHaveBeenCalled();
  });

  test('cancelling the Save dialog writes nothing', async () => {
    const d = deps({ isTauri: () => true, save: vi.fn(async () => null) });
    expect(await saveTextFile('x.json', '{}', d)).toBe(false);
    expect(d.writeTextFile).not.toHaveBeenCalled();
  });
});

function stubDocument() {
  const link = { href: '', download: '', click: vi.fn() };
  vi.stubGlobal('document', { createElement: vi.fn(() => link) });
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:lesson');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  return { link, create, revoke };
}

describe('a download', () => {
  test('clicks a temporary link to the text as JSON, then lets the link go', async () => {
    const { link, create, revoke } = stubDocument();
    download('my-wave.glovebox.json', '{"a":1}');
    const blob = create.mock.calls[0]![0] as Blob;
    expect(blob.type).toBe('application/json');
    expect(await blob.text()).toBe('{"a":1}');
    expect(link).toMatchObject({ href: 'blob:lesson', download: 'my-wave.glovebox.json' });
    expect(link.click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:lesson');
  });

  test('outside the app, saving downloads by default', async () => {
    const { link } = stubDocument();
    expect(await saveTextFile('x.json', '{}')).toBe(true);
    expect(link.click).toHaveBeenCalled();
  });
});
