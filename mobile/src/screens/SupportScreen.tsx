import React, { useCallback, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Application from 'expo-application';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect, useRouter } from 'expo-router';
import { EnvelopeSimple, WhatsappLogo } from '@unifesto/unicon/react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useAuth } from '../context/AuthContext';
import useTopSpacing from '../hooks/useTopSpacing';
import { listMyTickets, type SupportTicket } from '../lib/api/support';
import TicketRow from '../components/support/TicketRow';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import AuthButton from '../components/auth/AuthButton';
import Skeleton from '../components/Skeleton';
import { GUTTER, Section } from '../components/home/Section';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const SUPPORT_EMAIL = 'support@unifesto.app';
const WHATSAPP_NUMBER = '919346095136';
const WHATSAPP_DISPLAY = '+91 93460 95136';

const WEB = 'https://unifesto.app';
// Every legal page on the website (websites/web/src/components/Footer.tsx legal bar,
// plus Refunds and Grievance from its Help column). Delete account lives in Account.
const POLICIES = [
  { label: 'Terms of service', path: '/terms' },
  { label: 'Privacy policy', path: '/privacy' },
  { label: 'Privacy notice', path: '/privacy-notice' },
  { label: 'Cookies', path: '/cookies' },
  { label: 'Refunds', path: '/refund' },
  { label: 'Code of conduct', path: '/code-of-conduct' },
];
const YOUR_DATA = [
  { label: 'Data rights', path: '/data-rights' },
  { label: 'Privacy requests', path: '/privacy-requests' },
  { label: 'Grievance redressal', path: '/grievance' },
  { label: 'Subprocessors', path: '/subprocessors' },
  { label: 'Security', path: '/security' },
];

/** Legal pages open in the in-app browser, so reading one doesn't leave the app. */
const openPage = (path: string) =>
  WebBrowser.openBrowserAsync(`${WEB}${path}`).catch(() => open(`${WEB}${path}`));

const open = (url: string) =>
  Linking.openURL(url).catch(() => AppAlert.alert('Could not open', 'Please try again, or reach us another way.'));

/**
 * Pre-fills the email with app + device details under a divider, so support
 * can see the version without a back-and-forth.
 */
function supportMailto() {
  const details = [
    `App version: ${Application.nativeApplicationVersion ?? 'unknown'} (${Application.nativeBuildVersion ?? '?'})`,
    `Device: ${Platform.OS === 'ios' ? 'iOS' : 'Android'} ${Platform.Version}`,
  ].join('\n');
  const body = `\n\n\n---\n${details}`;
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Help with Unifesto')}&body=${encodeURIComponent(body)}`;
}


/**
 * Profile › Support. Signed in, a tracked request comes first (replies land in
 * the app and the team sees the build it came from), then My help: every case
 * I raised (questions, refunds, requests, reports…), newest activity first,
 * with a dot on the ones that have news. Email and WhatsApp follow for a quick word,
 * and the legal pages close the page.
 */
export default function SupportScreen() {
  const c = useCosmos();
  const router = useRouter();
  const topSpacing = useTopSpacing();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return setTickets([]);
    const list = await listMyTickets();
    // Platform admins get every case from this endpoint; this page is only mine.
    // ponytail: filters the newest 100, so an admin's own older cases can drop off; add a `mine` query param if that bites.
    setTickets(list.filter((t) => t.requesterId === user.id));
  }, [user]);

  // On focus, so a request raised or answered elsewhere shows on return.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const newRequest = () => router.push('/manage/support/new');

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={{ paddingTop: topSpacing, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          user ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.text} colors={[c.text]} progressViewOffset={topSpacing} />
          ) : undefined
        }
      >
        <View style={[styles.card, { backgroundColor: c.raised }]}>
          <View style={[styles.rule, { backgroundColor: `rgba(${c.glow}, 0.7)` }]} />
          <Text style={[styles.title, { color: c.text }]}>How can we help?</Text>
          <Text style={[styles.body, { color: c.soft }]}>
            {user
              ? 'Tell us what’s up and we’ll reply right here in the app. We see which version you’re on, so no need to explain.'
              : 'Sign in to raise a request and follow the replies in the app, or reach us directly below.'}
          </Text>
          {user ? (
            <AuthButton label="Start a request" arrow onPress={newRequest} style={{ marginTop: spacing[6] }} />
          ) : (
            <AuthButton label="Sign in" arrow onPress={() => router.push('/login')} style={{ marginTop: spacing[6] }} />
          )}
        </View>

        {user && (tickets === null || tickets.length > 0) ? (
          <Section title="My help" subtitle="Everything I've raised, newest first">
            <View style={[styles.list, styles.pad]}>
              {tickets === null
                ? [0, 1].map((i) => <Skeleton key={i} width="100%" height={76} borderRadius={cosmosCardRadius} />)
                : tickets.map((t) => <TicketRow key={t.id} ticket={t} onPress={() => router.push(`/manage/support/${t.id}`)} />)}
            </View>
          </Section>
        ) : null}

        <Section title="Talk to us" subtitle="For a quick word">
          <SettingsGroup style={styles.group}>
            <SettingsRow
              icon={<EnvelopeSimple size={26} color={c.text} />}
              label="Email"
              value={SUPPORT_EMAIL}
              external
              onPress={() => open(supportMailto())}
            />
            <SettingsRow
              icon={<WhatsappLogo size={26} color={c.text} />}
              label="WhatsApp"
              value={WHATSAPP_DISPLAY}
              external
              onPress={() => open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Hi Unifesto Support')}`)}
            />
          </SettingsGroup>
        </Section>

        <Section title="Policies" subtitle="The terms Unifesto runs on">
          <SettingsGroup plain style={styles.group}>
            {POLICIES.map((p) => (
              <SettingsRow key={p.path} label={p.label} external onPress={() => openPage(p.path)} />
            ))}
          </SettingsGroup>
        </Section>

        <Section title="Your data" subtitle="What we hold and how to ask about it">
          <SettingsGroup plain style={styles.group}>
            {YOUR_DATA.map((p) => (
              <SettingsRow key={p.path} label={p.label} external onPress={() => openPage(p.path)} />
            ))}
          </SettingsGroup>
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pad: { paddingHorizontal: GUTTER },
  // SettingsGroup's own top margin doubles Section's; Section owns spacing.
  group: { marginTop: 0, marginHorizontal: GUTTER },
  card: { marginHorizontal: GUTTER, marginTop: spacing[4], borderRadius: cosmosCardRadius, padding: spacing[6] },
  rule: { width: 40, height: 1, marginBottom: spacing[5] },
  title: { fontSize: 20, lineHeight: 28, ...cosmosFont.display },
  body: { marginTop: spacing[3], fontSize: typography.fontSize.base, lineHeight: 22, ...cosmosFont.body },
  list: { gap: spacing[3] },
});
