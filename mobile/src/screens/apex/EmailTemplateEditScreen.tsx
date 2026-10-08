import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trash } from '@unifesto/unicon/react-native';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../../hooks/useAnalyticsScreenTracking';
import { HeaderActions, HeaderIconButton } from '../../navigation/HeaderActions';
import { SettingsGroup, SettingsRow } from '../../components/profile/SettingsGroup';
import { FieldRow } from '../../components/manage/FormFields';
import SaveBar from '../../components/manage/SaveBar';
import HtmlPreviewSheet from '../../components/apex/HtmlPreviewSheet';
import { AppAlert } from '../../components/ui/AppAlert';
import {
  createEmailTemplate,
  deleteEmailTemplate,
  getEmailTemplate,
  previewEmailBody,
  updateEmailTemplate,
  type EmailTemplatePayload,
} from '../../lib/api/apexComms';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

const GUTTER = spacing[6];
const EMPTY: EmailTemplatePayload = { name: '', subject: '', body: '' };

/** Create (id = "new") or edit a global email template. */
export default function EmailTemplateEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  useAnalyticsScreenTracking('ApexEmailTemplateEdit');

  const [original, setOriginal] = useState<EmailTemplatePayload | null>(isNew ? EMPTY : null);
  const [form, setForm] = useState<EmailTemplatePayload>(EMPTY);
  const [loadError, setLoadError] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNew) return;
    void getEmailTemplate(id!).then((res) => {
      if (!res.ok) {
        setLoadError(res.denied ? 'Only Unifesto platform admins can edit templates.' : res.message);
        return;
      }
      const f = { name: res.data.name, subject: res.data.subject, body: res.data.body };
      setOriginal(f);
      setForm(f);
    });
  }, [id, isNew]);

  const set = (key: keyof EmailTemplatePayload) => (v: string) => {
    setError('');
    setForm((f) => ({ ...f, [key]: v }));
  };

  const dirty = !!original && (form.name !== original.name || form.subject !== original.subject || form.body !== original.body);
  const complete = !!form.name.trim() && !!form.subject.trim() && !!form.body.trim();

  const save = async () => {
    if (!complete) {
      setError('Name, subject and body are all required.');
      return;
    }
    setSaving(true);
    const payload = { name: form.name.trim(), subject: form.subject.trim(), body: form.body };
    const res = isNew ? await createEmailTemplate(payload) : await updateEmailTemplate(id!, payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.back();
  };

  const remove = () =>
    AppAlert.alert(`Delete "${original?.name}"?`, 'Spaces will no longer see it as a starting point.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const res = await deleteEmailTemplate(id!);
          if (res.ok) router.back();
          else AppAlert.alert('Not deleted', res.message);
        },
      },
    ]);

  const openPreview = async () => {
    const res = await previewEmailBody(form.body);
    if (res.ok) setPreview(res.data.html);
    else AppAlert.alert('No preview', res.message);
  };

  if (!original) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {loadError ? <Text style={[styles.muted, { color: tokens.textMuted }]}>{loadError}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen
        options={{
          title: isNew ? 'New template' : 'Edit template',
          headerRight: isNew
            ? undefined
            : () => (
                <HeaderActions>
                  <HeaderIconButton onPress={remove} label="Delete template">
                    <Trash size={22} color={tokens.danger} />
                  </HeaderIconButton>
                </HeaderActions>
              ),
        }}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 160 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <SettingsGroup plain>
          <FieldRow stacked label="Name" value={form.name} onChangeText={set('name')} placeholder="Internal name, e.g. Event reminder" />
          <FieldRow stacked label="Subject" value={form.subject} onChangeText={set('subject')} />
          <FieldRow
            stacked
            multiline
            label="Body (HTML) · {{firstName}} {{name}} {{email}}"
            value={form.body}
            onChangeText={set('body')}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {form.body.trim() ? <SettingsRow label="Preview" onPress={() => void openPreview()} /> : null}
        </SettingsGroup>
      </ScrollView>
      <SaveBar visible={dirty} label={isNew ? 'Create template' : 'Save template'} onPress={save} loading={saving} error={error} />
      <HtmlPreviewSheet html={preview} title={form.subject || 'Preview'} onClose={() => setPreview(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
});
