import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowCounterClockwise, CaretRight, Crown, EnvelopeSimple, GenderIntersex, Minus, Phone, Plus, Star, User, UsersThree } from '@unifesto/unicon/react-native';
import { GroupCell, SettingsGroup, SettingsRow } from '../../src/components/profile/SettingsGroup';
import { profileGenderToAttendeeOption } from '../../src/utils/profile';
import AttendeeForm from '../../src/components/AttendeeForm';
import CustomFieldInput from '../../src/components/CustomFieldInput';
import { displayAnswer, visibleFields } from '../../src/utils/formQuestions';
import Skeleton from '../../src/components/Skeleton';
import { ActionBar } from '../../src/components/event/EventOverlays';
import { useManageGroup, type GroupRow, type SeatAction } from '../../src/hooks/useManageGroup';
import CosmosScreen, { CosmosList } from '../../src/components/ui/CosmosScreen';
import { GUTTER } from '../../src/components/home/Section';
import type { GroupMemberInput } from '../../src/lib/api/registrations';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { CardBackdrop } from '../../src/components/ui/CardSurface';
import { Button } from '../../src/components/ui';
import { cosmosCardRadius, cosmosFont, cosmosRadius, useCosmos } from '../../src/theme/cosmos';

const AVATAR = 40;
/** Page titles are Michroma, except ones with a number in them ("Member 3"): its 0 reads as O. */
const titleFont = (t: string) => (/\d/.test(t) ? cosmosFont.figure : cosmosFont.display);

/**
 * "Manage group" — one page for both group models (pay-first seats and the
 * shared-ticket roster): a progress summary, one row per person, an inline
 * invite field, and an inline member editor. No modals, by design.
 */
export default function ManageGroupRoute() {
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const { registrationId: rawId } = useLocalSearchParams<{ registrationId: string }>();
  const g = useManageGroup(String(rawId ?? ''));

  const header = <Stack.Screen options={{ title: 'Manage group', headerShown: true }} />;

  if (g.loading) {
    return (
      <CosmosScreen contentContainerStyle={[styles.pad, { gap: spacing[4] }]}>
        {header}
        <Skeleton width="55%" height={28} borderRadius={8} />
        <Skeleton width="100%" height={6} borderRadius={3} />
        <Skeleton width="100%" height={260} borderRadius={cosmosCardRadius} />
      </CosmosScreen>
    );
  }

  if (g.error) {
    return (
      <CosmosScreen contentContainerStyle={styles.pad}>
        {header}
        <View style={[styles.empty, { backgroundColor: c.raised }]}>
          <UsersThree size={40} color={c.muted} weight="duotone" />
          <Text style={[styles.body, { color: c.soft, textAlign: 'center', marginTop: spacing[3] }]}>{g.error}</Text>
        </View>
      </CosmosScreen>
    );
  }

  // ── Editing one member (replaces the list) ──
  if (g.editing) {
    const i = g.editIndex;
    const editTitle = i === 0 ? 'My details' : i != null ? `Member ${i + 1}` : 'Members';
    return (
      <CosmosScreen
        keyboard
        keyboardDismissMode="interactive"
        bottom={140 + insets.bottom}
        contentContainerStyle={styles.pad}
        footer={g.editMode !== 'view' ? <ActionBar info={null} label="Save" loading={g.saving} accent={c.primary} onPress={g.saveRoster} /> : null}
      >
            {header}
            <View style={styles.editHead}>
              <Text style={[styles.title, titleFont(editTitle), { color: c.text }]} accessibilityRole="header">
                {editTitle}
              </Text>
              <Pressable onPress={g.closeEditing} disabled={g.saving} hitSlop={10}>
                <Text style={[styles.link, { color: c.soft }]}>{g.editMode === 'view' ? 'Done' : 'Cancel'}</Text>
              </Pressable>
            </View>
            <Text style={[styles.body, { color: c.muted, marginBottom: spacing[5] }]}>
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
                        {has.name ? <SettingsRow icon={<User size={24} color={c.primary} weight="duotone" />} label={saved!.name} /> : null}
                        {has.email ? <SettingsRow icon={<EnvelopeSimple size={24} color={c.primary} weight="duotone" />} label={saved!.email} /> : null}
                        {has.mobile ? <SettingsRow icon={<Phone size={24} color={c.primary} weight="duotone" />} label={`+91 ${saved!.mobile}`} /> : null}
                        {has.gender ? (
                          <SettingsRow
                            icon={<GenderIntersex size={24} color={c.primary} weight="duotone" />}
                            label={profileGenderToAttendeeOption(saved!.gender) || saved!.gender}
                          />
                        ) : null}
                      </SettingsGroup>
                      <Text style={[styles.body, { color: c.muted, marginTop: spacing[2] }]}>
                        {idx === 0
                          ? "Name, email, phone and gender can't be changed here. You can change your name and gender in your profile."
                          : view && !g.lockedReason
                            ? 'Their details are theirs to change.'
                            : "Name, email, phone and gender can't be changed here."}
                      </Text>
                      {g.lockedReason ? (
                        <Text style={[styles.body, { color: c.muted, marginTop: spacing[1] }]}>
                          {g.lockedReason} Ask the organiser if something is wrong.
                        </Text>
                      ) : null}

                    </>
                  )}

                  {g.customFields.length > 0 ? (
                    <View style={[styles.card, { marginTop: spacing[5] }]}>
                      <CardBackdrop shape={styles.card} />
                      <Text style={[styles.cardTitle, { color: c.text }]}>Additional information</Text>
                      {view
                        ? visibleFields(g.customFields, m.customFields)
                            .filter((field) => field.field_type !== 'section')
                            .map((field) => {
                            const shown = displayAnswer(field, m.customFields?.[field.id]) || 'Not answered';
                            return (
                              <Text key={field.id} style={[styles.body, { color: c.soft, marginTop: spacing[2] }]}>
                                {field.label}: <Text style={{ color: c.text }}>{shown}</Text>
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
            {g.rosterError ? <Text style={[styles.error, { color: c.danger }]}>{g.rosterError}</Text> : null}
            <SeatActions actions={g.openRow?.actions ?? []} />
      </CosmosScreen>
    );
  }

  // ── One seat's page: who holds it (or its state) and what you can do ──
  if (g.openRow) {
    const row = g.openRow;
    const md = g.openSeat?.memberDetails || {};
    const title = row.kind === 'filled' ? row.name : row.label;
    const status =
      row.kind === 'filled'
        ? row.isLead
          ? 'Team lead'
          : row.appStatus
            ? `In the team. ${row.appStatus}, so they don't have their own ticket in the app.`
            : 'In the team'
        : row.kind === 'invited'
          ? `Invited${row.email ? ` · ${row.email}` : ''}, waiting to claim`
          : row.kind === 'released'
            ? 'Released. It stays yours, but no one can claim it until you reopen it.'
            : 'Open. Invite someone to claim it.';
    return (
      <CosmosScreen bottom={spacing[10] + insets.bottom} contentContainerStyle={styles.pad}>
          {header}
          <View style={styles.editHead}>
            <Text style={[styles.title, titleFont(title), { color: c.text, flex: 1 }]} numberOfLines={2} accessibilityRole="header">
              {title}
            </Text>
            <Pressable onPress={g.closeSeat} hitSlop={10}>
              <Text style={[styles.link, { color: c.soft }]}>Done</Text>
            </Pressable>
          </View>
          <Text style={[styles.body, { color: c.muted, marginTop: 4 }]}>{status}</Text>
          {row.kind === 'filled' && (md.email || md.mobile) ? (
            <View style={{ marginTop: spacing[5] }}>
              <SettingsGroup>
                {md.email ? <SettingsRow icon={<EnvelopeSimple size={24} color={c.primary} weight="duotone" />} label={md.email} /> : null}
                {md.mobile ? <SettingsRow icon={<Phone size={24} color={c.primary} weight="duotone" />} label={`+91 ${md.mobile}`} /> : null}
              </SettingsGroup>
            </View>
          ) : null}
          <SeatActions actions={row.actions} />
          {row.kind === 'filled' && !row.isLead && g.team?.isLead && !g.team.open ? (
            <Text style={[styles.small, { color: c.muted, marginTop: spacing[5] }]}>
              {g.team.lockedReason ?? 'Team changes are closed.'} Ask the organiser if you need a change.
            </Text>
          ) : null}
      </CosmosScreen>
    );
  }

  // ── The group ──
  const progress = g.totalCount > 0 ? g.filledCount / g.totalCount : 0;
  const allFilled = g.totalCount > 0 && g.filledCount === g.totalCount;

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: c.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {header}
        <CosmosList
          bottom={spacing[10] + insets.bottom}
          contentContainerStyle={styles.pad}
          keyboardDismissMode="interactive"
          data={g.isMember ? [] : g.rows}
          keyExtractor={(row) => row.key}
          ListHeaderComponent={
            <>
              <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">My group</Text>
              {g.totalCount > 0 ? (
                <>
                  <Text style={[styles.body, { color: c.soft, marginTop: 4 }]}>
                    {allFilled
                      ? 'Everyone is in. Nice.'
                      : `${g.filledCount} of ${g.totalCount} ${g.usesSeats ? 'seats filled' : 'members added'}`}
                  </Text>
                  <View style={[styles.track, { backgroundColor: c.raised }]}>
                    <View style={[styles.fill, { width: `${Math.round(progress * 100)}%`, backgroundColor: allFilled ? c.success : c.primary }]} />
                  </View>
                </>
              ) : null}

              {/* Lead handover: asked of me (member), or waiting on someone (lead). */}
              {g.team?.leadTransfer ? (
                <View style={[styles.card, { marginTop: spacing[5] }]}>
                  <CardBackdrop shape={styles.card} />
                  <View style={styles.nameRow}>
                    <Crown size={20} color={c.primary} weight="duotone" />
                    <Text style={[styles.cardTitle, { color: c.text, marginBottom: 0 }]}>
                      {g.team.leadTransfer.toMe ? 'Lead your team?' : `Waiting for ${g.team.leadTransfer.toName}`}
                    </Text>
                  </View>
                  <Text style={[styles.body, { color: c.soft, marginTop: spacing[2] }]}>
                    {g.team.leadTransfer.toMe
                      ? `${g.team.leadTransfer.fromName} wants you to take over as team lead. You'll manage the team and its booking, including refunds.`
                      : `You asked ${g.team.leadTransfer.toName} to take over as team lead. Nothing changes until they accept.`}
                  </Text>
                  {g.team.leadTransfer.toMe ? (
                    <View style={[styles.actions, { marginTop: spacing[4] }]}>
                      <Button label="Accept" onPress={() => void g.answerTransfer(true)} style={{ flex: 1 }} />
                      <Button label="Decline" variant="secondary" onPress={() => void g.answerTransfer(false)} style={{ flex: 1 }} />
                    </View>
                  ) : (
                    <Pressable onPress={() => void g.cancelTransfer()} hitSlop={8} style={{ marginTop: spacing[3] }}>
                      <Text style={[styles.link, { color: c.danger }]}>Cancel request</Text>
                    </Pressable>
                  )}
                </View>
              ) : null}

              {/* The organiser's window for team changes (lead only). */}
              {g.team?.isLead && g.usesSeats ? (
                <Text style={[styles.small, { color: c.muted, marginTop: spacing[4] }]}>
                  {g.team.open
                    ? g.team.until
                      ? `You can change your team until ${new Date(g.team.until).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}.`
                      : 'You can change your team until the event ends.'
                    : `${g.team.lockedReason ?? 'Team changes are closed.'} Ask the organiser if you need a change.`}
                </Text>
              ) : null}

              {g.isMember ? (
                <View style={{ marginTop: spacing[6] }}>
                  <SettingsGroup>
                    <SettingsRow icon={<User size={24} color={c.primary} weight="duotone" />} label={g.details?.member?.name || 'Me'} />
                  </SettingsGroup>
                  <Text style={[styles.body, { color: c.muted, marginTop: spacing[2] }]}>
                    Name, email, phone and gender can't be changed here. You can change your name and gender in your profile.
                  </Text>
                </View>
              ) : null}
            </>
          }
          ListEmptyComponent={
            g.isMember ? null : (
              <View style={[styles.empty, { backgroundColor: c.raised, marginTop: spacing[6] }]}>
                <Text style={[styles.body, { color: c.soft, textAlign: 'center' }]}>There's nothing to manage for this ticket.</Text>
              </View>
            )
          }
          renderItem={({ item, index }) => (
            <GroupCell
              index={index}
              count={g.rows.length}
              divider={styles.rosterDivider}
              style={[index === 0 && styles.rosterFirst, index === g.rows.length - 1 && styles.rosterLast]}
            >
              <Row row={item} />
            </GroupCell>
          )}
          ListFooterComponent={
            <>
              {/* Lead: grow the team, inside the window and its size limit. */}
              {g.team?.isLead && g.teamOpen && g.usesSeats && g.team.canAddUpTo !== 0 ? (
                <View style={[styles.card, { marginTop: spacing[4] }]}>
                  <CardBackdrop shape={styles.card} />
                  <Text style={[styles.cardTitle, { color: c.text }]}>Add people</Text>
                  <Text style={[styles.small, { color: c.muted }]}>
                    {g.addIosBlocked
                      ? "Paid seats for online events aren't available in the iOS app."
                      : g.team.addNeedsPayment
                      ? `₹${g.team.addPricePerSeat} per person, plus the processing fee. Each new seat gets an invite link.`
                      : 'New seats are free on this ticket. Each one gets an invite link.'}
                  </Text>
                  {g.addIosBlocked ? null : (
                  <View style={[styles.stepper, { marginTop: spacing[4] }]}>
                    <Pressable
                      onPress={() => g.setAddCount(Math.max(1, g.addCount - 1))}
                      disabled={g.addCount <= 1}
                      hitSlop={10}
                      accessibilityLabel="One fewer seat"
                      style={{ opacity: g.addCount <= 1 ? 0.3 : 1 }}
                    >
                      <Minus size={22} color={c.text} weight="bold" />
                    </Pressable>
                    <Text style={[styles.stepCount, { color: c.text }]}>{g.addCount}</Text>
                    <Pressable
                      onPress={() => g.setAddCount(Math.min(g.team?.isLead ? g.team.canAddUpTo ?? 20 : 20, 20, g.addCount + 1))}
                      hitSlop={10}
                      accessibilityLabel="One more seat"
                    >
                      <Plus size={22} color={c.text} weight="bold" />
                    </Pressable>
                    <Button
                      label={g.team.addNeedsPayment ? `Pay ₹${g.team.addPricePerSeat * g.addCount} + fee` : `Add ${g.addCount} seat${g.addCount > 1 ? 's' : ''}`}
                      loading={g.adding}
                      onPress={() => void g.addSeats()}
                      style={{ flex: 1 }}
                    />
                  </View>
                  )}
                </View>
              ) : null}

              {/* Lead: the per-group questions, asked once for everyone. Teammate: their own answers. */}
              {g.details && g.teamFields.length > 0 ? (
                <View style={[styles.card, { marginTop: spacing[4] }]}>
                  <CardBackdrop shape={styles.card} />
                  <Text style={[styles.cardTitle, { color: c.text }]}>{g.isMember ? 'My answers' : 'Team answers'}</Text>
                  {g.details.editable ? (
                    <>
                      {g.details.editsUntil ? (
                        <Text style={[styles.small, { color: c.muted }]}>
                          You can change these until{' '}
                          {new Date(g.details.editsUntil).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}.
                        </Text>
                      ) : null}
                      {visibleFields(g.teamFields, g.teamDraft).map((field) => (
                        <CustomFieldInput key={field.id} field={field} value={g.teamDraft[field.id]} onChange={(v) => g.changeTeamAnswer(field.id, v)} />
                      ))}
                      <Button label={g.isMember ? 'Save my answers' : 'Save team answers'} loading={g.savingTeam} disabled={!g.teamChanged} onPress={g.saveTeam} fullWidth style={{ marginTop: spacing[4] }} />
                    </>
                  ) : (
                    <>
                      <Text style={[styles.small, { color: c.muted }]}>
                        {g.details.lockedReason ?? 'These can’t be changed right now.'} Ask the organiser if something is wrong.
                      </Text>
                      {visibleFields(g.teamFields, g.teamDraft)
                        .filter((field) => field.field_type !== 'section')
                        .map((field) => (
                          <Text key={field.id} style={[styles.body, { color: c.soft, marginTop: spacing[2] }]}>
                            {field.label}: <Text style={{ color: c.text }}>{displayAnswer(field, g.teamDraft[field.id]) || 'Not answered'}</Text>
                          </Text>
                        ))}
                    </>
                  )}
                </View>
              ) : null}

              {/* Inline invite (seats) — opened from an open row */}
              {g.composerOpen ? (
                <View style={[styles.card, { marginTop: spacing[4] }]}>
                  <CardBackdrop shape={styles.card} />
                  <View style={styles.cardHead}>
                    <Text style={[styles.cardTitle, { color: c.text, marginBottom: 0 }]}>
                      {g.replacing ? `Replace ${g.replacing.name}` : 'Invite by email'}
                    </Text>
                    <Pressable onPress={() => g.setComposerOpen(false)} hitSlop={10}>
                      <Text style={[styles.link, { color: c.soft }]}>Cancel</Text>
                    </Pressable>
                  </View>
                  <Text style={[styles.small, { color: c.muted, marginTop: 4 }]}>
                    {g.replacing
                      ? `${g.replacing.name} loses this seat and is told by email. The new person gets a link to claim it.`
                      : 'They get a link to claim this seat as their own ticket and fill in their own details.'}
                  </Text>
                  <View style={[styles.inputRow, { backgroundColor: c.card, borderColor: c.input }]}>
                    <EnvelopeSimple size={20} color={c.muted} />
                    <TextInput
                      style={[styles.input, { color: c.text }]}
                      value={g.email}
                      onChangeText={g.setEmail}
                      placeholder="name@email.com"
                      placeholderTextColor={c.muted}
                      selectionColor={c.text}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      returnKeyType="send"
                      autoFocus
                      onSubmitEditing={g.invite}
                    />
                  </View>
                  <Button
                    label={g.replacing ? 'Replace and invite' : 'Send invite'}
                    loading={g.inviting}
                    disabled={!g.email.trim()}
                    onPress={g.invite}
                    size="lg"
                    fullWidth
                    style={{ marginTop: spacing[4] }}
                  />
                </View>
              ) : null}
            </>
          }
        />
    </KeyboardAvoidingView>
  );
}

/** A seat's actions, as a list on its page. Destructive ones are red. */
function SeatActions({ actions }: { actions: SeatAction[] }) {
  if (actions.length === 0) return null;
  return (
    <View style={{ marginTop: spacing[6] }}>
      <SettingsGroup title="Actions">
        {actions.map((a) => (
          <SettingsRow key={a.key} label={a.label} danger={a.danger} onPress={a.onPress} />
        ))}
      </SettingsGroup>
    </View>
  );
}

/** One person-slot: who it is (or the seat's state). Tap to open its page. */
const Row = React.memo(function Row({ row }: { row: GroupRow }) {
  const c = useCosmos();
  const leadMark = row.isLead ? <Star size={12} color={c.primary} weight="fill" /> : null;

  const mark =
    row.kind === 'filled' ? (
      <View style={[styles.avatar, { backgroundColor: c.card }]}>
        <Text style={[styles.avatarText, { color: c.text }]}>{row.name.charAt(0).toUpperCase()}</Text>
      </View>
    ) : (
      <View style={styles.avatar}>
        {row.kind === 'invited' ? (
          <EnvelopeSimple size={24} color={c.primary} />
        ) : row.kind === 'released' ? (
          <ArrowCounterClockwise size={22} color={c.muted} />
        ) : (
          <Plus size={24} color={c.primary} weight="bold" />
        )}
      </View>
    );

  const [title, sub, titleColor, subColor] =
    row.kind === 'filled'
      ? [row.name, row.appStatus ?? row.sub, c.text, c.muted]
      : row.kind === 'invited'
        ? [row.email || row.label, 'Invited, waiting to claim', c.text, c.primary]
        : row.kind === 'released'
          ? [row.label, 'Released', c.soft, c.muted]
          : ['Invite by email', row.label, c.primary, c.muted];

  return (
    <Pressable
      onPress={row.onOpen}
      style={({ pressed }) => [styles.row, row.kind === 'released' && { opacity: 0.6 }, pressed && { backgroundColor: c.tint }]}
    >
      {mark}
      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          {leadMark}
          <Text style={[styles.name, { color: titleColor }]} numberOfLines={1}>
            {title}
            {row.kind === 'filled' && row.isLead ? <Text style={{ color: c.muted }}>{'  You'}</Text> : null}
          </Text>
        </View>
        {sub ? (
          <Text style={[styles.small, { color: subColor }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <CaretRight size={14} color={c.muted} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { paddingHorizontal: GUTTER },
  empty: { alignItems: 'center', borderRadius: cosmosCardRadius, padding: spacing[6] },
  title: { flexShrink: 1, fontSize: typography.fontSize.xl, lineHeight: 28, ...cosmosFont.display },
  body: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  small: { fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...cosmosFont.body },
  link: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  error: { marginTop: spacing[3], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: spacing[3] },
  fill: { height: '100%', borderRadius: 3 },
  card: { borderRadius: cosmosCardRadius, padding: spacing[5], overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: typography.fontSize.base, marginBottom: spacing[3], ...cosmosFont.strong },
  editHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], minHeight: 64, paddingVertical: spacing[2] },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, ...cosmosFont.strong },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { flexShrink: 1, fontSize: typography.fontSize.base, ...cosmosFont.strong },
  actions: { flexDirection: 'row', gap: spacing[4] },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  stepCount: { minWidth: 24, textAlign: 'center', fontSize: typography.fontSize.lg, ...cosmosFont.figure },
  action: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  divider: { height: StyleSheet.hairlineWidth },
  // The roster card: a little air above the first row and below the last.
  rosterFirst: { marginTop: spacing[6], paddingTop: spacing[1] },
  rosterLast: { paddingBottom: spacing[1] },
  rosterDivider: { marginLeft: spacing[4] + AVATAR + spacing[3] },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    height: 52,
    borderRadius: cosmosRadius,
    borderWidth: 1,
    paddingHorizontal: spacing[4],
    marginTop: spacing[4],
  },
  input: { flex: 1, height: '100%', fontSize: typography.fontSize.base, ...cosmosFont.body },
});
