import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trash } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { createCoupon, deleteCoupon, getCoupons, updateCoupon, type Coupon, type CouponInput, type DiscountType } from '../lib/api/coupons';
import { getManagedEvent } from '../lib/api/eventAdmin';
import { BlockTitle, FieldRow, SwitchRow } from '../components/manage/FormFields';
import DateTimeRow from '../components/manage/DateTimeRow';
import SaveBar from '../components/manage/SaveBar';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const TYPES = [
  { key: 'PERCENT' as const, label: 'Percent off' },
  { key: 'FLAT' as const, label: 'Rupees off' },
];

interface Draft {
  code: string;
  description: string;
  discountType: DiscountType;
  discountValue: string;
  maxDiscountAmount: string;
  minPurchaseAmount: string;
  usageLimit: string;
  perUserLimit: string;
  startsAt: Date | null;
  expiresAt: Date | null;
  ticketIds: string[];
  isActive: boolean;
}

const EMPTY: Draft = {
  code: '',
  description: '',
  discountType: 'PERCENT',
  discountValue: '',
  maxDiscountAmount: '',
  minPurchaseAmount: '',
  usageLimit: '',
  perUserLimit: '1',
  startsAt: null,
  expiresAt: null,
  ticketIds: [],
  isActive: true,
};

const numStr = (v: number | string | null) => (v == null ? '' : String(Number(v)));

const toDraft = (c: Coupon): Draft => ({
  code: c.code,
  description: c.description ?? '',
  discountType: c.discountType,
  discountValue: numStr(c.discountValue),
  maxDiscountAmount: numStr(c.maxDiscountAmount),
  minPurchaseAmount: numStr(c.minPurchaseAmount),
  usageLimit: c.usageLimit != null ? String(c.usageLimit) : '',
  perUserLimit: String(c.perUserLimit),
  startsAt: c.startsAt ? new Date(c.startsAt) : null,
  expiresAt: c.expiresAt ? new Date(c.expiresAt) : null,
  ticketIds: c.appliesToTicketTypeIds ?? [],
  isActive: c.isActive,
});

/** Create or edit one discount code. To pause one without losing its history, switch it off. */
export default function CouponEditorScreen() {
  const { eventId, couponId } = useLocalSearchParams<{ eventId: string; couponId: string }>();
  const isNew = couponId === 'new';
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const [draft, setDraft] = useState<Draft | null>(isNew ? EMPTY : null);
  const initial = useRef('');
  const [paidTickets, setPaidTickets] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useAnalyticsScreenTracking('CouponEditor');

  useEffect(() => {
    if (!eventId) return;
    void getManagedEvent(eventId).then((r) => {
      if (!r.ok) return;
      const types = (r.data as unknown as { ticketTypes?: { id: string; name: string; price: number | string }[] }).ticketTypes ?? [];
      setPaidTickets(types.filter((t) => Number(t.price) > 0));
    });
    if (!isNew)
      void getCoupons(eventId).then((r) => {
        const c = r.ok ? r.data.find((x) => x.id === couponId) : undefined;
        if (!c) {
          setError('This code no longer exists.');
          return;
        }
        const d = toDraft(c);
        initial.current = JSON.stringify(d);
        setDraft(d);
      });
  }, [eventId, couponId, isNew]);

  const set = (patch: Partial<Draft>) => {
    setError('');
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  const dirty = isNew || (draft !== null && JSON.stringify(draft) !== initial.current);

  const save = async () => {
    if (!draft) return;
    const value = Number(draft.discountValue);
    if (!draft.code.trim()) return setError('Enter a code.');
    if (!value || value <= 0) return setError('The discount has to be more than 0.');
    if (draft.discountType === 'PERCENT' && value > 100) return setError("A percentage can't go over 100.");
    if (draft.startsAt && draft.expiresAt && draft.expiresAt <= draft.startsAt) return setError('The end has to be after the start.');
    const optNum = (s: string) => (s.trim() ? Number(s) : undefined);
    const body: CouponInput = {
      code: draft.code.trim().toUpperCase(),
      description: draft.description.trim() || undefined,
      discountType: draft.discountType,
      discountValue: value,
      maxDiscountAmount: draft.discountType === 'PERCENT' ? optNum(draft.maxDiscountAmount) : undefined,
      minPurchaseAmount: optNum(draft.minPurchaseAmount),
      usageLimit: optNum(draft.usageLimit),
      perUserLimit: Number(draft.perUserLimit) || 1,
      startsAt: draft.startsAt?.toISOString(),
      expiresAt: draft.expiresAt?.toISOString(),
      appliesToTicketTypeIds: draft.ticketIds,
      isActive: draft.isActive,
    };
    setSaving(true);
    const res = isNew ? await createCoupon(eventId!, body) : await updateCoupon(eventId!, couponId!, body);
    setSaving(false);
    if (!res.ok) return setError(res.message);
    router.back();
  };

  const remove = () =>
    AppAlert.alert(`Delete ${draft?.code}?`, 'Buyers can no longer use it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          const res = await deleteCoupon(eventId!, couponId!);
          setDeleting(false);
          if (!res.ok) return AppAlert.alert("Couldn't delete", res.message);
          router.back();
        },
      },
    ]);

  const title = isNew ? 'New code' : 'Edit code';

  if (!draft) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <Stack.Screen options={{ title }} />
        {error ? <Text style={[styles.note, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const pct = draft.discountType === 'PERCENT';
  const tomorrow = () => new Date(Date.now() + 24 * 3600 * 1000);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ title }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 140 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <SettingsGroup plain>
          <FieldRow
            stacked
            label="Code"
            value={draft.code}
            onChangeText={(v) => set({ code: v.toUpperCase().replace(/\s/g, '') })}
            placeholder="EARLYBIRD"
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <FieldRow stacked label="Note (optional, only your team sees it)" value={draft.description} onChangeText={(v) => set({ description: v })} />
        </SettingsGroup>

        <View style={{ marginTop: spacing[8] }}>
          <BlockTitle>Discount</BlockTitle>
          <SegmentedTabs tabs={TYPES} value={draft.discountType} onChange={(t) => set({ discountType: t })} />
        </View>
        <SettingsGroup plain>
          <FieldRow label={pct ? 'Percent' : 'Amount (₹)'} value={draft.discountValue} onChangeText={(v) => set({ discountValue: v })} keyboardType="decimal-pad" />
          {pct ? (
            <FieldRow label="Cap (₹)" value={draft.maxDiscountAmount} onChangeText={(v) => set({ maxDiscountAmount: v })} placeholder="No cap" keyboardType="decimal-pad" />
          ) : null}
          <FieldRow label="Minimum order (₹)" value={draft.minPurchaseAmount} onChangeText={(v) => set({ minPurchaseAmount: v })} placeholder="None" keyboardType="decimal-pad" />
        </SettingsGroup>

        <SettingsGroup title="Limits" plain>
          <FieldRow label="Total uses" value={draft.usageLimit} onChangeText={(v) => set({ usageLimit: v })} placeholder="Unlimited" keyboardType="number-pad" />
          <FieldRow label="Uses per person" value={draft.perUserLimit} onChangeText={(v) => set({ perUserLimit: v })} keyboardType="number-pad" />
        </SettingsGroup>

        <SettingsGroup title="When" plain>
          <SwitchRow label="Starts later" value={!!draft.startsAt} onValueChange={(on) => set({ startsAt: on ? tomorrow() : null })} />
          {draft.startsAt ? <DateTimeRow label="Starts" value={draft.startsAt} onChange={(d) => set({ startsAt: d })} /> : null}
          <SwitchRow label="Has an end date" value={!!draft.expiresAt} onValueChange={(on) => set({ expiresAt: on ? new Date(Date.now() + 7 * 24 * 3600 * 1000) : null })} />
          {draft.expiresAt ? <DateTimeRow label="Ends" value={draft.expiresAt} minimumDate={draft.startsAt ?? undefined} onChange={(d) => set({ expiresAt: d })} /> : null}
        </SettingsGroup>

        {paidTickets.length > 1 ? (
          <>
            <SettingsGroup title="Works on" plain>
              {paidTickets.map((t) => (
                <SwitchRow
                  key={t.id}
                  label={t.name}
                  value={draft.ticketIds.includes(t.id)}
                  onValueChange={(on) =>
                    set({ ticketIds: on ? [...draft.ticketIds, t.id] : draft.ticketIds.filter((x) => x !== t.id) })
                  }
                />
              ))}
            </SettingsGroup>
            <Text style={[styles.note, { color: tokens.textMuted }]}>
              {draft.ticketIds.length ? 'Only the tickets switched on.' : 'None picked, so it works on every paid ticket.'}
            </Text>
          </>
        ) : null}

        <SettingsGroup plain>
          <SwitchRow label="Active" hint="Turn off to pause the code without deleting it." value={draft.isActive} onValueChange={(v) => set({ isActive: v })} />
        </SettingsGroup>

        {!isNew ? (
          <Button
            label="Delete code"
            variant="danger"
            size="lg"
            fullWidth
            loading={deleting}
            disabled={saving}
            icon={<Trash size={18} color={tokens.danger} weight="bold" />}
            onPress={remove}
            style={{ marginTop: spacing[10] }}
          />
        ) : null}
      </ScrollView>

      <SaveBar visible={dirty} label={isNew ? 'Create code' : 'Save changes'} onPress={save} loading={saving} disabled={deleting} error={error} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
