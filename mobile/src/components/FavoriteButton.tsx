import React from 'react';
import { TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { Heart } from '@unifesto/unicon/react-native';
import { useFavorites } from '../context/FavoritesContext';
import { useAuth } from '../context/AuthContext';
import { useCosmos } from '../theme/cosmos';
import { useRouter } from 'expo-router';
import { AppAlert } from './ui/AppAlert';

interface FavoriteButtonProps {
  eventId: string;
  size?: number;
  /** Tint for the unfavourited (outline) state. Defaults to the theme text
   *  colour. Use to match a specific header. */
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A bare heart toggle backed by FavoritesContext: filled when favourited,
 * outline otherwise, monochrome like every control. Optimistic: the context
 * handles the server round-trip and rolls back on failure, so the tap feels instant.
 */
export default function FavoriteButton({
  eventId,
  size = 22,
  color,
  style,
}: FavoriteButtonProps) {
  const router = useRouter();
  const c = useCosmos();
  const { isAuthenticated } = useAuth();
  const { isFavorite, toggleFavorite, saveAfterSignIn } = useFavorites();
  const favorited = isFavorite(eventId);

  const handlePress = () => {
    if (!isAuthenticated) {
      AppAlert.alert('Sign in to save events', 'Your saved events follow you to any device.', [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Sign in',
          // Sign-in returns here and the event is already saved.
          onPress: () => {
            saveAfterSignIn(eventId);
            router.push('/login');
          },
        },
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
      style={style}
    >
      <Heart size={size} weight={favorited ? 'fill' : 'regular'} color={favorited ? c.text : color ?? c.text} />
    </TouchableOpacity>
  );
}
