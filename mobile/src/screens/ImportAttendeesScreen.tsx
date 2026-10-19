import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { DownloadSimple, FileCsv } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import { getManagedEvent } from '../lib/api/eventAdmin';
import { downloadImportTemplate, previewImport, runImport, type ImportPreview, type ImportReport } from '../lib/api/attendeeAdd';
import { BlockTitle, SwitchRow } from '../components/manage/FormFields';
import ChipPicker from '../components/manage/ChipPicker';
import ManageStats from '../components/manage/ManageStats';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

type Picked = { uri: string; name: string; type: string };

/**
 * Add many people from a CSV for one ticket: get the template, fill it in,
 * pick the file, check the dry run, then import. A preview only counts for
 * the exact file and ticket it ran against, so changing either clears it.
 */
export default function ImportAttendeesScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();

  const [tickets, setTickets] = useState<{ value: string; label: string }[] | null>(null);
  const [ticketId, setTicketId] = useState('');
  const [file, setFile] = useState<Picked | null>(null);
  const [sendEmails, setSendEmails] = useState(true);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState<'template' | 'preview' | 'import' | null>(null);

  useEffect(() => {
    if (!eventId) return;
    void getManagedEvent(eventId).then((res) => {
      if (!res.ok) return;
      const list = ((res.data as unknown as { ticketTypes?: { id: string; name: string }[] }).ticketTypes ?? []).map((t) => ({
        value: t.id,
        label: t.name,
      }));
      setTickets(list);
      if (list[0]) setTicketId(list[0].value);
    });
  }, [eventId]);

  // A preview is only valid for this exact file + ticket.
  useEffect(() => {
    setPreview(null);
    setReport(null);
  }, [file, ticketId]);

  const getTemplate = async () => {
    setBusy('template');
    const res = await downloadImportTemplate(eventId!, ticketId);
    setBusy(null);
    if (!res.ok) {
      AppAlert.alert("Couldn't get the template", res.message);
      return;
    }
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(res.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
  };

  const pick = async () => {
    try {
      const res = await File.pickFileAsync({ mimeTypes: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain'] });
      if (res.canceled || !res.result) return;
      setFile({ uri: res.result.uri, name: res.result.name || 'attendees.csv', type: 'text/csv' });
    } catch {
      AppAlert.alert("Couldn't open that file");
    }
  };

  const check = async () => {
    if (!file) return;
    setBusy('preview');
    const res = await previewImport(eventId!, file, ticketId);
    setBusy(null);
    if (!res.ok) {
      AppAlert.alert("Couldn't read the file", res.message);
      return;
    }
    setPreview(res.data);
  };

  const run = () =>
    AppAlert.alert(`Import ${preview!.willCreate}?`, sendEmails ? 'Each person gets their ticket by email.' : 'No emails are sent.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Import',
        onPress: async () => {
          setBusy('import');
          const res = await runImport(eventId!, file!, ticketId, sendEmails);
          setBusy(null);
          if (!res.ok) {
            AppAlert.alert("Import didn't finish", res.message);
            return;
          }
          setReport(res.data);
          setPreview(null);
        },
      },
    ]);

  if (!tickets) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  const problems = (preview?.rows ?? []).filter((r) => r.outcome !== 'create');
  const reportProblems = (report?.rows ?? []).filter((r) => r.status !== 'created');

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
    >
      <BlockTitle>Ticket</BlockTitle>
      <ChipPicker options={tickets} value={ticketId} onChange={(v) => v && setTicketId(v)} />

      <SettingsGroup title="File">
        <SettingsRow
          icon={<DownloadSimple size={26} color={tokens.accent} weight="bold" />}
          label="Get the CSV template"
          trailing={busy === 'template' ? <ActivityIndicator size="small" color={tokens.accent} /> : undefined}
          onPress={busy ? undefined : getTemplate}
        />
        <SettingsRow
          icon={<FileCsv size={26} color={tokens.text} />}
          label={file ? file.name : 'Choose a filled-in CSV'}
          value={file ? 'Change' : undefined}
          onPress={pick}
        />
      </SettingsGroup>
      <Text style={[styles.note, { color: tokens.textMuted }]}>
        The template's columns match this ticket and its questions. People already registered are skipped.
      </Text>

      <SettingsGroup plain>
        <SwitchRow label="Email their tickets" value={sendEmails} onValueChange={setSendEmails} />
      </SettingsGroup>

      {file && !preview && !report ? (
        <Button label="Check the file" fullWidth loading={busy === 'preview'} onPress={check} style={{ marginTop: spacing[6] }} />
      ) : null}

      {preview ? (
        <>
          <View style={{ marginTop: spacing[8] }}>
            <ManageStats
              stats={[
                { label: 'Will add', value: preview.willCreate },
                { label: 'Skipped', value: preview.willSkip },
                { label: 'Errors', value: preview.willError },
              ]}
            />
          </View>
          <Text style={[styles.note, { color: tokens.textMuted }]}>
            {preview.newAccounts ? `${preview.newAccounts} new Unifesto accounts will be created. ` : ''}
            {preview.remainingCapacity != null ? `${preview.remainingCapacity} seats left on ${preview.ticketTypeName}.` : ''}
          </Text>
          {problems.length > 0 ? (
            <SettingsGroup title="Rows that won't be added" plain>
              {problems.slice(0, 50).map((r) => (
                <SettingsRow key={r.line} label={`Line ${r.line} · ${r.name || r.email || 'blank'}`} value={r.reason} />
              ))}
            </SettingsGroup>
          ) : null}
          <Button
            label={preview.willCreate ? `Import ${preview.willCreate}` : 'Nothing to import'}
            fullWidth
            disabled={!preview.willCreate}
            loading={busy === 'import'}
            onPress={run}
            style={{ marginTop: spacing[6] }}
          />
        </>
      ) : null}

      {report ? (
        <>
          <Text style={[styles.done, { color: tokens.success }]}>
            Added {report.created} to {report.ticketTypeName}
          </Text>
          {reportProblems.length > 0 ? (
            <SettingsGroup title="Not added" plain>
              {reportProblems.slice(0, 50).map((r) => (
                <SettingsRow key={r.line} label={`Line ${r.line} · ${r.name || r.email}`} value={r.reason} />
              ))}
            </SettingsGroup>
          ) : null}
          <Button label="Done" variant="secondary" fullWidth onPress={() => router.back()} style={{ marginTop: spacing[6] }} />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
  done: { marginTop: spacing[8], marginLeft: spacing[1], fontSize: typography.fontSize.lg, ...font('heading') },
});
