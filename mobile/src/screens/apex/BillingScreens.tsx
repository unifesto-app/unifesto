import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { CurrencyInr, Hash, NotePencil, Percent } from '@unifesto/unicon/react-native';
import { RefreshControl } from '../../components/ui/RefreshControl';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../../hooks/useAnalyticsScreenTracking';
import { SettingsGroup, SettingsRow } from '../../components/profile/SettingsGroup';
import FormRow from '../../components/profile/FormRow';
import ManageStats from '../../components/manage/ManageStats';
import ChipPicker from '../../components/manage/ChipPicker';
import SearchList from '../../components/apex/SearchList';
import { ApexRow } from '../../components/apex/ApexRow';
import { Button } from '../../components/ui';
import { AppAlert } from '../../components/ui/AppAlert';
import {
  MODEL_LABEL,
  PLAN_FEATURES,
  PLAN_LABEL,
  PLAN_LIMITS,
  getBillingModels,
  getPlans,
  getSpaceBillingStats,
  listSpaceSubscriptions,
  updateBillingModel,
  updatePlan,
  updateSpaceSubscription,
  type BillingModel,
  type BillingModelConfig,
  type BillingStats,
  type FeatureKey,
  type LimitKey,
  type OrgPlan,
  type PlanInfo,
  type SpaceSubscription,
} from '../../lib/api/apexPlatform';
import { inrShort } from '../../utils/money';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

/*
 * Apex billing parity with the web: the plan catalogue (limits, prices, feature
 * switches) and each space's billing arrangement.
 */

const GUTTER = spacing[6];
const MODELS = ['FREE', 'REVENUE_SHARE'] as const;
const isModelKey = (k: string): k is 'FREE' | 'REVENUE_SHARE' => (MODELS as readonly string[]).includes(k);

/** '' ⇄ null (unlimited / unset); anything else must be a non-negative number. */
const toField = (n: number | string | null | undefined) => (n === null || n === undefined ? '' : String(n));
const parseField = (s: string): number | null | undefined => {
  if (!s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

function Centered({ error }: { error?: string }) {
  const tokens = useTokens();
  return (
    <View style={[styles.center, { backgroundColor: tokens.bg }]}>
      {error ? <Text style={[styles.muted, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
    </View>
  );
}

// ── Plans list ───────────────────────────────────────────────────────────────

export function PlansScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  useAnalyticsScreenTracking('ApexPlans');
  const [plans, setPlans] = useState<PlanInfo[] | null>(null);
  const [models, setModels] = useState<BillingModelConfig[]>([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [p, m] = await Promise.all([getPlans(), getBillingModels()]);
    if (!p.ok) {
      setError(p.message);
      return;
    }
    setError('');
    setPlans(p.data);
    setModels(m.ok ? m.data : []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!plans) return <Centered error={error} />;

  const featureCount = (x: PlanInfo | BillingModelConfig) => PLAN_FEATURES.filter(([k]) => x[k]).length;

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 80 }}
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
        />
      }
    >
      <SettingsGroup title="Subscription plans">
        {plans.map((p) => (
          <SettingsRow
            key={p.plan}
            label={PLAN_LABEL[p.plan]}
            value={`${p.monthlyPrice ? `${inrShort(p.monthlyPrice)}/mo` : 'Free'} · ${featureCount(p)} features`}
            onPress={() => router.push(`/apex/plans/${p.plan}`)}
          />
        ))}
      </SettingsGroup>
      {models.length ? (
        <SettingsGroup title="Billing models">
          {models.map((m) => (
            <SettingsRow
              key={m.billingModel}
              label={MODEL_LABEL[m.billingModel]}
              value={`${m.billingModel === 'REVENUE_SHARE' && m.defaultRevenueSharePercent != null ? `${m.defaultRevenueSharePercent}% · ` : ''}${featureCount(m)} features`}
              onPress={() => router.push(`/apex/plans/${m.billingModel}`)}
            />
          ))}
        </SettingsGroup>
      ) : null}
      <Text style={[styles.note, { color: tokens.textMuted }]}>
        A feature switched off here is hidden from every space on that plan, even if the code is live.
      </Text>
    </ScrollView>
  );
}

// ── Plan / model editor ──────────────────────────────────────────────────────

export function PlanEditScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  useAnalyticsScreenTracking('ApexPlanEdit');
  const model = isModelKey(key ?? '');
  const [item, setItem] = useState<PlanInfo | BillingModelConfig | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = model ? await getBillingModels() : await getPlans();
      const found = res.ok
        ? (res.data as (PlanInfo | BillingModelConfig)[]).find((x) => ('plan' in x ? x.plan : x.billingModel) === key)
        : undefined;
      if (!found) {
        setError(res.ok ? 'Plan not found.' : res.message);
        return;
      }
      setItem(found);
      const f: Record<string, string> = {};
      PLAN_LIMITS.forEach(([k]) => (f[k] = toField(found[k])));
      if ('plan' in found) {
        f.monthlyPrice = toField(found.monthlyPrice);
        f.annualPrice = toField(found.annualPrice);
        f.platformFeePercent = toField(found.platformFeePercent);
      } else {
        f.defaultRevenueSharePercent = toField(found.defaultRevenueSharePercent);
      }
      setFields(f);
    })();
  }, [key, model]);

  const patch = (body: Record<string, unknown>) =>
    model ? updateBillingModel(key as 'FREE' | 'REVENUE_SHARE', body) : updatePlan(key as OrgPlan, body);

  // Switches save on flip (optimistic), like the web's toggles.
  const toggle = async (k: FeatureKey, on: boolean) => {
    if (!item) return;
    setItem({ ...item, [k]: on });
    const res = await patch({ [k]: on });
    if (!res.ok) {
      setItem((cur) => (cur ? { ...cur, [k]: !on } : cur));
      AppAlert.alert('Not saved', res.message);
    }
  };

  const save = async () => {
    const body: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(fields)) {
      const n = parseField(v);
      if (n === undefined) {
        setError('Numbers only. Leave a limit blank for unlimited.');
        return;
      }
      body[k] = n;
    }
    setError('');
    setSaving(true);
    const res = await patch(body);
    setSaving(false);
    if (res.ok) AppAlert.alert('Saved', 'Limits and prices updated.');
    else setError(res.message);
  };

  if (!item) return <Centered error={error} />;

  const set = (k: string) => (v: string) => {
    setError('');
    setFields((f) => ({ ...f, [k]: v }));
  };
  const numRow = (k: string, label: string, icon: React.ReactNode) => (
    <View key={k}>
      <Text style={[styles.fieldLabel, { color: tokens.textMuted }]}>{label}</Text>
      <FormRow icon={icon} value={fields[k] ?? ''} onChangeText={set(k)} keyboardType="decimal-pad" placeholder="Unlimited" accessibilityLabel={label} />
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 80 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <SettingsGroup title="Features">
          {PLAN_FEATURES.map(([k, label]) => (
            <SettingsRow
              key={k}
              label={label}
              trailing={
                <Switch
                  value={!!item[k]}
                  onValueChange={(on) => void toggle(k, on)}
                  trackColor={{ true: tokens.success }}
                  accessibilityLabel={label}
                />
              }
            />
          ))}
        </SettingsGroup>

        <SettingsGroup title="Limits">{PLAN_LIMITS.map(([k, label]) => numRow(k, label, <Hash size={20} color={tokens.text} />))}</SettingsGroup>

        <SettingsGroup title={model ? 'Revenue share' : 'Pricing'}>
          {model
            ? numRow('defaultRevenueSharePercent', 'Default share %', <Percent size={20} color={tokens.text} />)
            : [
                numRow('monthlyPrice', 'Monthly price (₹)', <CurrencyInr size={20} color={tokens.text} />),
                numRow('annualPrice', 'Annual price (₹)', <CurrencyInr size={20} color={tokens.text} />),
                numRow('platformFeePercent', 'Platform fee % per ticket', <Percent size={20} color={tokens.text} />),
              ]}
        </SettingsGroup>

        {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}
        <View style={{ marginTop: spacing[6] }}>
          <Button label="Save limits & prices" onPress={save} loading={saving} size="lg" fullWidth />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Space subscriptions ──────────────────────────────────────────────────────

// The list hands the row to the editor (there's no GET by space).
const subCache = new Map<string, SpaceSubscription>();

const MODEL_FILTERS = [
  { value: '', label: 'All' },
  { value: 'SUBSCRIPTION', label: 'Subscription' },
  { value: 'REVENUE_SHARE', label: 'Revenue share' },
  { value: 'FREE', label: 'Free' },
];

const arrangement = (s: SpaceSubscription) =>
  !s.billingModel
    ? 'Not set up'
    : s.billingModel === 'SUBSCRIPTION'
      ? `${s.plan ? PLAN_LABEL[s.plan] : 'Plan'} · ${s.billingCycle === 'ANNUAL' ? 'yearly' : 'monthly'}`
      : s.billingModel === 'REVENUE_SHARE'
        ? `Revenue share · ${s.revenueSharePercent ?? 0}%`
        : 'Free';

export function SubscriptionsScreen() {
  const router = useRouter();
  const tokens = useTokens();
  useAnalyticsScreenTracking('ApexSubscriptions');
  const [model, setModel] = useState('');
  const [stats, setStats] = useState<BillingStats | null>(null);

  useEffect(() => {
    void getSpaceBillingStats().then((r) => r.ok && setStats(r.data));
  }, []);

  const fetchPage = useCallback(
    async (search: string, page: number) => {
      const r = await listSpaceSubscriptions({ search, billingModel: (model || undefined) as BillingModel | undefined, page, limit: 20 });
      return r.ok ? { ok: true as const, data: { items: r.data.data, total: r.data.total } } : r;
    },
    [model],
  );

  return (
    <SearchList<SpaceSubscription>
      placeholder="Space name"
      noun={['space', 'spaces']}
      fetchPage={fetchPage}
      keyOf={(s) => s.spaceId}
      header={
        <View style={{ marginTop: spacing[4], gap: spacing[3] }}>
          <ManageStats
            loading={!stats}
            stats={[
              { label: 'MRR', value: stats ? inrShort(stats.mrr) : 0 },
              { label: 'Paying', value: stats?.subscription ?? 0 },
              { label: 'Not set up', value: stats?.notConfigured ?? 0 },
            ]}
          />
          <ChipPicker options={MODEL_FILTERS} value={model} onChange={setModel} />
        </View>
      }
      renderItem={(s) => (
        <ApexRow
          imageUrl={s.space.logoUrl ?? null}
          title={s.space.name}
          meta={arrangement(s)}
          value={!s.isActive ? 'Inactive' : s.billingModel === 'SUBSCRIPTION' && Number(s.amount) ? inrShort(s.amount) : undefined}
          valueColor={!s.isActive ? tokens.danger : tokens.text}
          onPress={() => {
            subCache.set(s.spaceId, s);
            router.push(`/apex/subscriptions/${s.spaceId}`);
          }}
        />
      )}
    />
  );
}

const MODEL_OPTIONS = (['FREE', 'REVENUE_SHARE', 'SUBSCRIPTION'] as const).map((m) => ({ value: m, label: MODEL_LABEL[m] }));
/** GROWTH is retired (D10): offered only to keep a space that is still on it. */
const planOptions = (current: OrgPlan) =>
  ([...(['STARTER', 'PRO', 'ENTERPRISE'] as const), ...(current === 'GROWTH' ? (['GROWTH'] as const) : [])] as OrgPlan[]).map((p) => ({
    value: p,
    label: p === 'GROWTH' ? `${PLAN_LABEL[p]} (retired)` : PLAN_LABEL[p],
  }));
const CYCLE_OPTIONS = [
  { value: 'MONTHLY' as const, label: 'Monthly' },
  { value: 'ANNUAL' as const, label: 'Yearly' },
];

export function SubscriptionEditScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  useAnalyticsScreenTracking('ApexSubscriptionEdit');
  const sub = subCache.get(spaceId ?? '');

  const [billingModel, setBillingModel] = useState<BillingModel>(sub?.billingModel ?? 'FREE');
  const [share, setShare] = useState(toField(sub?.revenueSharePercent));
  const [plan, setPlan] = useState<OrgPlan>(sub?.plan ?? 'STARTER');
  const [cycle, setCycle] = useState<'MONTHLY' | 'ANNUAL'>(sub?.billingCycle ?? 'MONTHLY');
  const [amount, setAmount] = useState(toField(sub?.amount));
  const [active, setActive] = useState(sub?.isActive ?? true);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!sub) return <Centered error="Open this space from the Subscriptions list." />;

  const save = async () => {
    const pct = parseField(share);
    const amt = parseField(amount);
    if (billingModel === 'REVENUE_SHARE' && (pct == null || pct > 100)) return setError('Enter a share between 0 and 100.');
    if (billingModel === 'SUBSCRIPTION' && amt == null) return setError('Enter the amount charged.');
    setError('');
    setSaving(true);
    const res = await updateSpaceSubscription(sub.spaceId, {
      billingModel,
      isActive: active,
      reason: reason.trim() || undefined,
      ...(billingModel === 'REVENUE_SHARE' ? { revenueSharePercent: pct! } : {}),
      ...(billingModel === 'SUBSCRIPTION' ? { plan, billingCycle: cycle, amount: amt! } : {}),
    });
    setSaving(false);
    if (!res.ok) return setError(res.message);
    subCache.delete(sub.spaceId);
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 80 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <Text style={[styles.title, { color: tokens.text }]}>{sub.space.name}</Text>
        <Text style={[styles.muted, { color: tokens.textMuted, textAlign: 'left' }]}>Now: {arrangement(sub)}</Text>

        <Text style={[styles.section, { color: tokens.textMuted }]}>Billing model</Text>
        <ChipPicker options={MODEL_OPTIONS} value={billingModel} onChange={(v) => v && setBillingModel(v)} />

        {billingModel === 'REVENUE_SHARE' ? (
          <SettingsGroup title="Revenue share">
            <FormRow icon={<Percent size={20} color={tokens.text} />} value={share} onChangeText={setShare} keyboardType="decimal-pad" placeholder="e.g. 5" accessibilityLabel="Revenue share percent" />
          </SettingsGroup>
        ) : null}

        {billingModel === 'SUBSCRIPTION' ? (
          <>
            <Text style={[styles.section, { color: tokens.textMuted }]}>Plan</Text>
            <ChipPicker options={planOptions(sub?.plan ?? plan)} value={plan} onChange={(v) => v && setPlan(v)} />
            <Text style={[styles.section, { color: tokens.textMuted }]}>Billed</Text>
            <ChipPicker options={CYCLE_OPTIONS} value={cycle} onChange={(v) => v && setCycle(v)} />
            <SettingsGroup title="Amount (₹)">
              <FormRow icon={<CurrencyInr size={20} color={tokens.text} />} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" accessibilityLabel="Amount in rupees" />
            </SettingsGroup>
          </>
        ) : null}

        <SettingsGroup>
          <SettingsRow label="Active" trailing={<Switch value={active} onValueChange={setActive} trackColor={{ true: tokens.success }} accessibilityLabel="Active" />} />
          <FormRow icon={<NotePencil size={20} color={tokens.text} />} value={reason} onChangeText={setReason} placeholder="Reason (kept in history)" multiline />
        </SettingsGroup>

        {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}
        <View style={{ marginTop: spacing[6] }}>
          <Button label="Save arrangement" onPress={save} loading={saving} size="lg" fullWidth />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
  note: { marginTop: spacing[4], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...font() },
  fieldLabel: { marginTop: spacing[3], marginLeft: spacing[4], fontSize: typography.fontSize.xs, ...font('medium') },
  error: { marginTop: spacing[4], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...font('medium') },
  title: { fontSize: typography.fontSize.xl, ...font('heading') },
  section: { marginTop: spacing[6], marginBottom: spacing[2], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...font('semibold') },
});
