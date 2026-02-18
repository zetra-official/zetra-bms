// app/(tabs)/club/store/[storeId].tsx

import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  Image as RNImage,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type StoreProfileRow = {
  store_id: string;
  display_name: string | null;
  bio: string | null;
  category: string | null;
  location: string | null;
  whatsapp: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type StoreStatsRow = {
  posts_count: number | null;
  followers_count: number | null;
  following_count: number | null;
};

type TabKey = "POSTS" | "ABOUT" | "ORDERS" | "PRODUCTS";

type StorePostRow = {
  post_id: string;
  store_id: string;
  caption: string | null;
  image_url: string | null;
  created_at: string | null;
  likes_count?: number | null;
  comments_count?: number | null;
};

function clean(x: any) {
  return String(x ?? "").trim();
}

function safeStr(x: any, fallback = "â€”") {
  const s = clean(x);
  return s.length ? s : fallback;
}

/**
 * Normalize phone/whatsapp to "255XXXXXXXXX"
 * Accepts: 0758..., 758..., +255..., 255...
 */
function normalizeTZ(numRaw: string) {
  const s = clean(numRaw).replace(/\s+/g, "");
  if (!s) return "";
  const only = s.replace(/[^\d+]/g, "");

  // +255...
  if (only.startsWith("+255")) return "255" + only.slice(4).replace(/\D/g, "");
  // 255...
  if (only.startsWith("255")) return "255" + only.slice(3).replace(/\D/g, "");
  // 0XXXXXXXXX
  if (only.startsWith("0")) return "255" + only.slice(1).replace(/\D/g, "");
  // 7XXXXXXXX or 6XXXXXXXX etc.
  if (/^\d{9,}$/.test(only)) {
    if (only.length === 9) return "255" + only;
    return only.replace(/\D/g, "");
  }
  return only.replace(/\D/g, "");
}

async function openUrl(url: string) {
  try {
    const can = await Linking.canOpenURL(url);
    if (!can) throw new Error("Cannot open link");
    await Linking.openURL(url);
  } catch {
    Alert.alert("Open link failed", "Imeshindikana kufungua link kwenye simu hii.");
  }
}

export default function ClubStoreDashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ storeId?: string }>();

  const { activeStoreId, activeRole } = useOrg();

  const storeId = clean(params?.storeId);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [profile, setProfile] = useState<StoreProfileRow | null>(null);
  const [stats, setStats] = useState<StoreStatsRow | null>(null);

  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  const [tab, setTab] = useState<TabKey>("POSTS");

  const PAGE = 30;
  const [posts, setPosts] = useState<StorePostRow[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsRefreshing, setPostsRefreshing] = useState(false);
  const [postsLoadingMore, setPostsLoadingMore] = useState(false);
  const [postsCursor, setPostsCursor] = useState<string | null>(null);
  const [postsHasMore, setPostsHasMore] = useState(true);

  const topPad = Math.max(insets.top, 10) + 8;

  const isMyStore = useMemo(
    () => !!activeStoreId && activeStoreId === storeId,
    [activeStoreId, storeId]
  );

  const canOwnerView = useMemo(
    () => activeRole === "owner" || activeRole === "admin",
    [activeRole]
  );
  const isOwnerView = useMemo(
    () => isMyStore && canOwnerView,
    [isMyStore, canOwnerView]
  );

  const loadProfileAndStats = useCallback(async () => {
    setErr(null);
    setLoading(true);

    try {
      if (!storeId) throw new Error("Store missing");

      const [{ data: p, error: pErr }, { data: s, error: sErr }] =
        await Promise.all([
          supabase.rpc("get_store_profile", { p_store_id: storeId }),
          supabase.rpc("get_store_stats", { p_store_id: storeId }),
        ]);

      if (pErr) throw pErr;
      if (sErr) throw sErr;

      const pRow = Array.isArray(p) ? (p[0] as any) : (p as any);
      setProfile((pRow as any) ?? null);

      const sRow = Array.isArray(s) ? (s[0] as any) : (s as any);
      setStats((sRow as any) ?? null);

      // best-effort: check if user already follows
      try {
        const { data: f, error: fErr } = await supabase.rpc(
          "get_my_followed_stores" as any
        );
        if (!fErr) {
          const found = (f ?? []).some(
            (r: any) => clean(r?.store_id) === storeId
          );
          setIsFollowing(found);
        }
      } catch {
        // ignore
      }
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load store dashboard");
      setProfile(null);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  const fetchStorePosts = useCallback(
    async (mode: "boot" | "refresh" | "more") => {
      if (!storeId) return;

      if (mode === "boot") setPostsLoading(true);
      if (mode === "refresh") setPostsRefreshing(true);
      if (mode === "more") setPostsLoadingMore(true);

      setErr(null);

      try {
        const args: any = { p_store_id: storeId, p_limit: PAGE };
        if (mode === "more" && postsCursor) args.p_before = postsCursor;

        const { data, error } = await supabase.rpc(
          "get_store_posts" as any,
          args
        );

        if (error) {
          const msg = String(error.message ?? "").toLowerCase();
          const missingRpc =
            msg.includes("does not exist") ||
            msg.includes("function") ||
            msg.includes("rpc");

          if (missingRpc) {
            setPosts([]);
            setPostsHasMore(false);
            setPostsCursor(null);
            setErr(
              "Store posts RPC haipo bado. Hakikisha A41-SQL imerun, kisha refresh."
            );
            return;
          }
          throw error;
        }

        const list = (data ?? []) as StorePostRow[];

        if (mode === "boot" || mode === "refresh") {
          setPosts(list);
        } else {
          setPosts((prev) => {
            const seen = new Set(prev.map((p) => String(p.post_id)));
            const merged = [...prev];
            for (const p of list) {
              const id = String(p.post_id ?? "");
              if (!id || seen.has(id)) continue;
              merged.push(p);
            }
            return merged;
          });
        }

        const last = list[list.length - 1];
        const nextCursor = last?.created_at ? String(last.created_at) : null;
        setPostsCursor(nextCursor);
        setPostsHasMore(list.length >= PAGE);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load store posts");
        if (mode === "boot" || mode === "refresh") {
          setPosts([]);
          setPostsHasMore(false);
          setPostsCursor(null);
        }
      } finally {
        if (mode === "boot") setPostsLoading(false);
        if (mode === "refresh") setPostsRefreshing(false);
        if (mode === "more") setPostsLoadingMore(false);
      }
    },
    [PAGE, postsCursor, storeId]
  );

  useEffect(() => {
    void loadProfileAndStats();
  }, [loadProfileAndStats]);

  useEffect(() => {
    if (tab !== "POSTS") return;
    setPostsCursor(null);
    setPostsHasMore(true);
    void fetchStorePosts("boot");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, storeId]);

  const toggleFollow = useCallback(async () => {
    if (!storeId) return;
    if (followBusy) return;

    setFollowBusy(true);
    setErr(null);

    const prev = isFollowing;
    setIsFollowing(!prev);

    try {
      const fn = prev ? "unfollow_store" : "follow_store";
      const { error } = await supabase.rpc(fn as any, { p_store_id: storeId });
      if (error) throw error;

      // refresh stats (best effort)
      try {
        const { data: s, error: sErr } = await supabase.rpc("get_store_stats", {
          p_store_id: storeId,
        });
        if (!sErr) {
          const sRow = Array.isArray(s) ? (s[0] as any) : (s as any);
          setStats((sRow as any) ?? null);
        }
      } catch {
        // ignore
      }
    } catch (e: any) {
      setIsFollowing(prev);
      setErr(e?.message ?? "Follow failed");
    } finally {
      setFollowBusy(false);
    }
  }, [followBusy, isFollowing, storeId]);

  const openWhatsAppToStore = useCallback(async () => {
    const raw = clean(profile?.whatsapp);
    const n = normalizeTZ(raw);
    if (!n) {
      Alert.alert("WhatsApp", "Store hii haijaweka WhatsApp bado.");
      return;
    }

    const msg = encodeURIComponent(
      `Habari, naomba maelezo kuhusu bidhaa/oda kwenye ${safeStr(
        profile?.display_name,
        "Store"
      )}.`
    );

    // wa.me format (no plus)
    await openUrl(`https://wa.me/${n}?text=${msg}`);
  }, [profile?.display_name, profile?.whatsapp]);

  const callStorePhone = useCallback(async () => {
    const raw = clean(profile?.phone);
    const n = normalizeTZ(raw);
    if (!n) {
      Alert.alert("Call", "Store hii haijaweka namba ya simu bado.");
      return;
    }
    // tel: prefers plain digits (255...)
    await openUrl(`tel:${n}`);
  }, [profile?.phone]);

  const openContact = useCallback(() => {
    const w = clean(profile?.whatsapp);
    const p = clean(profile?.phone);

    if (!w && !p) {
      Alert.alert("Contact", "Hakuna contact info bado.");
      return;
    }

    Alert.alert("Contact", "Chagua action:", [
      {
        text: "WhatsApp",
        onPress: () => void openWhatsAppToStore(),
      },
      {
        text: "Call",
        onPress: () => void callStorePhone(),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [callStorePhone, openWhatsAppToStore, profile?.phone, profile?.whatsapp]);

  const openMessage = useCallback(async () => {
    if (!storeId) return;
    try {
      const { data, error } = await supabase.rpc("open_thread" as any, {
        p_store_id: storeId,
      });
      if (error) throw error;

      const threadId = String(data ?? "");
      if (!threadId) throw new Error("Failed to open thread");

      router.push({
        pathname: "/(tabs)/club/inbox/[threadId]" as any,
        params: { threadId, storeId },
      } as any);
    } catch (e: any) {
      Alert.alert("Message", e?.message ?? "Failed to open inbox thread");
    }
  }, [router, storeId]);

  // âœ… Order button (PUBLIC) - normal order
  const openOrders = useCallback(() => {
    if (!storeId) return;

    // âœ… FIX ROUTE: order -> orders/create
    router.push({
      pathname: "/(tabs)/club/store/[storeId]/orders/create" as any,
      params: { storeId, storeName: safeStr(profile?.display_name, "Store") },
    } as any);
  }, [profile?.display_name, router, storeId]);

  // âœ… Order from specific post (option)
  const openOrderFromPost = useCallback(
    (item: StorePostRow) => {
      if (!storeId) return;

      const postId = clean(item?.post_id);
      const postCaption = String(item?.caption ?? "");
      const postImageUrl = String(item?.image_url ?? "");

      // âœ… FIX ROUTE: order -> orders/create
      router.push({
        pathname: "/(tabs)/club/store/[storeId]/orders/create" as any,
        params: {
          storeId,
          storeName: safeStr(profile?.display_name, "Store"),
          postId,
          postCaption,
          postImageUrl,
        },
      } as any);
    },
    [profile?.display_name, router, storeId]
  );

  const openStoreInbox = useCallback(() => {
    if (!storeId) return;
    router.push({
      pathname: "/(tabs)/club/inbox/store/[storeId]" as any,
      params: { storeId },
    } as any);
  }, [router, storeId]);

  const displayName = useMemo(
    () => safeStr(profile?.display_name, "Business"),
    [profile?.display_name]
  );
  const bio = useMemo(() => clean(profile?.bio), [profile?.bio]);
  const category = useMemo(() => clean(profile?.category), [profile?.category]);
  const location = useMemo(() => clean(profile?.location), [profile?.location]);
  const subtitle = useMemo(
    () => [category, location].filter(Boolean).join(" â€¢ "),
    [category, location]
  );

  const avatarUrl = useMemo(
    () => clean(profile?.avatar_url),
    [profile?.avatar_url]
  );

  const viewBadge = useMemo(() => {
    if (isOwnerView) return "OWNER VIEW";
    return "PUBLIC";
  }, [isOwnerView]);

  const postsCount = useMemo(() => {
    const n = stats?.posts_count;
    return typeof n === "number" ? String(n) : "â€”";
  }, [stats?.posts_count]);

  const followersCount = useMemo(() => {
    const n = stats?.followers_count;
    return typeof n === "number" ? String(n) : "â€”";
  }, [stats?.followers_count]);

  const followingCount = useMemo(() => {
    const n = stats?.following_count;
    return typeof n === "number" ? String(n) : "â€”";
  }, [stats?.following_count]);

  const TabBtn = useCallback(
    (k: TabKey, label: string, icon: any) => {
      const active = tab === k;
      return (
        <Pressable
          onPress={() => setTab(k)}
          hitSlop={10}
          style={({ pressed }) => [
            {
              flex: 1,
              height: 40,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: active
                ? theme.colors.emeraldBorder
                : "rgba(255,255,255,0.12)",
              backgroundColor: active
                ? theme.colors.emeraldSoft
                : "rgba(255,255,255,0.06)",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              opacity: pressed ? 0.92 : 1,
            },
          ]}
        >
          <Ionicons
            name={icon}
            size={16}
            color={active ? theme.colors.emerald : theme.colors.text}
          />
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>
            {label}
          </Text>
        </Pressable>
      );
    },
    [tab]
  );

  const openPostDetail = useCallback(
    (item: StorePostRow) => {
      const postId = String(item.post_id ?? "").trim();
      if (!postId) return;

      router.push({
        pathname: "/(tabs)/club/[postId]" as any,
        params: {
          postId,
          caption: String(item.caption ?? ""),
          imageUrl: String(item.image_url ?? ""),
          createdAt: String(item.created_at ?? ""),
          storeId: String(storeId ?? ""),
          storeName: String(displayName ?? ""),
          storeLocation: String(location ?? ""),
          storeCategory: String(category ?? ""),
        },
      } as any);
    },
    [category, displayName, location, router, storeId]
  );

  // âœ… Options menu on long-press
  const openPostOptions = useCallback(
    (item: StorePostRow) => {
      Alert.alert("Post Options", "Chagua unachotaka kufanya:", [
        {
          text: "View Post",
          onPress: () => openPostDetail(item),
        },
        {
          text: "Order from this Post",
          onPress: () => openOrderFromPost(item),
        },
        { text: "Cancel", style: "cancel" },
      ]);
    },
    [openOrderFromPost, openPostDetail]
  );

  const renderGridItem = useCallback(
    ({ item }: { item: StorePostRow }) => {
      const img = clean(item.image_url);
      return (
        <Pressable
          onPress={() => openPostDetail(item)}
          onLongPress={() => openPostOptions(item)}
          delayLongPress={220}
          style={({ pressed }) => [
            {
              flex: 1,
              aspectRatio: 1,
              borderRadius: 14,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              opacity: pressed ? 0.92 : 1,
            },
          ]}
        >
          {img ? (
            <RNImage
              source={{ uri: img }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="image-outline" size={20} color={theme.colors.faint} />
              <Text style={{ color: theme.colors.faint, fontWeight: "900", fontSize: 11, marginTop: 6 }}>
                No Image
              </Text>
            </View>
          )}
        </Pressable>
      );
    },
    [openPostDetail, openPostOptions]
  );

  const gridKey = useMemo(() => `grid-${storeId}`, [storeId]);

  return (
    <Screen scroll contentStyle={{ paddingTop: topPad }}>
      <View style={{ gap: 12 }}>
        {/* Top bar */}
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
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
                <Ionicons name="storefront-outline" size={18} color={theme.colors.emerald} />
              </View>

              <View>
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                  Store Dashboard
                </Text>
                <Text style={{ color: theme.colors.faint, fontWeight: "900", fontSize: 12 }}>
                  ZETRA Business Club
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
          <Card style={{ backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.dangerBorder }}>
            <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>{err}</Text>
          </Card>
        )}

        {/* Main profile card */}
        <Card style={{ padding: 14, gap: 12 }}>
          {loading ? (
            <View style={{ paddingVertical: 10, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
                Loading...
              </Text>
            </View>
          ) : (
            <>
              {/* Header row */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                  style={{
                    width: 74,
                    height: 74,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: theme.colors.emeraldBorder,
                    backgroundColor: "rgba(255,255,255,0.06)",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {avatarUrl ? (
                    <RNImage
                      source={{ uri: avatarUrl }}
                      style={{ width: "100%", height: "100%" }}
                      resizeMode="cover"
                    />
                  ) : (
                    <Ionicons name="business-outline" size={22} color={theme.colors.text} />
                  )}
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 20 }}>
                    {displayName}
                  </Text>

                  {!!subtitle && (
                    <Text style={{ color: theme.colors.faint, fontWeight: "900", marginTop: 4 }}>
                      {subtitle}
                    </Text>
                  )}

                  <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6, fontSize: 12 }}>
                    Store ID: {storeId.slice(0, 8)}â€¦{isMyStore ? " â€¢ (My active store)" : ""}
                  </Text>
                </View>

                <View
                  style={{
                    paddingHorizontal: 10,
                    height: 28,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>
                    {viewBadge}
                  </Text>
                </View>
              </View>

              {!!bio && (
                <Text style={{ color: theme.colors.text, fontWeight: "800", lineHeight: 20 }}>
                  {bio}
                </Text>
              )}

              {/* Stats row */}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 2 }}>
                <Stat label="Posts" value={postsCount} />
                <Stat label="Followers" value={followersCount} />
                <Stat label="Following" value={followingCount} />
              </View>

              {/* Quick Contact Actions */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={() => void openWhatsAppToStore()}
                  hitSlop={10}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      height: 44,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      borderColor: theme.colors.emeraldBorder,
                      backgroundColor: theme.colors.emeraldSoft,
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "row",
                      gap: 10,
                      opacity: pressed ? 0.92 : 1,
                    },
                  ]}
                >
                  <Ionicons name="logo-whatsapp" size={18} color={theme.colors.emerald} />
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>WhatsApp</Text>
                </Pressable>

                <Pressable
                  onPress={() => void callStorePhone()}
                  hitSlop={10}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      height: 44,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.12)",
                      backgroundColor: "rgba(255,255,255,0.06)",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "row",
                      gap: 10,
                      opacity: pressed ? 0.92 : 1,
                    },
                  ]}
                >
                  <Ionicons name="call-outline" size={18} color={theme.colors.text} />
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Call</Text>
                </Pressable>
              </View>

              {/* CTA buttons */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={toggleFollow}
                  disabled={followBusy || isMyStore}
                  hitSlop={10}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      height: 44,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      borderColor: isFollowing
                        ? theme.colors.emeraldBorder
                        : "rgba(255,255,255,0.12)",
                      backgroundColor: isFollowing
                        ? theme.colors.emeraldSoft
                        : "rgba(255,255,255,0.06)",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "row",
                      gap: 8,
                      opacity: isMyStore ? 0.6 : followBusy ? 0.6 : pressed ? 0.92 : 1,
                    },
                  ]}
                >
                  <Ionicons
                    name={isFollowing ? "checkmark-circle-outline" : "add-circle-outline"}
                    size={18}
                    color={isFollowing ? theme.colors.emerald : theme.colors.text}
                  />
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                    {isMyStore ? "My Store" : followBusy ? "..." : isFollowing ? "Following" : "Follow"}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={openMessage}
                  hitSlop={10}
                  style={({ pressed }) => [
                    {
                      height: 44,
                      paddingHorizontal: 14,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.12)",
                      backgroundColor: "rgba(255,255,255,0.06)",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "row",
                      gap: 8,
                      opacity: pressed ? 0.92 : 1,
                    },
                  ]}
                >
                  <Ionicons name="chatbubble-outline" size={18} color={theme.colors.text} />
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Message</Text>
                </Pressable>
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={openContact}
                  hitSlop={10}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      height: 44,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.12)",
                      backgroundColor: "rgba(255,255,255,0.06)",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "row",
                      gap: 8,
                      opacity: pressed ? 0.92 : 1,
                    },
                  ]}
                >
                  <Ionicons name="information-circle-outline" size={18} color={theme.colors.text} />
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Contact</Text>
                </Pressable>

                {/* âœ… PUBLIC Order */}
                <Pressable
                  onPress={openOrders}
                  hitSlop={10}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      height: 44,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      borderColor: theme.colors.emeraldBorder,
                      backgroundColor: theme.colors.emeraldSoft,
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "row",
                      gap: 8,
                      opacity: pressed ? 0.92 : 1,
                    },
                  ]}
                >
                  <Ionicons name="bag-handle-outline" size={18} color={theme.colors.emerald} />
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Order</Text>
                </Pressable>
              </View>

              {/* Staff tools */}
              {isMyStore && (
                <Pressable
                  onPress={openStoreInbox}
                  hitSlop={10}
                  style={({ pressed }) => [
                    {
                      height: 44,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.12)",
                      backgroundColor: "rgba(255,255,255,0.06)",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "row",
                      gap: 10,
                      opacity: pressed ? 0.92 : 1,
                    },
                  ]}
                >
                  <Ionicons name="mail-unread-outline" size={18} color={theme.colors.text} />
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Open Store Inbox</Text>
                </Pressable>
              )}

              {/* Tabs */}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 2 }}>
                {TabBtn("POSTS", "Posts", "images-outline")}
                {TabBtn("PRODUCTS", "Products", "pricetag-outline")}
                {TabBtn("ORDERS", "Orders", "receipt-outline")}
                {TabBtn("ABOUT", "About", "information-circle-outline")}
              </View>

              {/* POSTS */}
              {tab === "POSTS" && (
                <Card style={{ padding: 12, backgroundColor: theme.colors.surface2, borderColor: theme.colors.borderSoft }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Posts</Text>

                    <Pressable
                      onPress={() => {
                        setPostsCursor(null);
                        setPostsHasMore(true);
                        void fetchStorePosts("refresh");
                        void loadProfileAndStats();
                      }}
                      hitSlop={10}
                      style={({ pressed }) => [
                        {
                          height: 34,
                          paddingHorizontal: 12,
                          borderRadius: 999,
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
                      <Ionicons name="refresh" size={16} color={theme.colors.text} />
                      <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>Refresh</Text>
                    </Pressable>
                  </View>

                  <Text style={{ color: theme.colors.faint, fontWeight: "900", fontSize: 12, marginTop: 8 }}>
                    Tip: Long press post kupata â€œOrder from this Postâ€.
                  </Text>

                  {postsLoading ? (
                    <View style={{ paddingVertical: 16, alignItems: "center" }}>
                      <ActivityIndicator />
                      <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
                        Loading posts...
                      </Text>
                    </View>
                  ) : posts.length === 0 ? (
                    <View style={{ paddingTop: 10 }}>
                      <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                        Hii store bado haina posts.
                      </Text>

                      {isOwnerView && (
                        <Text style={{ color: theme.colors.faint, fontWeight: "900", marginTop: 10, fontSize: 12 }}>
                          OWNER/ADMIN: â€œEdit Store Profile/Catalogâ€ (A42+). Staff hawataruhusiwa.
                        </Text>
                      )}
                    </View>
                  ) : (
                    <View style={{ marginTop: 12 }}>
                      <FlatList
                        key={gridKey}
                        data={posts}
                        keyExtractor={(x) => String(x.post_id)}
                        renderItem={renderGridItem}
                        numColumns={3}
                        columnWrapperStyle={{ gap: 10, marginBottom: 10 }}
                        contentContainerStyle={{ gap: 0 }}
                        scrollEnabled={false}
                        onEndReachedThreshold={0.35}
                        onEndReached={() => {
                          if (postsLoadingMore || postsRefreshing || postsLoading) return;
                          if (!postsHasMore) return;
                          if (!postsCursor) return;
                          void fetchStorePosts("more");
                        }}
                        ListFooterComponent={
                          postsLoadingMore ? (
                            <View style={{ paddingVertical: 12, alignItems: "center" }}>
                              <ActivityIndicator />
                              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
                                Loading more...
                              </Text>
                            </View>
                          ) : !postsHasMore ? (
                            <Text style={{ color: theme.colors.faint, fontWeight: "900", textAlign: "center", marginTop: 8 }}>
                              â€” End â€”
                            </Text>
                          ) : null
                        }
                      />
                    </View>
                  )}
                </Card>
              )}

              {/* ABOUT */}
              {tab === "ABOUT" && (
                <Card style={{ padding: 12, backgroundColor: theme.colors.surface2, borderColor: theme.colors.borderSoft }}>
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>About</Text>

                  <View style={{ gap: 10, marginTop: 10 }}>
                    <Row label="Category" value={safeStr(category)} />
                    <Row label="Location" value={safeStr(location)} />

                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <Text style={{ color: theme.colors.faint, fontWeight: "900" }}>WhatsApp</Text>
                      <Pressable
                        onPress={() => void openWhatsAppToStore()}
                        hitSlop={10}
                        style={({ pressed }) => [
                          {
                            paddingHorizontal: 12,
                            height: 34,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: theme.colors.emeraldBorder,
                            backgroundColor: theme.colors.emeraldSoft,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            opacity: pressed ? 0.92 : 1,
                          },
                        ]}
                      >
                        <Ionicons name="logo-whatsapp" size={16} color={theme.colors.emerald} />
                        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>
                          {safeStr(profile?.whatsapp)}
                        </Text>
                      </Pressable>
                    </View>

                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <Text style={{ color: theme.colors.faint, fontWeight: "900" }}>Phone</Text>
                      <Pressable
                        onPress={() => void callStorePhone()}
                        hitSlop={10}
                        style={({ pressed }) => [
                          {
                            paddingHorizontal: 12,
                            height: 34,
                            borderRadius: 999,
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
                        <Ionicons name="call-outline" size={16} color={theme.colors.text} />
                        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>
                          {safeStr(profile?.phone)}
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  {isOwnerView ? (
                    <Text style={{ color: theme.colors.faint, fontWeight: "900", marginTop: 12, fontSize: 12 }}>
                      OWNER/ADMIN: â€œEdit Store Profileâ€ tutaongeza A42+ (staff hawataruhusiwa).
                    </Text>
                  ) : (
                    <Text style={{ color: theme.colors.faint, fontWeight: "900", marginTop: 12, fontSize: 12 }}>
                      PUBLIC: profile info ni read-only.
                    </Text>
                  )}
                </Card>
              )}

              {/* PRODUCTS */}
              {tab === "PRODUCTS" && (
                <Card style={{ padding: 12, backgroundColor: theme.colors.surface2, borderColor: theme.colors.borderSoft }}>
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Products</Text>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                    Angalia catalog ya store hii hapa.
                  </Text>

                  <Pressable
                    onPress={() => {
                      router.push({
                        pathname: "/(tabs)/club/store/[storeId]/products" as any,
                        params: { storeId },
                      } as any);
                    }}
                    hitSlop={10}
                    style={({ pressed }) => [
                      {
                        marginTop: 12,
                        height: 44,
                        borderRadius: theme.radius.pill,
                        borderWidth: 1,
                        borderColor: theme.colors.emeraldBorder,
                        backgroundColor: theme.colors.emeraldSoft,
                        alignItems: "center",
                        justifyContent: "center",
                        flexDirection: "row",
                        gap: 10,
                        opacity: pressed ? 0.92 : 1,
                      },
                    ]}
                  >
                    <Ionicons name="pricetag-outline" size={18} color={theme.colors.emerald} />
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Open Catalog</Text>
                  </Pressable>

                  {!isOwnerView && (
                    <Text style={{ color: theme.colors.faint, fontWeight: "900", marginTop: 10, fontSize: 12 }}>
                      NOTE: Staff hawaruhusiwi ku-edit catalog.
                    </Text>
                  )}
                </Card>
              )}

              {/* ORDERS */}
              {tab === "ORDERS" && (
                <Card style={{ padding: 12, backgroundColor: theme.colors.surface2, borderColor: theme.colors.borderSoft }}>
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Orders</Text>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                    Customer ana-create order kwa â€œOrderâ€ button. Store staff wana-manage orders kwenye Orders panel.
                  </Text>

                  {isMyStore ? (
                    <View style={{ marginTop: 12, gap: 10 }}>
                      {/* âœ… Staff manage */}
                      <Pressable
                        onPress={() => {
                          router.push({
                            pathname: "/(tabs)/club/store/orders/[storeId]" as any,
                            params: { storeId },
                          } as any);
                        }}
                        hitSlop={10}
                        style={({ pressed }) => [
                          {
                            height: 44,
                            borderRadius: theme.radius.pill,
                            borderWidth: 1,
                            borderColor: "rgba(255,255,255,0.12)",
                            backgroundColor: "rgba(255,255,255,0.06)",
                            alignItems: "center",
                            justifyContent: "center",
                            flexDirection: "row",
                            gap: 10,
                            opacity: pressed ? 0.92 : 1,
                          },
                        ]}
                      >
                        <Ionicons name="receipt-outline" size={18} color={theme.colors.text} />
                        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Manage Store Orders</Text>
                      </Pressable>

                      {/* âœ… IMPORTANT: Keep Order Form reachable even on My Store */}
                      <Pressable
                        onPress={openOrders}
                        hitSlop={10}
                        style={({ pressed }) => [
                          {
                            height: 44,
                            borderRadius: theme.radius.pill,
                            borderWidth: 1,
                            borderColor: theme.colors.emeraldBorder,
                            backgroundColor: theme.colors.emeraldSoft,
                            alignItems: "center",
                            justifyContent: "center",
                            flexDirection: "row",
                            gap: 10,
                            opacity: pressed ? 0.92 : 1,
                          },
                        ]}
                      >
                        <Ionicons name="bag-handle-outline" size={18} color={theme.colors.emerald} />
                        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Create Order (Form)</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={{ marginTop: 10, gap: 10 }}>
                      <Text style={{ color: theme.colors.faint, fontWeight: "900", fontSize: 12 }}>
                        PUBLIC: Kwa sasa management ni ya store staff. Lakini unaweza ku-create oda.
                      </Text>

                      <Pressable
                        onPress={openOrders}
                        hitSlop={10}
                        style={({ pressed }) => [
                          {
                            height: 44,
                            borderRadius: theme.radius.pill,
                            borderWidth: 1,
                            borderColor: theme.colors.emeraldBorder,
                            backgroundColor: theme.colors.emeraldSoft,
                            alignItems: "center",
                            justifyContent: "center",
                            flexDirection: "row",
                            gap: 10,
                            opacity: pressed ? 0.92 : 1,
                          },
                        ]}
                      >
                        <Ionicons name="bag-handle-outline" size={18} color={theme.colors.emerald} />
                        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Create Order</Text>
                      </Pressable>
                    </View>
                  )}
                </Card>
              )}
            </>
          )}
        </Card>

        <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 12, lineHeight: 16 }}>
          NOTE: Staff wanaruhusiwa ku-manage posts/inbox/orders, lakini hawaruhusiwi ku-edit store account/profile/catalog.
        </Text>
      </View>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flex: 1,
        paddingVertical: 10,
        borderRadius: theme.radius.xl,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(255,255,255,0.04)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
        {value}
      </Text>
      <Text style={{ color: theme.colors.faint, fontWeight: "900", fontSize: 11, marginTop: 4 }}>
        {label}
      </Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
      <Text style={{ color: theme.colors.faint, fontWeight: "900" }}>{label}</Text>
      <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{value}</Text>
    </View>
  );
}
