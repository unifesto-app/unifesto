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
import { CaretDown, CheckCircle } from 'phosphor-react-native';
import { useTokens } from '../../context/ThemeContext';
import { CardBackdrop } from '../ui/CardSurface';
import type { AgendaItem, Contact, Faq, Prize, Speaker } from '../../lib/api/additional-info';
import type { EventCurator, EventSponsor } from '../../lib/api/events';
import { formatTime } from '../../utils/eventFormat';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

/** Collapsible section: a borderless card whose title row toggles the body. */
export function Accordion({ title, count, defaultOpen = false, children }: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const tokens = useTokens();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.card}>
      <CardBackdrop />
      <Pressable
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setOpen((o) => !o);
        }}
        style={styles.cardHeader}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={[styles.cardTitle, { color: tokens.text }]}>
          {title}
          {count ? <Text style={{ color: tokens.textMuted }}>{`  ${count}`}</Text> : null}
        </Text>
        <CaretDown
          size={16}
          color={tokens.textMuted}
          weight="bold"
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        />
      </Pressable>
      {open ? <View style={styles.cardBody}>{children}</View> : null}
    </View>
  );
}

/** Rows inside a section, separated by hairlines. */
function Rows({ children }: { children: React.ReactNode }) {
  const tokens = useTokens();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View>
      {items.map((child, i) => (
        <View key={i}>
          {child}
          {i < items.length - 1 ? <View style={[styles.divider, { backgroundColor: tokens.border }]} /> : null}
        </View>
      ))}
    </View>
  );
}

function Avatar({ uri, name, size = 44, square = false }: { uri?: string | null; name: string; size?: number; square?: boolean }) {
  const tokens = useTokens();
  const radius = square ? borderRadius.md : size / 2;
  return uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius, backgroundColor: tokens.surface }} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.38, color: tokens.textSecondary, ...font('heading') }}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

export function AgendaSection({ items, accent }: { items: AgendaItem[]; accent: string }) {
  const tokens = useTokens();
  return (
    <Accordion title="Schedule" count={items.length}>
      <Rows>
        {items.map((item) => {
          const start = item.startTime || item.start_time;
          const end = item.endTime || item.end_time;
          const where = item.location || item.speakerName;
          return (
            <View key={item.id} style={styles.agendaRow}>
              <Text style={[styles.agendaTime, { color: accent }]}>
                {start ? formatTime(new Date(start)) : ''}
                {end ? `\n${formatTime(new Date(end))}` : ''}
              </Text>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[styles.itemTitle, { color: tokens.text }]}>{item.title}</Text>
                {item.description ? <Text style={[styles.itemBody, { color: tokens.textSecondary }]}>{item.description}</Text> : null}
                {where ? <Text style={[styles.itemMeta, { color: tokens.textMuted }]}>{where}</Text> : null}
              </View>
            </View>
          );
        })}
      </Rows>
    </Accordion>
  );
}

export function SpeakersSection({ items, accent }: { items: Speaker[]; accent: string }) {
  const tokens = useTokens();
  return (
    <Accordion title="Speakers" count={items.length}>
      <Rows>
        {items.map((s: any) => {
          const role = [s.title || s.designation, s.company].filter(Boolean).join(' · ');
          return (
            <View key={s.id} style={styles.personRow}>
              <Avatar uri={s.profile_image_url || s.avatarUrl} name={s.name} size={48} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[styles.itemTitle, { color: tokens.text }]}>
                  {s.name}
                  {s.is_featured || s.isFeatured ? <Text style={{ color: accent }}>{'  Featured'}</Text> : null}
                </Text>
                {role ? <Text style={[styles.itemMeta, { color: tokens.textSecondary }]}>{role}</Text> : null}
                {s.bio ? <Text style={[styles.itemBody, { color: tokens.textMuted }]} numberOfLines={3}>{s.bio}</Text> : null}
              </View>
            </View>
          );
        })}
      </Rows>
    </Accordion>
  );
}

export function SponsorsSection({ items, optedIn, pending, onToggle, accent }: {
  items: EventSponsor[];
  optedIn: Set<string>;
  pending: Set<string>;
  onToggle: (eventSponsorId: string) => void;
  accent: string;
}) {
  const tokens = useTokens();
  return (
    <Accordion title="Sponsors and partners" count={items.length}>
      <Rows>
        {items.map((sp) => {
          const isIn = optedIn.has(sp.eventSponsorId);
          const busy = pending.has(sp.eventSponsorId);
          return (
            <View key={sp.eventSponsorId} style={{ gap: spacing[3], paddingVertical: spacing[3] }}>
              <Pressable
                style={styles.personRowTight}
                disabled={!sp.websiteUrl}
                onPress={() => sp.websiteUrl && Linking.openURL(sp.websiteUrl)}
              >
                {/* Sponsor logos are 1:1. */}
                <Avatar uri={sp.logoUrl} name={sp.name} size={48} square />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[styles.itemTitle, { color: tokens.text }]} numberOfLines={1}>{sp.name}</Text>
                  {sp.tier ? (
                    <Text style={[styles.itemMeta, { color: sp.tier.color || tokens.textSecondary }]}>{sp.tier.name}</Text>
                  ) : null}
                  {sp.description ? (
                    <Text style={[styles.itemBody, { color: tokens.textMuted }]} numberOfLines={2}>{sp.description}</Text>
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
                    { backgroundColor: isIn ? tokens.surface : accent, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={isIn ? tokens.textMuted : '#fff'} />
                  ) : isIn ? (
                    <>
                      <CheckCircle size={16} color={tokens.textSecondary} weight="fill" />
                      <Text style={[styles.optInText, { color: tokens.textSecondary }]}>Details shared</Text>
                    </>
                  ) : (
                    <Text style={[styles.optInText, { color: '#fff' }]}>I'm interested</Text>
                  )}
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </Rows>
    </Accordion>
  );
}

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
const PLACE: Record<number, string> = { 1: '1st place', 2: '2nd place', 3: '3rd place' };

export function PrizesSection({ items, accent }: { items: Prize[]; accent: string }) {
  const tokens = useTokens();
  return (
    <Accordion title="Prizes" count={items.length}>
      <Rows>
        {items.map((p) => (
          <View key={p.id} style={styles.personRow}>
            <Text style={styles.medal}>{(p.position && MEDAL[p.position]) || '🏆'}</Text>
            <View style={{ flex: 1, gap: 3 }}>
              {p.position ? (
                <Text style={[styles.itemMeta, { color: tokens.textMuted }]}>{PLACE[p.position] || `#${p.position}`}</Text>
              ) : null}
              <Text style={[styles.itemTitle, { color: tokens.text }]}>{p.name}</Text>
              {p.description ? <Text style={[styles.itemBody, { color: tokens.textSecondary }]}>{p.description}</Text> : null}
              {p.value ? <Text style={[styles.itemTitle, { color: accent }]}>{p.value}</Text> : null}
            </View>
          </View>
        ))}
      </Rows>
    </Accordion>
  );
}

export function FaqSection({ items }: { items: Faq[] }) {
  const tokens = useTokens();
  return (
    <Accordion title="FAQs" count={items.length}>
      <Rows>
        {items.map((f) => (
          <View key={f.id} style={{ paddingVertical: spacing[3], gap: 6 }}>
            <Text style={[styles.itemTitle, { color: tokens.text }]}>{f.question}</Text>
            <Text style={[styles.itemBody, { color: tokens.textSecondary }]}>{f.answer}</Text>
          </View>
        ))}
      </Rows>
    </Accordion>
  );
}

export function ContactSection({ items, accent }: { items: Contact[]; accent: string }) {
  const tokens = useTokens();
  return (
    <Accordion title="Contact" count={items.length}>
      <Rows>
        {items.map((c) => (
          <View key={c.id} style={{ paddingVertical: spacing[3], gap: 3 }}>
            <Text style={[styles.itemTitle, { color: tokens.text }]}>{c.name}</Text>
            {c.role ? <Text style={[styles.itemMeta, { color: tokens.textMuted }]}>{c.role}</Text> : null}
            {c.email ? (
              <Text style={[styles.itemBody, { color: accent }]} onPress={() => Linking.openURL(`mailto:${c.email}`)}>
                {c.email}
              </Text>
            ) : null}
            {c.phone ? (
              <Text style={[styles.itemBody, { color: tokens.textSecondary }]} onPress={() => Linking.openURL(`tel:${c.phone}`)}>
                {c.phone}
              </Text>
            ) : null}
          </View>
        ))}
      </Rows>
    </Accordion>
  );
}

export function CuratorsBlock({ items }: { items: EventCurator[] }) {
  return (
    <PeopleBlock
      title="Curated by"
      people={items.map((c) => ({
        id: c.id,
        name: c.fullName || (c.username ? `@${c.username}` : 'Curator'),
        avatarUrl: c.avatarUrl,
        role: c.roleCode === 'CO_CURATOR' ? 'Co-curator' : 'Curator',
      }))}
    />
  );
}

/** A titled list of people: round avatar, name, role underneath. */
export function PeopleBlock({ title, people }: {
  title: string;
  people: { id: string; name: string; avatarUrl: string | null; role: string }[];
}) {
  const tokens = useTokens();
  return (
    <View style={{ gap: spacing[3] }}>
      <Text style={[styles.blockTitle, { color: tokens.text }]}>{title}</Text>
      {people.map((p) => (
        <View key={p.id} style={styles.personRowTight}>
          <Avatar uri={p.avatarUrl} name={p.name} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.itemTitle, { color: tokens.text }]} numberOfLines={1}>{p.name}</Text>
            <Text style={[styles.itemMeta, { color: tokens.textMuted }]}>{p.role}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: borderRadius.xl, overflow: 'hidden' },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    minHeight: 56,
  },
  cardTitle: { fontSize: typography.fontSize.base, ...font('semibold') },
  cardBody: { paddingHorizontal: spacing[4], paddingBottom: spacing[2] },
  divider: { height: StyleSheet.hairlineWidth },
  blockTitle: { fontSize: typography.fontSize.lg, ...font('heading') },
  agendaRow: { flexDirection: 'row', gap: spacing[4], paddingVertical: spacing[3] },
  agendaTime: { width: 72, fontSize: typography.fontSize.sm, lineHeight: 20, fontVariant: ['tabular-nums'], ...font('semibold') },
  personRow: { flexDirection: 'row', gap: spacing[3], paddingVertical: spacing[3] },
  personRowTight: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  itemTitle: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.3, ...font('semibold') },
  itemBody: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  itemMeta: { fontSize: typography.fontSize.sm, ...font('medium') },
  medal: { fontSize: 30, width: 44, textAlign: 'center' },
  optIn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: borderRadius.full,
  },
  optInText: { fontSize: typography.fontSize.sm, ...font('semibold') },
});
