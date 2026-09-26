import { RefreshControl as RNRefreshControl, type RefreshControlProps } from 'react-native';
import { invalidateApiCache } from '../../lib/api/memoryCache';

/**
 * Drop-in for React Native's RefreshControl: a pull-to-refresh always goes to
 * the network, skipping the in-memory API cache the rest of the app reads from.
 */
export function RefreshControl({ onRefresh, ...props }: RefreshControlProps) {
  return (
    <RNRefreshControl
      {...props}
      onRefresh={
        onRefresh &&
        (() => {
          invalidateApiCache();
          onRefresh();
        })
      }
    />
  );
}
