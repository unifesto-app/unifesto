import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RefreshControl } from '../../components/ui/RefreshControl';
import { useFocusEffect } from 'expo-router';
import useTopSpacing from '../../hooks/useTopSpacing';
import {
  createStatusIncident,
  getExternalStatus,
  getPlatformStatus,
  updateStatusIncident,
  type ExternalMonitor,
  type ExternalStatus,
  type PlatformStatus,
  type StatusIncident,
} from '../../lib/api/apex';
import ChipPicker, { MultiChipPicker } from '../../components/manage/ChipPicker';
import { Button } from '../../components/ui';
import { AppAlert } from '../../components/ui/AppAlert';
import { titleCase } from '../../lib/apexQueues';
import { CardBackdrop } from '../../components/ui/CardSurface';
import UptimeBars from '../../components/apex/UptimeBars';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { type Cosmos, cosmosFont, useCosmos } from '../../theme/cosmos';

const GUTTER = spacing[6];
type Service = PlatformStatus['services'][number];

export function overallLabel(status: Pick<PlatformStatus, 'overall' | 'stale'>, c: Cosmos) {
  switch (status.overall) {
    case 'operational':
      // Older backends sent 'operational' even with a dead sampler.
      if (status.stale) return { text: 'Status unknown', color: c.muted };
      return { text: 'All systems working', color: c.success };
    case 'unknown':
      return { text: 'Status unknown', color: c.muted };
    case 'degraded':
      return { text: 'Some systems degraded', color: c.warn };
    default:
      return { text: 'Major outage', color: c.danger };
  }
}

const serviceWord = (s: Service['currentStatus'], c: Cosmos) =>
  s === 'up'
    ? { text: 'Working', color: c.success }
    : s === 'down'
      ? { text: 'Outage', color: c.danger }
      : { text: 'No recent data', color: c.muted };

const impactColor = (i: StatusIncident['impact'], c: Cosmos) =>
  i === 'CRITICAL' || i === 'MAJOR' ? c.danger : i === 'MINOR' ? c.warn : c.text;

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
const dayLabel = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
/** Local calendar day, so incidents group the way the admin reads the clock. */
const localKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
/** Uptime buckets are UTC days. */
const utcDayLabel = (ymd: string) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function ServiceCard({ service }: { service: Service }) {
  const c = useCosmos();
  const [selected, setSelected] = useState<number | null>(null);
  const word = serviceWord(service.currentStatus, c);
  const day = selected != null ? service.days[selected] : null;

  const middle = day
    ? `${utcDayLabel(day.date)} · ${day.uptime != null ? `${day.uptime}% up` : 'No data'}`
    : service.uptimePercent != null
      ? `${service.uptimePercent}% uptime`
      : 'No data yet';

  return (
    <View style={styles.card}>
      <CardBackdrop />
      <View style={styles.serviceHead}>
        <Text style={[styles.serviceName, { color: c.text }]} numberOfLines={1}>
          {service.name}
        </Text>
        {service.latencyMs != null && service.currentStatus === 'up' ? (
          <Text style={[styles.small, { color: c.muted }]}>{service.latencyMs} ms</Text>
        ) : null}
        <Text style={[styles.word, { color: word.color }]}>{word.text}</Text>
      </View>
      <UptimeBars days={service.days} selected={selected} onSelect={setSelected} />
      <View style={styles.axis}>
        <Text style={[styles.small, { color: c.muted }]}>{service.days.length} days ago</Text>
        <Text style={[styles.small, { color: day ? c.text : c.muted }]} onPress={() => setSelected(null)}>
          {middle}
        </Text>
        <Text style={[styles.small, { color: c.muted }]}>Today</Text>
      </View>
    </View>
  );
}

function IncidentItem({ incident, onResolve }: { incident: StatusIncident; onResolve?: () => void }) {
  const c = useCosmos();
  const resolved = incident.status === 'RESOLVED';
  const when = resolved && incident.resolvedAt
    ? `${time(incident.startedAt)} to ${time(incident.resolvedAt)}`
    : `Since ${dayLabel(new Date(incident.startedAt))}, ${time(incident.startedAt)}`;

  return (
    <View style={styles.incident}>
      <Text style={[styles.incidentTitle, { color: resolved ? c.text : impactColor(incident.impact, c) }]}>
        {incident.title}
      </Text>
      <Text style={[styles.body, { color: c.soft }]}>
        <Text style={cosmosFont.strong}>{titleCase(incident.status)}</Text>
        {incident.body ? ` · ${incident.body}` : ''}
      </Text>
      <Text style={[styles.small, { color: c.muted }]}>
        {when}
        {incident.impact !== 'NONE' ? ` · ${titleCase(incident.impact)} impact` : ''}
      </Text>
      {onResolve ? (
        <Button label="Mark resolved" variant="ghost" size="sm" onPress={onResolve} style={{ alignSelf: 'flex-start', marginTop: spacing[1] }} />
      ) : null}
    </View>
  );
}

const IMPACTS: { value: StatusIncident['impact']; label: string }[] = [
  { value: 'MINOR', label: 'Minor' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'NONE', label: 'Maintenance' },
];

/** Report an incident by hand: what the self-checks can't see (proxy errors, rate limiting). */
function ReportIncident({ services, onDone }: { services: Service[]; onDone: () => void }) {
  const c = useCosmos();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [impact, setImpact] = useState<StatusIncident['impact']>('MINOR');
  const [affected, setAffected] = useState<string[]>(['api']);
  const [busy, setBusy] = useState(false);

  if (!open) return <Button label="Report an incident" variant="secondary" size="md" onPress={() => setOpen(true)} />;

  const submit = async () => {
    if (!title.trim()) return AppAlert.alert('Add a title', 'Say what is broken, for example "Checkout failing".');
    setBusy(true);
    const res = await createStatusIncident({ title: title.trim(), body: body.trim() || undefined, impact, affectedServices: affected });
    setBusy(false);
    if (!res.ok) return AppAlert.alert("Couldn't post it", res.message);
    setOpen(false);
    setTitle('');
    setBody('');
    onDone();
  };

  const input = [styles.input, { color: c.text, backgroundColor: c.tint }];
  return (
    <View style={styles.card}>
      <CardBackdrop />
      <TextInput value={title} onChangeText={setTitle} placeholder="What's wrong" placeholderTextColor={c.muted} maxLength={300} style={input} />
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder="Details (optional)"
        placeholderTextColor={c.muted}
        multiline
        style={[input, styles.multiline]}
      />
      <Text style={[styles.small, { color: c.muted }]}>Impact</Text>
      <ChipPicker options={IMPACTS} value={impact} onChange={(v) => v && setImpact(v)} />
      <Text style={[styles.small, { color: c.muted }]}>Affected</Text>
      <MultiChipPicker options={services.map((s) => ({ value: s.key, label: s.name }))} value={affected} onChange={setAffected} />
      <View style={styles.actions}>
        <Button label="Cancel" variant="ghost" size="md" onPress={() => setOpen(false)} style={{ flex: 1 }} />
        <Button label="Post" size="md" loading={busy} onPress={() => void submit()} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const EXTERNAL_LABEL: Record<ExternalMonitor['status'], string> = {
  up: 'Up',
  down: 'Down',
  degraded: 'Seems down',
  paused: 'Paused',
  unknown: 'Not checked yet',
};

const pct = (n: number | null) => (n === null ? '–' : `${n >= 99.995 ? '100' : n.toFixed(2)}%`);
const duration = (sec: number) => (sec >= 3600 ? `${Math.round(sec / 360) / 10} h` : sec >= 60 ? `${Math.round(sec / 60)} min` : `${sec} s`);

/** One UptimeRobot monitor: state, uptime over 1/7/30 days, response time, last downtime. */
function MonitorItem({ monitor: m }: { monitor: ExternalMonitor }) {
  const c = useCosmos();
  const color =
    m.status === 'up' ? c.success : m.status === 'down' ? c.danger : m.status === 'degraded' ? c.warn : c.muted;
  return (
    <View style={styles.incident}>
      <View style={styles.serviceHead}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.serviceName, { color: c.text }]} numberOfLines={1}>{m.name}</Text>
        <Text style={[styles.word, { color }]}>{EXTERNAL_LABEL[m.status]}</Text>
      </View>
      <Text style={[styles.small, { color: c.muted }]}>
        {`24 h ${pct(m.uptime.day)} · 7 d ${pct(m.uptime.week)} · 30 d ${pct(m.uptime.month)}${m.responseMs !== null ? ` · ${m.responseMs} ms` : ''}`}
      </Text>
      {m.lastDown ? (
        <Text style={[styles.small, { color: c.muted }]}>
          {`Last down ${dayLabel(new Date(m.lastDown.at))}, ${time(m.lastDown.at)} for ${duration(m.lastDown.durationSec)}${m.lastDown.reason ? ` (${m.lastDown.reason})` : ''}`}
        </Text>
      ) : null}
    </View>
  );
}

/** Public-status-page style board: overall banner, 90-day uptime bars, incidents by day. */
export default function PlatformStatusScreen() {
  const c = useCosmos();
  const topSpacing = useTopSpacing();
  const [data, setData] = useState<PlatformStatus | null>(null);
  const [external, setExternal] = useState<ExternalStatus | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [res, ext] = await Promise.all([getPlatformStatus(), getExternalStatus()]);
    if (ext.ok) setExternal(ext.data);
    if (res.ok) {
      setData(res.data);
      setError('');
    } else setError(res.denied ? 'Only Unifesto platform admins can see this.' : res.message);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const resolve = (i: StatusIncident) =>
    AppAlert.alert('Mark resolved?', i.title, [
      { text: 'Back', style: 'cancel' },
      {
        text: 'Resolve',
        onPress: async () => {
          const res = await updateStatusIncident(i.id, { status: 'RESOLVED' });
          if (!res.ok) return AppAlert.alert("Couldn't resolve it", res.message);
          void load();
        },
      },
    ]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!data) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        {error ? <Text style={[styles.small, { color: c.muted, textAlign: 'center' }]}>{error}</Text> : <ActivityIndicator color={c.primary} />}
      </View>
    );
  }

  const overall = overallLabel(data, c);
  const checked = data.lastSampleAt ?? data.updatedAt;
  const open = data.incidents.filter((i) => i.status !== 'RESOLVED');

  // One entry per day, today first, like a status page's incident history.
  const byDay = new Map<string, StatusIncident[]>();
  for (const i of data.incidents) {
    const k = localKey(new Date(i.startedAt));
    byDay.set(k, [...(byDay.get(k) ?? []), i]);
  }
  const history = Array.from({ length: data.incidentDays ?? 14 }, (_, n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return { date: d, items: byDay.get(localKey(d)) ?? [] };
  });

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} progressViewOffset={topSpacing} />}
    >
      <View style={[styles.banner, { backgroundColor: `${overall.color}22` }]}>
        <View style={[styles.dot, { backgroundColor: overall.color }]} />
        <Text style={[styles.bannerText, { color: c.text }]}>{overall.text}</Text>
        <Text style={[styles.small, { color: c.muted }]}>
          {data.stale ? (data.lastSampleAt ? `Last check ${dayLabel(new Date(checked))}, ${time(checked)}` : 'Never checked') : `As of ${time(checked)}`}
        </Text>
      </View>
      {data.stale ? (
        <Text style={[styles.hint, { color: c.warn }]}>
          Health checks have stopped reporting. The backend sampler, Redis or the database may be down.
        </Text>
      ) : null}

      {open.length > 0 ? (
        <>
          <Text style={[styles.section, { color: c.muted }]}>Happening now</Text>
          <View style={styles.card}>
            <CardBackdrop />
            {open.map((i, n) => (
              <View key={i.id}>
                {n > 0 ? <View style={[styles.divider, { backgroundColor: c.border }]} /> : null}
                <IncidentItem incident={i} onResolve={() => resolve(i)} />
              </View>
            ))}
          </View>
        </>
      ) : null}
      <View style={{ marginTop: open.length > 0 ? spacing[3] : spacing[6] }}>
        <ReportIncident services={data.services} onDone={() => void load()} />
      </View>

      <Text style={[styles.section, { color: c.muted }]}>Services</Text>
      <View style={styles.services}>
        {data.services.map((s) => (
          <ServiceCard key={s.key} service={s} />
        ))}
      </View>
      <Text style={[styles.hint, { color: c.muted }]}>
        Not an outside probe. The API checks itself every 5 minutes, so it can't see a dead server, proxy errors or
        rate limiting. Incidents count against uptime too. Drag across a bar strip to see a single day.
      </Text>

      {external ? (
        <>
          <Text style={[styles.section, { color: c.muted }]}>External monitoring (UptimeRobot)</Text>
          {!external.configured ? (
            <Text style={[styles.body, { color: c.muted, marginHorizontal: spacing[1] }]}>
              Not connected. Add a read-only UptimeRobot API key as UPTIMEROBOT_API_KEY in the backend's .env and deploy.
            </Text>
          ) : (
            <>
              {external.monitors.length > 0 ? (
                <View style={styles.card}>
                  <CardBackdrop />
                  {external.monitors.map((m, n) => (
                    <View key={m.id}>
                      {n > 0 ? <View style={[styles.divider, { backgroundColor: c.border }]} /> : null}
                      <MonitorItem monitor={m} />
                    </View>
                  ))}
                </View>
              ) : !external.error ? (
                <Text style={[styles.body, { color: c.muted, marginHorizontal: spacing[1] }]}>No monitors set up in UptimeRobot yet.</Text>
              ) : null}
              {external.error ? <Text style={[styles.hint, { color: c.warn }]}>{external.error}</Text> : null}
              <Text style={[styles.hint, { color: c.muted }]}>
                Checked from outside our servers, so it still sees an outage that stops our own checks.
                {external.fetchedAt ? ` As of ${time(external.fetchedAt)}.` : ''}
              </Text>
            </>
          )}
        </>
      ) : null}

      <Text style={[styles.section, { color: c.muted }]}>Past incidents</Text>
      {history.map(({ date, items }) => (
        <View key={localKey(date)} style={styles.day}>
          <Text style={[styles.dayTitle, { color: c.text }]}>{dayLabel(date)}</Text>
          <View style={[styles.rule, { backgroundColor: c.border }]} />
          {items.length === 0 ? (
            <Text style={[styles.body, { color: c.muted }]}>No incidents reported.</Text>
          ) : (
            items.map((i) => <IncidentItem key={i.id} incident={i} />)
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderRadius: borderRadius.xl,
  },
  bannerText: { flex: 1, fontSize: typography.fontSize.lg, ...cosmosFont.display },
  dot: { width: 10, height: 10, borderRadius: 5 },
  section: { marginTop: spacing[8], marginBottom: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  services: { gap: spacing[3] },
  card: { borderRadius: borderRadius.xl, overflow: 'hidden', padding: spacing[4], gap: spacing[3] },
  serviceHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  serviceName: { flex: 1, fontSize: typography.fontSize.base, ...cosmosFont.strong },
  word: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  axis: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  small: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  incident: { gap: 4, paddingVertical: spacing[1] },
  incidentTitle: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  body: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...cosmosFont.body },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing[2] },
  day: { marginBottom: spacing[5], gap: spacing[2] },
  dayTitle: { fontSize: typography.fontSize.base, ...cosmosFont.display },
  rule: { height: StyleSheet.hairlineWidth },
  input: { minHeight: 44, paddingHorizontal: spacing[3], borderRadius: borderRadius.lg, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  multiline: { minHeight: 80, paddingTop: spacing[3], textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: spacing[2] },
  hint: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...cosmosFont.body },
});
