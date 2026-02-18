// app/(tabs)/club/inbox/[threadId].tsx
import { supabase } from "@/src/supabase/supabaseClient";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Msg = {
  id: string;
  thread_id: string;
  sender_id: string;
  sender_type: "customer" | "store";
  body: string;
  created_at: string;
};

function clean(x: any) {
  return String(x ?? "").trim();
}

export default function ThreadChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarH = useBottomTabBarHeight();
  const isFocused = useIsFocused();

  const params = useLocalSearchParams<{ threadId?: string; storeId?: string }>();
  const threadId = clean(params?.threadId);
  const storeId = clean(params?.storeId);

  const topPad = Math.max(insets.top, 10) + 8;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const [myUid, setMyUid] = useState<string | null>(null);

  const [senderType, setSenderType] = useState<"customer" | "store">("customer");
  const [senderTypeLoading, setSenderTypeLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id ?? null;
      if (!mounted) return;
      setMyUid(uid);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const resolveSenderType = useCallback(async () => {
    setSenderTypeLoading(true);
    try {
      if (!storeId) {
        setSenderType("customer");
        return;
      }

      const { data, error } = await supabase.rpc("is_store_staff", { p_store_id: storeId });
      if (error) {
        setSenderType("customer");
        return;
      }

      setSenderType(!!data ? "store" : "customer");
    } catch {
      setSenderType("customer");
    } finally {
      setSenderTypeLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void resolveSenderType();
  }, [resolveSenderType]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      if (!threadId) throw new Error("Thread missing");

      const { data, error } = await supabase.rpc("get_thread_messages", { p_thread_id: threadId });
      if (error) throw error;

      setMsgs((data ?? []) as Msg[]);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load messages");
      setMsgs([]);
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = useCallback(async () => {
    if (!threadId) return;
    const body = clean(text);
    if (!body.length) return;
    if (busy) return;

    setBusy(true);
    setErr(null);

    try {
      const { error } = await supabase.rpc("send_thread_message", {
        p_thread_id: threadId,
        p_body: body,
        p_sender_type: senderType,
      });
      if (error) throw error;

      setText("");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Send failed");
    } finally {
      setBusy(false);
    }
  }, [busy, load, senderType, text, threadId]);

  const Header = useMemo(() => {
    return (
      <View style={{ paddingTop: topPad, paddingBottom: 12, gap: 12 }}>
        <Card style={{ padding: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
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

              <View>
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>Inbox</Text>
                <Text style={{ color: theme.colors.faint, fontWeight: "900", fontSize: 12 }}>
                  {senderTypeLoading ? "Checking access..." : senderType === "store" ? "Store reply mode" : "Customer mode"}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={({ pressed }) => [
                {
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
            >
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Back</Text>
            </Pressable>
          </View>
        </Card>

        {!!err && (
          <Card style={{ padding: 12, borderColor: theme.colors.dangerBorder, backgroundColor: theme.colors.dangerSoft }}>
            <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>{err}</Text>
          </Card>
        )}
      </View>
    );
  }, [err, router, senderType, senderTypeLoading, topPad]);

  const renderItem = useCallback(
    ({ item }: { item: Msg }) => {
      const mine = !!myUid && item.sender_id === myUid;
      const isStore = item.sender_type === "store";

      return (
        <View style={{ marginBottom: 10, alignItems: mine ? "flex-end" : "flex-start" }}>
          <View
            style={{
              maxWidth: "86%",
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: mine ? theme.colors.emeraldBorder : "rgba(255,255,255,0.12)",
              backgroundColor: mine ? theme.colors.emeraldSoft : "rgba(255,255,255,0.06)",
            }}
          >
            <Text style={{ color: theme.colors.faint, fontWeight: "900", fontSize: 11, marginBottom: 4 }}>
              {isStore ? "Store" : "Customer"}
            </Text>
            <Text style={{ color: theme.colors.text, fontWeight: "800", lineHeight: 20 }}>{item.body}</Text>
          </View>
        </View>
      );
    },
    [myUid]
  );

  const canSend = useMemo(() => {
    return !busy && !!clean(text).length && !senderTypeLoading;
  }, [busy, senderTypeLoading, text]);

  const composerBottom = tabBarH;

  return (
    <Screen scroll={false} contentStyle={{ paddingTop: 0, paddingHorizontal: 0, paddingBottom: 0 }}>
      <FlatList
        data={msgs}
        keyExtractor={(x) => String(x.id)}
        renderItem={renderItem}
        ListHeaderComponent={Header}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.page,
          paddingBottom: composerBottom + Math.max(insets.bottom, 10) + 100,
        }}
        ListEmptyComponent={
          loading ? null : (
            <Card style={{ padding: 14 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>No messages</Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>Andika message ya kwanza.</Text>
            </Card>
          )
        }
        ListFooterComponent={
          loading ? (
            <View style={{ paddingVertical: 14, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>Loading...</Text>
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />

      {/* ✅ Composer (ONLY when focused) + ✅ does NOT block tabs */}
      {isFocused && (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: composerBottom,
            paddingBottom: Math.max(insets.bottom, 10),
            paddingHorizontal: theme.spacing.page,
            paddingTop: 10,
            backgroundColor: "rgba(0,0,0,0.25)",
          }}
        >
          <View pointerEvents="auto" style={{ flexDirection: "row", gap: 10, alignItems: "flex-end" }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Type a message..."
              placeholderTextColor={theme.colors.muted}
              multiline
              style={{
                flex: 1,
                minHeight: 44,
                maxHeight: 120,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                color: theme.colors.text,
                fontWeight: "800",
              }}
            />

            <Pressable
              onPress={send}
              disabled={!canSend}
              hitSlop={10}
              style={({ pressed }) => [
                {
                  width: 54,
                  height: 44,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: theme.colors.emeraldBorder,
                  backgroundColor: theme.colors.emeraldSoft,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: !canSend ? 0.6 : pressed ? 0.92 : 1,
                },
              ]}
            >
              <Ionicons name="send" size={18} color={theme.colors.emerald} />
            </Pressable>
          </View>
        </View>
      )}
    </Screen>
  );
}