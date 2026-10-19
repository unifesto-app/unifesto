import React from 'react';
import { TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { Heart } from '@unifesto/unicon/react-native';
import { useFavorites } from '../context/FavoritesContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useRouter } from 'expo-router';
import { AppAlert } from './ui/AppAlert';

interface FavoriteButtonProps {
  eventId: string;
  size?: number;
  /** Show a translucent circular backdrop (for use over event banners). */
  scrim?: boolean;
  /** Tint for the unfavourited (outline) state. Defaults to the theme text
   *  colour, or white when `scrim` is set. Use to match a specific header. */
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A heart toggle backed by FavoritesContext. Filled + primary when favourited,
 * outline otherwise. Optimistic — the context handles the server round-trip and
 * rolls back on failure, so the tap feels instant.
 */
export default function FavoriteButton({
  eventId,
  size = 22,
  scrim = false,
  color,
  style,
}: FavoriteButtonProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const { isAuthenticated } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();
  const favorited = isFavorite(eventId);

  const handlePress = () => {
    if (!isAuthenticated) {
      AppAlert.alert('Sign in to save events', 'Your saved events follow you to any device.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Sign in', onPress: () => router.push('/login') },
      ]);
      return;
    }
    toggleFavorite(eventId);
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={favorited ? 'Remove from favourites' : 'Add to favourites'}
      accessibilityState={{ selected: favorited }}
      style={[
        scrim && {
          padding: 8,
          borderRadius: 999,
          backgroundColor: 'rgba(0,0,0,0.4)',
        },
        style,
      ]}
    >
      <Heart
        size={size}
        weight={favorited ? 'fill' : 'regular'}
        color={favorited ? colors.error : color ?? (scrim ? '#ffffff' : colors.text)}
      />
    </TouchableOpacity>
  );
}
