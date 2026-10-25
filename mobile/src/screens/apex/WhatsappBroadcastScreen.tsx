import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CheckCircle, Warning, X } from '@unifesto/unicon/react-native';
import { SettingsGroup, SettingsRow } from '../../components/profile/SettingsGroup';
import { BlockTitle, FieldRow } from '../../components/manage/FormFields';
import ChipPicker from '../../components/manage/ChipPicker';
import SelectRow from '../../components/manage/SelectRow';
import SaveBar from '../../components/manage/SaveBar';
import EntityPickerRow, { type PickerItem } from '../../components/apex/EntityPickerRow';
import { Button } from '../../components/ui';
import { AppAlert } from '../../components/ui/AppAlert';
import CosmosScreen from '../../components/ui/CosmosScreen';
import { GUTTER } from '../../components/home/Section';
import { titleCase } from '../../lib/apexQueues';
import {
  countWhatsappAudience,
  listBroadcastSpaces,
  listWhatsappTemplates,
  searchBroadcastUsers,
  sendWhatsappBroadcast,
  sendWhatsappTest,
  type BroadcastSpace,
  type WhatsappAudience,
  type WhatsappTemplate,
} from '../../lib/api/apexComms';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';

const NAME_TOKEN = '{name}';
// Typed to unlock an app-wide blast (client-side guard, like Apex web).
const CONFIRM_PHRASE = 'send to all';

const AUDIENCES: { value: WhatsappAudience; label: string }[] = [
  { value: 'SPACE', label: 'Space members' },
  { value: 'USER', label: 'Specific people' },
  { value: 'ALL', label: 'Everyone' },
];

const spaceLabel = (s: BroadcastSpace) => `${s.name} · ${s.memberCount}`;
const templateLabel = (t: WhatsappTemplate) => `${t.name} (${t.language})`;

async function pickPhoneUsers(q: string): Promise<PickerItem[]> {
  const res = await searchBroadcastUsers(q);
  if (!res.ok) return [];
  return res.data.map((u) => ({ id: u.id, title: u.name, subtitle: [u.username ? `@${u.username}` : null, u.mobileMasked].filter(Boolean).join(' · ') }));
}

/**
 * WhatsApp blast: an approved Meta template to a space's members, hand-picked
 * people, or everyone with a number. Cold outreach needs a template (the 24h
 * rule), so this is a template picker, not a free-text composer.
 */
export default function WhatsappBroadcastScreen() {
  const router = useRouter();
  const c = useCosmos();

  const [audience, setAudience] = useState<WhatsappAudience>('SPACE');
  const [spaces, setSpaces] = useState<BroadcastSpace[]>([]);
  const [spaceId, setSpaceId] = useState('');
  const [users, setUsers] = useState<PickerItem[]>([]);
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [templatesError, setTemplatesError] = useState('');
  const [templateKey, setTemplateKey] = useState('');
  const [params, setParams] = useState<string[]>([]);
  const [confirmText, setConfirmText] = useState('');
  const [sending, setSending] = useState(false);
  const [counting, setCounting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState<number | null>(null);

  const loadTemplates = useCallback(async () => {
    const res = await listWhatsappTemplates();
    if (res.ok) {
      setTemplates(res.data);
      setTemplatesError('');
    } else setTemplatesError(res.message || 'Could not load templates.');
  }, []);

  useEffect(() => {
    void loadTemplates();
    void listBroadcastSpaces().then((res) => res.ok && setSpaces(res.data));
  }, [loadTemplates]);

  const template = useMemo(() => templates.find((t) => templateLabel(t) === templateKey) ?? null, [templates, templateKey]);

  // One input per template placeholder, keeping whatever was already typed.
  useEffect(() => {
    const n = template?.bodyParamCount ?? 0;
    setParams((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? ''));
  }, [template]);

  const space = spaces.find((s) => s.id === spaceId) ?? null;
  const audienceReady = audience === 'ALL' || (audience === 'SPACE' && !!space) || (audience === 'USER' && users.length > 0);
  const ready =
    !!template && audienceReady && params.every((p) => p.trim()) && (audience !== 'ALL' || confirmText.trim().toLowerCase() === CONFIRM_PHRASE);

  const recipients =
    audience === 'ALL'
      ? 'everyone in the app with a mobile number'
      : audience === 'SPACE'
        ? space
          ? `${space.memberCount} member${space.memberCount === 1 ? '' : 's'} of ${space.name}`
          : 'the members of the chosen space'
        : `${users.length} selected ${users.length === 1 ? 'person' : 'people'}`;

  const target = {
    audience,
    spaceId: audience === 'SPACE' ? spaceId : undefined,
    userIds: audience === 'USER' ? users.map((u) => u.id) : undefined,
    // The server needs the template: a marketing one only counts opted-in people.
    templateName: template?.name,
    languageCode: template?.language,
  };

  // The server counts who it would actually dial (deduped numbers) before anything goes out.
  const confirmSend = async () => {
    if (!ready || sending || counting || !template) return;
    setCounting(true);
    setError('');
    const res = await countWhatsappAudience(target);
    setCounting(false);
    if (!res.ok) return setError(res.message || "Couldn't count the audience.");
    const n = res.data.recipientCount;
    if (!n) return setError('Nobody in this audience has a number WhatsApp can reach.');
    AppAlert.alert(
      `Send to ${n.toLocaleString('en-IN')} ${n === 1 ? 'person' : 'people'}?`,
      `${template.name} goes to ${recipients}. Each message is billed, and it can't be stopped once started.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start broadcast', style: audience === 'ALL' ? 'destructive' : 'default', onPress: () => void send() },
      ],
    );
  };

  const sendTest = async () => {
    if (!template || testing || !params.every((p) => p.trim())) return;
    setTesting(true);
    const res = await sendWhatsappTest({
      templateName: template.name,
      languageCode: template.language,
      bodyParams: params.map((p) => p.trim()),
    });
    setTesting(false);
    if (res.ok) AppAlert.alert('Test sent', 'Check WhatsApp on the number on your account.');
    else AppAlert.alert("Test didn't send", res.message);
  };

  const send = async () => {
    if (!ready || sending || !template) return;
    setSending(true);
    setError('');
    const res = await sendWhatsappBroadcast({
      ...target,
      templateName: template.name,
      languageCode: template.language,
      bodyParams: params.map((p) => p.trim()),
    });
    setSending(false);
    if (!res.ok) {
      setError(res.message || 'Could not start the broadcast.');
      return;
    }
    setConfirmText('');
    setSentTo(res.data.recipientCount);
  };

  if (sentTo !== null) {
    return (
      <CosmosScreen contentContainerStyle={styles.center}>
        <CheckCircle size={56} color={c.success} weight="fill" />
        <Text style={[styles.doneTitle, { color: c.text }]}>Broadcast started</Text>
        <Text style={[styles.doneBody, { color: c.muted }]}>
          Sending {template?.name} to {sentTo} recipient{sentTo === 1 ? '' : 's'}. Delivery runs in the background; individual sends show in
          Meta's dashboards.
        </Text>
        <View style={styles.doneActions}>
          <Button
            label="Send another"
            onPress={() => {
              // Start from a blank template so the same blast can't go out again on one tap.
              setTemplateKey('');
              setParams([]);
              setSentTo(null);
            }}
          />
          <Button label="Back to inbox" variant="secondary" onPress={() => router.back()} />
        </View>
      </CosmosScreen>
    );
  }

  return (
    <CosmosScreen
      keyboard
      bottom={180}
      contentContainerStyle={{ paddingHorizontal: GUTTER }}
      keyboardDismissMode="interactive"
      footer={<SaveBar visible={ready} label="Start broadcast" onPress={() => void confirmSend()} loading={sending || counting} error={error} />}
    >
        <BlockTitle>Who receives it</BlockTitle>
        <ChipPicker options={AUDIENCES} value={audience} onChange={(v) => v && setAudience(v)} />

        <SettingsGroup plain>
          {audience === 'SPACE' ? (
            <SelectRow
              label="Space"
              value={space ? spaceLabel(space) : ''}
              options={spaces.map(spaceLabel)}
              onChange={(label) => setSpaceId(spaces.find((s) => spaceLabel(s) === label)?.id ?? '')}
              placeholder={spaces.length ? 'Choose' : 'Loading…'}
            />
          ) : null}
          {audience === 'USER' ? (
            <>
              {users.map((u) => (
                <SettingsRow
                  key={u.id}
                  label={u.title}
                  value={u.subtitle}
                  trailing={<X size={18} color={c.muted} />}
                  onPress={() => setUsers((prev) => prev.filter((p) => p.id !== u.id))}
                />
              ))}
              <EntityPickerRow
                add
                label={users.length ? 'Add another person' : 'Add a person'}
                search={pickPhoneUsers}
                onPick={(u) => setUsers((prev) => (prev.some((p) => p.id === u.id) ? prev : [...prev, u]))}
                pickedIds={users.map((u) => u.id)}
              />
            </>
          ) : null}
          {audience === 'ALL' ? (
            <View style={styles.warn}>
              <Warning size={20} color={c.warn} weight="fill" />
              <Text style={[styles.warnText, { color: c.soft }]}>
                Messages every user in the app with a mobile number. It can't be undone once started. Use a Marketing template, for opted-in
                recipients only.
              </Text>
            </View>
          ) : null}
        </SettingsGroup>

        <SettingsGroup title="Message template" action={{ label: 'Refresh', onPress: () => void loadTemplates() }} plain>
          <SelectRow
            label="Template"
            value={templateKey}
            options={templates.map(templateLabel)}
            onChange={setTemplateKey}
            placeholder={templatesError ? 'Unavailable' : templates.length ? 'Choose' : 'None approved'}
          />
          {template ? (
            <View style={styles.templateBody}>
              <Text style={[styles.meta, { color: c.muted }]}>{titleCase(template.category)}</Text>
              {template.bodyText ? <Text style={[styles.quote, { color: c.text }]}>"{template.bodyText}"</Text> : null}
              {template.needsMediaHeader ? (
                <Text style={[styles.meta, { color: c.danger }]}>Has a media header this sender can't fill. It may fail.</Text>
              ) : null}
            </View>
          ) : null}
          {params.map((value, i) => (
            <FieldRow
              key={i}
              stacked
              label={`Variable {{${i + 1}}}`}
              value={value}
              onChangeText={(v) => setParams((prev) => prev.map((p, idx) => (idx === i ? v : p)))}
              placeholder={`e.g. ${NAME_TOKEN}`}
              autoCapitalize="none"
            />
          ))}
        </SettingsGroup>
        {templatesError ? <Text style={[styles.hint, { color: c.danger }]}>{templatesError}</Text> : null}
        {params.length ? (
          <Text style={[styles.hint, { color: c.muted }]}>Type {NAME_TOKEN} in a variable to use each recipient's own name.</Text>
        ) : null}

        {audience === 'ALL' ? (
          <SettingsGroup title={`Type ${CONFIRM_PHRASE} to confirm`} plain>
            <FieldRow stacked label="Confirmation" value={confirmText} onChangeText={setConfirmText} placeholder={CONFIRM_PHRASE} autoCapitalize="none" autoCorrect={false} />
          </SettingsGroup>
        ) : null}

        <Text style={[styles.summary, { color: c.muted }]}>
          {template ? template.name : 'No template'} → {recipients}
        </Text>
        {template && params.every((p) => p.trim()) ? (
          <Button
            label="Send a test to me"
            variant="secondary"
            onPress={() => void sendTest()}
            loading={testing}
            style={{ marginTop: spacing[4] }}
          />
        ) : null}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: GUTTER, gap: spacing[3] },
  doneTitle: { marginTop: spacing[2], fontSize: typography.fontSize['2xl'], ...cosmosFont.display },
  doneBody: { textAlign: 'center', fontSize: typography.fontSize.sm, lineHeight: 20, ...cosmosFont.body },
  doneActions: { marginTop: spacing[4], flexDirection: 'row', gap: spacing[3] },
  warn: { flexDirection: 'row', gap: spacing[3], padding: spacing[4] },
  warnText: { flex: 1, fontSize: typography.fontSize.sm, lineHeight: 20, ...cosmosFont.body },
  templateBody: { paddingHorizontal: spacing[4], paddingVertical: spacing[3], gap: spacing[2] },
  meta: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  quote: { fontSize: typography.fontSize.sm, lineHeight: 20, ...cosmosFont.body },
  hint: { marginTop: spacing[2], marginLeft: spacing[1], fontSize: typography.fontSize.xs, ...cosmosFont.body },
  summary: { marginTop: spacing[6], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
