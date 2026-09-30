import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Certificate, CheckCircle, Hourglass, WarningCircle } from 'phosphor-react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import ChipPicker from '../components/manage/ChipPicker';
import { BlockTitle } from '../components/manage/FormFields';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import {
  getCertificateBatch,
  getHackathonCertificates,
  issueHackathonCertificates,
  type HackathonCertificates,
} from '../lib/api/hackathon';
import { formatWhen } from '../lib/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const ICON = 26;
const POLL_MS = 3_000;

type Audience = 'PARTICIPANTS' | 'WINNERS';

/**
 * Hackathon certificates (plan §9.2): pick one of the event's certificate
 * templates and issue it to every team member, or to the winning teams (one
 * run per award). Custom text in the template can print {teamName},
 * {teamCode} and {awardTitle}. Templates are designed on the Space web
 * certificates page; issuing is Curator / Space Admin only.
 */
export default function HackathonCertificatesScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [data, setData] = useState<HackathonCertificates | null>(null);
  const [error, setError] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [audience, setAudience] = useState<Audience>('PARTICIPANTS');
  const [issuing, setIssuing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pending = useRef<Set<string>>(new Set());

  useAnalyticsScreenTracking('HackathonCertificates');

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getHackathonCertificates(eventId);
    if (!res.ok) return setError(res.message);
    setData(res.data);
    setError('');
    setTemplateId((t) => t || res.data.templates[0]?.id || '');
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // While a run is queued or rendering, check on it every few seconds.
  const running = data?.batches.some((b) => b.status === 'QUEUED' || b.status === 'PROCESSING') ?? false;
  useEffect(() => {
    if (!running || !eventId) return;
    const t = setInterval(async () => {
      for (const id of pending.current) {
        const res = await getCertificateBatch(eventId, id);
        if (res.ok && (res.data.status === 'COMPLETED' || res.data.status === 'FAILED')) pending.current.delete(id);
      }
      void load();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [running, eventId, load]);

  if (!data) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? <Text style={[styles.note, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const template = data.templates.find((t) => t.id === templateId) ?? null;
  const blocked = !data.planAllowed
    ? 'Certificates aren’t included in this space’s plan.'
    : !data.window.isOpen
      ? `Issuing closed on ${formatWhen(data.window.closesAt)}.`
      : !data.templates.length
        ? 'Design a certificate template on the Space web certificates page first.'
        : audience === 'WINNERS' && !data.winners.length
          ? 'Publish winners first.'
          : audience === 'PARTICIPANTS' && !data.participants.teams
            ? 'Import teams first.'
            : null;

  const issue = () => {
    if (!template) return;
    const who =
      audience === 'PARTICIPANTS'
        ? `${data.participants.people} ${data.participants.people === 1 ? 'person' : 'people'} in ${data.participants.teams} team${data.participants.teams === 1 ? '' : 's'}`
        : `the winning teams (${data.winners.length} award${data.winners.length === 1 ? '' : 's'})`;
    AppAlert.alert(
      `Issue “${template.name}”?`,
      `Certificates go to ${who} and are emailed. Anyone who already has this certificate is skipped.${
        audience === 'WINNERS' && !template.usesAward ? '\n\nThis template doesn’t print {awardTitle}, so winners’ certificates won’t name the award.' : ''
      }`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Issue',
          onPress: async () => {
            setIssuing(true);
            const res = await issueHackathonCertificates(eventId!, template.id, audience);
            setIssuing(false);
            if (!res.ok) return AppAlert.alert("Couldn't issue", res.message);
            for (const id of res.data.batchIds) pending.current.add(id);
            setData(res.data);
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
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
      <BlockTitle>Who gets them</BlockTitle>
      <ChipPicker
        options={[
          { value: 'PARTICIPANTS' as const, label: `Every team member (${data.participants.people})` },
          { value: 'WINNERS' as const, label: `Winners (${data.winners.length})` },
        ]}
        value={audience}
        onChange={(v) => v && setAudience(v)}
      />
      {audience === 'WINNERS' && data.winners.length ? (
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          {data.winners.map((w) => `${w.title}: ${w.team.teamCode ?? ''} ${w.team.name}`.trim()).join(' · ')}
        </Text>
      ) : null}

      <View style={{ marginTop: spacing[6] }}>
        <BlockTitle>Template</BlockTitle>
        {data.templates.length ? (
          <ChipPicker options={data.templates.map((t) => ({ value: t.id, label: t.name }))} value={templateId} onChange={(v) => v && setTemplateId(v)} />
        ) : null}
      </View>
      <Text style={[styles.note, { color: tokens.textMuted }]}>
        {template && (template.usesTeam || template.usesAward)
          ? `Prints ${[template.usesTeam ? 'the team' : null, template.usesAward ? 'the award' : null].filter(Boolean).join(' and ')}.`
          : 'Templates are designed on the Space web certificates page.'}{' '}
        To print the team or award, add custom text like “Team {'{teamName}'} ({'{teamCode}'})” or “{'{awardTitle}'}” to the design.
      </Text>

      {blocked ? <Text style={[styles.note, { color: tokens.warning, marginTop: spacing[4] }]}>{blocked}</Text> : null}
      {data.canIssue ? (
        <Button
          label={audience === 'WINNERS' ? 'Issue winner certificates' : 'Issue participant certificates'}
          size="lg"
          fullWidth
          loading={issuing}
          disabled={!!blocked || !template}
          icon={<Certificate size={18} color={blocked ? tokens.textMuted : tokens.accentFg} weight="fill" />}
          onPress={issue}
          style={{ marginTop: spacing[6] }}
        />
      ) : (
        <Text style={[styles.note, { color: tokens.textMuted, marginTop: spacing[4] }]}>
          Only the Curator or a Space Admin can issue certificates.
        </Text>
      )}
      {data.window.isOpen ? (
        <Text style={[styles.note, { color: tokens.textMuted }]}>You can issue certificates until {formatWhen(data.window.closesAt)}.</Text>
      ) : null}

      {data.batches.length ? (
        <SettingsGroup title="Issued">
          {data.batches.map((b) => (
            <SettingsRow
              key={b.id}
              icon={
                b.status === 'COMPLETED' ? (
                  <CheckCircle size={ICON} color={b.failed ? tokens.warning : tokens.success} weight="fill" />
                ) : b.status === 'FAILED' ? (
                  <WarningCircle size={ICON} color={tokens.danger} weight="fill" />
                ) : (
                  <Hourglass size={ICON} color={tokens.textMuted} weight="fill" />
                )
              }
              label={`${b.label} · ${formatWhen(b.createdAt)}`}
              value={
                b.status === 'COMPLETED'
                  ? `${b.issued + b.reactivated} issued${b.skipped ? ` · ${b.skipped} already had one` : ''}${b.failed ? ` · ${b.failed} failed` : ''}`
                  : b.status === 'FAILED'
                    ? 'Failed'
                    : b.status === 'PROCESSING'
                      ? 'Issuing…'
                      : 'Queued'
              }
            />
          ))}
        </SettingsGroup>
      ) : null}
      <Text style={[styles.note, { color: tokens.textMuted }]}>
        Each person gets their own certificate by email, and finds it under Certificates in the app.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
