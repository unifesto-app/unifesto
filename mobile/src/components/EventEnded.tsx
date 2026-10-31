import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Certificate, Confetti, Star, Trophy } from '@unifesto/unicon/react-native';
import { SettingsGroup, SettingsRow } from './profile/SettingsGroup';
import { getMyCertificates, type MyCertificate } from '../lib/api/certificates';
import { getFeedback } from '../lib/api/feedback';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, useCosmos } from '../theme/cosmos';

/**
 * My certificate for this event, once it has ended. Null while loading, when
 * none was issued, or before the event is over.
 * ponytail: reads my whole list (/certificates/mine); add a per-event query if lists grow long.
 */
export function useEventCertificate(eventId: string | undefined, ended: boolean): MyCertificate | null {
  const [cert, setCert] = useState<MyCertificate | null>(null);
  useEffect(() => {
    if (!eventId || !ended) return;
    let live = true;
    getMyCertificates().then((all) => live && setCert(all.find((c) => c.event.id === eventId) ?? null));
    return () => {
      live = false;
    };
  }, [eventId, ended]);
  return cert;
}

/**
 * Whether I can rate this event (F1), and whether I already did. Null while
 * loading, when feedback is off, or before the event is over.
 */
export function useEventFeedback(eventId: string | undefined, ended: boolean): { sent: boolean } | null {
  const [state, setState] = useState<{ sent: boolean } | null>(null);
  useEffect(() => {
    if (!eventId || !ended) return;
    let live = true;
    getFeedback(eventId).then((r) => live && setState(r.ok && r.data.open ? { sent: !!r.data.response } : null));
    return () => {
      live = false;
    };
  }, [eventId, ended]);
  return state;
}

/** Takes the place of the entry QR once the event is over: nothing left to scan. */
export function EndedStub({ checkedIn }: { checkedIn: boolean }) {
  const c = useCosmos();
  return (
    <View style={styles.stub}>
      <Confetti size={40} color={c.text} weight="fill" />
      <Text style={[styles.stubTitle, { color: c.text }]} accessibilityRole="header">This event has ended</Text>
      <Text style={[styles.stubBody, { color: c.muted }]}>
        {checkedIn ? 'Thanks for coming.' : 'Your ticket stays here for your records.'}
      </Text>
    </View>
  );
}

/**
 * What's left after an event: results, feedback and my certificate, each only
 * when it exists. Renders nothing when there is none.
 */
export function AfterEventGroup({
  cert,
  results,
  feedback,
  surface,
}: {
  cert: MyCertificate | null;
  results?: { value?: string; onPress: () => void } | null;
  feedback?: { sent: boolean; onPress: () => void } | null;
  surface?: string;
}) {
  const c = useCosmos();
  if (!cert && !results && !feedback) return null;
  return (
    <SettingsGroup title="After the event" surface={surface}>
      {feedback ? (
        <SettingsRow
          icon={<Star size={24} color={c.text} />}
          label={feedback.sent ? 'My feedback' : 'Rate this event'}
          value={feedback.sent ? 'Sent' : undefined}
          onPress={feedback.onPress}
        />
      ) : null}
      {results ? (
        <SettingsRow
          icon={<Trophy size={24} color={c.text} />}
          label="Results and winners"
          value={results.value || undefined}
          onPress={results.onPress}
        />
      ) : null}
      {cert ? (
        <SettingsRow
          icon={<Certificate size={24} color={c.text} />}
          label="My certificate"
          value={cert.locked ? 'Rate to unlock' : new Date(cert.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          external={!cert.locked}
          onPress={() => {
            // F2: held for my feedback; the feedback row opens the form.
            if (cert.locked) return feedback?.onPress();
            // The PDF when there is one (print quality), else the image.
            const url = cert.pdfUrl || cert.imageUrl;
            if (url) void WebBrowser.openBrowserAsync(url);
          }}
        />
      ) : null}
    </SettingsGroup>
  );
}

const styles = StyleSheet.create({
  stub: { alignItems: 'center', paddingVertical: spacing[6], gap: spacing[2] },
  stubTitle: { marginTop: spacing[2], fontSize: 20, lineHeight: 26, ...cosmosFont.display },
  stubBody: { fontSize: typography.fontSize.sm, textAlign: 'center', ...cosmosFont.body },
});
