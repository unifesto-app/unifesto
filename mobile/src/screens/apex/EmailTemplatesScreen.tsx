import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Plus } from 'phosphor-react-native';
import { RefreshControl } from '../../components/ui/RefreshControl';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../../hooks/useAnalyticsScreenTracking';
import { HeaderActions, HeaderIconButton } from '../../navigation/HeaderActions';
import { ApexRow, shortDate } from '../../components/apex/ApexRow';
import { listEmailTemplates, type EmailTemplate } from '../../lib/api/apexComms';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

const GUTTER = spacing[6];

/** The global email template library every space can start a campaign from. */
export default function EmailTemplatesScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [rows, setRows] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  useAnalyticsScreenTracking('ApexEmailTemplates');

  const load = useCallback(async () => {
    const res = await listEmailTemplates();
    if (res.ok) {
      setRows(res.data);
      setError('');
    } else setError(res.denied ? 'Only Unifesto platform admins can see this.' : res.message);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load().finally(() => setLoading(false));
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderActions>
              <HeaderIconButton onPress={() => router.push({ pathname: '/apex/email/templates/[id]', params: { id: 'new' } })} label="New template">
                <Plus size={24} color={tokens.text} />
              </HeaderIconButton>
            </HeaderActions>
          ),
        }}
      />
      <FlatList
        style={{ backgroundColor: tokens.bg }}
        contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
        data={loading || error ? [] : rows}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={
          <Text style={[styles.hint, { color: tokens.textMuted }]}>Every space sees these as read-only starting points.</Text>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={tokens.accent} style={{ marginTop: spacing[10] }} />
          ) : (
            <Text style={[styles.empty, { color: tokens.textMuted }]}>{error || 'No templates yet. Tap + to create one.'}</Text>
          )
        }
        ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: tokens.border }]} />}
        renderItem={({ item }) => (
          <ApexRow
            title={item.name}
            meta={`${item.subject} · updated ${shortDate(item.updatedAt)}`}
            onPress={() => router.push({ pathname: '/apex/email/templates/[id]', params: { id: item.id } })}
          />
        )}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={tokens.accent} colors={[tokens.accent]} progressViewOffset={topSpacing} />
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  hint: { marginBottom: spacing[2], fontSize: typography.fontSize.xs, ...font() },
  sep: { height: StyleSheet.hairlineWidth },
  empty: { marginTop: spacing[10], textAlign: 'center', fontSize: typography.fontSize.sm, ...font() },
});
