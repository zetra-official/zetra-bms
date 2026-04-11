// app/(tabs)/club/index.tsx
import { supabase } from "@/src/supabase/supabaseClient";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
  LayoutChangeEvent,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ✅ Org / Active store (for usage counter)
import { useOrg } from "@/src/context/OrgContext";

// ✅ Option B: expo-image (fast caching + decode)
import { Image as ExpoImage } from "expo-image";

// ✅ saved posts
import { isPostSaved, toggleSave, type SavedPost } from "@/src/club/savedPosts";

type FeedPost = {
  post_id: string;
  store_id: string;
  caption: string | null;

  // ✅ prefer feed image for list scroll (small)
  image_url: string | null;
  // ✅ optional HQ image for detail
  image_hq_url?: string | null;

  created_at: string | null;

  store_name?: string | null;
  store_display_name?: string | null;
  location?: string | null;
  category?: string | null;

  likes_count?: number | null;
  comments_count?: number | null;
  i_liked?: boolean | null;
};

type ClubUsageRow = {
  store_id: string;
  plan_code: string | null;
  used_this_month: number | null;
  limit_per_month: number | null;
  remaining: number | null;
  month_start: string | null;
  month_end: string | null;
};

function clean(x: any) {
  return String(x ?? "").trim();
}
function safeStr(x: any, fallback = "—") {
  const s = clean(x);
  return s.length ? s : fallback;
}
function fmtWhen(createdAt: any) {
  const s = clean(createdAt);
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function SafeIcon({
  name,
  size = 18,
  color,
}: {
  name: keyof typeof Ionicons.glyphMap;
  size?: number;
  color: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}

const FEED_RPC_CANDIDATES = [
  "get_club_feed_posts", // our bridge
  "get_club_feed",
  "get_club_feed_public",
  "get_club_feed_following_only",
] as const;

const LIKE_TOGGLE_RPC_CANDIDATES = [
  "toggle_post_like",
  "toggle_club_post_like",
  "like_club_post",
  "toggle_like",
] as const;

const COMMENTS_TABLE = "club_post_comments";
const POSTS_TABLE = "club_posts";

/* ---------------- Memoized item (KEY PERF FIX) ---------------- */

type FeedItemProps = {
  item: FeedPost;
  saved: boolean;

  onOpenPost: (p: FeedPost) => void;
  onOpenStore: (storeId: string) => void;
  onOpenMenu: (p: FeedPost) => void;
  onToggleLike: (p: FeedPost) => void;
  onOpenComments: (p: FeedPost) => void;
  onToggleSave: (p: FeedPost) => void;
};

const FeedPostItem = memo(function FeedPostItem({
  item,
  saved,
  onOpenPost,
  onOpenStore,
  onOpenMenu,
  onToggleLike,
  onOpenComments,
  onToggleSave,
}: FeedItemProps) {
  const { width } = useWindowDimensions();

  const img = clean(item.image_url) || clean(item.image_hq_url) || "";
  const caption = clean(item.caption);
  const storeName = safeStr(item.store_display_name ?? item.store_name, "Store");

  const likes = Number(item.likes_count) || 0;
  const comments = Number(item.comments_count) || 0;
  const liked = !!item.i_liked;

  const when = fmtWhen(item.created_at);

  const isDesktopWeb = Platform.OS === "web" && width >= 1024;
  const cardMaxWidth = isDesktopWeb ? 640 : undefined;
  const imageAspectRatio = isDesktopWeb ? 1.08 : 0.8;
  const desktopImageMaxHeight = isDesktopWeb ? 560 : undefined;

  return (
    <View
      style={{
        width: "100%",
        alignItems: "center",
        paddingHorizontal: isDesktopWeb ? 18 : 0,
        paddingTop: isDesktopWeb ? 14 : 0,
      }}
    >
      <Pressable
        onPress={() => onOpenPost(item)}
        hitSlop={10}
        style={({ pressed }) => [
          {
            opacity: pressed ? 0.98 : 1,
            width: "100%",
            maxWidth: cardMaxWidth,
          },
        ]}
      >
        <Card
          style={{
            padding: 0,
            borderRadius: isDesktopWeb ? 24 : 0,
            borderWidth: isDesktopWeb ? 1 : 0,
            backgroundColor: theme.colors.background,
            borderColor: isDesktopWeb ? theme.colors.borderSoft : "transparent",
            borderBottomWidth: isDesktopWeb ? 1 : 1,
            borderBottomColor: theme.colors.borderSoft,
            overflow: "hidden",
          }}
        >
        {/* HEADER */}
        <View style={{ paddingHorizontal: theme.spacing.page, paddingTop: 12, paddingBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Pressable
              onPress={() => onOpenStore(String(item.store_id ?? ""))}
              hitSlop={10}
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: theme.colors.emeraldBorder,
                  backgroundColor: theme.colors.emeraldSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <SafeIcon name="storefront-outline" size={18} color={theme.colors.emerald} />
              </View>

              <View>
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{storeName}</Text>
                <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 12 }}>Tap kuona post</Text>
              </View>
            </Pressable>

            <Pressable onPress={() => onOpenMenu(item)} hitSlop={10} style={{ padding: 6 }}>
              <SafeIcon name="ellipsis-horizontal" size={18} color={theme.colors.faint} />
            </Pressable>
          </View>
        </View>

        {/* IMAGE */}
        {img ? (
          <View
            style={{
              width: "100%",
              aspectRatio: imageAspectRatio,
              maxHeight: desktopImageMaxHeight,
              alignSelf: "center",
              backgroundColor: "rgba(255,255,255,0.05)",
              overflow: "hidden",
            }}
          >
            <ExpoImage
              source={{ uri: img }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              cachePolicy="disk"
              placeholder={null}
              transition={120}
            />
          </View>
        ) : null}

        {/* ACTIONS */}
        <View style={{ paddingHorizontal: theme.spacing.page, paddingTop: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginLeft: -6 }}>
              <Pressable
                onPress={() => onToggleLike(item)}
                hitSlop={14}
                pressRetentionOffset={14}
                style={({ pressed }) => [
                  {
                    width: 44,
                    height: 40,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <SafeIcon
                  name={liked ? "heart" : "heart-outline"}
                  size={24}
                  color={liked ? theme.colors.emerald : theme.colors.text}
                />
              </Pressable>

              <Pressable
                onPress={() => onOpenComments(item)}
                hitSlop={14}
                pressRetentionOffset={14}
                style={({ pressed }) => [
                  {
                    width: 44,
                    height: 40,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <SafeIcon name="chatbubble-outline" size={24} color={theme.colors.text} />
              </Pressable>

              <Pressable
                onPress={() => onOpenMenu(item)}
                hitSlop={14}
                pressRetentionOffset={14}
                style={({ pressed }) => [
                  {
                    width: 44,
                    height: 40,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <SafeIcon name="paper-plane-outline" size={24} color={theme.colors.text} />
              </Pressable>
            </View>

            <Pressable
              onPress={() => onToggleSave(item)}
              hitSlop={14}
              pressRetentionOffset={14}
              style={({ pressed }) => [
                {
                  width: 44,
                  height: 40,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
             <SafeIcon
  name={saved ? "bookmark" : "bookmark-outline"}
  size={24}
  color={saved ? theme.colors.emerald : theme.colors.text}
/>
            </Pressable>
          </View>

          <View style={{ marginTop: 2, flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{likes} likes</Text>
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{comments} comments</Text>
          </View>

          {!!caption && (
            <View style={{ marginTop: 4 }}>
              <Text style={{ color: theme.colors.text, lineHeight: 22 }}>
                <Text style={{ fontWeight: "900" }}>{storeName} </Text>
                <Text style={{ fontWeight: "800" }}>{caption}</Text>
              </Text>
            </View>
          )}

          <Pressable onPress={() => onOpenComments(item)} hitSlop={10} style={{ marginTop: 6 }}>
            <Text style={{ color: comments > 0 ? theme.colors.muted : theme.colors.faint, fontWeight: "900" }}>
              {comments > 0 ? `View all ${comments} comments` : "No comments yet"}
            </Text>
          </Pressable>

          {!!when ? (
            <Text style={{ marginTop: 6, marginBottom: 14, color: theme.colors.faint, fontWeight: "900", fontSize: 11 }}>
              {when}
            </Text>
          ) : (
            <View style={{ height: 14 }} />
          )}
        </View>
      </Card>
      </Pressable>
    </View>
  );
});

/* ---------------- Screen ---------------- */

export default function ClubFeedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Math.max(insets.top, 10) + 8;

  // ✅ Active store for Usage Counter (per store)
  const { activeStoreId, activeStoreName } = useOrg();

  const PAGE = 24;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);



  // saved state map (fast UI)
  const [savedMap, setSavedMap] = useState<Record<string, boolean>>({});

  // guard: ignore realtime updates before first load is ready
  const bootedRef = useRef(false);

  // remember last post opened for comments
  const lastCommentsPostIdRef = useRef<string | null>(null);

  // ✅ TopBar height (for perfect paddingTop)
  const [topBarH, setTopBarH] = useState<number>(0);
  const onTopBarLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const h = Math.ceil(e?.nativeEvent?.layout?.height ?? 0);
      if (h > 0 && h !== topBarH) setTopBarH(h);
    },
    [topBarH]
  );

  /* ---------------- Usage Counter ---------------- */

  const [usageLoading, setUsageLoading] = useState(false);
  const [usageErr, setUsageErr] = useState<string | null>(null);
  const [usage, setUsage] = useState<ClubUsageRow | null>(null);

  const fetchUsage = useCallback(
    async (mode: "silent" | "loud" = "silent") => {
      const storeId = clean(activeStoreId);
      if (!storeId) {
        setUsage(null);
        setUsageErr(null);
        return;
      }

      if (mode === "loud") setUsageLoading(true);
      setUsageErr(null);

      try {
        const { data, error } = await supabase.rpc("get_club_post_usage_v1", { p_store_id: storeId } as any);
        if (error) throw error;

        const row = (Array.isArray(data) ? (data?.[0] as any) : (data as any)) as ClubUsageRow | null;
        if (!row) {
          setUsage(null);
          return;
        }

        setUsage({
          store_id: clean((row as any)?.store_id ?? storeId),
          plan_code: clean((row as any)?.plan_code ?? "") || null,
          used_this_month: Number((row as any)?.used_this_month ?? 0),
          limit_per_month: Number((row as any)?.limit_per_month ?? 0),
          remaining: Number((row as any)?.remaining ?? 0),
          month_start: (row as any)?.month_start ? String((row as any).month_start) : null,
          month_end: (row as any)?.month_end ? String((row as any).month_end) : null,
        });
      } catch (e: any) {
        // keep feed stable even if usage RPC is missing
        const msg = String(e?.message ?? "");
        const low = msg.toLowerCase();
        const missing = low.includes("does not exist") || low.includes("function") || low.includes("rpc");
        if (!missing) setUsageErr(msg || "Failed to load usage");
        setUsage(null);
      } finally {
        if (mode === "loud") setUsageLoading(false);
      }
    },
    [activeStoreId]
  );

  // load usage on boot (silent)
  useEffect(() => {
    void fetchUsage("silent");
  }, [fetchUsage]);

  // refresh usage when screen focused (silent)
  useFocusEffect(
    useCallback(() => {
      if (!bootedRef.current) return;
      void fetchUsage("silent");
    }, [fetchUsage])
  );

  // ✅ AUTO-REFRESH usage when someone posts (realtime on club_posts for active store)
  useEffect(() => {
    const storeId = clean(activeStoreId);
    if (!storeId) return;

    const channelName = `club_usage_posts_${storeId}_${Date.now()}`;

    const ch = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: POSTS_TABLE,
          filter: `store_id=eq.${storeId}`,
        },
        () => {
          void fetchUsage("silent");
        }
      )
      .subscribe();

    return () => {
      try {
        void supabase.removeChannel(ch);
      } catch {}
    };
  }, [activeStoreId, fetchUsage]);

  const warmSavedFlags = useCallback(async (list: FeedPost[]) => {
    try {
      const ids = list.map((p) => clean(p.post_id)).filter(Boolean);
      if (!ids.length) return;
      const pairs = await Promise.all(ids.map(async (id) => [id, await isPostSaved(id)] as const));
      const next: Record<string, boolean> = {};
      for (const [id, v] of pairs) next[id] = v;
      setSavedMap((prev) => ({ ...prev, ...next }));
    } catch {}
  }, []);

  const callFirstWorkingFeedRpc = useCallback(async (args: any) => {
    let lastErr: any = null;

    for (const fn of FEED_RPC_CANDIDATES) {
      const { data, error } = await supabase.rpc(fn as any, args);
      if (!error) {
        return { data: (data ?? []) as FeedPost[] };
      }

      lastErr = error;
      const msg = String(error.message ?? "").toLowerCase();
      const missing = msg.includes("does not exist") || msg.includes("function") || msg.includes("rpc");
      if (!missing) break;
    }

    throw lastErr ?? new Error("Feed RPC missing");
  }, []);

  const fetchFeed = useCallback(
    async (mode: "boot" | "refresh" | "more") => {
      if (mode === "boot") setLoading(true);
      if (mode === "refresh") setRefreshing(true);
      if (mode === "more") setLoadingMore(true);

      setErr(null);

      try {
        const args: any = { p_limit: PAGE };
        if (mode === "more" && cursor) args.p_before = cursor;

        const res = await callFirstWorkingFeedRpc(args);
        const list = (res?.data ?? []) as FeedPost[];

        if (mode === "boot" || mode === "refresh") {
          setPosts(list);
          void warmSavedFlags(list);
        } else {
          setPosts((prev) => {
            const seen = new Set(prev.map((p) => clean(p.post_id)));
            const merged = [...prev];
            for (const p of list) {
              const id = clean(p.post_id);
              if (!id || seen.has(id)) continue;
              merged.push(p);
            }
            return merged;
          });
          void warmSavedFlags(list);
        }

        const last = list[list.length - 1];
        const nextCursor = last?.created_at ? String(last.created_at) : null;
        setCursor(nextCursor);
        setHasMore(list.length >= PAGE);

        if (mode === "boot") bootedRef.current = true;
      } catch (e: any) {
        const msg = e?.message ?? "Failed to load club feed";
        setErr(msg);

        if (mode === "boot" || mode === "refresh") {
          setPosts([]);
          setCursor(null);
          setHasMore(false);
        }
      } finally {
        if (mode === "boot") setLoading(false);
        if (mode === "refresh") setRefreshing(false);
        if (mode === "more") setLoadingMore(false);
      }
    },
    [PAGE, callFirstWorkingFeedRpc, cursor, warmSavedFlags]
  );

  useEffect(() => {
    void fetchFeed("boot");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // AUTO SYNC when you come back from comments
  const syncCommentsCountForLastPost = useCallback(async () => {
    const postId = clean(lastCommentsPostIdRef.current);
    if (!postId) return;

    try {
      const { count, error } = await supabase.from(COMMENTS_TABLE as any).select("id", { count: "exact", head: true }).eq("post_id", postId);
      if (error) return;

      const nextCount = Number(count) || 0;
      setPosts((prev) => prev.map((p) => (clean(p.post_id) !== postId ? p : { ...p, comments_count: nextCount })));
    } finally {
      lastCommentsPostIdRef.current = null;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!bootedRef.current) return;
      void syncCommentsCountForLastPost();
    }, [syncCommentsCountForLastPost])
  );

  // REALTIME (optional) - cheap update, still okay
  useEffect(() => {
    const channelName = `club_feed_comments_live_${Date.now()}`;

    const ch = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: COMMENTS_TABLE },
        (payload: any) => {
          if (!bootedRef.current) return;

          const postId = clean(payload?.new?.post_id) || clean(payload?.old?.post_id);
          if (!postId) return;

          const ev = String(payload?.eventType ?? "").toUpperCase();
          if (ev !== "INSERT" && ev !== "DELETE") return;

          setPosts((prev) =>
            prev.map((p) => {
              if (clean(p.post_id) !== postId) return p;
              const cur = Number(p.comments_count) || 0;
              const next = ev === "INSERT" ? cur + 1 : Math.max(0, cur - 1);
              return { ...p, comments_count: next };
            })
          );
        }
      )
      .subscribe();

    return () => {
      try {
        void supabase.removeChannel(ch);
      } catch {}
    };
  }, []);

  const openProfile = useCallback(() => router.push("/(tabs)/club/profile" as any), [router]);
  const openCreate = useCallback(() => router.push("/(tabs)/club/create" as any), [router]);
  const openSaved = useCallback(() => router.push("/(tabs)/club/saved" as any), [router]);

  const openStore = useCallback(
    (storeId: string) => {
      const sid = clean(storeId);
      if (!sid) return;
      router.push({ pathname: "/(tabs)/club/store/[storeId]" as any, params: { storeId: sid } } as any);
    },
    [router]
  );

  const openComments = useCallback(
    (p: FeedPost) => {
      const postId = clean(p?.post_id);
      if (!postId) return;
      lastCommentsPostIdRef.current = postId;

      router.push({
        pathname: "/(tabs)/club/[postId]/comments" as any,
        params: { postId, caption: String(p.caption ?? "").slice(0, 160) },
      } as any);
    },
    [router]
  );

  const openOrder = useCallback(
    (p: FeedPost) => {
      const storeId = clean(p?.store_id);
      if (!storeId) return;
      const storeName = String(p.store_display_name ?? p.store_name ?? "Store");

      router.push({
        pathname: "/(tabs)/club/orders/create" as any,
        params: {
          storeId,
          storeName,
          postId: String(p.post_id ?? ""),
          postCaption: String(p.caption ?? ""),
          postImageUrl: String(p.image_url ?? ""),
        },
      } as any);
    },
    [router]
  );

  const openPost = useCallback(
    (p: FeedPost) => {
      const postId = clean(p?.post_id);
      if (!postId) return;

      router.push({
        pathname: "/(tabs)/club/[postId]" as any,
        params: {
          postId,
          caption: String(p.caption ?? ""),
          imageUrl: String(p.image_url ?? ""),
          imageHqUrl: String(p.image_hq_url ?? ""),
          createdAt: String(p.created_at ?? ""),
          storeId: String(p.store_id ?? ""),
          storeName: String(p.store_display_name ?? p.store_name ?? ""),
          storeLocation: String(p.location ?? ""),
          storeCategory: String(p.category ?? ""),
        },
      } as any);
    },
    [router]
  );

  const openMenu = useCallback(
    (item: FeedPost) => {
      const storeName = safeStr(item.store_display_name ?? item.store_name, "Store");

      Alert.alert(storeName, "Chagua", [
        { text: "Open Store", onPress: () => openStore(String(item.store_id ?? "")) },
        { text: "Order", onPress: () => void openOrder(item) },
        { text: "Cancel", style: "cancel" },
      ]);
    },
    [openOrder, openStore]
  );

  const toggleLike = useCallback(async (p: FeedPost) => {
    const postId = clean(p?.post_id);
    if (!postId) return;

    // optimistic UI
    setPosts((prev) =>
      prev.map((x) => {
        if (clean(x.post_id) !== postId) return x;
        const liked = !!x.i_liked;
        const nextLiked = !liked;
        const nextCount = (Number(x.likes_count) || 0) + (nextLiked ? 1 : -1);
        return { ...x, i_liked: nextLiked, likes_count: Math.max(0, nextCount) };
      })
    );

    try {
      let lastErr: any = null;

      for (const fn of LIKE_TOGGLE_RPC_CANDIDATES) {
        const { error } = await supabase.rpc(fn as any, { p_post_id: postId });
        if (!error) return;

        lastErr = error;
        const msg = String(error.message ?? "").toLowerCase();
        const missing = msg.includes("does not exist") || msg.includes("function") || msg.includes("rpc");
        if (!missing) break;
      }

      throw lastErr ?? new Error("Like RPC missing");
    } catch (e: any) {
      // rollback
      setPosts((prev) =>
        prev.map((x) => {
          if (clean(x.post_id) !== postId) return x;
          const liked = !!x.i_liked;
          const nextLiked = !liked;
          const nextCount = (Number(x.likes_count) || 0) + (nextLiked ? 1 : -1);
          return { ...x, i_liked: nextLiked, likes_count: Math.max(0, nextCount) };
        })
      );
      setErr(e?.message ?? "Like haipo bado (DB/RPC).");
    }
  }, []);

  const onToggleSave = useCallback(async (p: FeedPost) => {
    const id = clean(p.post_id);
    if (!id) return;

    setSavedMap((prev) => ({ ...prev, [id]: !prev[id] }));

    try {
      const sp: SavedPost = {
        post_id: id,
        caption: p.caption ?? null,
        image_url: p.image_url ?? null,
        created_at: p.created_at ?? null,
        store_id: p.store_id ?? null,
        store_name: (p.store_display_name ?? p.store_name ?? null) as any,
        store_location: p.location ?? null,
        store_category: p.category ?? null,
        likes_count: p.likes_count ?? null,
        comments_count: p.comments_count ?? null,
      };

      const res = await toggleSave(sp);
      setSavedMap((prev) => ({ ...prev, [id]: res.saved }));
    } catch {
      setSavedMap((prev) => ({ ...prev, [id]: !prev[id] }));
    }
  }, []);

  /* ---------------- Top Bar (Compact Usage Pill) ---------------- */

  const TopBar = useMemo(() => {
    const IgTopIcon = ({
      icon,
      onPress,
      active,
      size,
      color,
      hitSlopSize,
    }: {
      icon: any;
      onPress: () => void;
      active?: boolean;
      size?: number;
      color?: string;
      hitSlopSize?: number;
    }) => {
      const hs = hitSlopSize ?? 26;
      return (
        <Pressable
          onPress={onPress}
          hitSlop={hs}
          pressRetentionOffset={hs}
          android_disableSound
          style={({ pressed }) => [
            {
              width: 48,
              height: 48,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.65 : 1,
            },
          ]}
        >
          <SafeIcon
  name={icon}
  size={size ?? 24}
  color={color ?? (active ? theme.colors.emerald : theme.colors.text)}
/>
        </Pressable>
      );
    };

    const used = Math.max(0, Number(usage?.used_this_month) || 0);
    const limit = Math.max(0, Number(usage?.limit_per_month) || 0);
    const rem = Math.max(0, Number(usage?.remaining) || Math.max(0, limit - used));

    // ✅ Per your rule: DO NOT show store name inside the pill
    const showBadge = !!clean(activeStoreId) && (limit > 0 || used > 0 || !!usage);

    // ✅ English, simple, clear
    const remainingText = ` ${rem} posts remaining this month`;

    return (
      <View
        pointerEvents="box-none"
        onLayout={onTopBarLayout}
        style={{
          paddingTop: topPad,
          paddingBottom: 8,
          backgroundColor: theme.colors.background,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.borderSoft,
        }}
      >
        <View
          pointerEvents="box-none"
          style={{
            paddingHorizontal: theme.spacing.page,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <IgTopIcon icon="add" onPress={openCreate} size={30} color={theme.colors.emerald} />

          <View style={{ flex: 1, alignItems: "center" }}>
            {/* Title row */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" }}>
              <Text
                numberOfLines={1}
                style={{
                  color: theme.colors.text,
                  fontSize: 19,
                  letterSpacing: 0.2,
                  flexShrink: 1,
                }}
              >
                <Text style={{ fontWeight: "900", fontStyle: "italic" }}>Zetra Business</Text>
                <Text style={{ fontWeight: "800" }}> Club</Text>
              </Text>
              <SafeIcon name="chevron-down" size={14} color={theme.colors.faint} />
            </View>

            {/* ✅ Compact pill (same vibe, fixed content) */}
            {showBadge ? (
              <View
                style={{
                  marginTop: 6,
                  alignSelf: "center",
                  maxWidth: "92%",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,

                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: theme.colors.emeraldBorder,
                  backgroundColor: "rgba(16,185,129,0.10)",
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: theme.colors.emeraldBorder,
                    backgroundColor: theme.colors.emeraldSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <SafeIcon name="speedometer-outline" size={12} color={theme.colors.emerald} />
                </View>

                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{
                    flex: 1,
                    color: theme.colors.text,
                    fontWeight: "900",
                    fontSize: 11,
                  }}
                >
                  {remainingText}
                </Text>

                <Pressable
                  onPress={() => void fetchUsage("loud")}
                  hitSlop={10}
                  style={({ pressed }) => [
                    {
                      opacity: pressed ? 0.75 : 1,
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "rgba(255,255,255,0.04)",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.08)",
                    },
                  ]}
                >
                  <SafeIcon
  name={usageLoading ? "hourglass-outline" : "refresh"}
  size={12}
  color={theme.colors.faint}
/>
                </Pressable>
              </View>
            ) : (
              <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 11, marginTop: 6 }}>
                Activate store kuona usage counter.
              </Text>
            )}

            {!!usageErr ? (
              <Text style={{ color: theme.colors.danger, fontWeight: "900", fontSize: 10, marginTop: 4 }}>
                {usageErr}
              </Text>
            ) : null}

            
          </View>

          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <IgTopIcon icon="bookmark-outline" onPress={openSaved} />
            <IgTopIcon icon="person-circle-outline" onPress={openProfile} size={30} hitSlopSize={32} />
          </View>
        </View>
      </View>
    );
  }, [
    activeStoreId,
    fetchUsage,
    onTopBarLayout,
    openCreate,
    openProfile,
    openSaved,
    
    topPad,
    usage,
    usageErr,
    usageLoading,
  ]);

  const keyExtractor = useCallback((x: FeedPost) => String(x.post_id), []);

  const renderItem = useCallback(
    ({ item }: { item: FeedPost }) => {
      const pid = clean(item.post_id);
      const saved = !!savedMap[pid];

      return (
        <FeedPostItem
          item={item}
          saved={saved}
          onOpenPost={openPost}
          onOpenStore={openStore}
          onOpenMenu={openMenu}
          onToggleLike={toggleLike}
          onOpenComments={openComments}
          onToggleSave={onToggleSave}
        />
      );
    },
    [savedMap, openPost, openStore, openMenu, toggleLike, openComments, onToggleSave]
  );

  // ✅ header padding fallback (in case layout not measured yet)
  const headerPad = Math.max(topBarH, topPad + 56);

  return (
    <Screen scroll={false} contentStyle={{ paddingTop: 0, paddingHorizontal: 0, paddingBottom: 0 }}>
      {/* ✅ ABSOLUTE TOP BAR (always clickable, not part of FlatList) */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          zIndex: 9999,
          elevation: 9999,
        }}
      >
        {TopBar}
      </View>

      <FlatList
        data={posts}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={{
          paddingTop: headerPad,
          paddingHorizontal: 0,
          paddingBottom: Math.max(insets.bottom, 10) + 110,
        }}
        refreshing={refreshing}
        onRefresh={() => {
          void fetchFeed("refresh");
          void fetchUsage("silent");
        }}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (loading || refreshing || loadingMore) return;
          if (!hasMore) return;
          if (!cursor) return;
          void fetchFeed("more");
        }}
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingVertical: 18, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 10 }}>Loading feed...</Text>
            </View>
          ) : (
            <View style={{ paddingHorizontal: theme.spacing.page }}>
              <Card style={{ padding: 14 }}>
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>No posts</Text>
                <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                  Hakuna posts kwa sasa. Bonyeza “Create Post”.
                </Text>
              </Card>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingVertical: 14, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>Loading more...</Text>
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
      />
    </Screen>
  );
}