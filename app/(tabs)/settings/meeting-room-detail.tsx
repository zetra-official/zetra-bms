import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Screen } from "@/src/ui/Screen";
import { UI } from "@/src/ui/theme";
import { supabase } from "@/src/supabase/supabaseClient";
import { useOrg } from "@/src/context/OrgContext";

type ReactionKey = "LOVE" | "LIKE" | "FIRE";

type MessageRow = {
  id: string;
  sender_membership_id?: string | null;
  sender_user_id?: string | null;
  sender_display_name?: string | null;
  message_text?: string | null;
  attachment_url?: string | null;
  created_at?: string | null;
  reply_to_message_id?: string | null;
  replied_message_text?: string | null;

  love_count?: number | null;
  like_count?: number | null;
  fire_count?: number | null;

  my_love_reacted?: boolean | null;
  my_like_reacted?: boolean | null;
  my_fire_reacted?: boolean | null;
};

type RoomMetaRow = {
  room_id: string;
  organization_id?: string | null;
  room_name: string;
  description?: string | null;
  is_archived?: boolean | null;
  my_role?: string | null;
  joined_at?: string | null;
  members_count?: number | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
};

type PendingInviteRow = {
  invite_id?: string | null;
  id?: string | null;
  room_id?: string | null;
  organization_id?: string | null;
  email?: string | null;
  member_type?: string | null;
  role?: string | null;
  status?: string | null;
  invited_by?: string | null;
  created_at?: string | null;
  invited_user_id?: string | null;
  accepted_at?: string | null;
  cancelled_at?: string | null;
};

type ReplyTarget = {
  id: string;
  text: string;
  mine: boolean;
};

type MemberRow = {
  membership_id?: string | null;
  user_id?: string | null;
  full_name?: string | null;
  role?: string | null;
  joined_at?: string | null;
};

type MentionCandidate = {
  userId: string;
  membershipId: string;
  fullName: string;
  role: string;
};

type ActionMessage = {
  id: string;
  text: string;
  mine: boolean;
  myLoveReacted: boolean;
  myLikeReacted: boolean;
  myFireReacted: boolean;
};

type TypingRow = {
  user_id?: string | null;
  full_name?: string | null;
  typing_started_at?: string | null;
};

function clean(v: any) {
  return String(v ?? "").trim();
}

function toInt(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function shortText(v: any, max = 80) {
  const s = clean(v);
  if (!s) return "Message";
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function formatMsgTime(ts?: string | null) {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatMsgDay(ts?: string | null) {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleDateString();
  } catch {
    return "";
  }
}

function formatDateTime(ts?: string | null) {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return "";
  }
}

function sameDay(a?: string | null, b?: string | null) {
  if (!a || !b) return false;
  try {
    const da = new Date(a);
    const db = new Date(b);
    return (
      da.getFullYear() === db.getFullYear() &&
      da.getMonth() === db.getMonth() &&
      da.getDate() === db.getDate()
    );
  } catch {
    return false;
  }
}

function niceRole(v?: string | null) {
  const x = clean(v).toUpperCase();
  return x || "MEMBER";
}

function niceMemberType(v?: string | null) {
  const x = clean(v).toUpperCase();
  return x || "INTERNAL";
}

function normalizeMentionName(v: string) {
  return clean(v).replace(/\s+/g, "_");
}

function normalizeMentionKey(v: string) {
  return normalizeMentionName(v).toLowerCase();
}

function extractMentionQuery(input: string) {
  const value = String(input ?? "");
  const match = value.match(/(^|\s)@([A-Za-z0-9._-]*)$/);
  if (!match) return null;

  return {
    raw: match[0],
    query: clean(match[2]).toLowerCase(),
  };
}

function extractMentionTokens(input: string) {
  const value = String(input ?? "");
  const matches = value.match(/@[A-Za-z0-9._-]+/g) || [];
  return Array.from(
    new Set(
      matches.map((m) => normalizeMentionKey(m.replace(/^@/, ""))).filter(Boolean)
    )
  );
}

function displayMemberName(v?: string | null, fallbackId?: string | null) {
  const name = clean(v);
  if (name) return name;

  const fid = clean(fallbackId).replace(/-/g, "").slice(0, 6).toUpperCase();
  if (fid) return `USER_${fid}`;
  return "Member";
}

function ReactionChip({
  emoji,
  count,
  active,
  onPress,
}: {
  emoji: string;
  count: number;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        minHeight: 28,
        paddingHorizontal: 10,
        borderRadius: 999,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderWidth: 1,
        borderColor: active ? UI.emeraldBorder : "rgba(255,255,255,0.10)",
        backgroundColor: active
          ? "rgba(16,185,129,0.12)"
          : "rgba(255,255,255,0.05)",
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <Text style={{ fontSize: 12 }}>{emoji}</Text>
      <Text
        style={{
          color: UI.text,
          fontWeight: "900",
          fontSize: 12,
        }}
      >
        {count}
      </Text>
    </Pressable>
  );
}

function MessageTextWithMentions({
  text,
}: {
  text: string;
}) {
  const value = String(text ?? "");
  const parts = value.split(/(@[A-Za-z0-9._-]+)/g);

  return (
    <Text
      style={{
        color: UI.text,
        fontWeight: "800",
        fontSize: 15,
        lineHeight: 21,
      }}
    >
      {parts.map((part, idx) => {
        const isMention = /^@[A-Za-z0-9._-]+$/.test(part);

        if (isMention) {
          return (
            <Text
              key={`${part}-${idx}`}
              style={{
                color: "#D7B56D",
                fontWeight: "900",
              }}
            >
              {part}
            </Text>
          );
        }

        return (
          <Text
            key={`${part}-${idx}`}
            style={{
              color: UI.text,
              fontWeight: "800",
            }}
          >
            {part}
          </Text>
        );
      })}
    </Text>
  );
}

function SwipeReplyWrapper({
  mine,
  onReply,
  children,
}: {
  mine: boolean;
  onReply: () => void;
  children: React.ReactNode;
}) {
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        return Math.abs(gesture.dx) > 12 && Math.abs(gesture.dy) < 10;
      },
      onPanResponderMove: (_, gesture) => {
        const dx = mine
          ? Math.max(-90, Math.min(0, gesture.dx))
          : Math.max(0, Math.min(90, gesture.dx));

        translateX.setValue(dx);
      },
      onPanResponderRelease: (_, gesture) => {
        const fired = mine ? gesture.dx <= -55 : gesture.dx >= 55;

        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 6,
        }).start();

        if (fired) {
          onReply();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 6,
        }).start();
      },
    })
  ).current;

  return (
    <View style={{ position: "relative" }}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: "42%",
          [mine ? "right" : "left"]: 8,
          zIndex: 0,
        }}
      >
        <Ionicons name="return-up-back-outline" size={18} color={UI.emerald} />
      </View>

      <Animated.View
        {...panResponder.panHandlers}
        style={{
          transform: [{ translateX }],
          zIndex: 1,
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

export default function MeetingRoomDetailScreen() {
  const router = useRouter();

  const goBackSafe = React.useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.push("/(tabs)/settings/meeting-room");
  }, [router]);

  const params = useLocalSearchParams<{
    roomId?: string;
    room_id?: string;
    roomName?: string;
    room_name?: string;
  }>();
  useOrg();

  const roomId = clean(params.roomId || params.room_id);
  const initialRoomName = clean(params.roomName || params.room_name);

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [roomName, setRoomName] = useState(initialRoomName || "Room Chat");
  const [roomDescription, setRoomDescription] = useState<string>("");
  const [roomRole, setRoomRole] = useState<string>("MEMBER");

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInviteRow[]>([]);
  const [roomMembers, setRoomMembers] = useState<MentionCandidate[]>([]);
  const [typingMembers, setTypingMembers] = useState<TypingRow[]>([]);

  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [actionMessage, setActionMessage] = useState<ActionMessage | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [inviteMemberType, setInviteMemberType] = useState<"INTERNAL" | "EXTERNAL">("INTERNAL");

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [reactingId, setReactingId] = useState<string | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [typingLoading, setTypingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<FlatList<MessageRow>>(null);
  const typingIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenMentionIdsRef = useRef<Set<string>>(new Set());

  const canManageMembers = useMemo(() => {
    const rr = clean(roomRole).toUpperCase();
    return rr === "OWNER" || rr === "ADMIN";
  }, [roomRole]);

  const mentionQuery = useMemo(() => extractMentionQuery(text), [text]);

  const filteredMentionMembers = useMemo(() => {
    if (!mentionQuery) return [];

    const q = clean(mentionQuery.query).toLowerCase();

    const base = roomMembers.filter((m) => clean(m.fullName));
    if (!q) return base.slice(0, 6);

    return base
      .filter((m) => {
        const name = clean(m.fullName).toLowerCase();
        const role = clean(m.role).toLowerCase();
        return name.includes(q) || role.includes(q);
      })
      .slice(0, 6);
  }, [mentionQuery, roomMembers]);

  const showMentionBox =
    !!mentionQuery && filteredMentionMembers.length > 0 && !inviteOpen;

  const messageIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    messages.forEach((m, idx) => {
      const id = clean(m.id);
      if (id) map.set(id, idx);
    });
    return map;
  }, [messages]);

  const myMentionKeys = useMemo(() => {
    const mine = roomMembers.filter((m) => clean(m.userId) === clean(myUserId));
    const keys = new Set<string>();

    mine.forEach((m) => {
      const n = normalizeMentionKey(m.fullName);
      if (n) keys.add(n);
    });

    return keys;
  }, [roomMembers, myUserId]);

  const typingLabel = useMemo(() => {
    const others = typingMembers
      .filter((m) => clean(m.user_id) !== clean(myUserId))
      .map((m) => displayMemberName(m.full_name, m.user_id));

    if (others.length === 0) return "";
    if (others.length === 1) return `${others[0]} is typing...`;
    if (others.length === 2) return `${others[0]} and ${others[1]} are typing...`;
    return `${others[0]} and ${others.length - 1} others are typing...`;
  }, [typingMembers, myUserId]);

  const loadMyUser = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) return null;
      const uid = clean(data?.user?.id);
      setMyUserId(uid || null);
      return uid || null;
    } catch {
      return null;
    }
  }, []);

  const loadRoomMeta = useCallback(async () => {
    if (!roomId) return;

    const joinedRes = await supabase.rpc("get_my_joined_meeting_rooms_v2");
    const joinedData: any[] = Array.isArray(joinedRes.data) ? joinedRes.data : [];

    if (!joinedRes.error && joinedData.length > 0) {
      const found = joinedData.find((r: any) => clean(r?.room_id) === roomId);

      if (found) {
        setRoomName(clean(found?.room_name) || initialRoomName || "Room Chat");
        setRoomDescription(clean(found?.description));
        setRoomRole(niceRole(found?.my_role));
        return;
      }
    }

    const fallbackRes = await supabase.rpc("get_my_meeting_rooms_v2", {
      p_org_id: null,
    } as any);

    if (fallbackRes.error || !Array.isArray(fallbackRes.data)) return;

    const foundFallback = (fallbackRes.data as RoomMetaRow[]).find(
      (r) => clean(r.room_id) === roomId
    );

    if (!foundFallback) return;

    setRoomName(clean(foundFallback.room_name) || initialRoomName || "Room Chat");
    setRoomDescription(clean(foundFallback.description));
    setRoomRole(niceRole(foundFallback.my_role));
  }, [roomId, initialRoomName]);

  const loadMessages = useCallback(async () => {
    if (!roomId) {
      setError("Room ID missing.");
      setMessages([]);
      return;
    }

    setError(null);

    const { data, error } = await supabase.rpc("get_meeting_room_messages_v5", {
      p_room_id: roomId,
    } as any);

    if (error) {
      setError(error.message ?? "Failed to load messages.");
      setMessages([]);
      return;
    }

    const rows = Array.isArray(data) ? (data as MessageRow[]) : [];

    rows.sort((a, b) => {
      const ta = new Date(a.created_at ?? 0).getTime();
      const tb = new Date(b.created_at ?? 0).getTime();
      return ta - tb;
    });

    setMessages(rows);
  }, [roomId]);

  const loadRoomMembers = useCallback(async () => {
    if (!roomId) {
      setRoomMembers([]);
      return;
    }

    setMembersLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_meeting_room_members_v2", {
        p_room_id: roomId,
      } as any);

      if (error) throw error;

      const rows = Array.isArray(data) ? (data as MemberRow[]) : [];

      const mapped: MentionCandidate[] = rows
        .map((r) => ({
          userId: clean(r.user_id),
          membershipId: clean(r.membership_id),
          fullName: displayMemberName(r.full_name, r.user_id),
          role: niceRole(r.role),
        }))
        .filter((r) => !!r.userId || !!r.membershipId);

      setRoomMembers(mapped);
    } catch {
      setRoomMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, [roomId]);

  const loadTypingMembers = useCallback(async () => {
    if (!roomId) {
      setTypingMembers([]);
      return;
    }

    setTypingLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_meeting_room_typing_members_v1", {
        p_room_id: roomId,
      } as any);

      if (error) throw error;

      const rows = Array.isArray(data) ? (data as TypingRow[]) : [];
      setTypingMembers(rows);
    } catch {
      setTypingMembers([]);
    } finally {
      setTypingLoading(false);
    }
  }, [roomId]);

  const loadPendingInvites = useCallback(async () => {
    if (!roomId || !canManageMembers) {
      setPendingInvites([]);
      return;
    }

    setInvitesLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_room_pending_invites_v2", {
        p_room_id: roomId,
      } as any);

      if (error) throw error;

      const rows = Array.isArray(data) ? (data as PendingInviteRow[]) : [];
      setPendingInvites(rows);
    } catch {
      setPendingInvites([]);
    } finally {
      setInvitesLoading(false);
    }
  }, [roomId, canManageMembers]);

  const markAsReadSafe = useCallback(async () => {
    if (!roomId) return;

    try {
      await supabase.rpc("mark_meeting_room_read_v2", {
        p_room_id: roomId,
      } as any);
    } catch {
      // silent
    }
  }, [roomId]);

  const setTypingStateSafe = useCallback(
    async (isTyping: boolean) => {
      if (!roomId) return;

      try {
        await supabase.rpc("set_meeting_room_typing_v1", {
          p_room_id: roomId,
          p_is_typing: isTyping,
        } as any);
      } catch {
        // silent
      }
    },
    [roomId]
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadMyUser(),
        loadRoomMeta(),
        loadMessages(),
        loadRoomMembers(),
        loadTypingMembers(),
      ]);
      await loadPendingInvites();
      await markAsReadSafe();
    } finally {
      setLoading(false);
    }
  }, [
    loadMyUser,
    loadRoomMeta,
    loadMessages,
    loadRoomMembers,
    loadTypingMembers,
    loadPendingInvites,
    markAsReadSafe,
  ]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!messages.length) return;

    const t = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: false });
    }, 120);

    return () => clearTimeout(t);
  }, [messages]);

  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`meeting-room-live-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meeting_room_messages",
          filter: `room_id=eq.${roomId}`,
        },
        async () => {
          await loadMessages();
          await markAsReadSafe();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meeting_room_message_reactions",
          filter: `room_id=eq.${roomId}`,
        },
        async () => {
          await loadMessages();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meeting_room_typing_presence",
          filter: `room_id=eq.${roomId}`,
        },
        async () => {
          await loadTypingMembers();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, loadMessages, markAsReadSafe, loadTypingMembers]);

  useEffect(() => {
    return () => {
      if (typingIdleTimerRef.current) {
        clearTimeout(typingIdleTimerRef.current);
        typingIdleTimerRef.current = null;
      }
      void setTypingStateSafe(false);
    };
  }, [setTypingStateSafe]);

  useEffect(() => {
    if (!messages.length || myMentionKeys.size === 0 || !myUserId) return;

    const fresh = [...messages].slice(-20);

    for (const msg of fresh) {
      const msgId = clean(msg.id);
      if (!msgId) continue;
      if (seenMentionIdsRef.current.has(msgId)) continue;

      seenMentionIdsRef.current.add(msgId);

      const isMine =
        clean(msg.sender_user_id) && clean(msg.sender_user_id) === clean(myUserId);
      if (isMine) continue;

      const tokens = extractMentionTokens(clean(msg.message_text));
      const mentionedMe = tokens.some((t) => myMentionKeys.has(t));

      if (mentionedMe) {
        const sender = displayMemberName(msg.sender_display_name, msg.sender_user_id);
        Alert.alert("Mention", `${sender} amekutaja kwenye room.`);
      }
    }
  }, [messages, myMentionKeys, myUserId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      loadRoomMeta(),
      loadMessages(),
      loadRoomMembers(),
      loadTypingMembers(),
    ]);
    await loadPendingInvites();
    await markAsReadSafe();
    setRefreshing(false);
  }, [
    loadRoomMeta,
    loadMessages,
    loadRoomMembers,
    loadTypingMembers,
    loadPendingInvites,
    markAsReadSafe,
  ]);

  const scrollToMessage = useCallback(
    (messageId?: string | null) => {
      const id = clean(messageId);
      if (!id) return;

      const index = messageIndexMap.get(id);
      if (index === undefined) return;

      try {
        listRef.current?.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.35,
        });
      } catch {
        setTimeout(() => {
          try {
            listRef.current?.scrollToIndex({
              index,
              animated: true,
              viewPosition: 0.35,
            });
          } catch {
            // silent
          }
        }, 250);
      }
    },
    [messageIndexMap]
  );

  const handleTextChange = useCallback(
    (value: string) => {
      setText(value);

      void setTypingStateSafe(clean(value).length > 0);

      if (typingIdleTimerRef.current) {
        clearTimeout(typingIdleTimerRef.current);
      }

      typingIdleTimerRef.current = setTimeout(() => {
        void setTypingStateSafe(false);
      }, 1800);
    },
    [setTypingStateSafe]
  );

  const insertMention = useCallback(
    (member: MentionCandidate) => {
      const nameToken = normalizeMentionName(member.fullName);
      const current = String(text ?? "");

      const match = current.match(/(^|\s)@([A-Za-z0-9._-]*)$/);
      if (!match) return;

      const replaced = current.replace(
        /(^|\s)@([A-Za-z0-9._-]*)$/,
        `${match[1]}@${nameToken} `
      );
      setText(replaced);
    },
    [text]
  );

  const sendMessage = useCallback(async () => {
    const msg = clean(text);

    if (!roomId) {
      Alert.alert("Room missing", "Hakuna room iliyochaguliwa.");
      return;
    }

    if (!msg) return;

    const optimisticId = `local-${Date.now()}`;

    const optimisticMessage: MessageRow = {
      id: optimisticId,
      sender_user_id: myUserId,
      sender_display_name: "You",
      message_text: msg,
      created_at: new Date().toISOString(),
      reply_to_message_id: replyTo?.id ?? null,
      replied_message_text: replyTo?.text ?? null,
      love_count: 0,
      like_count: 0,
      fire_count: 0,
      my_love_reacted: false,
      my_like_reacted: false,
      my_fire_reacted: false,
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      setSending(true);

      const { error } = await supabase.rpc("send_meeting_room_message_v3", {
        p_room_id: roomId,
        p_message: msg,
        p_reply_to_message_id: replyTo?.id ?? null,
      } as any);

      if (error) throw error;

      setText("");
      setReplyTo(null);
      await setTypingStateSafe(false);

      await Promise.all([loadMessages(), loadTypingMembers()]);
      await markAsReadSafe();

      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 120);
    } catch (e: any) {
      setMessages((prev) => prev.filter((m) => clean(m.id) !== optimisticId));
      Alert.alert("Send failed", e?.message ?? "Failed to send message.");
    } finally {
      setSending(false);
    }
  }, [
    text,
    roomId,
    myUserId,
    replyTo,
    loadMessages,
    loadTypingMembers,
    markAsReadSafe,
    setTypingStateSafe,
  ]);

  const sendInvite = useCallback(async () => {
    const email = clean(inviteEmail).toLowerCase();

    if (!roomId) {
      Alert.alert("Room missing", "Hakuna room iliyochaguliwa.");
      return;
    }

    if (!canManageMembers) {
      Alert.alert("Not allowed", "Only room owner/admin can invite members.");
      return;
    }

    if (!email || !email.includes("@")) {
      Alert.alert("Invalid email", "Weka email sahihi ya mwalikwa.");
      return;
    }

    try {
      setInviting(true);

      const { error } = await supabase.rpc("invite_user_to_meeting_room_v2", {
        p_room_id: roomId,
        p_email: email,
        p_member_type: inviteMemberType,
        p_role: inviteRole,
      } as any);

      if (error) throw error;

      setInviteEmail("");
      setInviteRole("MEMBER");
      setInviteMemberType("INTERNAL");
      setInviteOpen(false);

      await loadPendingInvites();

      Alert.alert(
        "Invite sent",
        "Invitation imetumwa successfully kwa ZETRA account hiyo."
      );
    } catch (e: any) {
      Alert.alert("Invite failed", e?.message ?? "Failed to send invite.");
    } finally {
      setInviting(false);
    }
  }, [roomId, canManageMembers, inviteEmail, inviteMemberType, inviteRole, loadPendingInvites]);

  const toggleReaction = useCallback(
    async (messageId: string, reaction: ReactionKey) => {
      const id = clean(messageId);
      if (!id || reactingId || id.startsWith("local-")) return;

      try {
        setReactingId(id);

        const { error } = await supabase.rpc("toggle_meeting_room_message_reaction_v2", {
          p_message_id: id,
          p_reaction: reaction,
        } as any);

        if (error) throw error;

        await loadMessages();
      } catch (e: any) {
        Alert.alert("Reaction failed", e?.message ?? "Failed to toggle reaction.");
      } finally {
        setReactingId(null);
        setActionMessage(null);
      }
    },
    [reactingId, loadMessages]
  );

  const handleCopyMessage = useCallback(async () => {
    if (!actionMessage) return;
    try {
      await Clipboard.setStringAsync(clean(actionMessage.text));
      setActionMessage(null);
      Alert.alert("Copied", "Message imenakiliwa.");
    } catch {
      Alert.alert("Copy failed", "Imeshindikana kunakili message.");
    }
  }, [actionMessage]);

  const handleReplyFromAction = useCallback(() => {
    if (!actionMessage) return;
    setReplyTo({
      id: actionMessage.id,
      text: actionMessage.text,
      mine: actionMessage.mine,
    });
    setActionMessage(null);
  }, [actionMessage]);

  const title = useMemo(() => roomName || "Room Chat", [roomName]);

  const renderItem = useCallback(
    ({ item, index }: { item: MessageRow; index: number }) => {
      const mine =
        !!myUserId &&
        clean(item.sender_user_id) &&
        clean(item.sender_user_id) === clean(myUserId);

      const prev = index > 0 ? messages[index - 1] : null;
      const showDay = !prev || !sameDay(prev.created_at, item.created_at);

      const loveCount = toInt(item.love_count);
      const likeCount = toInt(item.like_count);
      const fireCount = toInt(item.fire_count);

      const loved = !!item.my_love_reacted;
      const liked = !!item.my_like_reacted;
      const fired = !!item.my_fire_reacted;

      const busyReaction = reactingId === clean(item.id);

      const senderName = displayMemberName(item.sender_display_name, item.sender_user_id);

      return (
        <View>
          {showDay ? (
            <View
              style={{
                alignItems: "center",
                marginBottom: 10,
                marginTop: index === 0 ? 0 : 8,
              }}
            >
              <View
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                }}
              >
                <Text
                  style={{
                    color: UI.muted,
                    fontSize: 11,
                    fontWeight: "900",
                  }}
                >
                  {formatMsgDay(item.created_at)}
                </Text>
              </View>
            </View>
          ) : null}

          <View
            style={{
              alignItems: mine ? "flex-end" : "flex-start",
              marginBottom: 10,
            }}
          >
            <View style={{ maxWidth: "82%" }}>
              {!mine ? (
                <Text
                  style={{
                    color: UI.muted,
                    fontWeight: "900",
                    fontSize: 12,
                    marginBottom: 6,
                    marginLeft: 4,
                  }}
                  numberOfLines={1}
                >
                  {senderName}
                </Text>
              ) : null}

              <SwipeReplyWrapper
                mine={!!mine}
                onReply={() =>
                  setReplyTo({
                    id: clean(item.id),
                    text: clean(item.message_text),
                    mine: !!mine,
                  })
                }
              >
                <Pressable
                  onLongPress={() =>
                    setActionMessage({
                      id: clean(item.id),
                      text: clean(item.message_text),
                      mine: !!mine,
                      myLoveReacted: loved,
                      myLikeReacted: liked,
                      myFireReacted: fired,
                    })
                  }
                  delayLongPress={180}
                >
                  {({ pressed }) => (
                    <View
                      style={{
                        borderRadius: 20,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderWidth: 1,
                        borderColor: mine ? UI.emeraldBorder : "rgba(255,255,255,0.10)",
                        backgroundColor: mine ? UI.emeraldSoft : "rgba(255,255,255,0.06)",
                        opacity: pressed ? 0.96 : 1,
                      }}
                    >
                      {clean(item.reply_to_message_id) ? (
                        <Pressable
                          onPress={() => scrollToMessage(item.reply_to_message_id)}
                          style={({ pressed: p }) => ({
                            marginBottom: 8,
                            borderRadius: 12,
                            borderLeftWidth: 3,
                            borderLeftColor: mine ? UI.emerald : "rgba(255,255,255,0.35)",
                            backgroundColor: "rgba(255,255,255,0.05)",
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                            opacity: p ? 0.88 : 1,
                          })}
                        >
                          <Text
                            style={{
                              color: mine ? UI.text : UI.muted,
                              fontWeight: "900",
                              fontSize: 11,
                              marginBottom: 4,
                            }}
                            numberOfLines={1}
                          >
                            Reply
                          </Text>
                          <Text
                            style={{
                              color: UI.faint,
                              fontWeight: "700",
                              fontSize: 12,
                              lineHeight: 17,
                            }}
                            numberOfLines={2}
                          >
                            {shortText(item.replied_message_text, 90)}
                          </Text>
                        </Pressable>
                      ) : null}

                      <MessageTextWithMentions
                        text={clean(item.message_text) || "—"}
                      />

                      <Text
                        style={{
                          color: mine ? "rgba(255,255,255,0.72)" : UI.faint,
                          fontSize: 10,
                          fontWeight: "800",
                          marginTop: 6,
                          textAlign: "right",
                        }}
                      >
                        {formatMsgTime(item.created_at)}
                      </Text>
                    </View>
                  )}
                </Pressable>
              </SwipeReplyWrapper>

              {(loveCount > 0 || likeCount > 0 || fireCount > 0) ? (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    justifyContent: mine ? "flex-end" : "flex-start",
                    marginTop: 6,
                    gap: 6,
                  }}
                >
                  {loveCount > 0 ? (
                    <ReactionChip
                      emoji="❤️"
                      count={loveCount}
                      active={loved}
                      onPress={
                        busyReaction ? undefined : () => void toggleReaction(item.id, "LOVE")
                      }
                    />
                  ) : null}

                  {likeCount > 0 ? (
                    <ReactionChip
                      emoji="👍"
                      count={likeCount}
                      active={liked}
                      onPress={
                        busyReaction ? undefined : () => void toggleReaction(item.id, "LIKE")
                      }
                    />
                  ) : null}

                  {fireCount > 0 ? (
                    <ReactionChip
                      emoji="🔥"
                      count={fireCount}
                      active={fired}
                      onPress={
                        busyReaction ? undefined : () => void toggleReaction(item.id, "FIRE")
                      }
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        </View>
      );
    },
    [myUserId, messages, reactingId, toggleReaction, scrollToMessage]
  );

  return (
    <Screen bottomPad={0} contentStyle={{ paddingHorizontal: 0, paddingBottom: 0 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "android" ? "height" : "padding"}
        keyboardVerticalOffset={0}
      >
        <View
          style={{
            paddingHorizontal: 16,
            marginBottom: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Pressable
            onPress={goBackSafe}
            style={({ pressed }) => ({
              width: 42,
              height: 42,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Ionicons name="chevron-back" size={20} color={UI.text} />
          </Pressable>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                color: UI.text,
                fontWeight: "900",
                fontSize: 22,
              }}
              numberOfLines={1}
            >
              {title}
            </Text>

            <Text
              style={{
                color: UI.muted,
                fontWeight: "800",
                marginTop: 3,
                fontSize: 12,
              }}
              numberOfLines={1}
            >
              {roomDescription || "Chat room ndani ya organization hii."}
            </Text>
          </View>

          {canManageMembers ? (
            <Pressable
              onPress={() => setInviteOpen((v) => !v)}
              style={({ pressed }) => ({
                minWidth: 74,
                height: 42,
                paddingHorizontal: 12,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: UI.emeraldBorder,
                backgroundColor: UI.emeraldSoft,
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                {inviteOpen ? "Close" : "Invite"}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => void onRefresh()}
            style={({ pressed }) => ({
              width: 42,
              height: 42,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              opacity: pressed ? 0.9 : 1,
            })}
          >
            {loading || refreshing ? (
              <ActivityIndicator />
            ) : (
              <Ionicons name="refresh-outline" size={18} color={UI.text} />
            )}
          </Pressable>
        </View>

        {canManageMembers && inviteOpen ? (
          <View style={{ paddingHorizontal: 16, marginBottom: 10, gap: 10 }}>
            <View
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.04)",
                padding: 12,
                gap: 10,
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                Invite ZETRA Account
              </Text>

              <TextInput
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder="Email ya ZETRA user"
                placeholderTextColor="rgba(255,255,255,0.40)"
                autoCapitalize="none"
                keyboardType="email-address"
                style={{
                  minHeight: 46,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  color: UI.text,
                  fontWeight: "700",
                  paddingHorizontal: 14,
                }}
              />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={() => setInviteMemberType("INTERNAL")}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 42,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor:
                      inviteMemberType === "INTERNAL"
                        ? UI.emeraldBorder
                        : "rgba(255,255,255,0.10)",
                    backgroundColor:
                      inviteMemberType === "INTERNAL"
                        ? UI.emeraldSoft
                        : "rgba(255,255,255,0.04)",
                    opacity: pressed ? 0.92 : 1,
                  })}
                >
                  <Text style={{ color: UI.text, fontWeight: "900" }}>INTERNAL</Text>
                </Pressable>

                <Pressable
                  onPress={() => setInviteMemberType("EXTERNAL")}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 42,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor:
                      inviteMemberType === "EXTERNAL"
                        ? UI.emeraldBorder
                        : "rgba(255,255,255,0.10)",
                    backgroundColor:
                      inviteMemberType === "EXTERNAL"
                        ? UI.emeraldSoft
                        : "rgba(255,255,255,0.04)",
                    opacity: pressed ? 0.92 : 1,
                  })}
                >
                  <Text style={{ color: UI.text, fontWeight: "900" }}>EXTERNAL</Text>
                </Pressable>
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={() => setInviteRole("MEMBER")}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 42,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor:
                      inviteRole === "MEMBER"
                        ? UI.emeraldBorder
                        : "rgba(255,255,255,0.10)",
                    backgroundColor:
                      inviteRole === "MEMBER"
                        ? UI.emeraldSoft
                        : "rgba(255,255,255,0.04)",
                    opacity: pressed ? 0.92 : 1,
                  })}
                >
                  <Text style={{ color: UI.text, fontWeight: "900" }}>MEMBER</Text>
                </Pressable>

                <Pressable
                  onPress={() => setInviteRole("ADMIN")}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 42,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor:
                      inviteRole === "ADMIN"
                        ? UI.emeraldBorder
                        : "rgba(255,255,255,0.10)",
                    backgroundColor:
                      inviteRole === "ADMIN"
                        ? UI.emeraldSoft
                        : "rgba(255,255,255,0.04)",
                    opacity: pressed ? 0.92 : 1,
                  })}
                >
                  <Text style={{ color: UI.text, fontWeight: "900" }}>ADMIN</Text>
                </Pressable>
              </View>

              <Pressable
                onPress={() => void sendInvite()}
                disabled={inviting}
                style={({ pressed }) => ({
                  minHeight: 46,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: UI.emeraldBorder,
                  backgroundColor: UI.emeraldSoft,
                  opacity: pressed ? 0.92 : 1,
                })}
              >
                {inviting ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                    Send Invitation
                  </Text>
                )}
              </Pressable>
            </View>

            <View
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.03)",
                padding: 12,
                gap: 8,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
                  Pending Invites
                </Text>
                {invitesLoading ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={{ color: UI.emerald, fontWeight: "900", fontSize: 12 }}>
                    {pendingInvites.length}
                  </Text>
                )}
              </View>

              {pendingInvites.length === 0 ? (
                <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
                  Hakuna pending invites kwa room hii sasa hivi.
                </Text>
              ) : (
                pendingInvites.map((inv, idx) => (
                  <View
                    key={clean(inv.invite_id || inv.id) || String(idx)}
                    style={{
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.10)",
                      backgroundColor: "rgba(255,255,255,0.04)",
                      padding: 10,
                      gap: 4,
                    }}
                  >
                    <Text style={{ color: UI.text, fontWeight: "900" }}>
                      {clean(inv.email) || "No email"}
                    </Text>
                    <Text style={{ color: UI.muted, fontSize: 12, fontWeight: "800" }}>
                      {niceMemberType(inv.member_type)} • {niceRole(inv.role)}
                    </Text>
                    <Text style={{ color: UI.faint, fontSize: 11, fontWeight: "800" }}>
                      {formatDateTime(inv.created_at)}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </View>
        ) : null}

        {error ? (
          <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
            <View
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(201,74,74,0.35)",
                backgroundColor: "rgba(201,74,74,0.10)",
                padding: 12,
              }}
            >
              <Text style={{ color: UI.danger, fontWeight: "900", fontSize: 14 }}>
                {error}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={{ flex: 1 }}>
          {loading ? (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ActivityIndicator size="large" color={UI.emerald} />
            </View>
          ) : messages.length === 0 ? (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 24,
              }}
            >
              <Ionicons name="chatbubble-outline" size={28} color={UI.emerald} />
              <Text
                style={{
                  color: UI.text,
                  fontWeight: "900",
                  fontSize: 17,
                  marginTop: 10,
                }}
              >
                No messages yet
              </Text>
              <Text
                style={{
                  color: UI.muted,
                  fontWeight: "800",
                  textAlign: "center",
                  lineHeight: 20,
                  marginTop: 8,
                }}
              >
                Tuma message ya kwanza ndani ya room hii.
              </Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => clean(item.id)}
              renderItem={renderItem}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingTop: 4,
                paddingBottom: 12,
              }}
              showsVerticalScrollIndicator={false}
              style={{ flex: 1 }}
              onScrollToIndexFailed={(info) => {
                setTimeout(() => {
                  try {
                    listRef.current?.scrollToIndex({
                      index: info.index,
                      animated: true,
                      viewPosition: 0.35,
                    });
                  } catch {
                    // silent
                  }
                }, 250);
              }}
            />
          )}
        </View>

        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 8,
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,0.06)",
            backgroundColor: "#0B0F14",
          }}
        >
          {replyTo ? (
            <Pressable
              onPress={() => scrollToMessage(replyTo.id)}
              style={({ pressed }) => ({
                marginBottom: 8,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: UI.emeraldBorder,
                backgroundColor: "rgba(16,185,129,0.08)",
                paddingHorizontal: 12,
                paddingVertical: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                opacity: pressed ? 0.92 : 1,
              })}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    color: UI.emerald,
                    fontWeight: "900",
                    fontSize: 12,
                    marginBottom: 4,
                  }}
                  numberOfLines={1}
                >
                  Replying to {replyTo.mine ? "your message" : "message"}
                </Text>
                <Text
                  style={{
                    color: UI.text,
                    fontWeight: "700",
                    fontSize: 13,
                  }}
                  numberOfLines={2}
                >
                  {shortText(replyTo.text, 120)}
                </Text>
              </View>

              <Pressable
                onPress={() => setReplyTo(null)}
                style={({ pressed }) => ({
                  width: 30,
                  height: 30,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255,255,255,0.08)",
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Ionicons name="close" size={16} color={UI.text} />
              </Pressable>
            </Pressable>
          ) : null}

          {typingLabel ? (
            <View
              style={{
                marginBottom: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
                backgroundColor: "rgba(255,255,255,0.04)",
              }}
            >
              <Text
                style={{
                  color: UI.emerald,
                  fontWeight: "900",
                  fontSize: 12,
                }}
              >
                {typingLabel}
              </Text>
            </View>
          ) : null}

          {showMentionBox ? (
            <View
              style={{
                marginBottom: 8,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: UI.emeraldBorder,
                backgroundColor: "rgba(16,185,129,0.08)",
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  paddingHorizontal: 12,
                  paddingTop: 10,
                  paddingBottom: 6,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    color: UI.emerald,
                    fontWeight: "900",
                    fontSize: 12,
                  }}
                >
                  Mention member
                </Text>

                {membersLoading || typingLoading ? (
                  <ActivityIndicator size="small" />
                ) : null}
              </View>

              {filteredMentionMembers.map((member, idx) => (
                <Pressable
                  key={`${member.userId}-${member.membershipId}-${idx}`}
                  onPress={() => insertMention(member)}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderTopWidth: idx === 0 ? 0 : 1,
                    borderTopColor: "rgba(255,255,255,0.06)",
                    backgroundColor: pressed
                      ? "rgba(255,255,255,0.05)"
                      : "transparent",
                  })}
                >
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                    {member.fullName}
                  </Text>
                  <Text
                    style={{
                      color: UI.muted,
                      fontWeight: "800",
                      fontSize: 12,
                      marginTop: 2,
                    }}
                  >
                    {member.role}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              gap: 10,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              paddingLeft: 14,
              paddingRight: 8,
              paddingTop: 8,
              paddingBottom: 8,
            }}
          >
            <TextInput
              value={text}
              onChangeText={handleTextChange}
              placeholder={replyTo ? "Write reply..." : "Write message..."}
              placeholderTextColor="rgba(255,255,255,0.40)"
              multiline
              style={{
                flex: 1,
                minHeight: 44,
                maxHeight: 120,
                color: UI.text,
                fontWeight: "700",
                fontSize: 15,
                paddingVertical: 10,
              }}
            />

            <Pressable
              onPress={() => void sendMessage()}
              disabled={sending || !clean(text)}
              style={({ pressed }) => ({
                width: 46,
                height: 46,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: clean(text)
                  ? UI.emeraldBorder
                  : "rgba(255,255,255,0.10)",
                backgroundColor: clean(text)
                  ? UI.emeraldSoft
                  : "rgba(255,255,255,0.05)",
                opacity: pressed ? 0.9 : 1,
              })}
            >
              {sending ? (
                <ActivityIndicator />
              ) : (
                <Ionicons
                  name="send"
                  size={18}
                  color={clean(text) ? UI.emerald : "rgba(255,255,255,0.45)"}
                />
              )}
            </Pressable>
          </View>
        </View>

        <Modal
          visible={!!actionMessage}
          transparent
          animationType="fade"
          onRequestClose={() => setActionMessage(null)}
        >
          <Pressable
            onPress={() => setActionMessage(null)}
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.55)",
              justifyContent: "flex-end",
            }}
          >
            <Pressable
              onPress={() => {}}
              style={{
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "#0F141B",
                padding: 16,
                gap: 10,
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                Message Actions
              </Text>

              <Text
                style={{
                  color: UI.muted,
                  fontWeight: "700",
                  lineHeight: 20,
                }}
                numberOfLines={3}
              >
                {shortText(actionMessage?.text, 140)}
              </Text>

              <Pressable
                onPress={handleReplyFromAction}
                style={({ pressed }) => ({
                  minHeight: 46,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: UI.text, fontWeight: "900" }}>Reply</Text>
              </Pressable>

              <Pressable
                onPress={handleCopyMessage}
                style={({ pressed }) => ({
                  minHeight: 46,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: UI.text, fontWeight: "900" }}>Copy</Text>
              </Pressable>

              <Pressable
                onPress={() =>
                  actionMessage &&
                  void toggleReaction(actionMessage.id, "LOVE")
                }
                style={({ pressed }) => ({
                  minHeight: 46,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: UI.emeraldBorder,
                  backgroundColor: "rgba(16,185,129,0.08)",
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: UI.text, fontWeight: "900" }}>
                  {actionMessage?.myLoveReacted ? "Unlike ❤️" : "Love ❤️"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() =>
                  actionMessage &&
                  void toggleReaction(actionMessage.id, "LIKE")
                }
                style={({ pressed }) => ({
                  minHeight: 46,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: UI.text, fontWeight: "900" }}>
                  {actionMessage?.myLikeReacted ? "Remove 👍" : "Like 👍"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() =>
                  actionMessage &&
                  void toggleReaction(actionMessage.id, "FIRE")
                }
                style={({ pressed }) => ({
                  minHeight: 46,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: UI.text, fontWeight: "900" }}>
                  {actionMessage?.myFireReacted ? "Remove 🔥" : "Fire 🔥"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setActionMessage(null)}
                style={({ pressed }) => ({
                  minHeight: 46,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: UI.muted, fontWeight: "900" }}>Cancel</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </Screen>
  );
}