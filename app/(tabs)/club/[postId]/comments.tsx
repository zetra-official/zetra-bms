// app/(tabs)/club/[postId]/comments.tsx

import { supabase } from "@/src/supabase/supabaseClient";
import { useOrg } from "@/src/context/OrgContext";

import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Keyboard, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type CommentRow = Record<string, any>;

function safeStr(x: any, fallback = "—") {
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

function getCommentDisplayName(item: CommentRow, fallback = "Store") {
  return safeStr(
    item.store_profile_name ??
      item.store_profile_display_name ??
      item.club_store_profile_name ??
      item.club_profile_name ??
      item.store_display_name ??
      item.store_public_name ??
      item.store_name ??
      item.author_store_name ??
      item.author_name ??
      item.user_name ??
      item.full_name ??
      item.customer_name,
    fallback
  );
}

type ReplyTarget = {
  commentId: string;
  snippet: string;
  authorName: string;
};

function snippetOf(body: string, max = 80) {
  const s = String(body ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function hasStoreLink(item: CommentRow) {
  return String(item?.store_id ?? "").trim().length > 0;
}

export default function ClubCommentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeStoreId } = useOrg();

  const params = useLocalSearchParams<{
    postId: string;
    caption?: string;
  }>();

  const postId = String(params.postId ?? "").trim();
  const caption = String(params.caption ?? "").trim();

  const PAGE = 30;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const [viewerUserId, setViewerUserId] = useState<string>("");
  const [activeStoreName, setActiveStoreName] = useState<string>("");

  const sendingRef = useRef(false);

  // ✅ Reply state
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);

 const goBack = useCallback(() => {
    router.back();
  }, [router]);

  const openStore = useCallback(
    (storeId: string) => {
      const sid = String(storeId ?? "").trim();
      if (!sid) return;

      router.push({
        pathname: "/(tabs)/club/store/[storeId]" as any,
        params: { storeId: sid },
      } as any);
    },
    [router]
  );

  const fetchPage = useCallback(
    async (mode: "boot" | "refresh" | "more") => {
      if (!postId) {
        setErr("Missing postId");
        setLoading(false);
        return;
      }

      setErr(null);

      if (mode === "boot") setLoading(true);
      if (mode === "refresh") setRefreshing(true);
      if (mode === "more") setLoadingMore(true);

      try {
        const args: any = { p_post_id: postId, p_limit: PAGE };
        if (mode === "more" && cursor) args.p_before = cursor;

        const { data, error } = await supabase.rpc("get_club_comments_v3", args);
        if (error) throw error;

        const list = (data ?? []) as CommentRow[];

        if (mode === "boot" || mode === "refresh") {
          setRows(list);
        } else {
          setRows((prev) => {
            const seen = new Set(prev.map((x) => String(x.comment_id ?? x.id ?? "")));
            const merged = [...prev];
            for (const r of list) {
              const id = String(r.comment_id ?? r.id ?? "");
              if (!id) continue;
              if (seen.has(id)) continue;
              merged.push(r);
            }
            return merged;
          });
        }

        const last = list[list.length - 1];
        const nextCursor = last?.created_at ? String(last.created_at) : null;
        setCursor(nextCursor);

        setHasMore(list.length >= PAGE);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load comments");
        if (mode === "boot" || mode === "refresh") setRows([]);
      } finally {
        if (mode === "boot") setLoading(false);
        if (mode === "refresh") setRefreshing(false);
        if (mode === "more") setLoadingMore(false);
      }
    },
    [PAGE, cursor, postId]
  );

  useEffect(() => {
    void fetchPage("boot");
  }, [fetchPage]);

  useEffect(() => {
    let alive = true;

    async function loadViewerContext() {
      try {
        const [{ data: authData }, storeRes] = await Promise.all([
          supabase.auth.getUser(),
          activeStoreId
            ? supabase.from("stores").select("name").eq("id", activeStoreId).maybeSingle()
            : Promise.resolve({ data: null, error: null } as any),
        ]);

        if (!alive) return;

        const uid = String(authData?.user?.id ?? "").trim();
        const sname = String(storeRes?.data?.name ?? "").trim();

        setViewerUserId(uid);
        setActiveStoreName(sname);
      } catch {
        if (!alive) return;
        setViewerUserId("");
        setActiveStoreName("");
      }
    }

    void loadViewerContext();

    return () => {
      alive = false;
    };
  }, [activeStoreId]);

  const onRefresh = useCallback(() => {
    setCursor(null);
    setHasMore(true);
    void fetchPage("refresh");
  }, [fetchPage]);

  const onEndReached = useCallback(() => {
    if (loading || refreshing || loadingMore) return;
    if (!hasMore) return;
    if (!cursor) return;
    void fetchPage("more");
  }, [cursor, fetchPage, hasMore, loading, loadingMore, refreshing]);

  const openReply = useCallback((item: CommentRow) => {
    const id = String(item.comment_id ?? item.id ?? "").trim();
    if (!id) return;

    const body = String(item.body ?? "").trim();
    const snip = snippetOf(body, 80);

    const backendAuthor = getCommentDisplayName(item, "");
    const isMine = String(item.profile_id ?? "").trim() === viewerUserId;
    const authorName =
      backendAuthor || (isMine ? safeStr(activeStoreName, "My Store") : "Store");

    setReplyTo({
      commentId: id,
      snippet: snip || "Comment",
      authorName,
    });

    // focus UX: usivunje button taps
    setTimeout(() => {
      // keep keyboard as is; user can type immediately
    }, 0);
  }, [activeStoreName, viewerUserId]);

  const cancelReply = useCallback(() => {
    setReplyTo(null);
  }, [activeStoreName, viewerUserId]);

  const sendComment = useCallback(async () => {
    if (!postId) return;

    if (!activeStoreId) {
      setErr("Chagua store kwanza kabla ya ku-comment");
      return;
    }

    const body = String(text ?? "").trim();
    if (!body.length) {
      setErr("Andika comment kwanza");
      return;
    }

    if (sendingRef.current) return;
    sendingRef.current = true;

    setSending(true);
    setErr(null);

    try {
      // ✅ important: do NOT rely on overloaded function.
      // Always call the 3-args signature by ALWAYS passing p_parent_comment_id (null ok).
      const payload: any = {
        p_post_id: postId,
        p_body: body,
        p_parent_comment_id: replyTo?.commentId ? replyTo.commentId : null,
        p_store_id: activeStoreId,
      };

      const { error } = await supabase.rpc("create_club_comment_v2", payload);
      if (error) throw error;

      setText("");
      setReplyTo(null);

      setCursor(null);
      setHasMore(true);

      // Optional: dismiss after success only (nice UX)
      Keyboard.dismiss();

      await fetchPage("refresh");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to send comment");
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  }, [activeStoreId, fetchPage, postId, replyTo, text]);

  // ✅ Build nested tree (roots + children)
  const nestedData = useMemo(() => {
    const children = new Map<string, CommentRow[]>();
    const roots: CommentRow[] = [];

    for (const r of rows) {
      const id = String(r.comment_id ?? r.id ?? "").trim();
      if (!id) continue;

      const parentId = String(r.parent_comment_id ?? "").trim();
      if (parentId) {
        const arr = children.get(parentId) ?? [];
        arr.push(r);
        children.set(parentId, arr);
      } else {
        roots.push(r);
      }
    }

    const sortDesc = (a: CommentRow, b: CommentRow) => {
      const ta = new Date(String(a.created_at ?? "")).getTime();
      const tb = new Date(String(b.created_at ?? "")).getTime();
      return (tb || 0) - (ta || 0);
    };

    roots.sort(sortDesc);
    for (const [k, arr] of children.entries()) {
      arr.sort(sortDesc);
      children.set(k, arr);
    }

    return { roots, children };
  }, [rows]);

  const Header = useMemo(() => {
    const headerTopPad = Math.max(insets.top, 10) + 6;

    return (
      <View
        style={{
          paddingTop: headerTopPad,
          paddingBottom: 12,
          gap: 10,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.06)",
          marginBottom: 2,
        }}
      >
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
                width: 40,
                height: 40,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.25)",
                backgroundColor: "rgba(16,185,129,0.10)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="chatbubble-outline" size={20} color={theme.colors.emerald} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 20 }}>
                Comments
              </Text>

              {!!caption && (
                <Text
                  style={{
                    color: theme.colors.muted,
                    fontWeight: "800",
                    marginTop: 2,
                    fontSize: 12,
                    lineHeight: 16,
                  }}
                  numberOfLines={2}
                >
                  {caption}
                </Text>
              )}
            </View>
          </View>

          <Pressable
            onPress={goBack}
            hitSlop={10}
            style={({ pressed }) => [
              {
                paddingHorizontal: 14,
                height: 40,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
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

        {!!err && (
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.colors.dangerBorder,
              backgroundColor: theme.colors.dangerSoft,
              padding: 12,
              borderRadius: 14,
            }}
          >
            <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>{err}</Text>
          </View>
        )}
      </View>
    );
  }, [caption, err, goBack, insets.top]);

  const renderCommentCard = useCallback(
    (item: CommentRow, depth: number) => {
      const id = String(item.comment_id ?? item.id ?? "");
      const body = safeStr(item.body, "");
      const createdAt = item.created_at ? String(item.created_at) : null;

      const backendAuthor = getCommentDisplayName(item, "");
      const isMine = String(item.profile_id ?? "").trim() === viewerUserId;

      const author =
        backendAuthor ||
        (isMine ? safeStr(activeStoreName, depth > 0 ? "My Store Reply" : "My Store") : "") ||
        (depth > 0 ? "Store Reply" : "Store");

      const likesCount = Number(item.likes_count ?? item.like_count ?? 0) || 0;
      const repliesCount = Number(item.replies_count ?? item.reply_count ?? 0) || 0;

      const padLeft = Math.min(40, Math.max(0, depth) * 22);

      return (
        <View
          key={`${id}:${depth}`}
          style={{
            paddingLeft: padLeft,
            paddingTop: 10,
            paddingBottom: 2,
            borderBottomWidth: depth === 0 ? 1 : 0,
            borderBottomColor: "rgba(255,255,255,0.06)",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                backgroundColor: depth > 0 ? "rgba(255,255,255,0.06)" : theme.colors.emeraldSoft,
                borderWidth: 1,
                borderColor: depth > 0 ? "rgba(255,255,255,0.10)" : theme.colors.emeraldBorder,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 2,
              }}
            >
              <Ionicons
                name={depth > 0 ? "storefront-outline" : "business-outline"}
                size={16}
                color={depth > 0 ? theme.colors.text : theme.colors.emerald}
              />
            </View>

            <View style={{ flex: 1, paddingRight: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
                <Pressable
                  onPress={() => {
                    const sid = String(item.store_id ?? "").trim();
                    if (!sid) return;
                    openStore(sid);
                  }}
                  disabled={!hasStoreLink(item)}
                  hitSlop={12}
                  pressRetentionOffset={12}
                  style={({ pressed }) => [
                    {
                      flexDirection: "row",
                      alignItems: "center",
                      borderRadius: 10,
                      paddingHorizontal: hasStoreLink(item) ? 6 : 0,
                      paddingVertical: hasStoreLink(item) ? 3 : 0,
                      marginLeft: hasStoreLink(item) ? -6 : 0,
                      backgroundColor:
                        hasStoreLink(item) && pressed ? "rgba(16,185,129,0.10)" : "transparent",
                      opacity: pressed ? 0.82 : 1,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: hasStoreLink(item) ? theme.colors.emerald : theme.colors.text,
                      fontWeight: "900",
                      fontSize: 14,
                    }}
                  >
                    {author}
                  </Text>

                  {hasStoreLink(item) ? (
                    <Ionicons
                      name="chevron-forward"
                      size={12}
                      color={theme.colors.emerald}
                      style={{ marginLeft: 3, marginTop: 1 }}
                    />
                  ) : null}
                </Pressable>

                <Text
                  style={{
                    color: theme.colors.faint,
                    fontWeight: "800",
                    fontSize: 12,
                    marginLeft: 8,
                  }}
                >
                  {fmtTimeAgo(createdAt)}
                </Text>
              </View>

              <Text
                style={{
                  color: theme.colors.text,
                  fontWeight: "800",
                  fontSize: 15,
                  lineHeight: 22,
                  marginTop: 3,
                }}
              >
                {body}
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 16,
                  marginTop: 8,
                  paddingBottom: 4,
                }}
              >
                <Pressable
                  hitSlop={10}
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={{ color: theme.colors.muted, fontWeight: "900", fontSize: 12 }}>
                    Like
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => openReply(item)}
                  hitSlop={10}
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={{ color: theme.colors.muted, fontWeight: "900", fontSize: 12 }}>
                    Reply
                  </Text>
                </Pressable>

                {likesCount > 0 ? (
                  <Text style={{ color: theme.colors.faint, fontWeight: "900", fontSize: 12 }}>
                    {likesCount} likes
                  </Text>
                ) : null}

                {repliesCount > 0 && depth === 0 ? (
                  <Text style={{ color: theme.colors.faint, fontWeight: "900", fontSize: 12 }}>
                    {repliesCount} replies
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        </View>
      );
    },
    [activeStoreName, openReply, openStore, viewerUserId]
  );

  const renderItem = useCallback(
    ({ item }: { item: CommentRow }) => {
      const id = String(item.comment_id ?? item.id ?? "").trim();
      if (!id) return null;

      const blocks: React.ReactNode[] = [];
      blocks.push(renderCommentCard(item, 0));

      const kids = nestedData.children.get(id) ?? [];
      for (const child of kids) {
        const cid = String(child.comment_id ?? child.id ?? "").trim();
        if (!cid) continue;
        blocks.push(renderCommentCard(child, 1));
      }

      return <View>{blocks}</View>;
    },
    [nestedData.children, renderCommentCard]
  );

  const EmptyState = useMemo(() => {
    return (
      <View
        style={{
          paddingTop: 10,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.06)",
        }}
      >
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
          No comments yet
        </Text>
        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
          Kuwa wa kwanza ku-comment.
        </Text>
      </View>
    );
  }, []);

  const FooterComposer = useMemo(() => {
    return (
      <View
        style={{
          paddingTop: 14,
          paddingBottom: Math.max(insets.bottom, 10) + 16,
          borderTopWidth: 1,
          borderTopColor: "rgba(255,255,255,0.06)",
        }}
      >
        <Text style={{ color: theme.colors.text, fontWeight: "900", marginBottom: 10 }}>
          {replyTo ? "Reply" : "Add comment"}
        </Text>

        {!!replyTo && (
          <View
            style={{
              borderWidth: 1,
              borderColor: "rgba(16,185,129,0.28)",
              backgroundColor: "rgba(16,185,129,0.10)",
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 10,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.emerald, fontWeight: "900", fontSize: 12 }}>
                Replying to {replyTo.authorName}
              </Text>
              <Text
                style={{ color: theme.colors.text, fontWeight: "800", marginTop: 2 }}
                numberOfLines={2}
              >
                {replyTo.snippet}
              </Text>
            </View>

            <Pressable
              onPress={cancelReply}
              hitSlop={10}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1, padding: 4 }]}
            >
              <Ionicons name="close" size={18} color={theme.colors.text} />
            </Pressable>
          </View>
        )}

        <View
          style={{
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            borderRadius: 18,
            backgroundColor: "rgba(255,255,255,0.05)",
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={replyTo ? "Andika reply..." : "Andika comment..."}
            placeholderTextColor={theme.colors.faint}
            style={{
              color: theme.colors.text,
              fontWeight: "800",
              minHeight: 44,
            }}
            multiline
            blurOnSubmit={false}
          />
        </View>

        <Pressable
          onPress={sendComment}
          disabled={sending || !String(text).trim().length}
          hitSlop={12}
          style={({ pressed }) => [
            {
              marginTop: 12,
              height: 50,
              borderRadius: theme.radius.pill,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: theme.colors.emeraldBorder,
              backgroundColor: theme.colors.emeraldSoft,
              opacity: sending || !String(text).trim().length ? 0.55 : pressed ? 0.92 : 1,
            },
          ]}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
            {sending ? "Sending..." : replyTo ? "Send Reply" : "Send Comment"}
          </Text>
        </Pressable>
      </View>
    );
  }, [cancelReply, insets.bottom, replyTo, sendComment, sending, text]);

  return (
    <Screen scroll={false} contentStyle={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }}>
      <FlatList
        data={loading ? [] : nestedData.roots}
        keyExtractor={(item, idx) => String(item.comment_id ?? item.id ?? idx)}
        renderItem={renderItem}
        ListHeaderComponent={Header}
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReachedThreshold={0.35}
        onEndReached={onEndReached}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.page,
          paddingBottom: 0,
          paddingTop: 0,
        }}
        ListEmptyComponent={!loading ? EmptyState : null}
        ListFooterComponent={
          <>
            {loadingMore ? (
              <View style={{ alignItems: "center", paddingVertical: 12 }}>
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Loading more...
                </Text>
              </View>
            ) : !hasMore && rows.length > 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 12 }}>
                <Text style={{ color: theme.colors.faint, fontWeight: "800" }}>
                  End of comments
                </Text>
              </View>
            ) : null}
            {FooterComposer}
          </>
        }
        // ✅ KEY FIX: button works on FIRST tap even if keyboard is open
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </Screen>
  );
}