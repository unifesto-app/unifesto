import React from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { UserPlus } from '@unifesto/unicon/react-native';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import SearchField from '../components/manage/SearchField';
import { useAuth } from '../context/AuthContext';
import { useSpaceAccess } from '../context/SpaceAccessContext';
import { useSpaceMembers, type MemberFilter } from '../hooks/useSpaceMembers';
import useTopSpacing from '../hooks/useTopSpacing';
import MemberRow from '../components/manage/MemberRow';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { AppAlert, type AppAlertButton } from '../components/ui/AppAlert';
import { SPACE_ROLE_LABEL, type SpaceMember } from '../lib/api/spaceMembers';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cardSegment, cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';
import { GUTTER } from '../components/home/Section';

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
  const c = useCosmos();
  const topSpacing = useTopSpacing();
  const { user } = useAuth();
  const { spaces, refresh: refreshAccess } = useSpaceAccess();
  const m = useSpaceMembers(spaceId);
  const creatorId = spaces.find((s) => s.id === spaceId)?.creator?.id;

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
                : AppAlert.alert(`Make ${name} a member?`, 'Space admin → Member. They stop managing this space, its members and its money.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Make member', style: 'destructive', onPress: () => void act(() => m.changeRole(member, 'MEMBER')) },
                  ]),
          }
        : {
            text: 'Make Space admin',
            onPress: () =>
              AppAlert.alert(`Make ${name} a Space admin?`, 'Member → Space admin. They can manage members, settings, payouts and refunds straight away.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Make Space admin', onPress: () => void act(() => m.changeRole(member, 'SPACE_ADMIN')) },
              ]),
          },
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
      <SearchField value={m.query} onChangeText={m.setQuery} placeholder="Name, username or email" />
      <View style={{ marginTop: spacing[4] }}>
        <SegmentedTabs tabs={TABS} value={m.filter} onChange={m.setFilter} />
      </View>
      {!m.loading && !m.error ? (
        <Text style={[styles.count, { color: c.muted }]} accessibilityRole="header">
          {m.total.toLocaleString('en-IN')} {m.total === 1 ? 'person' : 'people'}
        </Text>
      ) : null}
    </View>
  );

  const empty = m.loading ? (
    <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
  ) : (
    <View style={[styles.empty, { backgroundColor: c.raised }]}>
      <Text style={[styles.emptyText, { color: c.soft }]}>
        {m.denied ? 'Only Space admins can manage members.' : m.error || (m.query ? 'No one matches that search.' : 'No one here yet.')}
      </Text>
    </View>
  );

  const rows = m.loading || m.error ? [] : m.rows;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: m.denied
            ? undefined
            : () => (
                <Pressable onPress={openAdd} hitSlop={10} accessibilityRole="button" accessibilityLabel="Add member">
                  <UserPlus size={24} color={c.text} weight="bold" />
                </Pressable>
              ),
        }}
      />
      <View style={[styles.container, { backgroundColor: c.bg }]}>
        <CosmosBackdrop horizon={false} />
        <FlatList
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          contentContainerStyle={styles.content}
          data={rows}
          keyExtractor={(r) => r.id}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          // One card for the whole roster: each row is a segment of it.
          renderItem={({ item, index }) => (
            <View style={cardSegment(c.raised, index, rows.length)}>
              {index > 0 ? <View style={[styles.sep, { backgroundColor: c.border }]} /> : null}
              <MemberRow
                user={item.user}
                trailing={SPACE_ROLE_LABEL[item.role.code] ?? item.role.name}
                tags={[item.userId === creatorId ? 'Owner' : '', item.userId === user?.id ? 'You' : ''].filter(Boolean)}
                busy={m.busyId === item.id}
                onPress={() => openMember(item)}
              />
            </View>
          )}
          onEndReached={() => void m.loadMore()}
          onEndReachedThreshold={0.4}
          ListFooterComponent={m.loadingMore ? <ActivityIndicator color={c.text} style={{ marginVertical: spacing[4] }} /> : null}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={m.refreshing} onRefresh={m.refresh} tintColor={c.text} colors={[c.text]} progressViewOffset={topSpacing} />
          }
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  count: { marginTop: spacing[6], marginBottom: spacing[3], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  // Starts under the name: past the 40pt avatar and its gap.
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 52 },
  empty: { marginTop: spacing[6], borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
