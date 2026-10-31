import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { FieldRow } from '../components/manage/FormFields';
import ChipPicker from '../components/manage/ChipPicker';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { shareLink } from '../lib/share';
import { withUtm } from '../services/utm';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { CardBackdrop } from '../components/ui/CardSurface';
import { cosmosCardRadius, cosmosFont, displayTracking, useCosmos } from '../theme/cosmos';

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

/** Quick picks under a tag field; tapping the picked one clears it. */
function Chips({ options, value, onPick }: { options: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <View style={styles.chips}>
      <ChipPicker options={options.map((o) => ({ value: o, label: o }))} value={value} onChange={onPick} clearable />
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
  const c = useCosmos();
  const [source, setSource] = useState('');
  const [medium, setMedium] = useState('');
  const [campaign, setCampaign] = useState(defaultCampaign ?? '');

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
    <CosmosScreen keyboard contentContainerStyle={styles.content}>
      {title ? (
        <Text style={[styles.title, { color: c.text }]} numberOfLines={2} accessibilityRole="header">
          {title}
        </Text>
      ) : null}

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

      <View style={styles.preview}>
        <CardBackdrop shape={styles.preview} />
        <Text style={[styles.previewLabel, { color: c.muted }]}>My link</Text>
        <Text style={[styles.previewUrl, { color: link ? c.text : c.muted }]} selectable>
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
      <Text style={[styles.note, { color: c.muted }]}>
        Registrations count for this link when the person opened it within 7 days before registering.
      </Text>
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  title: { fontSize: typography.fontSize['2xl'], lineHeight: 30, marginBottom: spacing[2], ...cosmosFont.display, letterSpacing: displayTracking(24) },
  chips: { marginTop: spacing[2], marginHorizontal: spacing[1] },
  preview: { marginTop: spacing[8], padding: spacing[5], borderRadius: cosmosCardRadius },
  previewLabel: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  previewUrl: { marginTop: spacing[2], fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.45, ...cosmosFont.body },
  note: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...cosmosFont.body },
});
