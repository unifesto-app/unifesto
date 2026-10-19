import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { RefreshControl } from "../../components/ui/RefreshControl";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { MagnifyingGlass, Megaphone } from "@unifesto/unicon/react-native";
import {
  HeaderActions,
  HeaderIconButton,
} from "../../navigation/HeaderActions";
import { useTokens } from "../../context/ThemeContext";
import useTopSpacing from "../../hooks/useTopSpacing";
import {
  conversationName,
  getWhatsappConversations,
  messagePreview,
  type WhatsappConversation,
} from "../../lib/api/apex";
import { ApexRow, whenShort } from "../../components/apex/ApexRow";
import { borderRadius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { font } from "../../theme/fontHelpers";
import { CardBackdrop } from "../../components/ui/CardSurface";

const GUTTER = spacing[6];

/** Messages sent to the Unifesto WhatsApp Business number, newest first. */
export default function WhatsappInboxScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<WhatsappConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);

  // Debounce typing into the search box.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const gen = ++generation.current;
    const res = await getWhatsappConversations(query || undefined);
    if (gen !== generation.current) return;
    if (!res.ok) {
      setError(
        res.denied
          ? "Only Unifesto platform admins can see this."
          : res.message,
      );
      return;
    }
    setError("");
    setRows(res.data.conversations ?? []);
  }, [query]);

  // Unread counts change as threads are opened; reload on every focus.
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const now = new Date();

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderActions>
              <HeaderIconButton
                onPress={() => router.push("/apex/whatsapp/broadcast")}
                label="WhatsApp blast"
              >
                <Megaphone size={24} color={tokens.text} />
              </HeaderIconButton>
            </HeaderActions>
          ),
        }}
      />
      <FlatList
        style={{ backgroundColor: tokens.bg }}
        contentContainerStyle={styles.content}
        data={loading || error ? [] : rows}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ paddingTop: topSpacing }}>
            <View style={styles.search}>
              <CardBackdrop shape={styles.search} />
              <MagnifyingGlass size={18} color={tokens.textMuted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Name or number"
                placeholderTextColor={tokens.textMuted}
                style={[styles.input, { color: tokens.text }]}
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator
              color={tokens.accent}
              style={{ marginTop: spacing[10] }}
            />
          ) : (
            <Text style={[styles.empty, { color: tokens.textMuted }]}>
              {error || (query ? "No matches." : "No messages yet.")}
            </Text>
          )
        }
        ItemSeparatorComponent={() => (
          <View style={[styles.sep, { backgroundColor: tokens.border }]} />
        )}
        renderItem={({ item }) => {
          const last = item.messages?.[0];
          const preview = `${last?.direction === "OUTBOUND" ? "You: " : ""}${messagePreview(last)}`;
          return (
            <ApexRow
              title={conversationName(item)}
              meta={preview}
              value={whenShort(item.lastMessageAt, now)}
              unread={item.unreadCount > 0}
              onPress={() =>
                router.push({
                  pathname: "/apex/whatsapp/[id]",
                  params: { id: item.id, name: conversationName(item) },
                })
              }
            />
          );
        }}
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
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.xl,
    height: 44,
    marginBottom: spacing[2],
  },
  input: { flex: 1, fontSize: typography.fontSize.base, ...font() },
  sep: { height: StyleSheet.hairlineWidth },
  empty: {
    marginTop: spacing[10],
    textAlign: "center",
    fontSize: typography.fontSize.sm,
    ...font(),
  },
});
