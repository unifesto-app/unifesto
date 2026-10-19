import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Certificate, Confetti, Trophy } from '@unifesto/unicon/react-native';
import { SettingsGroup, SettingsRow } from './profile/SettingsGroup';
import { getMyCertificates, type MyCertificate } from '../lib/api/certificates';
import { useTokens } from '../context/ThemeContext';
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

/** Takes the place of the entry QR once the event is over: nothing left to scan. */
export function EndedStub({ checkedIn }: { checkedIn: boolean }) {
  const c = useCosmos();
  return (
    <View style={styles.stub}>
      <Confetti size={40} color={c.primary} weight="fill" />
      <Text style={[styles.stubTitle, { color: c.text }]}>This event has ended</Text>
      <Text style={[styles.stubBody, { color: c.muted }]}>
        {checkedIn ? 'Thanks for coming.' : 'Your ticket stays here for your records.'}
      </Text>
    </View>
  );
}

/**
 * What's left after an event: results and my certificate, each only when it
 * exists. Renders nothing when there is neither.
 * ponytail: no feedback row yet; add it with the attendee feedback form (F1).
 */
export function AfterEventGroup({
  cert,
  results,
  surface,
}: {
  cert: MyCertificate | null;
  results?: { value?: string; onPress: () => void } | null;
  surface?: string;
}) {
  const tokens = useTokens();
  if (!cert && !results) return null;
  return (
    <SettingsGroup title="After the event" surface={surface}>
      {results ? (
        <SettingsRow
          icon={<Trophy size={24} color={tokens.text} />}
          label="Results and winners"
          value={results.value || undefined}
          onPress={results.onPress}
        />
      ) : null}
      {cert ? (
        <SettingsRow
          icon={<Certificate size={24} color={tokens.text} />}
          label="My certificate"
          value={new Date(cert.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          external
          onPress={() => {
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
  stubTitle: { marginTop: spacing[2], fontSize: typography.fontSize.lg, ...cosmosFont.strong },
  stubBody: { fontSize: typography.fontSize.sm, textAlign: 'center', ...cosmosFont.body },
});
