import React from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import * as Application from 'expo-application';
import { EnvelopeSimple, FileText, ShieldCheck, WhatsappLogo } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';
import { AppAlert } from '../components/ui/AppAlert';

const SUPPORT_EMAIL = 'support@unifesto.app';
const WHATSAPP_NUMBER = '919346095136';
const WHATSAPP_DISPLAY = '+91 93460 95136';

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

export default function SupportScreen() {
  const tokens = useTokens();
  const topSpacing = useTopSpacing();

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: tokens.text }]}>How can we help?</Text>
      <Text style={[styles.lead, { color: tokens.textSecondary }]}>Reach the Unifesto team directly.</Text>

      <SettingsGroup title="Contact">
        <SettingsRow
          icon={<EnvelopeSimple size={26} color={tokens.accent} weight="fill" />}
          label="Email"
          value={SUPPORT_EMAIL}
          external
          onPress={() => open(supportMailto())}
        />
        <SettingsRow
          icon={<WhatsappLogo size={26} color="#25D366" weight="fill" />}
          label="WhatsApp"
          value={WHATSAPP_DISPLAY}
          external
          onPress={() => open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Hi Unifesto Support')}`)}
        />
      </SettingsGroup>

      <SettingsGroup title="Legal">
        <SettingsRow
          icon={<FileText size={26} color={tokens.textSecondary} />}
          label="Terms of service"
          external
          onPress={() => open('https://unifesto.app/terms')}
        />
        <SettingsRow
          icon={<ShieldCheck size={26} color={tokens.textSecondary} />}
          label="Privacy policy"
          external
          onPress={() => open('https://unifesto.app/privacy')}
        />
      </SettingsGroup>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing[6], paddingBottom: 100 },
  title: {
    marginTop: spacing[2],
    fontSize: typography.fontSize['3xl'],
    lineHeight: typography.fontSize['3xl'] * 1.15,
    letterSpacing: -0.5,
    ...font('heading'),
  },
  lead: { marginTop: spacing[2], fontSize: typography.fontSize.base, ...font() },
});
