// app/(tabs)/club/[postId]/comments.tsx

import { supabase } from "@/src/supabase/supabaseClient";
import { Card } from "@/src/ui/Card";
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

type ReplyTarget = {
  commentId: string;
  snippet: string;
};

function snippetOf(body: string, max = 80) {
  const s = String(body ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export default function ClubCommentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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

  const sendingRef = useRef(false);

  // ✅ Reply state
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);

  const goBack = useCallback(() => {
    router.back();
  }, [router]);

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

        const { data, error } = await supabase.rpc("get_club_comments", args);
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

    setReplyTo({ commentId: id, snippet: snip || "Comment" });

    // focus UX: usivunje button taps
    setTimeout(() => {
      // keep keyboard as is; user can type immediately
    }, 0);
  }, []);

  const cancelReply = useCallback(() => {
    setReplyTo(null);
  }, []);

  const sendComment = useCallback(async () => {
    if (!postId) return;

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
      };

      const { error } = await supabase.rpc("create_club_comment", payload);
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
  }, [fetchPage, postId, replyTo, text]);

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
      <View style={{ paddingTop: headerTopPad, paddingBottom: 10, gap: 10 }}>
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
          <Card
            style={{
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
  }, [caption, err, goBack, insets.top]);

  const renderCommentCard = useCallback(
    (item: CommentRow, depth: number) => {
      const id = String(item.comment_id ?? item.id ?? "");
      const body = safeStr(item.body, "");
      const createdAt = item.created_at ? String(item.created_at) : null;

      const padLeft = Math.min(28, Math.max(0, depth) * 14);

      return (
        <View key={`${id}:${depth}`} style={{ paddingLeft: padLeft }}>
          <Card style={{ marginBottom: 10, padding: 12, gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
              <Text style={{ color: theme.colors.faint, fontWeight: "900", fontSize: 12 }}>
                {fmtTimeAgo(createdAt)}
              </Text>

              <Pressable
                onPress={() => openReply(item)}
                hitSlop={10}
                style={({ pressed }) => [
                  {
                    height: 28,
                    paddingHorizontal: 10,
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
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>
                  Reply
                </Text>
              </Pressable>
            </View>

            <Text style={{ color: theme.colors.text, fontWeight: "800", lineHeight: 20 }}>
              {body}
            </Text>
          </Card>
        </View>
      );
    },
    [openReply]
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
      <View style={{ paddingTop: 8 }}>
        <Card style={{ padding: 14 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
            No comments yet
          </Text>
          <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
            Kuwa wa kwanza ku-comment.
          </Text>
        </Card>
      </View>
    );
  }, []);

  const FooterComposer = useMemo(() => {
    return (
      <View style={{ paddingTop: 10, paddingBottom: Math.max(insets.bottom, 10) + 16 }}>
        <Card style={{ padding: 14, gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
            {replyTo ? "Reply" : "Add comment"}
          </Text>

          {!!replyTo && (
            <View
              style={{
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.28)",
                backgroundColor: "rgba(16,185,129,0.10)",
                borderRadius: theme.radius.xl,
                paddingHorizontal: 12,
                paddingVertical: 10,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.emerald, fontWeight: "900", fontSize: 12 }}>
                  Replying to
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
                style={({ pressed }) => [
                  {
                    width: 36,
                    height: 36,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.14)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.92 : 1,
                  },
                ]}
              >
                <Ionicons name="close" size={18} color={theme.colors.text} />
              </Pressable>
            </View>
          )}

          <View
            style={{
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              borderRadius: theme.radius.xl,
              backgroundColor: "rgba(255,255,255,0.05)",
              paddingHorizontal: 12,
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
              // ✅ Do not block button taps; FlatList handles taps now.
              blurOnSubmit={false}
            />
          </View>

          <Pressable
            onPress={sendComment}
            disabled={sending || !String(text).trim().length}
            hitSlop={12}
            style={({ pressed }) => [
              {
                height: 52,
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
        </Card>
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