import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaperPlaneTilt } from '@unifesto/unicon/react-native';
import { getWhatsappConfig, setTicketWhatsappLink, updateEvent, type EventWhatsappConfig } from '../lib/api/eventAdmin';
import { sendWhatsappBlast } from '../lib/api/manageEvent';
import { FieldRow } from '../components/manage/FormFields';
import SaveBar from '../components/manage/SaveBar';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import CosmosScreen from '../components/ui/CosmosScreen';
import { CardBackdrop } from '../components/ui/CardSurface';
import { GUTTER } from '../components/home/Section';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const PLACEHOLDER = 'https://chat.whatsapp.com/…';

/**
 * The event's private attendee WhatsApp group: one event-level link, optional
 * per-ticket links (holders of that ticket go to its group instead), and the
 * send-once invite blast. Links are only ever messaged to confirmed attendees,
 * never shown on the public page.
 */
export default function EventWhatsappScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const c = useCosmos();
  const insets = useSafeAreaInsets();

  const [config, setConfig] = useState<EventWhatsappConfig | null>(null);
  const [loadError, setLoadError] = useState('');
  const [eventUrl, setEventUrl] = useState('');
  const [ticketUrls, setTicketUrls] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getWhatsappConfig(eventId);
    if (!res.ok) {
      setLoadError(res.denied ? "You can't manage this event's WhatsApp group." : res.message);
      return;
    }
    setLoadError('');
    setConfig(res.data);
    setEventUrl(res.data.whatsappAttendeeGroupUrl ?? '');
    setTicketUrls(Object.fromEntries(res.data.ticketTypes.map((t) => [t.id, t.whatsappGroupUrl ?? ''])));
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const changedTickets = useMemo(
    () => (config?.ticketTypes ?? []).filter((t) => (ticketUrls[t.id] ?? '').trim() !== (t.whatsappGroupUrl ?? '').trim()),
    [config, ticketUrls],
  );
  const eventChanged = !!config && eventUrl.trim() !== (config.whatsappAttendeeGroupUrl ?? '').trim();
  const dirty = eventChanged || changedTickets.length > 0;

  const save = async () => {
    if (!eventId) return;
    setSaving(true);
    setError('');
    // Only PATCH what changed; an empty string clears a link server-side.
    if (eventChanged) {
      const res = await updateEvent(eventId, { whatsappAttendeeGroupUrl: eventUrl.trim() });
      if (!res.ok) {
        setSaving(false);
        setError(res.message);
        return;
      }
    }
    for (const t of changedTickets) {
      const res = await setTicketWhatsappLink(eventId, t.id, (ticketUrls[t.id] ?? '').trim());
      if (!res.ok) {
        setSaving(false);
        setError(`${t.name}: ${res.message}`);
        await load();
        return;
      }
    }
    await load();
    setSaving(false);
  };

  const confirmBlast = () =>
    AppAlert.alert(
      'Send the group invite?',
      "Confirmed attendees who haven't been invited or already joined get the link. Nobody is messaged twice.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setSending(true);
            const res = await sendWhatsappBlast(eventId!);
            setSending(false);
            if (!res.ok) {
              AppAlert.alert("Couldn't send", res.message);
              return;
            }
            const r = res.data;
            if (r.eligible === 0) {
              AppAlert.alert('Nobody new to invite', 'Everyone has already been invited or has joined.');
              return;
            }
            const skipped = [
              r.noPhone ? `${r.noPhone} without a phone number` : '',
              r.noLink ? `${r.noLink} with no group link` : '',
              r.failed ? `${r.failed} failed` : '',
            ].filter(Boolean);
            AppAlert.alert(
              r.queued ? `Sending to ${r.sent}` : `Sent to ${r.sent}`,
              [r.queued ? 'Invites go out over the next few minutes.' : '', skipped.length ? `Skipped: ${skipped.join(', ')}.` : '']
                .filter(Boolean)
                .join(' ') || undefined,
            );
          },
        },
      ],
    );

  if (!config) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        {loadError ? (
          <View style={styles.empty}>
            <CardBackdrop shape={styles.empty} />
            <Text style={[styles.muted, { color: c.soft }]}>{loadError}</Text>
            <Button label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[4] }} />
          </View>
        ) : (
          <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
        )}
      </CosmosScreen>
    );
  }

  const usingParent = !eventUrl.trim() && !!config.parentAttendeeGroupUrl;

  return (
    <CosmosScreen
      keyboard
      keyboardDismissMode="interactive"
      bottom={140 + insets.bottom}
      contentContainerStyle={styles.content}
      footer={<SaveBar visible={dirty} label="Save links" onPress={save} loading={saving} error={error} />}
    >
      <Text style={[styles.intro, { color: c.soft }]}>
        Create the group in WhatsApp, then paste its invite link. Attendees get it when they register, and it never shows
        on the public event page.
      </Text>

      <SettingsGroup title="Attendee group" plain>
        <FieldRow
          stacked
          label="Group invite link"
          value={eventUrl}
          onChangeText={setEventUrl}
          placeholder={PLACEHOLDER}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </SettingsGroup>
      {usingParent ? (
        <Text style={[styles.note, { color: c.muted }]}>
          No group of its own yet, so attendees go to the main event's group: {config.parentAttendeeGroupUrl}
        </Text>
      ) : null}

      {config.ticketTypes.length > 0 ? (
        <>
          <SettingsGroup title="Per-ticket groups" plain>
            {config.ticketTypes.map((t) => (
              <FieldRow
                key={t.id}
                stacked
                label={t.name}
                value={ticketUrls[t.id] ?? ''}
                onChangeText={(v) => setTicketUrls((m) => ({ ...m, [t.id]: v }))}
                placeholder="Blank uses the attendee group"
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
            ))}
          </SettingsGroup>
          <Text style={[styles.note, { color: c.muted }]}>
            Holders of a ticket with its own link are invited there instead.
          </Text>
        </>
      ) : null}

      <SettingsGroup title="Invite">
        <SettingsRow
          icon={<PaperPlaneTilt size={28} color={c.text} />}
          label="Send invite to attendees"
          trailing={sending ? <ActivityIndicator size="small" color={c.text} /> : undefined}
          onPress={sending ? undefined : dirty ? () => AppAlert.alert('Save first', 'Save your link changes before sending.') : confirmBlast}
        />
      </SettingsGroup>
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6], alignItems: 'center' },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...cosmosFont.body },
  intro: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, marginLeft: spacing[1], ...cosmosFont.body },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...cosmosFont.body },
});
