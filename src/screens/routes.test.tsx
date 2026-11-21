import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { renderApp } from '../test/renderApp';
import { session } from '../test/storageContract';
import { LAST_SEEN_VERSION_KEY } from '../updates/useUpdatedNotice';

// A version an update could have come from
vi.mock('../updates/version', async importOriginal => ({
  ...(await importOriginal<typeof import('../updates/version')>()),
  APP_VERSION: '1.0.0',
}));

describe('around every screen', () => {
  test('after an update, a notice links to what is new', async () => {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, '0.9.0');
    const { router } = await renderApp('/progress', { sessions: [session()] });
    expect(screen.getByRole('heading', { name: 'Progress' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /what's new/i }));
    expect(router.state.location.pathname).toBe('/settings');
    expect(router.state.location.hash).toBe('#whats-new');
    localStorage.clear();
  });
});
