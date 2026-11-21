import { screen } from '@testing-library/react';
import { expect, test } from 'vitest';

test('the app starts in #root and opens on the library', async () => {
  document.body.innerHTML = '<div id="root"></div>';
  await import('./main');
  expect(await screen.findByRole('heading', { name: 'Learn to glove' })).toBeInTheDocument();
});
