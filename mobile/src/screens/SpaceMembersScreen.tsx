import React from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { MagnifyingGlass, UserPlus, X } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import { CardBackdrop } from '../components/ui/CardSurface';
import { useAuth } from '../context/AuthContext';
import { useSpaceAccess } from '../context/SpaceAccessContext';
import { useSpaceMembers, type MemberFilter } from '../hooks/useSpaceMembers';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import MemberRow, { SPACE_ROLE_LABEL } from '../components/manage/MemberRow';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { AppAlert, type AppAlertButton } from '../components/ui/AppAlert';
import type { SpaceMember } from '../lib/api/spaceMembers';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

const TABS: { key: MemberFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'SPACE_ADMIN', label: 'Admins' },
  { key: 'MEMBER', label: 'Members' },
];

/**
 * A space's roster for Space Admins: search, filter by role, promote/demote
 * and remove. The creator is protected (the server enforces it too), and
 * removing yourself asks twice because it ends your access.
 */
export default function SpaceMembersScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const { user } = useAuth();
  const { spaces, refresh: refreshAccess } = useSpaceAccess();
  const m = useSpaceMembers(spaceId);
  const creatorId = spaces.find((s) => s.id === spaceId)?.creator?.id;

  useAnalyticsScreenTracking('SpaceMembers');

  const openAdd = () => router.push(`/manage/space/${spaceId}/add-member`);

  const act = async (run: () => Promise<string | null>) => {
    const problem = await run();
    if (problem) AppAlert.alert("Couldn't update", problem);
  };

  const openMember = (member: SpaceMember) => {
    const isCreator = member.userId === creatorId;
    const isMe = member.userId === user?.id;
    const name = member.user.fullName || member.user.username || 'This person';
    const isAdmin = member.role.code === 'SPACE_ADMIN';

    if (isCreator) {
      AppAlert.alert(name, 'Created this space, so they always stay a Space admin.');
      return;
    }

    const buttons: AppAlertButton[] = [
      isAdmin
        ? {
            text: 'Make member',
            onPress: () =>
              isMe
                ? AppAlert.alert('Step down as Space admin?', "You'll stop being able to manage this space, its members and its money.", [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Step down',
                      style: 'destructive',
                      onPress: () =>
                        void act(async () => {
                          const problem = await m.changeRole(member, 'MEMBER');
                          if (!problem) {
                            await refreshAccess();
                            router.navigate('/(tabs)/space');
                          }
                          return problem;
                        }),
                    },
                  ])
                : void act(() => m.changeRole(member, 'MEMBER')),
          }
        : { text: 'Make Space admin', onPress: () => void act(() => m.changeRole(member, 'SPACE_ADMIN')) },
      {
        text: isMe ? 'Leave space' : 'Remove from space',
        style: 'destructive',
        onPress: () =>
          AppAlert.alert(
            isMe ? 'Leave this space?' : `Remove ${name}?`,
            isMe
              ? "You'll lose access to this space and its events straight away."
              : 'They lose their space role. Event roles they hold stay as they are.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: isMe ? 'Leave' : 'Remove',
                style: 'destructive',
                onPress: () =>
                  void act(async () => {
                    const problem = await m.remove(member);
                    if (!problem && isMe) {
                      await refreshAccess();
                      router.navigate('/(tabs)/space');
                    }
                    return problem;
                  }),
              },
            ],
          ),
      },
      { text: 'Cancel', style: 'cancel' },
    ];

    AppAlert.alert(name, `${SPACE_ROLE_LABEL[member.role.code] ?? member.role.name}${isMe ? ' · You' : ''}`, buttons);
  };

  const header = (
    <View style={{ paddingTop: topSpacing }}>
      <View style={styles.search}>
        <CardBackdrop shape={styles.search} />
        <MagnifyingGlass size={20} color={tokens.textMuted} weight="bold" />
        <TextInput
          value={m.query}
          onChangeText={m.setQuery}
          placeholder="Name, username or email"
          placeholderTextColor={tokens.textMuted}
          style={[styles.searchInput, { color: tokens.text }]}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {m.query.length > 0 ? (
          <Pressable onPress={() => m.setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
            <X size={18} color={tokens.textSecondary} weight="bold" />
          </Pressable>
        ) : null}
      </View>
      <View style={{ marginTop: spacing[4] }}>
        <SegmentedTabs tabs={TABS} value={m.filter} onChange={m.setFilter} />
      </View>
      {!m.loading && !m.error ? (
        <Text style={[styles.count, { color: tokens.textMuted }]}>
          {m.total.toLocaleString('en-IN')} {m.total === 1 ? 'person' : 'people'}
        </Text>
      ) : null}
    </View>
  );

  const empty = m.loading ? (
    <ActivityIndicator color={tokens.accent} style={{ marginTop: spacing[10] }} />
  ) : (
    <Text style={[styles.empty, { color: tokens.textMuted }]}>
      {m.denied ? 'Only Space admins can manage members.' : m.error || (m.query ? 'No one matches that search.' : 'No one here yet.')}
    </Text>
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: m.denied
            ? undefined
            : () => (
                <Pressable onPress={openAdd} hitSlop={10} accessibilityRole="button" accessibilityLabel="Add member">
                  <UserPlus size={24} color={tokens.text} weight="bold" />
                </Pressable>
              ),
        }}
      />
      <FlatList
        style={{ backgroundColor: tokens.bg }}
        contentContainerStyle={styles.content}
        data={m.loading || m.error ? [] : m.rows}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: tokens.border }]} />}
        renderItem={({ item }) => (
          <MemberRow
            user={item.user}
            trailing={SPACE_ROLE_LABEL[item.role.code] ?? item.role.name}
            tags={[item.userId === creatorId ? 'Owner' : '', item.userId === user?.id ? 'You' : ''].filter(Boolean)}
            busy={m.busyId === item.id}
            onPress={() => openMember(item)}
          />
        )}
        onEndReached={() => void m.loadMore()}
        onEndReachedThreshold={0.4}
        ListFooterComponent={m.loadingMore ? <ActivityIndicator color={tokens.accent} style={{ marginVertical: spacing[4] }} /> : null}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={m.refreshing} onRefresh={m.refresh} tintColor={tokens.accent} colors={[tokens.accent]} progressViewOffset={topSpacing} />
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], height: 50, paddingHorizontal: spacing[4], borderRadius: borderRadius.full },
  searchInput: { flex: 1, height: '100%', fontSize: typography.fontSize.base, ...font() },
  count: { marginTop: spacing[4], marginBottom: spacing[1], fontSize: typography.fontSize.xs, ...font('medium') },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 52 },
  empty: { marginTop: spacing[10], textAlign: 'center', fontSize: typography.fontSize.sm, ...font() },
});
