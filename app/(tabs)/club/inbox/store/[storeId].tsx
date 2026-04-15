import { supabase } from "@/src/supabase/supabaseClient";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ThreadRow = {
  thread_id: string;
  store_id: string;
  post_id?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  last_message?: string | null;
  unread_count?: number | null;
  updated_at?: string | null;
  created_at?: string | null;
};

function clean(x: any) {
  return String(x ?? "").trim();
}

function safeStr(x: any, fallback = "—") {
  const s = clean(x);
  return s.length ? s : fallback;
}

function safeNum(x: any, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function isUuid(v: string) {
  const s = clean(v);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function fmtWhen(iso?: string | null) {
  const s = clean(iso);
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function normalizeThreadRow(x: any, fallbackStoreId: string): ThreadRow {
  return {
    thread_id: clean(x?.thread_id ?? x?.id ?? x?.conversation_id ?? x?.chat_thread_id),
    store_id: clean(x?.store_id ?? fallbackStoreId),
    post_id: clean(x?.post_id ?? x?.source_post_id) || null,
    customer_id: clean(x?.customer_id ?? x?.buyer_id ?? x?.created_by) || null,
    customer_name:
      clean(x?.customer_name ?? x?.full_name ?? x?.name ?? x?.buyer_name ?? x?.client_name) || null,
    customer_phone:
      clean(x?.customer_phone ?? x?.phone ?? x?.mobile ?? x?.buyer_phone ?? x?.client_phone) || null,
    last_message:
      clean(x?.last_message ?? x?.last_body ?? x?.body_preview ?? x?.preview ?? x?.message) || null,
    unread_count: safeNum(x?.unread_count ?? x?.unread ?? 0, 0),
    updated_at: clean(x?.updated_at ?? x?.last_message_at ?? x?.last_at) || null,
    created_at: clean(x?.created_at) || null,
  };
}

const THREADS_RPC_CANDIDATES = [
  "get_store_inbox_threads",
  "get_store_chat_threads",
  "get_store_threads",
  "get_club_store_threads",
  "get_inbox_threads_for_store",
] as const;

const ENSURE_THREAD_RPC_CANDIDATES = [
  "get_or_create_thread_for_post",
  "get_or_create_store_thread_for_post",
  "get_or_create_club_thread_for_post",
  "get_or_create_post_thread_v1",
  "ensure_club_post_thread_v1",
  "create_or_get_post_thread_v1",
] as const;

const THREADS_TABLE_CANDIDATES = [
  "club_message_threads",
  "club_inbox_threads",
  "club_threads",
] as const;

export default function ClubInboxStoreThreadsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Math.max(insets.top, 10) + 8;

  const params = useLocalSearchParams<{
    storeId?: string;
    storeName?: string;
    postId?: string;
    postCaption?: string;
    postImageUrl?: string;
  }>();

  const storeId = clean(params?.storeId);
  const storeName = clean(params?.storeName) || "Store";
  const postId = clean(params?.postId);
  const postCaption = clean(params?.postCaption);
  const postImageUrl = clean(params?.postImageUrl);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<ThreadRow[]>([]);
  const [sourceUsed, setSourceUsed] = useState<string | null>(null);
  const [openingPostChat, setOpeningPostChat] = useState(false);

  const storeIdOk = isUuid(storeId);

  const openThread = useCallback(
    (threadId: string) => {
      const tid = clean(threadId);
      if (!tid) return;

      router.push({
        pathname: "/(tabs)/club/inbox/[threadId]" as any,
        params: {
          threadId: tid,
          storeId,
        },
      } as any);
    },
    [router, storeId]
  );

  const load = useCallback(
    async (mode: "boot" | "refresh" = "boot") => {
      if (mode === "boot") setLoading(true);
      if (mode === "refresh") setRefreshing(true);
      setErr(null);

      try {
        if (!storeId) throw new Error("Store missing");
        if (!storeIdOk) throw new Error(`Invalid storeId: "${storeId}"`);

        let loaded: ThreadRow[] = [];
        let loadedFrom: string | null = null;
        let lastErr: any = null;

        for (const fn of THREADS_RPC_CANDIDATES) {
          const { data, error } = await supabase.rpc(fn as any, { p_store_id: storeId } as any);
          if (!error) {
            loaded = ((data ?? []) as any[])
              .map((x) => normalizeThreadRow(x, storeId))
              .filter((x) => clean(x.thread_id).length > 0);
            loadedFrom = `rpc:${fn}`;
            break;
          }

          lastErr = error;
          const msg = String(error.message ?? "").toLowerCase();
          const missing =
            msg.includes("does not exist") ||
            msg.includes("function") ||
            msg.includes("rpc");

          if (!missing) break;
        }

        if (!loadedFrom) {
          for (const table of THREADS_TABLE_CANDIDATES) {
            const { data, error } = await supabase
              .from(table as any)
              .select("*")
              .eq("store_id", storeId)
              .order("updated_at", { ascending: false });

            if (!error) {
              loaded = ((data ?? []) as any[])
                .map((x) => normalizeThreadRow(x, storeId))
                .filter((x) => clean(x.thread_id).length > 0);
              loadedFrom = `table:${table}`;
              break;
            }

            lastErr = error;
            const msg = String(error.message ?? "").toLowerCase();
            const missing =
              msg.includes("does not exist") ||
              msg.includes("relation") ||
              msg.includes("table");

            if (!missing) break;
          }
        }

        if (!loadedFrom && lastErr) throw lastErr;

        loaded.sort((a, b) => {
          const ta = new Date(a.updated_at || a.created_at || 0).getTime();
          const tb = new Date(b.updated_at || b.created_at || 0).getTime();
          return tb - ta;
        });

        setRows(loaded);
        setSourceUsed(loadedFrom);
      } catch (e: any) {
        setRows([]);
        setSourceUsed(null);
        setErr(e?.message ?? "Failed to load inbox threads");
      } finally {
        if (mode === "boot") setLoading(false);
        if (mode === "refresh") setRefreshing(false);
      }
    },
    [storeId, storeIdOk]
  );

  useFocusEffect(
    useCallback(() => {
      void load("boot");
    }, [load])
  );

const openOrCreatePostThread = useCallback(async () => {
  if (!storeIdOk || !postId) return;

  setOpeningPostChat(true);
  try {
    const existing = rows.find((x) => clean(x.post_id) === postId);
    if (existing?.thread_id) {
      openThread(existing.thread_id);
      return;
    }

    let lastErr: any = null;

    for (const fn of ENSURE_THREAD_RPC_CANDIDATES) {
      const payload = {
        p_store_id: storeId,
        p_post_id: postId,
      } as any;

      const { data, error } = await supabase.rpc(fn as any, payload);

      if (!error) {
        const row = Array.isArray(data) ? data?.[0] : data;
        const threadId = clean(
          row?.thread_id ?? row?.id ?? row?.conversation_id ?? data
        );

        if (threadId) {
          openThread(threadId);
          return;
        }
      } else {
        lastErr = error;
        const msg = String(error.message ?? "").toLowerCase();
        const missing =
          msg.includes("does not exist") ||
          msg.includes("function") ||
          msg.includes("rpc") ||
          msg.includes("could not find");

        if (!missing) break;
      }
    }

    Alert.alert(
      "Chat",
      lastErr?.message ?? "Imeshindikana kufungua au kutengeneza thread ya post hii."
    );
  } catch (e: any) {
    Alert.alert("Chat", e?.message ?? "Failed to open seller chat");
  } finally {
    setOpeningPostChat(false);
  }
}, [openThread, postId, rows, storeId, storeIdOk]);

  const subtitle = useMemo(() => {
    if (storeName) return `Store: ${storeName}`;
    if (storeId) return `Store: ${storeId.slice(0, 8)}…`;
    return "Store inbox";
  }, [storeId, storeName]);

  const Header = useMemo(() => {
    return (
      <View style={{ paddingTop: topPad, paddingBottom: 12, gap: 12 }}>
        <Card style={{ padding: 14 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: theme.colors.emeraldBorder,
                  backgroundColor: theme.colors.emeraldSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.colors.emerald} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                  Store Inbox
                </Text>
                <Text style={{ color: theme.colors.faint, fontWeight: "900", fontSize: 12 }} numberOfLines={1}>
                  {subtitle}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Pressable
                onPress={() => void load("refresh")}
                hitSlop={10}
                style={({ pressed }) => [
                  {
                    height: 38,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    opacity: pressed ? 0.92 : 1,
                  },
                ]}
              >
                <Ionicons name="refresh" size={16} color={theme.colors.text} />
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>
                  {refreshing ? "..." : "Refresh"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.back()}
                hitSlop={10}
                style={({ pressed }) => [
                  {
                    width: 38,
                    height: 38,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.92 : 1,
                  },
                ]}
              >
                <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
              </Pressable>
            </View>
          </View>

          {!!sourceUsed && (
            <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 11, marginTop: 10 }}>
              Threads source: {sourceUsed}
            </Text>
          )}
        </Card>

        {!!postId && (
          <Card style={{ padding: 14, gap: 10 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
              Zungumza kuhusu post hii
            </Text>

            {!!postCaption && (
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }} numberOfLines={2}>
                {postCaption}
              </Text>
            )}

            <Pressable
              onPress={() => void openOrCreatePostThread()}
              disabled={openingPostChat}
              hitSlop={10}
              style={({ pressed }) => [
                {
                  height: 48,
                  borderRadius: theme.radius.pill,
                  borderWidth: 1,
                  borderColor: theme.colors.emeraldBorder,
                  backgroundColor: theme.colors.emeraldSoft,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 10,
                  opacity: openingPostChat ? 0.6 : pressed ? 0.92 : 1,
                },
              ]}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.colors.emerald} />
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                {openingPostChat ? "Opening..." : "Open Chat for This Post"}
              </Text>
            </Pressable>
          </Card>
        )}

        {!!err && (
          <Card
            style={{
              padding: 12,
              borderColor: theme.colors.dangerBorder,
              backgroundColor: theme.colors.dangerSoft,
            }}
          >
            <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>{err}</Text>
          </Card>
        )}

        <Text style={{ color: theme.colors.faint, fontWeight: "900", paddingHorizontal: 2 }}>
          Conversations
        </Text>
      </View>
    );
  }, [
    err,
    load,
    openingPostChat,
    openOrCreatePostThread,
    postCaption,
    postId,
    refreshing,
    router,
    sourceUsed,
    subtitle,
    topPad,
  ]);

  const renderItem = useCallback(
    ({ item }: { item: ThreadRow }) => {
      const threadId = clean(item.thread_id);
      const customerName = safeStr(item.customer_name, "Customer");
      const customerPhone = clean(item.customer_phone);
      const lastMessage = safeStr(item.last_message, "No messages yet");
      const unread = safeNum(item.unread_count, 0);
      const when = fmtWhen(item.updated_at || item.created_at);

      return (
        <Pressable
          onPress={() => openThread(threadId)}
          hitSlop={10}
          style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1, marginBottom: 12 }]}
        >
          <Card style={{ padding: 12, gap: 10 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: theme.colors.emeraldBorder,
                    backgroundColor: theme.colors.emeraldSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="person-outline" size={17} color={theme.colors.emerald} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }} numberOfLines={1}>
                    {customerName}
                  </Text>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }} numberOfLines={1}>
                    {customerPhone ? customerPhone : "No phone"}
                  </Text>
                </View>
              </View>

              {unread > 0 ? (
                <View
                  style={{
                    minWidth: 26,
                    height: 26,
                    paddingHorizontal: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: theme.colors.emeraldBorder,
                    backgroundColor: theme.colors.emeraldSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>
                    {unread}
                  </Text>
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={18} color={theme.colors.faint} />
              )}
            </View>

            <Text style={{ color: theme.colors.text, fontWeight: unread > 0 ? "900" : "800" }} numberOfLines={2}>
              {lastMessage}
            </Text>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 12 }}>
                {when}
              </Text>

              {item.post_id ? (
                <Text style={{ color: theme.colors.muted, fontWeight: "900", fontSize: 12 }}>
                  Linked to post
                </Text>
              ) : null}
            </View>
          </Card>
        </Pressable>
      );
    },
    [openThread]
  );

  return (
    <Screen scroll={false} contentStyle={{ paddingTop: 0, paddingHorizontal: 0, paddingBottom: 0 }}>
      <FlatList
        data={loading ? [] : rows}
        keyExtractor={(x, i) => clean(x.thread_id) || String(i)}
        renderItem={renderItem}
        ListHeaderComponent={Header}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.page,
          paddingBottom: Math.max(insets.bottom, 10) + 110,
        }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingVertical: 18, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 10 }}>
                Loading conversations...
              </Text>
            </View>
          ) : (
            <Card style={{ padding: 14 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                No conversations yet
              </Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                Hakuna chat bado kwa store hii.
              </Text>
            </Card>
          )
        }
      />
    </Screen>
  );
}