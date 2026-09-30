import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LockSimple } from 'phosphor-react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { BlockTitle, FieldRow } from '../components/manage/FormFields';
import ChipPicker from '../components/manage/ChipPicker';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import StatementCard from '../components/hackathon/StatementCard';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import {
  getMyHackathon,
  getMyStatementOptions,
  lockMyStatement,
  type HackathonHub,
  type MyStatementOptions,
  type SetStatementInput,
} from '../lib/api/hackathon';
import { blockCopy, formatWhen, placesLabel } from '../lib/hackathon';
import { onNotificationArrived } from '../lib/notificationBus';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

/**
 * The team's problem statement. Once locked it just shows what the team has.
 * Before that, the team lead picks one from the organisers' list or writes
 * their own (whichever the hackathon uses), adds a theme if needed, and locks
 * it in — once. Everyone else on the team sees the same choices, read-only.
 */
export default function HackathonStatementScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const [hub, setHub] = useState<HackathonHub | null>(null);
  const [opts, setOpts] = useState<MyStatementOptions | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // The lead's draft.
  const [pickedId, setPickedId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [themeId, setThemeId] = useState('');
  const [themeText, setThemeText] = useState('');

  useAnalyticsScreenTracking('HackathonStatement');

  const load = useCallback(async () => {
    if (!eventId) return;
    const [h, o] = await Promise.all([getMyHackathon(eventId), getMyStatementOptions(eventId)]);
    if (h.ok && h.data) setHub(h.data);
    if (o.ok) {
      setOpts(o.data);
      setError('');
    } else {
      setError(o.message);
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(
    () =>
      onNotificationArrived((n) => {
        if (!n.eventId || n.eventId === eventId) void load();
      }),
    [eventId, load],
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!opts) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? (
          <>
            <Text style={[styles.body, { color: tokens.textSecondary, textAlign: 'center' }]}>{error}</Text>
            <Button label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[4] }} />
          </>
        ) : (
          <ActivityIndicator color={tokens.accent} />
        )}
      </View>
    );
  }

  const mine = hub?.team?.statement ?? null;
  const locked = opts.block === 'LOCKED' && mine;
  const canChoose = opts.block === null && opts.isLead && !opts.cancelled;
  const picked = opts.statements.find((s) => s.id === pickedId) ?? null;
  // A statement's own theme decides it; otherwise the team gives one.
  const needsTheme =
    opts.themeMode === 'TEXT' ? !picked?.theme : !picked?.theme && opts.themes.length > 0;
  const writing = opts.mode === 'TEAM_WRITES';

  const lockIn = () => {
    const input: SetStatementInput = {};
    if (writing) {
      if (!title.trim()) return setError('Give your problem statement a title.');
      if (!description.trim()) return setError('Describe the problem you will solve.');
      input.title = title.trim();
      input.description = description.trim();
    } else {
      if (!picked) return setError('Pick a problem statement.');
      input.statementId = picked.id;
    }
    if (needsTheme) {
      if (opts.themeMode === 'TEXT') {
        if (!themeText.trim()) return setError('Add your theme or domain.');
        input.themeText = themeText.trim();
      } else {
        if (!themeId) return setError('Pick a theme.');
        input.themeId = themeId;
      }
    }
    const name = picked ? `${picked.code} · ${picked.title}` : `“${title.trim()}”`;
    AppAlert.alert(`Lock in ${name}?`, 'Your team can’t change it after this. Only the organisers can.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Lock in',
        onPress: async () => {
          setSaving(true);
          const res = await lockMyStatement(eventId!, input);
          setSaving(false);
          if (!res.ok) {
            setError(res.message);
            void load(); // e.g. the statement just filled up
            return;
          }
          setError('');
          if (res.data) setHub(res.data);
          void load();
        },
      },
    ]);
  };

  const stop = opts.cancelled
    ? { title: 'Registration cancelled', body: 'This team’s registration was cancelled.' }
    : opts.block
      ? (blockCopy(opts.block) ?? { title: 'Your problem statement is locked in', body: 'Pull down to refresh.' })
      : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 120 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
            progressViewOffset={topSpacing}
          />
        }
      >
        {locked ? (
          <>
            <View style={styles.lockedHead}>
              <LockSimple size={18} color={tokens.success} weight="fill" />
              <Text style={[styles.lockedLabel, { color: tokens.success }]}>
                {mine.setBy?.kind === 'ORGANISER'
                  ? 'Assigned by the organisers'
                  : `Locked in${mine.setBy?.name ? ` by ${mine.setBy.name}` : ''}`}
                {mine.lockedAt ? ` · ${formatWhen(mine.lockedAt)}` : ''}
              </Text>
            </View>
            <StatementCard
              code={mine.code}
              title={mine.title}
              description={mine.description}
              theme={mine.themeLabel}
              expanded
            />
            <Text style={[styles.note, { color: tokens.textMuted }]}>
              Your team’s problem statement is final. Only the organisers can change it.
            </Text>
          </>
        ) : stop ? (
          <View style={[styles.box, { borderColor: tokens.borderStrong }]}>
            <Text style={[styles.boxTitle, { color: tokens.text }]}>{stop.title}</Text>
            <Text style={[styles.boxBody, { color: tokens.textSecondary }]}>{stop.body}</Text>
          </View>
        ) : (
          <>
            <Text style={[styles.heading, { color: tokens.text }]}>
              {writing ? 'Write your problem statement' : 'Pick your problem statement'}
            </Text>
            <Text style={[styles.body, { color: tokens.textSecondary }]}>
              {opts.isLead
                ? 'Choose carefully: once you lock it in, your team can’t change it.'
                : 'Your team lead locks it in. Talk it through with them.'}
              {opts.deadline ? ` Closes ${formatWhen(opts.deadline)}.` : ''}
            </Text>

            {writing ? (
              canChoose ? (
                <SettingsGroup plain>
                  <FieldRow
                    stacked
                    label="Title"
                    value={title}
                    onChangeText={(v) => {
                      setError('');
                      setTitle(v);
                    }}
                    placeholder="Real-time crop prices for farmers"
                    maxLength={200}
                  />
                  <FieldRow
                    stacked
                    multiline
                    label="The problem, in a few lines"
                    value={description}
                    onChangeText={(v) => {
                      setError('');
                      setDescription(v);
                    }}
                    placeholder="Who has the problem, why it matters, and what you’ll build."
                    maxLength={4000}
                  />
                </SettingsGroup>
              ) : null
            ) : opts.statements.length === 0 ? (
              <Text style={[styles.note, { color: tokens.textMuted }]}>The organisers haven’t added problem statements yet.</Text>
            ) : (
              opts.statements.map((s) => {
                const full = s.placesLeft === 0;
                return (
                  <StatementCard
                    key={s.id}
                    code={s.code}
                    title={s.title}
                    description={s.description}
                    theme={s.theme?.name}
                    note={placesLabel(s.placesLeft)}
                    selected={canChoose && s.id === pickedId}
                    disabled={full}
                    onPress={
                      canChoose && !full
                        ? () => {
                            setError('');
                            setPickedId(s.id);
                          }
                        : undefined
                    }
                  />
                );
              })
            )}

            {canChoose && needsTheme && (writing || picked) ? (
              opts.themeMode === 'TEXT' ? (
                <SettingsGroup title="Theme" plain>
                  <FieldRow
                    stacked
                    label="Theme or domain"
                    value={themeText}
                    onChangeText={(v) => {
                      setError('');
                      setThemeText(v);
                    }}
                    placeholder="HealthTech"
                    maxLength={60}
                  />
                </SettingsGroup>
              ) : (
                <View style={{ marginTop: spacing[6] }}>
                  <BlockTitle>Theme</BlockTitle>
                  <ChipPicker
                    options={opts.themes.map((t) => ({ value: t.id, label: t.name }))}
                    value={themeId}
                    onChange={(v) => {
                      setError('');
                      setThemeId(v);
                    }}
                  />
                </View>
              )
            ) : null}

            {canChoose ? (
              <Button
                label="Lock in"
                size="lg"
                fullWidth
                loading={saving}
                disabled={!writing && !picked}
                icon={<LockSimple size={18} color={tokens.accentFg} weight="bold" />}
                onPress={lockIn}
                style={{ marginTop: spacing[6] }}
              />
            ) : null}
          </>
        )}
        {error ? <Text style={[styles.note, { color: tokens.danger }]}>{error}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  heading: { fontSize: typography.fontSize.xl, ...font('bold') },
  body: { marginTop: spacing[2], fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.5, ...font() },
  note: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  lockedHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginHorizontal: spacing[1] },
  lockedLabel: { fontSize: typography.fontSize.sm, ...font('semibold') },
  box: { padding: spacing[4], borderRadius: borderRadius.xl, borderWidth: 1 },
  boxTitle: { fontSize: typography.fontSize.base, ...font('semibold') },
  boxBody: { marginTop: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
});
