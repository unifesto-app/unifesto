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
import { GUTTER, Section } from '../components/home/Section';
import { AppAlert } from '../components/ui/AppAlert';
import { getMyCertificates, type MyCertificate } from '../lib/api/certificates';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

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
 * Profile › Certificates: the newest one up front, big, with everything you'd
 * do with it (open, share, copy the code a résumé asks for); every earlier
 * one as a compact row, grouped by the year it was issued.
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

  // Newest first from the server; the first is the hero, the rest by year.
  const [latest, ...earlier] = certificates;
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
      <Skeleton width="100%" height={340} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[4] }} />
      {[0, 1].map((i) => (
        <Skeleton key={i} width="100%" height={92} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[3] }} />
      ))}
    </View>
  ) : !latest ? (
    <View style={[styles.prompt, { backgroundColor: c.raised }]}>
      <CertificateIcon size={40} color={c.soft} weight="duotone" />
      <Text style={[styles.promptTitle, { color: c.text }]}>No certificates yet</Text>
      <Text style={[styles.promptBody, { color: c.soft }]}>
        When an organiser issues a certificate for an event you attended, it lands here, ready to share.
      </Text>
      <AuthButton label="Browse events" arrow onPress={() => router.push('/events')} style={{ marginTop: spacing[6] }} />
    </View>
  ) : (
    <>
      <View style={styles.pad}>
        <Text style={[styles.eyebrow, { color: c.muted }]}>
          {certificates.length === 1 ? 'Your certificate' : `Latest of ${certificates.length}`}
        </Text>
        <LatestCard cert={latest} onOpenEvent={() => router.push(`/event/${latest.event.slug || latest.event.id}`)} />
      </View>
      {years.map(([year, certs], i) => (
        <Section key={year} title={String(year)} style={i === 0 ? styles.firstSection : undefined}>
          <View style={[styles.pad, styles.list]}>
            {certs.map((cert) => <CertificateRow key={cert.id} cert={cert} />)}
          </View>
        </Section>
      ))}
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={{ paddingTop: topSpacing, paddingBottom: 100 }}
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

function LatestCard({ cert, onOpenEvent }: { cert: MyCertificate; onOpenEvent: () => void }) {
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
    <View style={[styles.card, { backgroundColor: c.raised }]}>
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

      <View style={styles.cardBody}>
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

        {/* The code résumés and forms ask for; copying gives the full verify link. */}
        <View style={[styles.code, { borderTopColor: c.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.codeLabel, { color: c.muted }]}>Verification code</Text>
            <Text style={[styles.codeValue, { color: c.text }]} selectable>{cert.verificationCode}</Text>
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
      style={({ pressed }) => [styles.row, { backgroundColor: c.raised, transform: [{ scale: pressed ? 0.985 : 1 }] }]}
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
  // Section's default top margin is sized for Home; tighter under the hero.
  firstSection: { marginTop: spacing[10] },
  list: { gap: spacing[3] },
  eyebrow: { marginTop: spacing[4], marginBottom: spacing[3], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  card: { borderRadius: cosmosCardRadius, overflow: 'hidden' },
  preview: { width: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cardBody: { padding: spacing[5] },
  title: { fontSize: 17, lineHeight: 24, ...cosmosFont.display },
  meta: { marginTop: 4, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  actions: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[5] },
  action: { flex: 1, height: 46, paddingHorizontal: spacing[3] },
  code: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginTop: spacing[5],
    paddingTop: spacing[4],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  codeLabel: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  codeValue: { marginTop: 2, fontSize: typography.fontSize.base, letterSpacing: 0.5, ...cosmosFont.strong },
  copy: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], padding: spacing[3], paddingRight: spacing[4], borderRadius: cosmosCardRadius },
  thumb: { width: THUMB_W, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  rowTitle: { fontSize: typography.fontSize.base, lineHeight: 21, ...cosmosFont.strong },
  prompt: { marginHorizontal: GUTTER, marginTop: spacing[6], borderRadius: cosmosCardRadius, padding: spacing[6] },
  promptTitle: { marginTop: spacing[5], fontSize: 20, lineHeight: 28, ...cosmosFont.display },
  promptBody: { marginTop: spacing[3], fontSize: typography.fontSize.base, lineHeight: 22, ...cosmosFont.body },
});
