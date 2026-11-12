import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image as RNImage, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { Certificate as CertificateIcon, Export } from '@unifesto/unicon/react-native';
import useTopSpacing from '../hooks/useTopSpacing';
import Skeleton from '../components/Skeleton';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import AuthButton from '../components/auth/AuthButton';
import { GUTTER } from '../components/home/Section';
import { AppAlert } from '../components/ui/AppAlert';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { getMyCertificates, type MyCertificate } from '../lib/api/certificates';
import { borderRadius, column, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, displayTracking, useCosmos } from '../theme/cosmos';

/** Most templates are landscape A4; used until the real image size is known. */
const DEFAULT_RATIO = 1.414;
const VERIFY_BASE = 'https://unifesto.app/verify';
const THUMB_W = 96;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const verifyUrl = (cert: MyCertificate) => `${VERIFY_BASE}/${cert.verificationCode}`;

const share = (cert: MyCertificate) =>
  Share.share({
    message: `My certificate for ${cert.event.title} on Unifesto. Verify it here: ${verifyUrl(cert)}`,
    url: verifyUrl(cert),
  }).catch(() => {});

/** The PDF when there is one (print quality), else the image. */
const openCert = (cert: MyCertificate) => {
  const url = cert.pdfUrl || cert.imageUrl;
  if (url) WebBrowser.openBrowserAsync(url);
};

/** Certificates are drawn by each organiser's template: keep their true proportions. */
function useRatio(url: string | null) {
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  useEffect(() => {
    if (!url) return;
    RNImage.getSize(url, (w, h) => h > 0 && setRatio(w / h), () => {});
  }, [url]);
  return ratio;
}

/**
 * Profile › Certificates, straight on the page (no cards): the newest one up
 * front, big, with everything you'd do with it (open, share, copy the code a
 * résumé asks for); every earlier one as a row with full hairlines, grouped by
 * the year it was issued.
 */
export default function CertificatesScreen() {
  const c = useCosmos();
  const router = useRouter();
  const topSpacing = useTopSpacing();
  const [certificates, setCertificates] = useState<MyCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setCertificates(await getMyCertificates());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // F2: held for my feedback; listed apart, they open the feedback form.
  const locked = certificates.filter((cert) => cert.locked);
  // Newest first from the server; the first is the hero, the rest by year.
  const [latest, ...earlier] = certificates.filter((cert) => !cert.locked);
  const years = useMemo(() => {
    const groups = new Map<number, MyCertificate[]>();
    for (const cert of earlier) {
      const y = new Date(cert.issuedAt).getFullYear();
      groups.set(y, [...(groups.get(y) ?? []), cert]);
    }
    return [...groups.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [certificates]);

  const body = loading ? (
    <View style={styles.pad}>
      <Skeleton width="100%" height={240} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[4] }} />
      <Skeleton width="70%" height={20} borderRadius={6} style={{ marginTop: spacing[4] }} />
      <Skeleton width="40%" height={14} borderRadius={6} style={{ marginTop: spacing[2] }} />
    </View>
  ) : !latest && !locked.length ? (
    // An empty state straight on the page: one headline, one line, one button.
    <View style={styles.prompt}>
      <CertificateIcon size={44} color={c.muted} weight="duotone" />
      <Text style={[styles.promptTitle, { color: c.text }]} accessibilityRole="header">No certificates yet</Text>
      <Text style={[styles.promptBody, { color: c.muted }]}>
        When an organiser issues a certificate for an event you attended, it lands here, ready to share.
      </Text>
      <AuthButton label="Browse events" arrow onPress={() => router.push('/events')} style={styles.promptButton} />
    </View>
  ) : (
    <>
      {locked.length ? (
        <SettingsGroup title="Waiting for my feedback" style={[styles.group, styles.first]}>
          {locked.map((cert) => (
            <SettingsRow
              key={cert.id}
              icon={<CertificateIcon size={28} color={c.warn} />}
              label={cert.event.title}
              value="Rate to unlock"
              onPress={() => router.push(`/feedback/${cert.event.id}` as never)}
            />
          ))}
        </SettingsGroup>
      ) : null}
      {latest ? (
        <View style={[styles.pad, locked.length ? styles.after : null]}>
          <Text style={[styles.eyebrow, { color: c.muted }]}>
            {certificates.length - locked.length === 1 ? 'My certificate' : `Latest of ${certificates.length - locked.length}`}
          </Text>
          <LatestCertificate cert={latest} onOpenEvent={() => router.push(`/event/${latest.event.slug || latest.event.id}`)} />
        </View>
      ) : null}
      {years.map(([year, certs]) => (
        <SettingsGroup key={year} plain title={String(year)} style={styles.group}>
          {certs.map((cert) => <CertificateRow key={cert.id} cert={cert} />)}
        </SettingsGroup>
      ))}
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={[column, { paddingTop: topSpacing, paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.text} colors={[c.text]} progressViewOffset={topSpacing} />
        }
      >
        {body}
      </ScrollView>
    </View>
  );
}

/** The newest certificate on the page: its image at true proportions, then title, actions and the code band. */
function LatestCertificate({ cert, onOpenEvent }: { cert: MyCertificate; onOpenEvent: () => void }) {
  const c = useCosmos();
  const ratio = useRatio(cert.imageUrl);

  const copyCode = async () => {
    try {
      await Clipboard.setStringAsync(verifyUrl(cert));
      AppAlert.alert('Link copied', 'Anyone with it can check this certificate is genuine.');
    } catch {
      AppAlert.alert('Unable to copy', 'Please try again.');
    }
  };

  return (
    <View>
      <Pressable
        onPress={() => cert.imageUrl && WebBrowser.openBrowserAsync(cert.imageUrl)}
        disabled={!cert.imageUrl}
        accessibilityRole="imagebutton"
        accessibilityLabel="Open certificate image"
      >
        <View style={[styles.preview, { aspectRatio: ratio, backgroundColor: c.card }]}>
          {cert.imageUrl ? (
            <Image source={{ uri: cert.imageUrl }} style={StyleSheet.absoluteFill} contentFit="contain" />
          ) : (
            <CertificateIcon size={40} color={c.muted} weight="duotone" />
          )}
        </View>
      </Pressable>

      <View style={styles.latestBody}>
        <Pressable onPress={onOpenEvent} accessibilityRole="link" accessibilityHint="Opens the event">
          <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>{cert.event.title}</Text>
        </Pressable>
        <Text style={[styles.meta, { color: c.soft }]}>Issued {formatDate(cert.issuedAt)}</Text>

        <View style={styles.actions}>
          {cert.pdfUrl ? (
            <AuthButton label="Open PDF" onPress={() => WebBrowser.openBrowserAsync(cert.pdfUrl!)} style={styles.action} />
          ) : null}
          <AuthButton
            label="Share"
            variant={cert.pdfUrl ? 'secondary' : 'primary'}
            icon={<Export size={17} color={cert.pdfUrl ? c.text : c.primaryFg} />}
            onPress={() => share(cert)}
            style={styles.action}
          />
        </View>

        {/* The code résumés and forms ask for, in a band between full hairlines;
            copying gives the full verify link. Mint: a certificate is a done thing. */}
        <View style={[styles.code, { borderColor: c.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.codeLabel, { color: c.muted }]}>Verification code</Text>
            <Text style={[styles.codeValue, { color: c.mint }]} selectable>{cert.verificationCode}</Text>
          </View>
          <Pressable onPress={copyCode} hitSlop={10} accessibilityRole="button" accessibilityLabel="Copy verification link">
            {({ pressed }) => <Text style={[styles.copy, { color: c.text, opacity: pressed ? 0.6 : 1 }]}>Copy link</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function CertificateRow({ cert }: { cert: MyCertificate }) {
  const c = useCosmos();
  const ratio = useRatio(cert.imageUrl);
  return (
    <Pressable
      onPress={() => openCert(cert)}
      disabled={!cert.pdfUrl && !cert.imageUrl}
      accessibilityRole="button"
      accessibilityLabel={`Certificate for ${cert.event.title}, issued ${formatDate(cert.issuedAt)}`}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <View style={[styles.thumb, { height: THUMB_W / ratio, backgroundColor: c.card }]}>
        {cert.imageUrl ? (
          <Image source={{ uri: cert.imageUrl }} style={StyleSheet.absoluteFill} contentFit="contain" />
        ) : (
          <CertificateIcon size={24} color={c.muted} weight="duotone" />
        )}
      </View>
      <View style={styles.info}>
        <Text style={[styles.rowTitle, { color: c.text }]} numberOfLines={2}>{cert.event.title}</Text>
        <Text style={[styles.meta, { color: c.soft }]}>Issued {formatDate(cert.issuedAt)}</Text>
      </View>
      <Pressable onPress={() => share(cert)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Share certificate">
        {({ pressed }) => <Export size={20} color={c.soft} style={{ opacity: pressed ? 0.6 : 1 }} />}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pad: { paddingHorizontal: GUTTER },
  // Grouped lists: SettingsGroup owns the section spacing and its muted title.
  group: { marginHorizontal: GUTTER },
  first: { marginTop: spacing[4] },
  after: { marginTop: spacing[8] },
  eyebrow: { marginTop: spacing[4], marginBottom: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  // The certificate itself keeps a card's corners; it's the one image on the page.
  preview: { width: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: cosmosCardRadius },
  latestBody: { paddingTop: spacing[4] },
  title: { fontSize: typography.fontSize.lg, lineHeight: 24, ...cosmosFont.strong },
  meta: { marginTop: 4, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  actions: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[5] },
  action: { flex: 1, height: 46, paddingHorizontal: spacing[3] },
  code: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginTop: spacing[5],
    paddingVertical: spacing[4],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  codeLabel: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  codeValue: { marginTop: 2, fontSize: typography.fontSize.base, letterSpacing: 0.5, ...cosmosFont.figure },
  copy: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  // Rows sit on the group's card: its side padding, SettingsGroup draws the hairlines.
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  thumb: { width: THUMB_W, borderRadius: borderRadius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  rowTitle: { fontSize: typography.fontSize.base, lineHeight: 21, ...cosmosFont.strong },
  prompt: { alignItems: 'center', paddingHorizontal: GUTTER, marginTop: spacing[10] },
  promptTitle: { marginTop: spacing[4], fontSize: 24, lineHeight: 30, textAlign: 'center', ...cosmosFont.display, letterSpacing: displayTracking(24) },
  promptBody: { marginTop: spacing[2], fontSize: typography.fontSize.base, lineHeight: 22, textAlign: 'center', ...cosmosFont.body },
  promptButton: { marginTop: spacing[6], alignSelf: 'stretch' },
});
