import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowCounterClockwise, CaretRight, EnvelopeSimple, GenderIntersex, Phone, Plus, Star, User, UsersThree } from 'phosphor-react-native';
import { SettingsGroup, SettingsRow } from '../../src/components/profile/SettingsGroup';
import FormRow from '../../src/components/profile/FormRow';
import { ATTENDEE_GENDER_OPTIONS, profileGenderToAttendeeOption } from '../../src/utils/profile';
import AttendeeForm from '../../src/components/AttendeeForm';
import CustomFieldInput from '../../src/components/CustomFieldInput';
import { displayAnswer, visibleFields } from '../../src/utils/formQuestions';
import Skeleton from '../../src/components/Skeleton';
import { ActionBar } from '../../src/components/event/EventOverlays';
import { useManageGroup, type GroupRow } from '../../src/hooks/useManageGroup';
import useTopSpacing from '../../src/hooks/useTopSpacing';
import { useTokens } from '../../src/context/ThemeContext';
import type { GroupMemberInput } from '../../src/lib/api/registrations';
import { borderRadius, spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { font } from '../../src/theme/fontHelpers';
import { CardBackdrop } from '../../src/components/ui/CardSurface';

const GUTTER = spacing[6];
const AVATAR = 40;

/**
 * "Manage group" — one page for both group models (pay-first seats and the
 * shared-ticket roster): a progress summary, one row per person, an inline
 * invite field, and an inline member editor. No modals, by design.
 */
export default function ManageGroupRoute() {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing(8);
  const { registrationId: rawId } = useLocalSearchParams<{ registrationId: string }>();
  const g = useManageGroup(String(rawId ?? ''));

  const header = <Stack.Screen options={{ title: 'Manage group', headerShown: true }} />;

  if (g.loading) {
    return (
      <View style={[styles.flex, { backgroundColor: tokens.bg, paddingTop: topSpacing, paddingHorizontal: GUTTER, gap: spacing[4] }]}>
        {header}
        <Skeleton width="55%" height={28} borderRadius={8} />
        <Skeleton width="100%" height={6} borderRadius={3} />
        <Skeleton width="100%" height={260} borderRadius={borderRadius.xl} />
      </View>
    );
  }

  if (g.error) {
    return (
      <View style={[styles.flex, styles.center, { backgroundColor: tokens.bg, padding: GUTTER }]}>
        {header}
        <UsersThree size={48} color={tokens.textSecondary} weight="duotone" />
        <Text style={[styles.body, { color: tokens.textMuted, textAlign: 'center', marginTop: spacing[3] }]}>{g.error}</Text>
      </View>
    );
  }

  // ── Editing one member (replaces the list) ──
  if (g.editing) {
    const i = g.editIndex;
    return (
      <View style={[styles.flex, { backgroundColor: tokens.bg }]}>
        {header}
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 140 + insets.bottom }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            <View style={styles.editHead}>
              <Text style={[styles.title, { color: tokens.text }]}>
                {i === 0 ? 'My details' : i != null ? `Member ${i + 1}` : 'Members'}
              </Text>
              <Pressable onPress={g.closeEditing} disabled={g.saving} hitSlop={10}>
                <Text style={[styles.link, { color: tokens.textSecondary }]}>{g.editMode === 'view' ? 'Done' : 'Cancel'}</Text>
              </Pressable>
            </View>
            <Text style={[styles.body, { color: tokens.textMuted, marginBottom: spacing[5] }]}>
              {i === 0 ? 'You get your own copy of the ticket by email.' : 'They get their own copy of the ticket by email.'}
            </Text>

            {g.draft.map((m, idx) => {
              if (!(i === null || i === idx)) return null;
              const locked = g.editMode !== 'fill';
              const view = g.editMode === 'view';
              // What the server already has for this person. Those identity
              // fields are read-only; only blanks can be filled (never in view).
              const saved = g.savedMember(idx);
              const has = {
                name: !!saved?.name?.trim(),
                email: !!saved?.email?.trim(),
                mobile: !!saved?.mobile?.trim(),
                gender: !!saved?.gender?.trim(),
              };
              const set = (field: keyof GroupMemberInput) => (value: string) => g.changeMember(idx, field, value);
              return (
                <View key={idx}>
                  {!locked ? (
                    <AttendeeForm
                      attendee={m}
                      index={idx}
                      onChange={(at, field, value) => g.changeMember(at, field as keyof GroupMemberInput, value)}
                      showTitle={false}
                    />
                  ) : (
                    <>
                      <SettingsGroup>
                        {has.name ? <SettingsRow icon={<User size={24} color={tokens.accent} weight="duotone" />} label={saved!.name} /> : null}
                        {has.email ? <SettingsRow icon={<EnvelopeSimple size={24} color={tokens.accent} weight="duotone" />} label={saved!.email} /> : null}
                        {has.mobile ? <SettingsRow icon={<Phone size={24} color={tokens.accent} weight="duotone" />} label={`+91 ${saved!.mobile}`} /> : null}
                        {has.gender ? (
                          <SettingsRow
                            icon={<GenderIntersex size={24} color={tokens.accent} weight="duotone" />}
                            label={profileGenderToAttendeeOption(saved!.gender) || saved!.gender}
                          />
                        ) : null}
                      </SettingsGroup>
                      <Text style={[styles.body, { color: tokens.textMuted, marginTop: spacing[2] }]}>
                        {view ? 'Their details are theirs to change.' : "Name, email, mobile and gender can't be changed once added."}
                      </Text>

                      {!view && (!has.name || !has.email || !has.mobile) ? (
                        <View style={{ marginTop: spacing[5] }}>
                          <Text style={[styles.cardTitle, { color: tokens.text }]}>Add what's missing</Text>
                          <SettingsGroup>
                            {!has.name ? (
                              <FormRow icon={<User size={24} color={tokens.accent} weight="duotone" />} value={m.name} onChangeText={set('name')} placeholder="Full name" autoCapitalize="words" />
                            ) : null}
                            {!has.email ? (
                              <FormRow
                                icon={<EnvelopeSimple size={24} color={tokens.accent} weight="duotone" />}
                                value={m.email}
                                onChangeText={set('email')}
                                placeholder="Email"
                                autoCapitalize="none"
                                keyboardType="email-address"
                              />
                            ) : null}
                            {!has.mobile ? (
                              <FormRow
                                icon={<Phone size={24} color={tokens.accent} weight="duotone" />}
                                prefix="+91"
                                value={m.mobile}
                                onChangeText={(v) => set('mobile')(v.replace(/[^0-9]/g, ''))}
                                placeholder="10-digit mobile"
                                keyboardType="number-pad"
                                maxLength={10}
                              />
                            ) : null}
                          </SettingsGroup>
                        </View>
                      ) : null}
                      {!view && !has.gender ? (
                        <View style={{ marginTop: spacing[5] }}>
                          <Text style={[styles.cardTitle, { color: tokens.text }]}>Gender</Text>
                          <View style={styles.chips}>
                            {ATTENDEE_GENDER_OPTIONS.map((opt) => {
                              const active = m.gender === opt;
                              return (
                                <Pressable
                                  key={opt}
                                  onPress={() => set('gender')(opt)}
                                  style={[styles.chip, { backgroundColor: active ? tokens.text : undefined }]}
                                >
                                  {!active ? <CardBackdrop shape={styles.chip} /> : null}
                                  <Text style={[styles.chipText, { color: active ? tokens.bg : tokens.text }]}>{opt}</Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      ) : null}
                    </>
                  )}

                  {g.customFields.length > 0 ? (
                    <View style={[styles.card, { marginTop: spacing[5] }]}>
                      <CardBackdrop shape={styles.card} />
                      <Text style={[styles.cardTitle, { color: tokens.text }]}>Additional information</Text>
                      {view
                        ? visibleFields(g.customFields, m.customFields)
                            .filter((field) => field.field_type !== 'section')
                            .map((field) => {
                            const shown = displayAnswer(field, m.customFields?.[field.id]) || 'Not answered';
                            return (
                              <Text key={field.id} style={[styles.body, { color: tokens.textSecondary, marginTop: spacing[2] }]}>
                                {field.label}: <Text style={{ color: tokens.text }}>{shown}</Text>
                              </Text>
                            );
                          })
                        : visibleFields(g.customFields, m.customFields).map((field) => (
                            <CustomFieldInput
                              key={field.id}
                              field={field}
                              value={m.customFields?.[field.id]}
                              onChange={(value) => g.changeMemberCustomField(idx, field.id, value)}
                            />
                          ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
            {g.rosterError ? <Text style={[styles.error, { color: tokens.danger }]}>{g.rosterError}</Text> : null}
          </ScrollView>
        </KeyboardAvoidingView>
        {g.editMode !== 'view' ? (
          <ActionBar info={null} label="Save" loading={g.saving} accent={tokens.accent} onPress={g.saveRoster} />
        ) : null}
      </View>
    );
  }

  // ── The group ──
  const progress = g.totalCount > 0 ? g.filledCount / g.totalCount : 0;
  const allFilled = g.totalCount > 0 && g.filledCount === g.totalCount;

  return (
    <View style={[styles.flex, { backgroundColor: tokens.bg }]}>
      {header}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: spacing[10] + insets.bottom }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.title, { color: tokens.text }]}>My group</Text>
          {g.totalCount > 0 ? (
            <>
              <Text style={[styles.body, { color: tokens.textSecondary, marginTop: 4 }]}>
                {allFilled
                  ? 'Everyone is in. Nice.'
                  : `${g.filledCount} of ${g.totalCount} ${g.usesSeats ? 'seats filled' : 'members added'}`}
              </Text>
              <View style={[styles.track, { backgroundColor: tokens.elevated }]}>
                <View style={[styles.fill, { width: `${Math.round(progress * 100)}%`, backgroundColor: allFilled ? tokens.success : tokens.accent }]} />
              </View>
            </>
          ) : null}

          {g.rows.length > 0 ? (
            <View style={[styles.card, { paddingVertical: spacing[1], paddingHorizontal: 0, marginTop: spacing[6] }]}>
              <CardBackdrop shape={styles.card} />
              {g.rows.map((row, idx) => (
                <View key={row.key}>
                  <Row row={row} />
                  {idx < g.rows.length - 1 ? (
                    <View style={[styles.divider, { backgroundColor: tokens.border, marginLeft: spacing[4] + AVATAR + spacing[3] }]} />
                  ) : null}
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.body, { color: tokens.textMuted, textAlign: 'center', marginTop: spacing[8] }]}>
              There's nothing to manage for this ticket.
            </Text>
          )}

          {/* Inline invite (seats) — opened from an open row */}
          {g.composerOpen ? (
            <View style={[styles.card, { marginTop: spacing[4] }]}>
              <CardBackdrop shape={styles.card} />
              <View style={styles.cardHead}>
                <Text style={[styles.cardTitle, { color: tokens.text, marginBottom: 0 }]}>
                  {g.replacing ? `Replace ${g.replacing.name}` : 'Invite by email'}
                </Text>
                <Pressable onPress={() => g.setComposerOpen(false)} hitSlop={10}>
                  <Text style={[styles.link, { color: tokens.textSecondary }]}>Cancel</Text>
                </Pressable>
              </View>
              <Text style={[styles.small, { color: tokens.textMuted, marginTop: 4 }]}>
                {g.replacing
                  ? `${g.replacing.name} loses this seat and is told by email. The new person gets a link to claim it.`
                  : 'They get a link to claim this seat as their own ticket and fill in their own details.'}
              </Text>
              <View style={[styles.inputRow, { backgroundColor: tokens.fill }]}>
                <EnvelopeSimple size={20} color={tokens.textMuted} />
                <TextInput
                  style={[styles.input, { color: tokens.text }]}
                  value={g.email}
                  onChangeText={g.setEmail}
                  placeholder="name@email.com"
                  placeholderTextColor={tokens.textMuted}
                  selectionColor={tokens.accent}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  returnKeyType="send"
                  autoFocus
                  onSubmitEditing={g.invite}
                />
              </View>
              <Pressable
                onPress={g.invite}
                disabled={g.inviting || !g.email.trim()}
                style={({ pressed }) => [
                  styles.send,
                  { backgroundColor: tokens.accent, opacity: g.inviting || !g.email.trim() ? 0.5 : pressed ? 0.85 : 1 },
                ]}
              >
                {g.inviting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.sendText}>{g.replacing ? 'Replace and invite' : 'Send invite'}</Text>}
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** One person-slot: an avatar/mark, who it is, and what you can do with it. */
function Row({ row }: { row: GroupRow }) {
  const tokens = useTokens();

  const leadMark = row.isLead ? <Star size={12} color={tokens.accent} weight="fill" /> : null;
  const TextAction = ({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) => (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text style={[styles.action, { color: danger ? tokens.danger : tokens.accent }]}>{label}</Text>
    </Pressable>
  );

  if (row.kind === 'filled') {
    return (
      <Pressable onPress={row.onEdit} style={({ pressed }) => [styles.row, pressed && { backgroundColor: tokens.pressed }]}>
        <View style={[styles.avatar, { backgroundColor: tokens.surface }]}>
          <Text style={[styles.avatarText, { color: tokens.text }]}>{row.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            {leadMark}
            <Text style={[styles.name, { color: tokens.text }]} numberOfLines={1}>
              {row.name}
              {row.isLead ? <Text style={{ color: tokens.textMuted }}>{'  You'}</Text> : null}
            </Text>
          </View>
          {row.sub ? <Text style={[styles.small, { color: tokens.textMuted }]} numberOfLines={1}>{row.sub}</Text> : null}
        </View>
        {row.onReplace ? <TextAction label="Replace" onPress={row.onReplace} danger /> : null}
        <Text style={[styles.action, { color: tokens.textSecondary }]}>{row.editable ? 'Edit' : 'Details'}</Text>
        <CaretRight size={14} color={tokens.textMuted} />
      </Pressable>
    );
  }

  if (row.kind === 'invited') {
    return (
      <View style={styles.row}>
        <View style={styles.avatar}>
          <EnvelopeSimple size={24} color={tokens.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            {leadMark}
            <Text style={[styles.name, { color: tokens.text }]} numberOfLines={1}>{row.email || row.label}</Text>
          </View>
          <Text style={[styles.small, { color: tokens.accent }]}>Invited, waiting to claim</Text>
        </View>
        <View style={styles.actions}>
          <TextAction label="Revoke" onPress={row.onRevoke} />
          <TextAction label="Release" onPress={row.onRelease} danger />
        </View>
      </View>
    );
  }

  if (row.kind === 'released') {
    return (
      <View style={[styles.row, { opacity: 0.6 }]}>
        <View style={styles.avatar}>
          <ArrowCounterClockwise size={22} color={tokens.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: tokens.textSecondary }]}>{row.label}</Text>
          <Text style={[styles.small, { color: tokens.textMuted }]}>Released</Text>
        </View>
        <TextAction label="Reopen" onPress={row.onReopen} />
      </View>
    );
  }

  // open
  return (
    <Pressable onPress={row.onInvite} style={({ pressed }) => [styles.row, pressed && { backgroundColor: tokens.pressed }]}>
      <View style={styles.avatar}>
        <Plus size={24} color={tokens.accent} weight="bold" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: tokens.accent }]}>Invite by email</Text>
        <Text style={[styles.small, { color: tokens.textMuted }]}>{row.label}</Text>
      </View>
      {row.onRelease ? <TextAction label="Release" onPress={row.onRelease} danger /> : <CaretRight size={14} color={tokens.textMuted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: typography.fontSize['2xl'], letterSpacing: -0.4, ...font('heading') },
  body: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  small: { fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
  link: { fontSize: typography.fontSize.sm, ...font('semibold') },
  error: { marginTop: spacing[3], fontSize: typography.fontSize.sm, ...font('medium') },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: spacing[3] },
  fill: { height: '100%', borderRadius: 3 },
  card: { borderRadius: borderRadius.xl, padding: spacing[5], overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: typography.fontSize.base, marginBottom: spacing[3], ...font('semibold') },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: { height: 40, paddingHorizontal: spacing[5], borderRadius: borderRadius.full, justifyContent: 'center' },
  chipText: { fontSize: typography.fontSize.sm, ...font('semibold') },
  editHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], minHeight: 64, paddingVertical: spacing[2] },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, ...font('heading') },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { flexShrink: 1, fontSize: typography.fontSize.base, ...font('semibold') },
  actions: { flexDirection: 'row', gap: spacing[4] },
  action: { fontSize: typography.fontSize.sm, ...font('semibold') },
  divider: { height: StyleSheet.hairlineWidth },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    height: 52,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[4],
    marginTop: spacing[4],
  },
  input: { flex: 1, height: '100%', fontSize: typography.fontSize.base, ...font() },
  send: { marginTop: spacing[4], height: 48, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#ffffff', fontSize: typography.fontSize.base, ...font('semibold') },
});
