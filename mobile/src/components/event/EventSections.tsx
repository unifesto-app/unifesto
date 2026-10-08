import React, { useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { CaretDown, CaretRight, CheckCircle, EnvelopeSimple, Phone } from '@unifesto/unicon/react-native';
import { GUTTER, Rail, Section } from '../home/Section';
import type { AgendaItem, Contact, Faq, Prize, Speaker } from '../../lib/api/additional-info';
import type { EventCurator, EventSponsor } from '../../lib/api/events';
import { formatTime } from '../../utils/eventFormat';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, cosmosRadius, useCosmos } from '../../theme/cosmos';

/** Long agendas start folded to this many slots. */
const AGENDA_PREVIEW = 4;
const SPEAKER_WIDTH = 148;

const toggleAnim = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
const countLabel = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Raised card in the gutter whose children are split by hairlines. */
function Card({ children }: { children: React.ReactNode }) {
  const c = useCosmos();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.card, { backgroundColor: c.raised }]}>
      {items.map((child, i) => (
        <View key={i}>
          {child}
          {i < items.length - 1 ? <View style={[styles.divider, { backgroundColor: c.border }]} /> : null}
        </View>
      ))}
    </View>
  );
}

function Avatar({ uri, name, size = 44, square = false }: { uri?: string | null; name: string; size?: number; square?: boolean }) {
  const c = useCosmos();
  // Space and sponsor logos are 1:1 rounded squares; people are circles.
  const radius = square ? size * 0.24 : size / 2;
  return uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius, backgroundColor: c.card }} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.36, color: c.muted, ...cosmosFont.display }}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

/** Quiet text toggle under a folded list. */
function MoreToggle({ open, label, onPress }: { open: boolean; label: string; onPress: () => void }) {
  const c = useCosmos();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" style={({ pressed }) => [styles.more, { opacity: pressed ? 0.6 : 1 }]}>
      <Text style={[styles.moreText, { color: c.text }]}>{open ? 'Show less' : label}</Text>
      <CaretDown size={13} color={c.text} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
    </Pressable>
  );
}

export function AgendaSection({ items }: { items: AgendaItem[] }) {
  const c = useCosmos();
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, AGENDA_PREVIEW);
  return (
    <Section title="Schedule" subtitle={countLabel(items.length, 'slot')}>
      <View style={styles.gutter}>
        <Card>
          {shown.map((item) => {
            const start = item.startTime || item.start_time;
            const end = item.endTime || item.end_time;
            const where = item.location || item.speakerName;
            return (
              <View key={item.id} style={styles.agendaRow}>
                <View style={styles.agendaTimeCol}>
                  <Text style={[styles.agendaTime, { color: c.text }]}>{start ? formatTime(new Date(start)) : ''}</Text>
                  {end ? <Text style={[styles.agendaEnd, { color: c.muted }]}>{formatTime(new Date(end))}</Text> : null}
                </View>
                <View style={styles.flexGap}>
                  <Text style={[styles.itemTitle, { color: c.text }]}>{item.title}</Text>
                  {item.description ? <Text style={[styles.itemBody, { color: c.soft }]}>{item.description}</Text> : null}
                  {where ? <Text style={[styles.itemMeta, { color: c.muted }]}>{where}</Text> : null}
                </View>
              </View>
            );
          })}
        </Card>
        {items.length > AGENDA_PREVIEW ? (
          <MoreToggle open={open} label={`Show all ${items.length}`} onPress={() => { toggleAnim(); setOpen((o) => !o); }} />
        ) : null}
      </View>
    </Section>
  );
}

/** Speakers as a rail of tiles: faces are the point, so they lead. */
export function SpeakersSection({ items }: { items: Speaker[] }) {
  const c = useCosmos();
  return (
    <Section title="Speakers" subtitle={countLabel(items.length, 'speaker')}>
      <Rail>
        {items.map((s: any) => {
          const role = [s.title || s.designation, s.company].filter(Boolean).join(' · ');
          const featured = s.is_featured || s.isFeatured;
          return (
            <View key={s.id} style={[styles.speaker, { backgroundColor: c.raised }]}>
              <Avatar uri={s.profile_image_url || s.avatarUrl} name={s.name} size={72} />
              <Text style={[styles.speakerName, { color: c.text }]} numberOfLines={2}>{s.name}</Text>
              {role ? <Text style={[styles.speakerRole, { color: c.muted }]} numberOfLines={2}>{role}</Text> : null}
              {featured ? (
                <View style={[styles.chip, { borderColor: c.outline }]}>
                  <Text style={[styles.chipText, { color: c.soft }]}>Featured</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </Rail>
    </Section>
  );
}

const PLACE: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd' };

export function PrizesSection({ items }: { items: Prize[] }) {
  const c = useCosmos();
  return (
    <Section title="Prizes" subtitle={countLabel(items.length, 'prize')}>
      <View style={styles.gutter}>
        <Card>
          {items.map((p) => (
            <View key={p.id} style={styles.row}>
              <Text style={[styles.place, { color: p.position ? c.text : c.muted }]}>
                {p.position ? PLACE[p.position] || `${p.position}th` : '—'}
              </Text>
              <View style={styles.flexGap}>
                <Text style={[styles.itemTitle, { color: c.text }]}>{p.name}</Text>
                {p.description ? <Text style={[styles.itemBody, { color: c.soft }]}>{p.description}</Text> : null}
              </View>
              {p.value ? <Text style={[styles.prizeValue, { color: c.text }]} numberOfLines={1}>{p.value}</Text> : null}
            </View>
          ))}
        </Card>
      </View>
    </Section>
  );
}

export function SponsorsSection({ items, optedIn, pending, onToggle }: {
  items: EventSponsor[];
  optedIn: Set<string>;
  pending: Set<string>;
  onToggle: (eventSponsorId: string) => void;
}) {
  const c = useCosmos();
  return (
    <Section title="Sponsors and partners">
      <View style={styles.gutter}>
        <Card>
          {items.map((sp) => {
            const isIn = optedIn.has(sp.eventSponsorId);
            const busy = pending.has(sp.eventSponsorId);
            return (
              <View key={sp.eventSponsorId} style={styles.sponsor}>
                <Pressable
                  style={styles.rowTight}
                  disabled={!sp.websiteUrl}
                  onPress={() => sp.websiteUrl && Linking.openURL(sp.websiteUrl)}
                  accessibilityRole={sp.websiteUrl ? 'link' : undefined}
                >
                  <Avatar uri={sp.logoUrl} name={sp.name} size={48} square />
                  <View style={styles.flexGap}>
                    <Text style={[styles.itemTitle, { color: c.text }]} numberOfLines={1}>{sp.name}</Text>
                    {sp.tier ? <Text style={[styles.itemMeta, { color: sp.tier.color || c.muted }]}>{sp.tier.name}</Text> : null}
                    {sp.description ? (
                      <Text style={[styles.itemBody, { color: c.soft }]} numberOfLines={2}>{sp.description}</Text>
                    ) : null}
                  </View>
                </Pressable>
                {sp.leadCaptureEnabled ? (
                  <Pressable
                    onPress={() => onToggle(sp.eventSponsorId)}
                    disabled={busy}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.optIn,
                      isIn ? { borderWidth: 1, borderColor: c.outline } : { backgroundColor: c.primary },
                      { opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color={isIn ? c.muted : c.primaryFg} />
                    ) : isIn ? (
                      <>
                        <CheckCircle size={16} color={c.soft} weight="fill" />
                        <Text style={[styles.optInText, { color: c.soft }]}>Details shared</Text>
                      </>
                    ) : (
                      <Text style={[styles.optInText, { color: c.primaryFg }]}>I'm interested</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </Card>
      </View>
    </Section>
  );
}

/** Each question folds on its own, so a long FAQ stays scannable. */
export function FaqSection({ items }: { items: Faq[] }) {
  const c = useCosmos();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    toggleAnim();
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  return (
    <Section title="FAQs">
      <View style={styles.gutter}>
        <Card>
          {items.map((f) => {
            const isOpen = open.has(f.id);
            return (
              <Pressable
                key={f.id}
                onPress={() => toggle(f.id)}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                style={styles.faq}
              >
                <View style={styles.faqHead}>
                  <Text style={[styles.itemTitle, styles.flex, { color: c.text }]}>{f.question}</Text>
                  <CaretDown size={15} color={c.muted} style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }} />
                </View>
                {isOpen ? <Text style={[styles.itemBody, { color: c.soft, marginTop: spacing[2] }]}>{f.answer}</Text> : null}
              </Pressable>
            );
          })}
        </Card>
      </View>
    </Section>
  );
}

/**
 * Who's behind it: the hosting space (tap → its page), the event's curators,
 * and the organiser contacts with bare mail / call actions.
 */
export function HostedBySection({ space, coHosts, curators, contacts, onOpenSpace }: {
  space?: { id: string; name: string; logoUrl: string | null } | null;
  coHosts?: { id: string; name: string; logoUrl: string | null }[];
  curators?: EventCurator[];
  contacts: Contact[];
  onOpenSpace: (id: string) => void;
}) {
  const c = useCosmos();
  const spaces = space ? [space, ...(coHosts ?? [])] : [];
  const people = curators ?? [];
  if (!spaces.length && !people.length && !contacts.length) return null;
  return (
    <Section title="Hosted by">
      <View style={styles.gutter}>
        <Card>
          {spaces.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => onOpenSpace(s.id)}
              accessibilityRole="link"
              style={({ pressed }) => [styles.row, styles.center, pressed && { backgroundColor: c.tint }]}
            >
              <Avatar uri={s.logoUrl} name={s.name} size={44} square />
              <Text style={[styles.itemTitle, styles.flex, { color: c.text }]} numberOfLines={1}>{s.name}</Text>
              <CaretRight size={15} color={c.muted} />
            </Pressable>
          ))}
          {people.map((p) => (
            <View key={p.id} style={[styles.row, styles.center]}>
              <Avatar uri={p.avatarUrl} name={p.fullName || p.username || 'C'} size={44} />
              <View style={styles.flex}>
                <Text style={[styles.itemTitle, { color: c.text }]} numberOfLines={1}>
                  {p.fullName || (p.username ? `@${p.username}` : 'Curator')}
                </Text>
                <Text style={[styles.itemMeta, { color: c.muted }]}>{p.roleCode === 'CO_CURATOR' ? 'Co-curator' : 'Curator'}</Text>
              </View>
            </View>
          ))}
          {contacts.map((ct) => (
            <View key={ct.id} style={[styles.row, styles.center]}>
              <View style={styles.flex}>
                <Text style={[styles.itemTitle, { color: c.text }]} numberOfLines={1}>{ct.name}</Text>
                <Text style={[styles.itemMeta, { color: c.muted }]} numberOfLines={1}>{ct.role || 'Contact'}</Text>
              </View>
              {ct.email ? (
                <Pressable onPress={() => Linking.openURL(`mailto:${ct.email}`)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Email ${ct.name}`}>
                  <EnvelopeSimple size={24} color={c.text} />
                </Pressable>
              ) : null}
              {ct.phone ? (
                <Pressable onPress={() => Linking.openURL(`tel:${ct.phone}`)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Call ${ct.name}`}>
                  <Phone size={24} color={c.text} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </Card>
      </View>
    </Section>
  );
}

/** A titled list of people: round avatar, name, role underneath. Used by the space page. */
export function PeopleBlock({ title, people }: {
  title: string;
  people: { id: string; name: string; avatarUrl: string | null; role: string }[];
}) {
  const c = useCosmos();
  return (
    <View style={{ gap: spacing[3] }}>
      <Text style={[styles.blockTitle, { color: c.text }]}>{title}</Text>
      {people.map((p) => (
        <View key={p.id} style={styles.rowTight}>
          <Avatar uri={p.avatarUrl} name={p.name} size={40} />
          <View style={styles.flex}>
            <Text style={[styles.itemTitle, { color: c.text }]} numberOfLines={1}>{p.name}</Text>
            <Text style={[styles.itemMeta, { color: c.muted }]}>{p.role}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexGap: { flex: 1, gap: 3 },
  center: { alignItems: 'center' },
  gutter: { paddingHorizontal: GUTTER },
  card: { borderRadius: cosmosCardRadius, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: spacing[4] },
  row: { flexDirection: 'row', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[4] },
  rowTight: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  blockTitle: { fontSize: 17, lineHeight: 24, ...cosmosFont.display },
  itemTitle: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.3, ...cosmosFont.strong },
  itemBody: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  itemMeta: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  more: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginTop: spacing[3], paddingHorizontal: spacing[1] },
  moreText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  agendaRow: { flexDirection: 'row', gap: spacing[4], paddingHorizontal: spacing[4], paddingVertical: spacing[4] },
  agendaTimeCol: { width: 74 },
  agendaTime: { fontSize: typography.fontSize.sm, fontVariant: ['tabular-nums'], ...cosmosFont.strong },
  agendaEnd: { marginTop: 2, fontSize: typography.fontSize.xs, fontVariant: ['tabular-nums'], ...cosmosFont.body },
  speaker: { width: SPEAKER_WIDTH, borderRadius: cosmosCardRadius, padding: spacing[4], alignItems: 'center' },
  speakerName: { marginTop: spacing[3], textAlign: 'center', fontSize: typography.fontSize.sm, lineHeight: 19, ...cosmosFont.strong },
  speakerRole: { marginTop: 3, textAlign: 'center', fontSize: typography.fontSize.xs, lineHeight: 16, ...cosmosFont.body },
  chip: { marginTop: spacing[3], paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 11, ...cosmosFont.strong },
  place: { width: 44, fontSize: 15, lineHeight: 21, ...cosmosFont.display },
  prizeValue: { maxWidth: '35%', fontSize: typography.fontSize.base, ...cosmosFont.strong },
  sponsor: { gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[4] },
  optIn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: cosmosRadius,
  },
  optInText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  faq: { paddingHorizontal: spacing[4], paddingVertical: spacing[4] },
  faqHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
});
