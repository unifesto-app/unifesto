import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Lock, ShieldCheck } from 'phosphor-react-native';
import { RefreshControl } from '../../components/ui/RefreshControl';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../../hooks/useAnalyticsScreenTracking';
import { SettingsGroup, SettingsRow } from '../../components/profile/SettingsGroup';
import { AppAlert } from '../../components/ui/AppAlert';
import {
  actionLabel,
  getCapabilityMatrix,
  roleLabel,
  setCapabilityGrant,
  type CapabilityMatrix,
  type RoleScope,
} from '../../lib/api/apex';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

/*
 * Apex IAM parity: the platform capability matrix. The web grid (roles ×
 * actions) doesn't fit a phone, so it's pivoted into one group per role with a
 * switch per action. Grants apply instantly; revokes confirm first, like web.
 */

const GUTTER = spacing[6];
const EDITABLE_SCOPES: { scope: RoleScope; label: string }[] = [
  { scope: 'SPACE', label: 'Space' },
  { scope: 'EVENT', label: 'Event' },
];
const cellKey = (code: string, action: string) => `${code}|${action}`;

export default function IamScreen() {
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  useAnalyticsScreenTracking('ApexIam');

  const [matrix, setMatrix] = useState<CapabilityMatrix | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await getCapabilityMatrix();
    if (!res.ok) {
      setError(res.denied ? 'Only Unifesto platform admins can manage IAM.' : res.message);
      return;
    }
    setError('');
    setMatrix(res.data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const apply = async (code: string, action: string, granted: boolean) => {
    const key = cellKey(code, action);
    setPending((p) => new Set(p).add(key));
    const res = await setCapabilityGrant({ code, action, granted });
    setPending((p) => {
      const next = new Set(p);
      next.delete(key);
      return next;
    });
    if (!res.ok) {
      AppAlert.alert('Not saved', res.message);
      return;
    }
    setMatrix(res.data);
  };

  const toggle = (code: string, action: string, granted: boolean) => {
    if (!granted) {
      void apply(code, action, true);
      return;
    }
    // Removing access is the risky direction.
    AppAlert.alert(
      'Revoke this permission?',
      `${roleLabel(code)} will no longer be able to ${actionLabel(action).toLowerCase()}. Anyone holding this role loses that access immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Revoke', style: 'destructive', onPress: () => void apply(code, action, false) },
      ],
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!matrix) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? <Text style={[styles.muted, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const admin = matrix.roles.find((r) => !r.editable);

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 80 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} />}
    >
      <Text style={[styles.intro, { color: tokens.textMuted }]}>
        Which roles can do what across every space. Changes take effect immediately.
      </Text>

      {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}

      {admin ? (
        <>
          <SettingsGroup title="Platform">
            <SettingsRow
              icon={<ShieldCheck size={26} color={tokens.accent} weight="fill" />}
              label={roleLabel(admin.code)}
              trailing={<Lock size={18} color={tokens.textMuted} weight="fill" />}
            />
          </SettingsGroup>
          {admin.note ? <Text style={[styles.note, { color: tokens.textMuted }]}>{admin.note}</Text> : null}
        </>
      ) : null}

      {EDITABLE_SCOPES.map(({ scope, label }) => {
        const actions = matrix.actions.filter((a) => a.scope === scope);
        const roles = matrix.roles.filter((r) => r.scope === scope && r.editable);
        if (!actions.length || !roles.length) return null;
        return roles.map((role) => (
          <SettingsGroup key={role.code} title={`${label} · ${roleLabel(role.code)}`} plain>
            {actions.map((a) => {
              const granted = role.grants.includes(a.key);
              const saving = pending.has(cellKey(role.code, a.key));
              return (
                <SettingsRow
                  key={a.key}
                  label={actionLabel(a.key)}
                  trailing={
                    saving ? (
                      <ActivityIndicator color={tokens.accent} />
                    ) : (
                      <Switch
                        value={granted}
                        onValueChange={() => toggle(role.code, a.key, granted)}
                        trackColor={{ false: tokens.fillStrong, true: tokens.accent }}
                        thumbColor="#ffffff"
                        ios_backgroundColor={tokens.fillStrong}
                        accessibilityLabel={`${actionLabel(a.key)} for ${roleLabel(role.code)}`}
                      />
                    )
                  }
                />
              );
            })}
          </SettingsGroup>
        ));
      })}

      <Text style={[styles.note, { color: tokens.textMuted }]}>
        Plan features (waitlists, analytics, certificates…) are set per plan on Apex web.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
  intro: { fontSize: typography.fontSize.sm, marginBottom: spacing[2], marginHorizontal: spacing[1], ...font() },
  note: { marginHorizontal: spacing[1], marginBottom: spacing[2], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
  error: { marginBottom: spacing[3], fontSize: typography.fontSize.sm, ...font('medium') },
});
