import React, { useCallback, useEffect, useState } from 'react';
import { Image as RNImage, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { Certificate as CertificateIcon, Export, FilePdf } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import Skeleton from '../components/Skeleton';
import { getMyCertificates, type MyCertificate } from '../lib/api/certificates';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';
import { CardBackdrop } from '../components/ui/CardSurface';

const GUTTER = spacing[6];
/** Most templates are landscape A4; used until the real image size is known. */
const DEFAULT_RATIO = 1.414;
const VERIFY_BASE = 'https://unifesto.app/verify';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function CertificatesScreen() {
  const tokens = useTokens();
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

  const share = (cert: MyCertificate) => {
    const verifyUrl = `${VERIFY_BASE}/${cert.verificationCode}`;
    Share.share({
      message: `My certificate for ${cert.event.title} on Unifesto. Verify it here: ${verifyUrl}`,
      url: verifyUrl,
    }).catch(() => {});
  };

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={tokens.accent}
          colors={[tokens.accent]}
          progressViewOffset={topSpacing}
        />
      }
    >
      {loading ? (
        [0, 1].map((i) => (
          <View key={i} style={[styles.card]}>
            <CardBackdrop shape={styles.card} />
            <Skeleton width="100%" height={200} borderRadius={borderRadius.lg} />
            <Skeleton width="70%" height={16} borderRadius={6} style={{ marginTop: spacing[4] }} />
            <Skeleton width="40%" height={12} borderRadius={6} style={{ marginTop: spacing[2] }} />
          </View>
        ))
      ) : certificates.length === 0 ? (
        <View style={styles.empty}>
          <CertificateIcon size={48} color={tokens.textSecondary} weight="duotone" />
          <Text style={[styles.emptyTitle, { color: tokens.text }]}>No certificates yet</Text>
          <Text style={[styles.emptyBody, { color: tokens.textMuted }]}>
            When an organiser issues a certificate for an event you attended, it shows up here.
          </Text>
        </View>
      ) : (
        certificates.map((cert) => (
          <CertificateCard
            key={cert.id}
            cert={cert}
            onOpenPdf={() => cert.pdfUrl && WebBrowser.openBrowserAsync(cert.pdfUrl)}
            onOpenImage={() => cert.imageUrl && WebBrowser.openBrowserAsync(cert.imageUrl)}
            onShare={() => share(cert)}
          />
        ))
      )}
    </ScrollView>
  );
}

function CertificateCard({
  cert,
  onOpenPdf,
  onOpenImage,
  onShare,
}: {
  cert: MyCertificate;
  onOpenPdf: () => void;
  onOpenImage: () => void;
  onShare: () => void;
}) {
  const tokens = useTokens();
  // Show the certificate at its true proportions — templates vary by organiser.
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  useEffect(() => {
    if (!cert.imageUrl) return;
    RNImage.getSize(cert.imageUrl, (w, h) => h > 0 && setRatio(w / h), () => {});
  }, [cert.imageUrl]);

  return (
    <View style={[styles.card]}>
      <CardBackdrop shape={styles.card} />
      <Pressable onPress={onOpenImage} disabled={!cert.imageUrl} accessibilityRole="imagebutton" accessibilityLabel="Open certificate image">
        <View style={[styles.preview, { aspectRatio: ratio, backgroundColor: tokens.surface }]}>
          {cert.imageUrl ? (
            <Image source={{ uri: cert.imageUrl }} style={StyleSheet.absoluteFill} contentFit="contain" />
          ) : (
            <CertificateIcon size={40} color={tokens.textMuted} weight="duotone" />
          )}
        </View>
      </Pressable>

      <Text style={[styles.title, { color: tokens.text }]} numberOfLines={2}>{cert.event.title}</Text>
      <Text style={[styles.meta, { color: tokens.textMuted }]}>Issued {formatDate(cert.issuedAt)}</Text>

      <View style={styles.actions}>
        {cert.pdfUrl ? (
          <Pressable
            onPress={onOpenPdf}
            accessibilityRole="button"
            style={({ pressed }) => [styles.primary, { backgroundColor: tokens.text, opacity: pressed ? 0.85 : 1 }]}
          >
            <FilePdf size={17} color={tokens.bg} weight="fill" />
            <Text style={[styles.primaryText, { color: tokens.bg }]}>Open PDF</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onShare}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Share certificate"
          style={({ pressed }) => [styles.share, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Export size={20} color={tokens.text} />
          <Text style={[styles.shareText, { color: tokens.text }]}>Share</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100, gap: spacing[4] },
  card: { borderRadius: borderRadius.xl, padding: spacing[3], paddingBottom: spacing[4] },
  preview: {
    width: '100%',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: spacing[4],
    marginHorizontal: spacing[1],
    fontSize: typography.fontSize.lg,
    lineHeight: typography.fontSize.lg * 1.25,
    ...font('heading'),
  },
  meta: { marginTop: 4, marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, ...font() },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing[5], marginTop: spacing[4], marginHorizontal: spacing[1] },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: spacing[5],
    borderRadius: borderRadius.full,
  },
  primaryText: { fontSize: typography.fontSize.sm, ...font('semibold') },
  share: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shareText: { fontSize: typography.fontSize.sm, ...font('semibold') },
  empty: { alignItems: 'center', paddingTop: spacing[16], paddingHorizontal: spacing[4] },
  emptyTitle: { marginTop: spacing[4], fontSize: typography.fontSize.lg, textAlign: 'center', ...font('heading') },
  emptyBody: {
    marginTop: 6,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * 1.5,
    textAlign: 'center',
    maxWidth: 300,
    ...font(),
  },
});
