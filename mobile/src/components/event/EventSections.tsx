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
import { CaretDown, CaretRight, CheckCircle, EnvelopeSimple, Phone } from '../ui/icons';
import { GUTTER, Rail } from '../home/Section';
import type { AgendaItem, Contact, Faq, Prize, Speaker } from '../../lib/api/additional-info';
import type { EventSponsor } from '../../lib/api/events';
import { formatTime } from '../../utils/eventFormat';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, cosmosRadius, useCosmos } from '../../theme/cosmos';

/** Long agendas start folded to this many slots. */
const AGENDA_PREVIEW = 4;
const SPEAKER_WIDTH = 148;

const toggleAnim = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

/**
 * A section of the event (or space) page: a muted Hanken SemiBold title in
 * sentence case, no blurb under it, then its content. Same title as the
 * settings lists, so the page reads as one system.
 */
export function EventBlock({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useCosmos();
  return (
    <View style={styles.block}>
      <Text style={[styles.blockTitle, { color: c.muted }]} accessibilityRole="header">{title}</Text>
      {children}
    </View>
  );
}

/** Rows straight on the page, a full hairline between each; no card. */
function Rows({ children }: { children: React.ReactNode }) {
  const c = useCosmos();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View>
      {items.map((child, i) => (
        <View key={i} style={i > 0 && [styles.divider, { borderTopColor: c.border }]}>
          {child}
        </View>
      ))}
    </View>
  );
}

function Avatar({ uri, name, size = 44, square = false }: { uri?: string | null; name: string; size?: number; square?: boolean }) {
  const c = useCosmos();
  // Space and sponsor logos are 1:1 rounded squares; people are circles.
  const radius = square ? borderRadius.md : size / 2;
  return uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius, backgroundColor: c.card }} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.36, color: c.muted, ...cosmosFont.strong }}>{name.charAt(0).toUpperCase()}</Text>
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

const agendaDay = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

export function AgendaSection({ items }: { items: AgendaItem[] }) {
  const c = useCosmos();
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, AGENDA_PREVIEW);
  const startOf = (item: AgendaItem) => item.startTime || item.start_time;
  // A multi-day agenda (a fest, an overnight hackathon) opens each day with its date.
  const multiDay = new Set(items.map((item) => agendaDay(startOf(item)))).size > 1;
  return (
    <EventBlock title="Schedule">
      <View style={styles.gutter}>
        <Rows>
          {shown.map((item, i) => {
            const start = startOf(item);
            const end = item.endTime || item.end_time;
            const where = [item.location, item.speakerName].filter(Boolean).join(' · ');
            const day = agendaDay(start);
            const newDay = multiDay && (i === 0 || agendaDay(startOf(shown[i - 1])) !== day);
            return (
              <View key={item.id}>
                {newDay ? <Text style={[styles.agendaDay, { color: c.muted }]}>{day}</Text> : null}
                <View style={styles.agendaRow}>
                  <View style={styles.agendaTimeCol}>
                    <Text style={[styles.agendaTime, { color: c.sky }]}>{start ? formatTime(new Date(start)) : ''}</Text>
                    {end ? <Text style={[styles.agendaEnd, { color: c.muted }]}>{formatTime(new Date(end))}</Text> : null}
                  </View>
                  <View style={styles.flexGap}>
                    <Text style={[styles.itemTitle, { color: c.text }]}>{item.title}</Text>
                    {item.description ? <Text style={[styles.itemBody, { color: c.soft }]}>{item.description}</Text> : null}
                    {where ? <Text style={[styles.itemMeta, { color: c.muted }]}>{where}</Text> : null}
                  </View>
                </View>
              </View>
            );
          })}
        </Rows>
        {items.length > AGENDA_PREVIEW ? (
          <MoreToggle open={open} label={`Show all ${items.length}`} onPress={() => { toggleAnim(); setOpen((o) => !o); }} />
        ) : null}
      </View>
    </EventBlock>
  );
}

/** Speakers as a rail of bare faces (no tiles): faces are the point, so they lead. */
export function SpeakersSection({ items }: { items: Speaker[] }) {
  const c = useCosmos();
  return (
    <EventBlock title="Speakers">
      <Rail>
        {items.map((s: any) => {
          const role = [s.title || s.designation, s.company].filter(Boolean).join(' · ');
          const featured = s.is_featured || s.isFeatured;
          return (
            <View key={s.id} style={styles.speaker}>
              <Avatar uri={s.profile_image_url || s.avatarUrl} name={s.name} size={72} />
              <Text style={[styles.speakerName, { color: c.text }]} numberOfLines={2}>{s.name}</Text>
              {role ? <Text style={[styles.speakerRole, { color: c.muted }]} numberOfLines={2}>{role}</Text> : null}
              {featured ? <Text style={[styles.featured, { color: c.muted }]}>Featured</Text> : null}
            </View>
          );
        })}
      </Rail>
    </EventBlock>
  );
}

const PLACE: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd' };

export function PrizesSection({ items }: { items: Prize[] }) {
  const c = useCosmos();
  return (
    <EventBlock title="Prizes">
      <View style={styles.gutter}>
        <Rows>
          {items.map((p) => (
            <View key={p.id} style={styles.row}>
              <Text style={[styles.place, { color: p.position ? c.text : c.muted }]}>
                {p.position ? PLACE[p.position] || `${p.position}th` : ''}
              </Text>
              <View style={styles.flexGap}>
                <Text style={[styles.itemTitle, { color: c.text }]}>{p.name}</Text>
                {p.description ? <Text style={[styles.itemBody, { color: c.soft }]}>{p.description}</Text> : null}
              </View>
              {p.value ? <Text style={[styles.prizeValue, { color: c.ivory }]} numberOfLines={1}>{p.value}</Text> : null}
            </View>
          ))}
        </Rows>
      </View>
    </EventBlock>
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
    <EventBlock title="Sponsors and partners">
      <View style={styles.gutter}>
        <Rows>
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
                    {sp.tier ? <Text style={[styles.itemMeta, { color: c.muted }]}>{sp.tier.name}</Text> : null}
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
                    accessibilityLabel={isIn ? `Details shared with ${sp.name}. Undo` : `I'm interested in ${sp.name}`}
                    accessibilityState={{ selected: isIn, busy }}
                    // Secondary, a hairline outline: the page's one primary is the register bar.
                    style={({ pressed }) => [
                      styles.optIn,
                      isIn ? null : { borderWidth: 1, borderColor: c.outline },
                      { opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color={c.muted} />
                    ) : isIn ? (
                      <>
                        <CheckCircle size={16} color={c.success} weight="fill" />
                        <Text style={[styles.optInText, { color: c.success }]}>Details shared</Text>
                      </>
                    ) : (
                      <Text style={[styles.optInText, { color: c.text }]}>I'm interested</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </Rows>
      </View>
    </EventBlock>
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
    <EventBlock title="FAQs">
      <View style={styles.gutter}>
        <Rows>
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
        </Rows>
      </View>
    </EventBlock>
  );
}

/**
 * Who's behind it: the hosting spaces (tap → their page) and the organiser's
 * contacts with bare mail / call actions. The event's team (curators) isn't
 * listed: the contacts are who the organiser chose to put forward.
 */
export function HostedBySection({ space, coHosts, contacts, onOpenSpace }: {
  space?: { id: string; name: string; logoUrl: string | null; visibility?: string } | null;
  coHosts?: { id: string; name: string; logoUrl: string | null; visibility?: string }[];
  contacts: Contact[];
  onOpenSpace: (id: string) => void;
}) {
  const c = useCosmos();
  const spaces = space ? [space, ...(coHosts ?? [])] : [];
  if (!spaces.length && !contacts.length) return null;
  return (
    <EventBlock title="Hosted by">
      <View style={styles.gutter}>
        <Rows>
          {spaces.map((s) => (
            <Pressable
              key={s.id}
              // A PRIVATE space has no public page, so it isn't a link.
              disabled={s.visibility === 'PRIVATE'}
              onPress={() => onOpenSpace(s.id)}
              accessibilityRole={s.visibility === 'PRIVATE' ? undefined : 'link'}
              style={({ pressed }) => [styles.row, styles.center, pressed && { opacity: 0.6 }]}
            >
              <Avatar uri={s.logoUrl} name={s.name} size={44} square />
              <Text style={[styles.itemTitle, styles.flex, { color: c.text }]} numberOfLines={1}>{s.name}</Text>
              {s.visibility === 'PRIVATE' ? null : <CaretRight size={15} color={c.muted} />}
            </Pressable>
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
        </Rows>
      </View>
    </EventBlock>
  );
}

/** A titled list of people as rows: round avatar, name, role underneath. Used by the space page. */
export function PeopleBlock({ title, people }: {
  title: string;
  people: { id: string; name: string; avatarUrl: string | null; role: string }[];
}) {
  const c = useCosmos();
  return (
    <EventBlock title={title}>
      <View style={styles.gutter}>
        <Rows>
          {people.map((p) => (
            <View key={p.id} style={[styles.row, styles.center]}>
              <Avatar uri={p.avatarUrl} name={p.name} size={44} />
              <View style={styles.flex}>
                <Text style={[styles.itemTitle, { color: c.text }]} numberOfLines={1}>{p.name}</Text>
                <Text style={[styles.itemMeta, { color: c.muted }]}>{p.role}</Text>
              </View>
            </View>
          ))}
        </Rows>
      </View>
    </EventBlock>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexGap: { flex: 1, gap: 3 },
  center: { alignItems: 'center' },
  gutter: { paddingHorizontal: GUTTER },
  // A page section: spacing[8] above, like the settings lists.
  block: { marginTop: spacing[8] },
  blockTitle: { marginBottom: spacing[3], marginHorizontal: GUTTER + spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  // Rows sit on the page inside the gutter: full hairlines, no side padding.
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', gap: spacing[3], paddingVertical: spacing[4] },
  rowTight: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  itemTitle: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.3, ...cosmosFont.strong },
  itemBody: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  itemMeta: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  more: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginTop: spacing[3], paddingHorizontal: spacing[1] },
  moreText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  agendaRow: { flexDirection: 'row', gap: spacing[4], paddingVertical: spacing[4] },
  agendaDay: { paddingTop: spacing[4], fontSize: typography.fontSize.xs, ...cosmosFont.body },
  agendaTimeCol: { width: 74 },
  agendaTime: { fontSize: typography.fontSize.sm, ...cosmosFont.figure },
  agendaEnd: { marginTop: 2, fontSize: typography.fontSize.xs, ...cosmosFont.figure },
  speaker: { width: SPEAKER_WIDTH, alignItems: 'center' },
  speakerName: { marginTop: spacing[3], textAlign: 'center', fontSize: typography.fontSize.sm, lineHeight: 19, ...cosmosFont.strong },
  speakerRole: { marginTop: 3, textAlign: 'center', fontSize: typography.fontSize.xs, lineHeight: 16, ...cosmosFont.body },
  featured: { marginTop: spacing[2], fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  place: { width: 44, fontSize: 15, lineHeight: 21, ...cosmosFont.figure },
  prizeValue: { maxWidth: '35%', fontSize: typography.fontSize.base, ...cosmosFont.figure },
  sponsor: { gap: spacing[3], paddingVertical: spacing[4] },
  optIn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: cosmosRadius,
  },
  optInText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  faq: { paddingVertical: spacing[4] },
  faqHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
});
