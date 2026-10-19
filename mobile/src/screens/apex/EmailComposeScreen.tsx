import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import { SettingsGroup, SettingsRow } from '../../components/profile/SettingsGroup';
import { BlockTitle, FieldRow, SwitchRow } from '../../components/manage/FormFields';
import ChipPicker from '../../components/manage/ChipPicker';
import DateTimeRow from '../../components/manage/DateTimeRow';
import SelectRow from '../../components/manage/SelectRow';
import SaveBar from '../../components/manage/SaveBar';
import EntityPickerRow, { type PickerItem } from '../../components/apex/EntityPickerRow';
import HtmlPreviewSheet from '../../components/apex/HtmlPreviewSheet';
import { AppAlert } from '../../components/ui/AppAlert';
import { pickEvents, pickSpaces, pickUsers } from '../../lib/apexPickers';
import {
  createEmailCampaign,
  listEmailTemplates,
  previewEmailBody,
  type EmailTargetType,
  type EmailTemplate,
} from '../../lib/api/apexComms';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

const GUTTER = spacing[6];

type Needs = 'user' | 'space' | 'event';
const TARGETS: { value: EmailTargetType; label: string; needs?: Needs }[] = [
  { value: 'ALL_USERS', label: 'All users' },
  { value: 'ORGANISERS_ONLY', label: 'Organisers' },
  { value: 'SEGMENT', label: 'Segment' },
  { value: 'SPACE_MEMBERS', label: 'Space members', needs: 'space' },
  { value: 'EVENT_REGISTRANTS', label: 'Event registrants', needs: 'event' },
  { value: 'WAITLIST', label: 'Event waitlist', needs: 'event' },
  { value: 'SINGLE_USER', label: 'One person', needs: 'user' },
];

const SPLITS = [
  { value: '30', label: 'A 30%' },
  { value: '50', label: 'A 50%' },
  { value: '70', label: 'A 70%' },
] as const;

const PICKERS: Record<Needs, { label: string; search: (q: string) => Promise<PickerItem[]> }> = {
  user: { label: 'Person', search: pickUsers },
  space: { label: 'Space', search: pickSpaces },
  event: { label: 'Event', search: pickEvents },
};

const inAnHour = () => {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d;
};

/** Compose a platform email campaign: audience, template or HTML body, optional A/B subject, send or schedule. */
export default function EmailComposeScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [target, setTarget] = useState<EmailTargetType>('ALL_USERS');
  const [picked, setPicked] = useState<PickerItem | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [ab, setAb] = useState(false);
  const [subjectB, setSubjectB] = useState('');
  const [split, setSplit] = useState<(typeof SPLITS)[number]['value']>('50');
  const [hasRegistrations, setHasRegistrations] = useState(false);
  const [joinedFilter, setJoinedFilter] = useState(false);
  const [joinedAfter, setJoinedAfter] = useState(() => new Date(Date.now() - 30 * 86_400_000));
  const [scheduled, setScheduled] = useState(false);
  const [at, setAt] = useState(inAnHour);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void listEmailTemplates().then((res) => res.ok && setTemplates(res.data));
  }, []);

  const needs = TARGETS.find((t) => t.value === target)?.needs;
  const ready = !!subject.trim() && !!body.trim() && (!needs || !!picked) && (!ab || !!subjectB.trim());

  const chooseTarget = (v: EmailTargetType) => {
    // A picked space can't carry over to an event audience, etc.
    if (TARGETS.find((t) => t.value === v)?.needs !== needs) setPicked(null);
    setTarget(v);
  };

  const applyTemplate = (name: string) => {
    setTemplateName(name);
    const tpl = templates.find((t) => t.name === name);
    if (!tpl) return;
    const load = () => {
      setSubject(tpl.subject);
      setBody(tpl.body);
    };
    // Don't silently throw away something already written.
    if (subject.trim() || body.trim()) {
      AppAlert.alert('Replace what you wrote?', `Subject and body will be replaced with "${tpl.name}".`, [
        { text: 'Keep mine', style: 'cancel' },
        { text: 'Replace', onPress: load },
      ]);
    } else load();
  };

  const openPreview = async () => {
    const res = await previewEmailBody(body);
    if (res.ok) setPreview(res.data.html);
    else AppAlert.alert('No preview', res.message);
  };

  const send = async () => {
    setSending(true);
    setError('');
    const res = await createEmailCampaign({
      targetType: target,
      targetId: needs ? picked!.id : undefined,
      subject: subject.trim(),
      subjectB: ab ? subjectB.trim() : undefined,
      abSplitPct: ab ? Number(split) : undefined,
      body,
      segmentFilters:
        target === 'SEGMENT'
          ? { hasRegistrations: hasRegistrations || undefined, joinedAfter: joinedFilter ? joinedAfter.toISOString() : undefined }
          : undefined,
      scheduledAt: scheduled ? at.toISOString() : undefined,
    });
    setSending(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.back();
  };

  const submit = () => {
    if (!ready || sending) return;
    if (scheduled && at.getTime() <= Date.now()) {
      setError('Pick a time in the future, or turn scheduling off.');
      return;
    }
    const audience = picked ? `${TARGETS.find((t) => t.value === target)!.label}: ${picked.title}` : TARGETS.find((t) => t.value === target)!.label;
    AppAlert.alert(scheduled ? 'Schedule this campaign?' : 'Send this campaign now?', `To ${audience}. Emails can't be recalled once sent.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: scheduled ? 'Schedule' : 'Send', onPress: () => void send() },
    ]);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 160 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <BlockTitle>Send to</BlockTitle>
        <ChipPicker options={TARGETS} value={target} onChange={(v) => v && chooseTarget(v)} />

        {needs ? (
          <SettingsGroup plain>
            <EntityPickerRow label={PICKERS[needs].label} value={picked?.title} search={PICKERS[needs].search} onPick={setPicked} />
          </SettingsGroup>
        ) : null}

        {target === 'SEGMENT' ? (
          <SettingsGroup title="Segment" plain>
            <SwitchRow label="Has registered for an event" value={hasRegistrations} onValueChange={setHasRegistrations} />
            <SwitchRow label="Joined after a date" value={joinedFilter} onValueChange={setJoinedFilter} />
            {joinedFilter ? <DateTimeRow label="Joined after" mode="date" value={joinedAfter} onChange={setJoinedAfter} /> : null}
          </SettingsGroup>
        ) : null}

        <SettingsGroup title="Content" plain>
          {templates.length > 0 ? (
            <SelectRow label="Template" value={templateName} options={templates.map((t) => t.name)} onChange={applyTemplate} placeholder="Start from scratch" />
          ) : null}
          <FieldRow stacked label="Subject" value={subject} onChangeText={setSubject} placeholder="What's this email about?" />
          <FieldRow
            stacked
            multiline
            label="Body (HTML) · {{firstName}} {{name}} {{email}}"
            value={body}
            onChangeText={setBody}
            placeholder="<p>Hi {{firstName}}, …</p>"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {body.trim() ? <SettingsRow label="Preview" onPress={() => void openPreview()} /> : null}
        </SettingsGroup>

        <SettingsGroup title="A/B subject test" plain>
          <SwitchRow label="Test a second subject line" value={ab} onValueChange={setAb} />
          {ab ? <FieldRow stacked label="Subject B" value={subjectB} onChangeText={setSubjectB} placeholder="Alternate subject" /> : null}
        </SettingsGroup>
        {ab ? (
          <View style={styles.block}>
            <ChipPicker options={[...SPLITS]} value={split} onChange={(v) => v && setSplit(v)} />
            <Text style={[styles.hint, { color: tokens.textMuted }]}>
              Subject A goes to {split}% of recipients, B to the rest.
            </Text>
          </View>
        ) : null}

        <SettingsGroup title="When" plain>
          <SwitchRow label="Schedule for later" value={scheduled} onValueChange={setScheduled} />
          {scheduled ? <DateTimeRow label="Send at" value={at} onChange={setAt} minimumDate={new Date()} /> : null}
        </SettingsGroup>
      </ScrollView>

      <SaveBar visible={ready} label={scheduled ? 'Schedule campaign' : 'Send campaign'} onPress={submit} loading={sending} error={error} />
      <HtmlPreviewSheet html={preview} title={subject || 'Preview'} onClose={() => setPreview(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: spacing[4] },
  hint: { marginTop: spacing[2], marginLeft: spacing[1], fontSize: typography.fontSize.xs, ...font() },
});
