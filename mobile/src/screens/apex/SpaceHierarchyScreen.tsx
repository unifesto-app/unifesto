import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check } from 'phosphor-react-native';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../../hooks/useAnalyticsScreenTracking';
import { SettingsGroup, SettingsRow } from '../../components/profile/SettingsGroup';
import { FieldRow } from '../../components/manage/FormFields';
import { Button } from '../../components/ui';
import { AppAlert } from '../../components/ui/AppAlert';
import { createSubSpaceRequest, getAllSpacesForPicker, getSpaceDetail, type AdminSpaceDetail, type AdminSpaceRow } from '../../lib/api/apex';
import { ACTION_LABEL, availableActions, buildRequest, needsPicker, pickerOptions, type HierarchyAction } from '../../lib/apexHierarchy';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

const GUTTER = spacing[6];
const PICKER_LIMIT = 40;

/** File a parent/child change for a space. It lands in the Sub-space requests queue for review. */
export default function SpaceHierarchyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  useAnalyticsScreenTracking('ApexSpaceHierarchy');

  const [space, setSpace] = useState<AdminSpaceDetail | null>(null);
  const [all, setAll] = useState<AdminSpaceRow[] | null>(null);
  const [error, setError] = useState('');
  const [action, setAction] = useState<HierarchyAction | null>(null);
  const [picked, setPicked] = useState<AdminSpaceRow | null>(null);
  const [query, setQuery] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const [s, list] = await Promise.all([getSpaceDetail(id!), getAllSpacesForPicker()]);
      if (!s.ok) return setError(s.message);
      setSpace(s.data);
      setAll(list.ok ? list.data.spaces : []);
    })();
  }, [id]);

  const options = useMemo(() => {
    if (!space || !all || !action || !needsPicker(action)) return [];
    const q = query.trim().toLowerCase();
    const list = pickerOptions(action, space.id, all);
    return q ? list.filter((s) => s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q)) : list;
  }, [space, all, action, query]);

  if (!space || !all) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? <Text style={[styles.hint, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const actions = availableActions(space);
  const choose = (a: HierarchyAction) => {
    setAction(a);
    setPicked(null);
    setQuery('');
  };
  const canSubmit = !!action && (!needsPicker(action) || !!picked) && !busy;

  const submit = async () => {
    if (!action || !canSubmit) return;
    setBusy(true);
    const res = await createSubSpaceRequest({ ...buildRequest(action, space, picked), reason: reason.trim() || 'Requested from Apex mobile' });
    setBusy(false);
    if (!res.ok) return AppAlert.alert('Request not sent', res.message);
    AppAlert.alert('Request filed', 'Review it in Requests → Sub-spaces to make it take effect.', [{ text: 'OK', onPress: () => router.back() }]);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: topSpacing }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={[styles.summary, { color: tokens.text }]}>{space.name}</Text>
        <Text style={[styles.hint, { color: tokens.textMuted }]}>
          {space.type === 'SUPER' ? `Parent space · ${space._count?.childSpaces ?? 0} child spaces` : 'Regular space'}
          {space.parentSpace ? ` · under ${space.parentSpace.name}` : ''}
        </Text>

        <SettingsGroup title="What should change?" plain>
          {actions.map((a) => (
            <SettingsRow
              key={a}
              label={ACTION_LABEL[a]}
              onPress={() => choose(a)}
              trailing={action === a ? <Check size={18} color={tokens.accent} weight="bold" /> : <View />}
            />
          ))}
        </SettingsGroup>

        {action && needsPicker(action) ? (
          <>
            <SettingsGroup title={action === 'ASSIGN_PARENT' ? 'Parent space' : action === 'ASSIGN_CHILD' ? 'Child space' : 'Space to remove'} plain>
              <FieldRow label="Search" value={query} onChangeText={setQuery} placeholder="Name or slug" autoCapitalize="none" autoCorrect={false} />
              {options.length === 0 ? (
                <SettingsRow label={action === 'ASSIGN_CHILD' ? 'No spaces without a parent' : 'No spaces to pick'} />
              ) : null}
              {options.slice(0, PICKER_LIMIT).map((s) => (
                <SettingsRow
                  key={s.id}
                  label={s.name}
                  value={s.type === 'SUPER' ? 'Parent' : undefined}
                  onPress={() => setPicked(s)}
                  trailing={picked?.id === s.id ? <Check size={18} color={tokens.accent} weight="bold" /> : <View />}
                />
              ))}
            </SettingsGroup>
            <Text style={[styles.note, { color: tokens.textMuted }]}>
              {action === 'ASSIGN_PARENT'
                ? 'Only a parent space can hold children. Picking a regular space promotes it first.'
                : action === 'ASSIGN_CHILD'
                  ? 'A space can have only one parent, so only unattached spaces are listed.'
                  : options.length > PICKER_LIMIT
                    ? `Showing ${PICKER_LIMIT} of ${options.length}. Search to narrow.`
                    : ''}
            </Text>
          </>
        ) : null}

        {action ? (
          <SettingsGroup title="Reason (optional)" plain>
            <FieldRow stacked multiline label="Why is this change needed?" value={reason} onChangeText={setReason} placeholder="Shown on the request" />
          </SettingsGroup>
        ) : null}

        <Button label="File request" size="lg" fullWidth disabled={!canSubmit} loading={busy} onPress={submit} style={{ marginTop: spacing[8] }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  summary: { fontSize: typography.fontSize.xl, ...font('heading') },
  hint: { marginTop: 2, fontSize: typography.fontSize.sm, ...font() },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...font() },
});
