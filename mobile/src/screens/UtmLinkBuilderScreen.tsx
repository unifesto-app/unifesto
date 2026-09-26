import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { FieldRow } from '../components/manage/FormFields';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { shareLink } from '../lib/share';
import { withUtm } from '../services/utm';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

const SOURCES = ['instagram', 'whatsapp', 'linkedin', 'x', 'email', 'college', 'poster'];
const MEDIUMS = ['social', 'email', 'ads', 'print', 'qr', 'referral'];

/**
 * Tags are stored lowercased server-side, so normalise here too — the link a
 * curator copies reads exactly like the row it will show up as.
 */
const tag = (v: string) =>
  v
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

function Chips({ options, value, onPick }: { options: string[]; value: string; onPick: (v: string) => void }) {
  const tokens = useTokens();
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable
            key={o}
            onPress={() => onPick(on ? '' : o)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.chip, { backgroundColor: on ? tokens.accent : tokens.fill }]}
          >
            <Text style={[styles.chipText, { color: on ? tokens.accentFg : tokens.text }]}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Build a tracking link for any channel the fixed buttons don't cover (a
 * college notice board QR, a newsletter, an ad). Opened with the public
 * event or space URL to tag; registrations through the result show up under
 * its source in the tracking breakdown.
 */
export default function UtmLinkBuilderScreen() {
  const { url, title, campaign: defaultCampaign } = useLocalSearchParams<{ url: string; title?: string; campaign?: string }>();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [source, setSource] = useState('');
  const [medium, setMedium] = useState('');
  const [campaign, setCampaign] = useState(defaultCampaign ?? '');

  useAnalyticsScreenTracking('UtmLinkBuilder');

  const s = tag(source);
  const link = s && url ? withUtm(url, { source: s, medium: tag(medium) || undefined, campaign: tag(campaign) || undefined }) : '';

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(link);
      AppAlert.alert('Link copied', `Registrations through it show up as "${s}".`);
    } catch {
      AppAlert.alert('Unable to copy', 'Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {title ? <Text style={[styles.title, { color: tokens.text }]} numberOfLines={2}>{title}</Text> : null}

        <SettingsGroup title="Where you'll post it" plain>
          <FieldRow label="Source" value={source} onChangeText={setSource} placeholder="e.g. instagram" autoCapitalize="none" autoCorrect={false} />
        </SettingsGroup>
        <Chips options={SOURCES} value={s} onPick={setSource} />

        <SettingsGroup title="Kind of channel (optional)" plain>
          <FieldRow label="Medium" value={medium} onChangeText={setMedium} placeholder="e.g. social" autoCapitalize="none" autoCorrect={false} />
        </SettingsGroup>
        <Chips options={MEDIUMS} value={tag(medium)} onPick={setMedium} />

        <SettingsGroup title="Campaign (optional)" plain>
          <FieldRow label="Campaign" value={campaign} onChangeText={setCampaign} placeholder="e.g. early-bird" autoCapitalize="none" autoCorrect={false} />
        </SettingsGroup>

        <View style={[styles.preview, { backgroundColor: tokens.elevated }]}>
          <Text style={[styles.previewLabel, { color: tokens.textMuted }]}>Your link</Text>
          <Text style={[styles.previewUrl, { color: link ? tokens.text : tokens.textMuted }]} selectable>
            {link || 'Add a source to build the link.'}
          </Text>
        </View>

        <Button label="Copy link" fullWidth disabled={!link} onPress={() => void copy()} style={{ marginTop: spacing[5] }} />
        <Button
          label="Share"
          variant="secondary"
          fullWidth
          disabled={!link}
          onPress={() => void shareLink({ message: title || 'On Unifesto', url: link, title })}
          style={{ marginTop: spacing[3] }}
        />
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          Registrations count for this link when the person opened it within 7 days before registering.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  title: { fontSize: typography.fontSize.xl, marginBottom: spacing[2], ...font('heading') },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[2], marginHorizontal: spacing[1] },
  chip: { paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: borderRadius.full },
  chipText: { fontSize: typography.fontSize.sm, ...font('medium') },
  preview: { marginTop: spacing[8], padding: spacing[4], borderRadius: borderRadius.xl },
  previewLabel: { fontSize: typography.fontSize.xs, ...font() },
  previewUrl: { marginTop: spacing[1], fontSize: typography.fontSize.sm, ...font() },
  note: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...font() },
});
