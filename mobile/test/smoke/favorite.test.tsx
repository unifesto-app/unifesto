import { expect, jest, test } from '@jest/globals';
import { render } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';
import FavoriteButton from '../../src/components/FavoriteButton';

// Outline icons have no filled heart: colour is the only on/off signal, so it must differ.
let mockSaved = false;
jest.mock('../../src/context/FavoritesContext', () => ({
  useFavorites: () => ({ isFavorite: () => mockSaved, toggleFavorite: () => {}, saveAfterSignIn: () => {} }),
}));
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true }) }));

type Node = { type: string; props: { style?: unknown }; children?: (Node | string)[] | null };
const findImage = (n: Node | string | null): Node | null => {
  if (!n || typeof n === 'string') return null;
  if (n.type === 'Image') return n;
  for (const child of n.children ?? []) { const hit = findImage(child); if (hit) return hit; }
  return null;
};
const heartTint = async () => {
  const screen = await render(<FavoriteButton eventId="e1" color="#123456" />);
  return (StyleSheet.flatten(findImage(screen.toJSON() as Node)?.props.style as object) as { tintColor?: string })?.tintColor;
};

test('a saved heart is a different colour from an unsaved one', async () => {
  mockSaved = false;
  const off = await heartTint();
  mockSaved = true;
  const on = await heartTint();
  expect(off).toBe('#123456');
  expect(on).not.toBe(off);
});
