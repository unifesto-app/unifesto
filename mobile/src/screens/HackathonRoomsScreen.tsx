import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Plus } from '@unifesto/unicon/react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { HeaderActions, HeaderIconButton } from '../navigation/HeaderActions';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { autoAllocateRooms, getRooms, type Room } from '../lib/api/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

/**
 * Rooms at the venue and how full they are. "Auto-allocate" fills free places
 * with teams that have no room, in Team ID order; move single teams from the
 * team screen.
 */
export default function HackathonRoomsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [unallocated, setUnallocated] = useState(0);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [allocating, setAllocating] = useState(false);

  useAnalyticsScreenTracking('HackathonRooms');

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getRooms(eventId);
    if (res.ok) {
      setRooms(res.data.rooms);
      setUnallocated(res.data.unallocated);
      setError('');
    } else {
      setError(res.message);
      setRooms((r) => r ?? []);
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openRoom = (roomId: string) =>
    router.push({ pathname: `/manage/event/${eventId}/hackathon/room`, params: { roomId } } as never);

  const free = (rooms ?? []).reduce((s, r) => s + Math.max(0, r.capacity - r.occupied), 0);

  const allocate = () =>
    AppAlert.alert(
      `Allocate ${unallocated} team${unallocated === 1 ? '' : 's'}?`,
      `Teams without a room fill the ${free} free place${free === 1 ? '' : 's'}, room by room in Team ID order. Teams already in a room stay put. Each team is notified of its room.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Allocate',
          onPress: async () => {
            setAllocating(true);
            const res = await autoAllocateRooms(eventId!);
            setAllocating(false);
            if (!res.ok) return AppAlert.alert("Couldn't allocate", res.message);
            setRooms(res.data.rooms);
            setUnallocated(res.data.unallocated);
            AppAlert.alert(
              'Rooms allocated',
              res.data.unplaced
                ? `${res.data.allocated} placed. ${res.data.unplaced} didn't fit: add a room or raise a capacity, then allocate again.`
                : `${res.data.allocated} team${res.data.allocated === 1 ? '' : 's'} placed.`,
            );
          },
        },
      ],
    );

  if (!rooms) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderActions>
              <HeaderIconButton onPress={() => openRoom('new')} label="Add room">
                <Plus size={24} color={tokens.text} />
              </HeaderIconButton>
            </HeaderActions>
          ),
        }}
      />
      <ScrollView
        style={{ backgroundColor: tokens.bg }}
        contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
            progressViewOffset={topSpacing}
          />
        }
      >
        {rooms.length === 0 ? (
          <View style={{ marginTop: spacing[10], alignItems: 'center' }}>
            <Text style={[styles.empty, { color: tokens.text }]}>No rooms yet</Text>
            <Text style={[styles.note, { color: tokens.textMuted, textAlign: 'center' }]}>
              Add the rooms teams will work in, with how many teams each one fits.
            </Text>
            <Button label="Add a room" onPress={() => openRoom('new')} style={{ marginTop: spacing[5] }} />
          </View>
        ) : (
          <>
            <Text style={[styles.summary, { color: tokens.text }]}>
              {unallocated ? `${unallocated} team${unallocated === 1 ? '' : 's'} without a room` : 'Every team has a room'}
            </Text>
            <Text style={[styles.note, { color: tokens.textMuted }]}>{free} free place{free === 1 ? '' : 's'} across {rooms.length} room{rooms.length === 1 ? '' : 's'}</Text>
            {unallocated ? (
              <Button
                label="Auto-allocate"
                size="lg"
                fullWidth
                loading={allocating}
                disabled={free === 0}
                onPress={allocate}
                style={{ marginTop: spacing[5] }}
              />
            ) : null}
            {unallocated && free === 0 ? (
              <Text style={[styles.note, { color: tokens.warning }]}>Every room is full. Add a room or raise a capacity.</Text>
            ) : null}

            <SettingsGroup title="Rooms" plain>
              {rooms.map((r) => (
                <SettingsRow
                  key={r.id}
                  label={r.location ? `${r.name} · ${r.location}` : r.name}
                  value={`${r.occupied}/${r.capacity}`}
                  onPress={() => openRoom(r.id)}
                />
              ))}
            </SettingsGroup>
          </>
        )}
        {error ? <Text style={[styles.note, { color: tokens.danger }]}>{error}</Text> : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: typography.fontSize.lg, ...font('semibold') },
  summary: { fontSize: typography.fontSize.xl, ...font('bold') },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
});
