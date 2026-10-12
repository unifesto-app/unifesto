import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AuthButton from '../auth/AuthButton';
import { FieldRow } from './FormFields';
import { SettingsGroup } from '../profile/SettingsGroup';
import {
  requestWhiteLabel,
  updateEventBranding,
  updateSpaceBranding,
  type WhiteLabelOverview,
  type WhiteLabelRequest,
} from '../../lib/api/whiteLabel';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';

const DEFAULT = '#3491ff';
const HEX = /^#[0-9a-f]{6}$/i;
const SWATCHES = ['#3491ff', '#7a5af8', '#e0457b', '#f04438', '#f79009', '#12b76a', '#0ba5ec', '#1d2939'];

interface BrandColorCardProps {
  spaceId: string;
  /** Omit for the space itself. */
  eventId?: string;
  enabled: boolean;
  brandColor: string | null;
  latest: WhiteLabelRequest | null;
  planHasBranding: boolean;
  /** Event targets: the space colour they already inherit. */
  inherited?: string | null;
  /** Space target only: email sender extras. */
  surfaces?: Pick<WhiteLabelOverview['space'], 'emailFromName' | 'emailReplyTo'>;
  onChanged: () => void | Promise<void>;
}

/**
 * One white-label target (the space or an event). Not on the plan → a note;
 * awaiting review → read-only; approved → pick and save a colour freely;
 * otherwise → pick a colour and send a request for a Platform Admin.
 */
export default function BrandColorCard({
  spaceId,
  eventId,
  enabled,
  brandColor,
  latest,
  planHasBranding,
  inherited,
  surfaces,
  onChanged,
}: BrandColorCardProps) {
  const c = useCosmos();
  // An event's card sits on the raised event row: step down to the tint there.
  const fill = eventId ? c.tint : c.raised;
  const pending = !enabled && latest?.status === 'PENDING';
  const seedColor = brandColor ?? latest?.brandColor ?? inherited ?? DEFAULT;

  const [color, setColor] = useState(seedColor);
  const [note, setNote] = useState('');
  const [fromName, setFromName] = useState(surfaces?.emailFromName ?? '');
  const [replyTo, setReplyTo] = useState(surfaces?.emailReplyTo ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);

  useEffect(() => setColor(seedColor), [seedColor]);

  const valid = HEX.test(color);

  if (!enabled && !pending && !planHasBranding) {
    return (
      <Text style={[styles.note, { color: c.muted }]}>
        Your own accent colour isn't part of this space's plan. See Plan and billing.
      </Text>
    );
  }

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    const res = enabled
      ? eventId
        ? await updateEventBranding(eventId, color)
        : await updateSpaceBranding(spaceId, {
            brandColor: color,
            emailFromName: fromName.trim() || undefined,
            emailReplyTo: replyTo.trim() || undefined,
          })
      : await requestWhiteLabel({
          spaceId,
          eventId,
          brandColor: color,
          reason: note.trim() || `Requesting white-label for this ${eventId ? 'event' : 'space'}.`,
        });
    setBusy(false);
    if (!res.ok) {
      setMessage({ text: res.message, bad: true });
      return;
    }
    setNote('');
    setMessage({ text: enabled ? 'Saved.' : 'Request sent.' });
    await onChanged();
  };

  return (
    <View>
      {eventId && !enabled && inherited ? (
        <Text style={[styles.note, { color: c.muted }]}>Already uses your space colour. Request only if it needs its own.</Text>
      ) : null}

      <View style={[styles.picker, { backgroundColor: fill, opacity: pending ? 0.5 : 1, pointerEvents: pending ? 'none' : 'auto' }]}>
        <View style={styles.previewRow}>
          <View style={[styles.preview, { backgroundColor: valid ? color : c.tint }]} />
          <TextInput
            value={color}
            onChangeText={(v) => setColor(v.trim())}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={7}
            placeholder={DEFAULT}
            placeholderTextColor={c.muted}
            selectionColor={c.text}
            style={[styles.hex, { color: valid ? c.text : c.danger }]}
          />
        </View>
        <View style={styles.swatches}>
          {SWATCHES.map((s) => (
            <Pressable
              key={s}
              onPress={() => setColor(s)}
              accessibilityLabel={`Use ${s}`}
              accessibilityRole="button"
              accessibilityState={{ selected: color.toLowerCase() === s }}
              style={[styles.swatch, { borderColor: color.toLowerCase() === s ? c.text : 'transparent' }]}
            >
              <View style={[styles.dot, { backgroundColor: s }]} />
            </Pressable>
          ))}
        </View>
      </View>
      {!valid ? <Text style={[styles.note, { color: c.danger }]}>Use a 6-digit hex colour, like #7a5af8.</Text> : null}

      {enabled && !eventId ? (
        <SettingsGroup title="Confirmation emails" plain surface={eventId ? c.tint : undefined}>
          <FieldRow stacked label="Sender name" value={fromName} onChangeText={setFromName} placeholder="Your organisation" />
          <FieldRow
            stacked
            label="Reply-to email"
            value={replyTo}
            onChangeText={setReplyTo}
            placeholder="hello@yourorg.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </SettingsGroup>
      ) : null}

      {pending ? (
        <Text style={[styles.note, { color: c.soft }]}>
          Waiting for review{latest?.requester?.fullName ? `, requested by ${latest.requester.fullName}` : ''}. You can change
          the colour any time once it's approved.
        </Text>
      ) : !enabled ? (
        <>
          {latest?.status === 'REJECTED' && latest.reviewNote ? (
            <Text style={[styles.note, { color: c.danger }]}>Last request declined: {latest.reviewNote}</Text>
          ) : null}
          <SettingsGroup plain surface={eventId ? c.tint : undefined}>
            <FieldRow stacked multiline label="Note for the reviewer (optional)" value={note} onChangeText={setNote} />
          </SettingsGroup>
        </>
      ) : null}

      {!pending ? (
        <AuthButton
          label={enabled ? 'Save colour' : 'Request own colour'}
          onPress={submit}
          loading={busy}
          disabled={!valid}
          style={{ marginTop: spacing[4] }}
        />
      ) : null}
      {message ? <Text style={[styles.note, { color: message.bad ? c.danger : c.success }]}>{message.text}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  picker: { borderRadius: cosmosCardRadius, overflow: 'hidden', padding: spacing[4], marginTop: spacing[3] },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  preview: { width: 40, height: 40, borderRadius: 12 },
  hex: { flex: 1, fontSize: typography.fontSize.lg, ...cosmosFont.strong },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], marginTop: spacing[4] },
  // 44pt tap target around a 32pt dot; the ring marks the picked one.
  swatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 32, height: 32, borderRadius: 16 },
  note: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
});
