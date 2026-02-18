import { supabase } from "@/src/supabase/supabaseClient";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ✅ ADD
import { isPostSaved, toggleSave, type SavedPost } from "@/src/club/savedPosts";

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

const LIKE_TOGGLE_RPC_CANDIDATES = [
  "toggle_post_like",
  "toggle_club_post_like",
  "like_club_post",
  "toggle_like",
] as const;

const POST_STATS_RPC_CANDIDATES = [
  "get_post_stats",
  "get_club_post_stats",
  "get_post_reactions",
] as const;

export default function ClubPostDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{
    postId?: string;
    caption?: string;
    imageUrl?: string;
    createdAt?: string;

    storeId?: string;
    storeName?: string;
    storeLocation?: string;
    storeCategory?: string;
  }>();

  const postId = safeStr(params.postId, "");
  const caption = safeStr(params.caption, "");
  const imageUrl = safeStr(params.imageUrl, "");
  const createdAt = safeStr(params.createdAt, "");

  const storeId = safeStr(params.storeId, "");
  const storeName = safeStr(params.storeName, "Store");
  const storeLocation = safeStr(params.storeLocation, "");
  const storeCategory = safeStr(params.storeCategory, "");
  const subtitle = [storeCategory, storeLocation].filter(Boolean).join(" • ");

  const topPad = Math.max(insets.top, 10) + 8;

  const [fullOpen, setFullOpen] = useState(false);

  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState<number | null>(null);
  const [commentsCount, setCommentsCount] = useState<number | null>(null);
  const [likeBusy, setLikeBusy] = useState(false);

  // ✅ ADD saved
  const [saved, setSaved] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  const goBack = useCallback(() => router.back(), [router]);

  const openComments = useCallback(() => {
    if (!postId) return;
    router.push({
      pathname: "/(tabs)/club/[postId]/comments" as any,
      params: { postId: String(postId), caption: String(caption ?? "").slice(0, 160) },
    } as any);
  }, [caption, postId, router]);

  // ✅✅✅ FIXED: use canonical route (orders/create) — no store/[storeId]/order
  const openOrderFromPost = useCallback(() => {
    if (!storeId) return;

    router.push({
      pathname: "/(tabs)/club/orders/create" as any,
      params: {
        storeId,
        storeName,
        postId,
        postCaption: caption,
        postImageUrl: imageUrl,
      },
    } as any);
  }, [caption, imageUrl, postId, router, storeId, storeName]);

  const openStore = useCallback(() => {
    if (!storeId) return;
    router.push({
      pathname: "/(tabs)/club/store/[storeId]" as any,
      params: { storeId },
    } as any);
  }, [router, storeId]);

  // ✅ init saved flag
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!postId) return;
      try {
        const v = await isPostSaved(postId);
        if (!cancelled) setSaved(v);
      } catch {}
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [postId]);

  // best-effort stats
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!postId) return;

      for (const fn of POST_STATS_RPC_CANDIDATES) {
        const { data, error } = await supabase.rpc(fn as any, { p_post_id: postId });
        if (!error) {
          if (cancelled) return;
          const row = Array.isArray(data) ? data?.[0] : data;
          const lc = row?.likes_count;
          const cc = row?.comments_count;
          const il = row?.i_liked;

          if (typeof lc === "number") setLikesCount(lc);
          if (typeof cc === "number") setCommentsCount(cc);
          if (typeof il === "boolean") setLiked(il);
          return;
        }

        const msg = String(error.message ?? "").toLowerCase();
        const missing =
          msg.includes("does not exist") ||
          msg.includes("function") ||
          msg.includes("rpc");
        if (!missing) return;
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [postId]);

  const toggleLike = useCallback(async () => {
    if (!postId) return;
    if (likeBusy) return;

    setLikeBusy(true);

    setLiked((v) => !v);
    setLikesCount((n) => {
      const base = typeof n === "number" ? n : 0;
      return base + (liked ? -1 : 1);
    });

    try {
      let lastErr: any = null;

      for (const fn of LIKE_TOGGLE_RPC_CANDIDATES) {
        const { error } = await supabase.rpc(fn as any, { p_post_id: postId });
        if (!error) return;

        lastErr = error;
        const msg = String(error.message ?? "").toLowerCase();
        const missing =
          msg.includes("does not exist") ||
          msg.includes("function") ||
          msg.includes("rpc");
        if (!missing) break;
      }

      throw lastErr ?? new Error("Like RPC missing");
    } catch {
      setLiked((v) => !v);
      setLikesCount((n) => {
        const base = typeof n === "number" ? n : 0;
        return base + (liked ? 1 : -1);
      });
    } finally {
      setLikeBusy(false);
    }
  }, [likeBusy, liked, postId]);

  // ✅ ADD save toggle
  const onToggleSave = useCallback(async () => {
    if (!postId) return;
    if (saveBusy) return;

    setSaveBusy(true);
    const prev = saved;
    setSaved(!prev); // optimistic

    try {
      const sp: SavedPost = {
        post_id: postId,
        caption: caption || null,
        image_url: imageUrl || null,
        created_at: createdAt || null,
        store_id: storeId || null,
        store_name: storeName || null,
        store_location: storeLocation || null,
        store_category: storeCategory || null,
        likes_count: likesCount ?? null,
        comments_count: commentsCount ?? null,
      };

      const res = await toggleSave(sp);
      setSaved(res.saved);
    } catch {
      setSaved(prev);
    } finally {
      setSaveBusy(false);
    }
  }, [
    caption,
    commentsCount,
    createdAt,
    imageUrl,
    likesCount,
    postId,
    saveBusy,
    saved,
    storeCategory,
    storeId,
    storeLocation,
    storeName,
  ]);

  const Fullscreen = useMemo(() => {
    return (
      <Modal visible={fullOpen} transparent animationType="fade" onRequestClose={() => setFullOpen(false)}>
        <Pressable
          onPress={() => setFullOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.88)",
            paddingTop: topPad,
            paddingBottom: Math.max(insets.bottom, 10) + 10,
          }}
        >
          <View style={{ paddingHorizontal: theme.spacing.page, flexDirection: "row", alignItems: "center" }}>
            <Pressable
              onPress={() => setFullOpen(false)}
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
              <Ionicons name="close" size={18} color={theme.colors.text} />
            </Pressable>
            <View style={{ flex: 1 }} />
          </View>

          <View style={{ flex: 1, paddingHorizontal: theme.spacing.page, paddingTop: 12, paddingBottom: 12 }}>
            {!!imageUrl ? (
              <ExpoImage
                source={{ uri: imageUrl }}
                style={{ width: "100%", height: "100%" }}
                contentFit="contain"
                transition={160}
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>No image</Text>
              </View>
            )}
          </View>
        </Pressable>
      </Modal>
    );
  }, [fullOpen, imageUrl, insets.bottom, topPad]);

  const LikeLabel = useMemo(() => {
    const n = typeof likesCount === "number" ? likesCount : null;
    if (n === null) return "Like";
    return n > 0 ? `Like ${n}` : "Like";
  }, [likesCount]);

  const CommentLabel = useMemo(() => {
    const n = typeof commentsCount === "number" ? commentsCount : null;
    if (n === null) return "Comments";
    return n > 0 ? `Comments ${n}` : "Comments";
  }, [commentsCount]);

  return (
    <Screen scroll contentStyle={{ paddingTop: topPad }}>
      <View style={{ gap: 12 }}>
        <Card style={{ padding: 14, backgroundColor: theme.colors.surface, borderColor: theme.colors.borderSoft }}>
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
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>{storeName}</Text>
              <Text style={{ color: theme.colors.faint, fontWeight: "900", fontSize: 12 }}>
                {fmtTimeAgo(createdAt)}
                {subtitle ? ` • ${subtitle}` : ""}
              </Text>
            </View>

            {/* ✅ Save */}
            {!!postId && (
              <Pressable
                onPress={() => void onToggleSave()}
                disabled={saveBusy}
                hitSlop={10}
                style={({ pressed }) => [
                  {
                    width: 44,
                    height: 40,
                    borderRadius: theme.radius.pill,
                    borderWidth: 1,
                    borderColor: saved ? theme.colors.emeraldBorder : "rgba(255,255,255,0.12)",
                    backgroundColor: saved ? theme.colors.emeraldSoft : "rgba(255,255,255,0.06)",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: saveBusy ? 0.6 : pressed ? 0.92 : 1,
                    marginRight: 8,
                  },
                ]}
              >
                <Ionicons
                  name={saved ? "bookmark" : "bookmark-outline"}
                  size={18}
                  color={saved ? theme.colors.emerald : theme.colors.text}
                />
              </Pressable>
            )}

            {/* ✅ Store */}
            {!!storeId && (
              <Pressable
                onPress={openStore}
                hitSlop={10}
                style={({ pressed }) => [
                  {
                    height: 40,
                    paddingHorizontal: 12,
                    borderRadius: theme.radius.pill,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    opacity: pressed ? 0.92 : 1,
                  },
                ]}
              >
                <Ionicons name="business-outline" size={16} color={theme.colors.text} />
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>Store</Text>
              </Pressable>
            )}
          </View>

          {/* Like / Comments / Order */}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Pressable
              onPress={toggleLike}
              disabled={likeBusy}
              hitSlop={10}
              style={({ pressed }) => [
                {
                  flex: 1,
                  height: 40,
                  borderRadius: theme.radius.pill,
                  borderWidth: 1,
                  borderColor: liked ? theme.colors.emeraldBorder : "rgba(255,255,255,0.12)",
                  backgroundColor: liked ? theme.colors.emeraldSoft : "rgba(255,255,255,0.06)",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  opacity: likeBusy ? 0.6 : pressed ? 0.92 : 1,
                },
              ]}
            >
              <Ionicons
                name={liked ? "heart" : "heart-outline"}
                size={16}
                color={liked ? theme.colors.emerald : theme.colors.text}
              />
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>{LikeLabel}</Text>
            </Pressable>

            <Pressable
              onPress={openComments}
              hitSlop={10}
              style={({ pressed }) => [
                {
                  flex: 1,
                  height: 40,
                  borderRadius: theme.radius.pill,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
            >
              <Ionicons name="chatbubble-outline" size={16} color={theme.colors.text} />
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>{CommentLabel}</Text>
            </Pressable>

            {!!storeId && (
              <Pressable
                onPress={openOrderFromPost}
                hitSlop={10}
                style={({ pressed }) => [
                  {
                    flex: 1,
                    height: 40,
                    borderRadius: theme.radius.pill,
                    borderWidth: 1,
                    borderColor: theme.colors.emeraldBorder,
                    backgroundColor: theme.colors.emeraldSoft,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    opacity: pressed ? 0.92 : 1,
                  },
                ]}
              >
                <Ionicons name="bag-handle-outline" size={16} color={theme.colors.emerald} />
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>Order</Text>
              </Pressable>
            )}
          </View>
        </Card>

        {!!caption && (
          <Card>
            <Text style={{ color: theme.colors.text, fontWeight: "900", marginBottom: 6 }}>Caption</Text>
            <Text style={{ color: theme.colors.text, fontWeight: "800", lineHeight: 20 }}>{caption}</Text>
          </Card>
        )}

        {!!imageUrl && (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <Pressable onPress={() => setFullOpen(true)} style={{ width: "100%" }}>
              <View style={{ width: "100%", aspectRatio: 16 / 9, backgroundColor: "rgba(0,0,0,0.35)" }}>
                <ExpoImage
                  source={{ uri: imageUrl }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="contain"
                  transition={160}
                  cachePolicy="memory-disk"
                />
              </View>

              <View style={{ padding: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="expand-outline" size={16} color={theme.colors.muted} />
                <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Tap to view fullscreen</Text>
              </View>
            </Pressable>
          </Card>
        )}

        {!postId ? (
          <Card style={{ backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.dangerBorder }}>
            <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>
              Post haijapokelewa vizuri. Rudi kwenye feed uifungue tena.
            </Text>
          </Card>
        ) : null}
      </View>

      {Fullscreen}
    </Screen>
  );
}