import { getSavedList, removeSaved, SavedPost } from "@/src/club/savedPosts";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function safeStr(x: any, fallback = "") {
  const s = String(x ?? "").trim();
  return s.length ? s : fallback;
}

function fmtTimeAgo(iso?: string | null) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const sec = Math.max(1, Math.floor(diff / 1000));
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (day > 0) return `${day}d`;
  if (hr > 0) return `${hr}h`;
  if (min > 0) return `${min}m`;
  return `${sec}s`;
}

export default function ClubSavedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<SavedPost[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const topPad = Math.max(insets.top, 10) + 8;

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const list = await getSavedList();
      setItems(list);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load saved posts");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const goBack = useCallback(() => router.back(), [router]);

  const openPost = useCallback(
    (p: SavedPost) => {
      const postId = String(p.post_id);
      router.push({
        pathname: "/(tabs)/club/[postId]" as any,
        params: {
          postId,
          caption: String(p.caption ?? ""),
          imageUrl: String(p.image_url ?? ""),
          createdAt: String(p.created_at ?? ""),
          storeId: String(p.store_id ?? ""),
          storeName: String(p.store_name ?? ""),
          storeLocation: String(p.store_location ?? ""),
          storeCategory: String(p.store_category ?? ""),
        },
      } as any);
    },
    [router]
  );

  const confirmRemove = useCallback(
    (postId: string) => {
      Alert.alert("Remove saved?", "Utaondoa post hii kwenye Saved.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await removeSaved(postId);
            await load();
          },
        },
      ]);
    },
    [load]
  );

  const Header = useMemo(() => {
    return (
      <View style={{ paddingTop: topPad, paddingBottom: 12, gap: 12 }}>
        <Card
          style={{
            padding: 14,
            marginHorizontal: theme.spacing.page,
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.borderSoft,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable
              onPress={goBack}
              hitSlop={10}
              style={({ pressed }) => [
                {
                  width: 44,
                  height: 40,
                  borderRadius: theme.radius.pill,
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

            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>Saved Posts</Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 4, fontSize: 12 }}>
                Hapa kuna posts ulizobookmark.
              </Text>
            </View>

            <View
              style={{
                paddingHorizontal: 10,
                height: 34,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{items.length}</Text>
            </View>
          </View>
        </Card>

        {!!err && (
          <Card
            style={{
              marginHorizontal: theme.spacing.page,
              borderColor: theme.colors.dangerBorder,
              backgroundColor: theme.colors.dangerSoft,
              padding: 12,
            }}
          >
            <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>{err}</Text>
          </Card>
        )}
      </View>
    );
  }, [err, goBack, items.length, topPad]);

  const Empty = useMemo(() => {
    if (loading) return null;
    return (
      <Card style={{ padding: 14, marginHorizontal: theme.spacing.page }}>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>No saved posts</Text>
        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
          Ukiwa kwenye feed, bonyeza icon ya bookmark ku-save post.
        </Text>
      </Card>
    );
  }, [loading]);

  return (
    <Screen scroll={false} contentStyle={{ paddingTop: 0, paddingHorizontal: 0, paddingBottom: 0 }}>
      {loading ? (
        <View style={{ paddingTop: topPad + 40, alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 10 }}>Loading saved...</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => String(it.post_id)}
          ListHeaderComponent={Header}
          ListEmptyComponent={Empty}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 10) + 16 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const storeName = safeStr(item.store_name, "Store");
            const subtitle = [safeStr(item.store_category, ""), safeStr(item.store_location, "")]
              .filter(Boolean)
              .join(" • ");

            return (
              <Card
                style={{
                  padding: 0,
                  marginBottom: 12,
                  marginHorizontal: theme.spacing.page,
                  overflow: "hidden",
                }}
              >
                <Pressable onPress={() => openPost(item)} style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.12)",
                        backgroundColor: "rgba(255,255,255,0.06)",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name="bookmark" size={18} color={theme.colors.emerald} />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 14 }}>{storeName}</Text>
                      <Text style={{ color: theme.colors.faint, fontWeight: "900", fontSize: 12 }}>
                        {fmtTimeAgo(item.created_at)}
                        {subtitle ? ` • ${subtitle}` : ""}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => confirmRemove(String(item.post_id))}
                      hitSlop={10}
                      style={({ pressed }) => [
                        {
                          width: 42,
                          height: 36,
                          borderRadius: theme.radius.pill,
                          borderWidth: 1,
                          borderColor: theme.colors.dangerBorder,
                          backgroundColor: theme.colors.dangerSoft,
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: pressed ? 0.92 : 1,
                        },
                      ]}
                    >
                      <Ionicons name="trash-outline" size={18} color={theme.colors.dangerText} />
                    </Pressable>
                  </View>

                  {!!item.caption && (
                    <Text style={{ color: theme.colors.text, fontWeight: "800", lineHeight: 20, marginTop: 10 }}>
                      {String(item.caption)}
                    </Text>
                  )}
                </Pressable>

                {!!item.image_url && (
                  <View style={{ width: "100%", aspectRatio: 16 / 9, backgroundColor: "rgba(0,0,0,0.35)" }}>
                    <ExpoImage
                      source={{ uri: String(item.image_url) }}
                      style={{ width: "100%", height: "100%" }}
                      contentFit="contain"
                      transition={160}
                      cachePolicy="memory-disk"
                    />
                  </View>
                )}
              </Card>
            );
          }}
        />
      )}
    </Screen>
  );
}