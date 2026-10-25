import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui';
import { SheetBackdrop } from './ui/CardSurface';
import { acceptLegal, getPendingLegal, type PendingLegalDoc } from '../lib/api/legal';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, useCosmos } from '../theme/cosmos';

/**
 * I2: blocks the app until the signed-in user accepts every legal document with
 * a new version that needs their consent. Checked on launch and on each
 * sign-in. The only ways out are to agree or to sign out.
 */
export default function LegalAcceptSheet() {
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [pending, setPending] = useState<PendingLegalDoc[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setPending([]);
    if (!user?.id) return;
    let live = true;
    getPendingLegal().then((r) => live && r.ok && setPending(r.data));
    return () => {
      live = false;
    };
  }, [user?.id]);

  const agree = async () => {
    setBusy(true);
    setError('');
    for (const d of pending) {
      const r = await acceptLegal(d.slug, d.version);
      if (!r.ok) {
        setError(r.message);
        setBusy(false);
        return;
      }
    }
    setPending([]);
    setBusy(false);
  };

  return (
    <Modal visible={pending.length > 0} transparent animationType="slide" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.root}>
        <View style={[StyleSheet.absoluteFill, styles.backdrop]} />
        <View style={[styles.card, { paddingBottom: insets.bottom + spacing[4] }]} accessibilityViewIsModal>
          <SheetBackdrop radius={28} />
          <Text style={[styles.title, { color: c.text }]}>We have updated our terms</Text>
          <Text style={[styles.body, { color: c.soft }]}>Please read what changed and agree to continue.</Text>
          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: spacing[4], paddingVertical: spacing[4] }}>
            {pending.map((d) => (
              <View key={d.slug}>
                <Text style={[styles.docTitle, { color: c.text }]}>{d.title}</Text>
                {d.summary ? <Text style={[styles.body, { color: c.soft }]}>{d.summary}</Text> : null}
                <Pressable
                  onPress={() => WebBrowser.openBrowserAsync(`https://unifesto.app/${d.slug}`).catch(() => {})}
                  accessibilityRole="link"
                  hitSlop={8}
                >
                  <Text style={[styles.link, { color: c.primary }]}>Read the full text</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
          {error ? <Text style={[styles.body, { color: c.danger }]}>{error}</Text> : null}
          <Button label={busy ? 'Saving…' : 'I agree'} size="lg" onPress={agree} disabled={busy} style={styles.button} />
          <Button label="Sign out" size="lg" variant="ghost" onPress={() => logout()} disabled={busy} style={styles.button} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.5)' },
  card: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing[6],
    paddingTop: spacing[6],
  },
  title: { fontSize: typography.fontSize.xl, marginBottom: spacing[2], ...cosmosFont.display },
  docTitle: { fontSize: typography.fontSize.base, marginBottom: spacing[1], ...cosmosFont.strong },
  body: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.45, ...cosmosFont.body },
  link: { marginTop: spacing[1], fontSize: typography.fontSize.base, ...cosmosFont.strong },
  button: { marginTop: spacing[3], alignSelf: 'stretch' },
});
