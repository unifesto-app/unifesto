import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ArrowRight, ClipboardText, NotePencil } from '@unifesto/unicon/react-native';
import { CardBackdrop } from '../ui/CardSurface';
import { Button } from '../ui';
import { IMPORT_SOURCES, importEvent, type ImportedEvent } from '../../lib/eventImport';
import { cosmosCardRadius, cosmosFont, cosmosRadius, useCosmos } from '../../theme/cosmos';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

interface Props {
  /** Sub-event of this big event, if any. */
  parentTitle?: string;
  onImported: (e: ImportedEvent) => void;
  onScratch: () => void;
}

/**
 * First screen of New event: bring an event over from Luma, Meetup, Unstop,
 * Devnovate or any event page by its link, or start from a blank form.
 */
export default function EventStartPanel({ parentTitle, onImported, onScratch }: Props) {
  const c = useCosmos();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (link = url) => {
    if (!link.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      onImported(await importEvent(link));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't import that link.");
    } finally {
      setBusy(false);
    }
  };

  const paste = async () => {
    const text = (await Clipboard.getStringAsync().catch(() => '')).trim();
    if (!text) {
      setError('Nothing to paste. Copy the event link first.');
      return;
    }
    setUrl(text);
    void run(text);
  };

  return (
    <View>
      <Text style={[styles.title, { color: c.text }]}>{parentTitle ? 'New sub-event' : 'New event'}</Text>
      <Text style={[styles.summary, { color: c.soft }]}>
        {parentTitle ? `Part of ${parentTitle}. ` : ''}Bring one over from another site, or start fresh.
      </Text>

      <View style={[styles.card, styles.first]}>
        <CardBackdrop shape={styles.card} />
        <Text style={[styles.cardTitle, { color: c.text }]}>Import from a link</Text>
        <Text style={[styles.meta, { color: c.muted }]}>Name, dates, venue, description and poster come across, ready to check before anything is created.</Text>

        <View style={styles.sources}>
          {IMPORT_SOURCES.map((s) => (
            <View key={s} style={[styles.source, { backgroundColor: c.tint }]}>
              <Text style={[styles.sourceText, { color: c.soft }]}>{s === 'Website' ? 'Any event page' : s}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.field, { borderColor: error ? c.danger : c.input }]}>
          <TextInput
            value={url}
            onChangeText={(v) => {
              setUrl(v);
              setError('');
            }}
            placeholder="lu.ma/… or any event link"
            placeholderTextColor={c.muted}
            selectionColor={c.primary}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => void run()}
            editable={!busy}
            style={[styles.input, { color: c.text }]}
            accessibilityLabel="Event link"
          />
          {busy ? (
            <ActivityIndicator color={c.muted} style={styles.fieldAction} />
          ) : !url ? (
            <Pressable onPress={paste} hitSlop={8} accessibilityRole="button" accessibilityLabel="Paste link" style={styles.fieldAction}>
              <ClipboardText size={22} color={c.soft} />
            </Pressable>
          ) : null}
        </View>
        {error ? (
          <Text style={[styles.error, { color: c.danger }]} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <Button label={busy ? 'Importing…' : 'Import'} onPress={() => void run()} disabled={!url.trim() || busy} fullWidth />
      </View>

      <Pressable
        onPress={onScratch}
        accessibilityRole="button"
        style={({ pressed }) => [styles.card, styles.row, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
      >
        <CardBackdrop shape={styles.card} />
        <NotePencil size={26} color={c.soft} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: c.text }]}>Start from scratch</Text>
          <Text style={[styles.meta, { color: c.muted }]}>Three short steps: basics, when and where, tickets.</Text>
        </View>
        <ArrowRight size={18} color={c.muted} weight="bold" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, lineHeight: 34, ...cosmosFont.display },
  summary: { marginTop: spacing[2], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  first: { marginTop: spacing[8] },
  card: { borderRadius: cosmosCardRadius, padding: spacing[5], gap: spacing[3], marginBottom: spacing[4] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  cardTitle: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  meta: { marginTop: 2, fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...cosmosFont.body },
  sources: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  source: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  sourceText: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: cosmosRadius, paddingLeft: spacing[4], minHeight: 50 },
  input: { flex: 1, fontSize: typography.fontSize.base, paddingVertical: spacing[3], ...cosmosFont.body },
  fieldAction: { paddingHorizontal: spacing[4] },
  error: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
