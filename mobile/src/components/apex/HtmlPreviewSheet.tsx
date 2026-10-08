import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from '@unifesto/unicon/react-native';
import { useTokens } from '../../context/ThemeContext';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import { SheetBackdrop } from '../ui/CardSurface';

// Emails are designed for a white canvas; scale to the phone like a mail app.
const wrap = (html: string) =>
  `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:12px;background:#fff;color:#111;font-family:-apple-system,Roboto,sans-serif}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`;

/** Bottom sheet rendering an email's HTML as the recipient would see it. */
export default function HtmlPreviewSheet({ html, title, onClose }: { html: string | null; title: string; onClose: () => void }) {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={html !== null} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: tokens.overlay }]} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { top: insets.top + spacing[10], paddingBottom: insets.bottom }]}>
        <SheetBackdrop radius={borderRadius.xl} />
        <View style={styles.head}>
          <Text style={[styles.title, { color: tokens.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close preview">
            <X size={22} color={tokens.text} />
          </Pressable>
        </View>
        {html !== null ? (
          <WebView
            originWhitelist={['*']}
            source={{ html: wrap(html) }}
            style={styles.web}
            // Preview only: links shouldn't navigate inside the sheet.
            onShouldStartLoadWithRequest={(r) => r.url === 'about:blank' || r.url.startsWith('data:')}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[6], paddingVertical: spacing[4] },
  title: { flex: 1, fontSize: typography.fontSize.lg, ...font('heading') },
  web: { flex: 1, backgroundColor: '#fff' },
});
