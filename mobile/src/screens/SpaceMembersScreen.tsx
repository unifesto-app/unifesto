import React, { useCallback, useEffect, useState } from 'react';
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
import TabPager from '../components/ui/TabPager';
import { AppAlert, type AppAlertButton } from '../components/ui/AppAlert';
import { SPACE_ROLE_LABEL, type SpaceMember } from '../lib/api/spaceMembers';
import { column, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, useCosmos } from '../theme/cosmos';
import { GUTTER } from '../components/home/Section';

const TABS: { key: MemberFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'SPACE_ADMIN', label: 'Admins' },
  { key: 'MEMBER', label: 'Members' },
];

/**
 * A space's roster for Space Admins: search, filter by role, promote/demote
 * and remove. The creator is protected (the server enforces it too), and
 * removing yourself asks twice because it ends your access. The roster is
 * rows on the page with full hairlines.
 */
export default function SpaceMembersScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const router = useRouter();
  const c = useCosmos();
  const topSpacing = useTopSpacing();
  const { user } = useAuth();
  const { spaces, refresh: refreshAccess } = useSpaceAccess();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<MemberFilter>('all');
  // Bumped after a role change or removal so the other tabs reload too.
  const [stamp, setStamp] = useState(0);
  const [denied, setDenied] = useState(false);
  const onDenied = useCallback(() => setDenied(true), []);
  const creatorId = spaces.find((s) => s.id === spaceId)?.creator?.id;

  const openAdd = () => router.push(`/manage/space/${spaceId}/add-member`);

  const act = async (run: () => Promise<string | null>) => {
    const problem = await run();
    if (problem) AppAlert.alert("Couldn't update", problem);
    else setStamp((n) => n + 1);
  };

  const openMember = (m: Members, member: SpaceMember) => {
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

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: denied
            ? undefined
            : () => (
                <Pressable onPress={openAdd} hitSlop={10} accessibilityRole="button" accessibilityLabel="Add member">
                  <UserPlus size={24} color={c.text} weight="bold" />
                </Pressable>
              ),
        }}
      />
      {/* Search and tabs stay put; each role is its own page of the pager. */}
      <View style={[styles.container, { backgroundColor: c.bg }]}>
        <CosmosBackdrop horizon={false} />
        <View style={[column, styles.head, { paddingTop: topSpacing }]}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Name, username or email" />
        </View>
        <TabPager
          tabs={TABS}
          value={filter}
          onChange={setFilter}
          tabsStyle={[column, styles.head, { marginTop: spacing[4] }]}
          renderPage={(f) => (
            <MemberList
              spaceId={spaceId}
              filter={f}
              query={query}
              stamp={stamp}
              creatorId={creatorId}
              myId={user?.id}
              onOpen={openMember}
              onDenied={onDenied}
            />
          )}
        />
      </View>
    </>
  );
}

type Members = ReturnType<typeof useSpaceMembers>;

/** One role tab's roster: its own paging and pull-to-refresh. */
function MemberList({
  spaceId,
  filter,
  query,
  stamp,
  creatorId,
  myId,
  onOpen,
  onDenied,
}: {
  spaceId: string | undefined;
  filter: MemberFilter;
  query: string;
  stamp: number;
  creatorId: string | undefined;
  myId: string | undefined;
  onOpen: (m: Members, member: SpaceMember) => void;
  onDenied: () => void;
}) {
  const c = useCosmos();
  const m = useSpaceMembers(spaceId, filter, query, stamp);

  useEffect(() => {
    if (m.denied) onDenied();
  }, [m.denied, onDenied]);

  const header =
    !m.loading && !m.error ? (
      <Text style={[styles.count, { color: c.muted }]} accessibilityRole="header">
        {m.total.toLocaleString('en-IN')} {m.total === 1 ? 'person' : 'people'}
      </Text>
    ) : null;

  const empty = m.loading ? (
    <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
  ) : (
    <View style={styles.empty}>
      <Text style={[styles.emptyText, { color: c.muted }]}>
        {m.denied ? 'Only Space admins can manage members.' : m.error || (query ? 'No one matches that search.' : 'No one here yet.')}
      </Text>
    </View>
  );

  const rows = m.loading || m.error ? [] : m.rows;

  return (
    <FlatList
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
      contentContainerStyle={[column, styles.content]}
      data={rows}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      // Rows on the page: a full hairline between people, no card.
      renderItem={({ item, index }) => (
        <View style={index > 0 && [styles.divider, { borderTopColor: c.border }]}>
          <MemberRow
            user={item.user}
            trailing={SPACE_ROLE_LABEL[item.role.code] ?? item.role.name}
            tags={[item.userId === creatorId ? 'Owner' : '', item.userId === myId ? 'You' : ''].filter(Boolean)}
            busy={m.busyId === item.id}
            onPress={() => onOpen(m, item)}
          />
        </View>
      )}
      onEndReached={() => void m.loadMore()}
      onEndReachedThreshold={0.4}
      ListFooterComponent={m.loadingMore ? <ActivityIndicator color={c.text} style={{ marginVertical: spacing[4] }} /> : null}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={m.refreshing} onRefresh={m.refresh} tintColor={c.text} colors={[c.text]} />}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  head: { paddingHorizontal: GUTTER },
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  count: { marginTop: spacing[6], marginBottom: spacing[3], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  empty: { marginTop: spacing[10], alignItems: 'center' },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
