import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { CosmosList } from "../../components/ui/CosmosScreen";
import SearchField from "../../components/manage/SearchField";
import { GUTTER } from "../../components/home/Section";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { Megaphone } from "@unifesto/unicon/react-native";
import {
  HeaderActions,
  HeaderIconButton,
} from "../../navigation/HeaderActions";
import {
  conversationName,
  getWhatsappConversations,
  messagePreview,
  type WhatsappConversation,
} from "../../lib/api/apex";
import { ApexRow, whenShort } from "../../components/apex/ApexRow";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { cardSegment, cosmosCardRadius, cosmosFont, useCosmos } from "../../theme/cosmos";

/** Messages sent to the Unifesto WhatsApp Business number, newest first. */
export default function WhatsappInboxScreen() {
  const router = useRouter();
  const c = useCosmos();
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
  const data = loading || error ? [] : rows;

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
                <Megaphone size={24} color={c.text} />
              </HeaderIconButton>
            </HeaderActions>
          ),
        }}
      />
      <CosmosList
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={styles.content}
        data={data}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={
          <View style={styles.search}>
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder="Name or number"
            />
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator
              color={c.text}
              style={{ marginTop: spacing[10] }}
            />
          ) : (
            <View style={[styles.empty, { backgroundColor: c.raised }]}>
              <Text style={[styles.emptyText, { color: c.soft }]}>
                {error || (query ? "No matches." : "No messages yet.")}
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const last = item.messages?.[0];
          const preview = `${last?.direction === "OUTBOUND" ? "You: " : ""}${messagePreview(last)}`;
          return (
            <View style={cardSegment(c.raised, index, data.length)}>
              {index > 0 ? (
                <View style={[styles.sep, { backgroundColor: c.border }]} />
              ) : null}
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
            </View>
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  search: { marginBottom: spacing[4] },
  sep: { height: StyleSheet.hairlineWidth },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyText: {
    textAlign: "center",
    fontSize: typography.fontSize.sm,
    ...cosmosFont.body,
  },
});
