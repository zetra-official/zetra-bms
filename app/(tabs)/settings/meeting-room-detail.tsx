import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
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
  attachment_path?: string | null;

  message_type?: string | null;
  media_kind?: string | null;
  file_name?: string | null;
  file_size_bytes?: number | null;
  mime_type?: string | null;
  expires_at?: string | null;
  is_expired?: boolean | null;

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
  attachmentUrl?: string | null;
  messageType?: "TEXT" | "MEDIA";
  mediaKind?: "IMAGE" | "VIDEO" | "AUDIO" | "PDF" | "DOCUMENT" | null;
};

type TypingRow = {
  user_id?: string | null;
  full_name?: string | null;
  typing_started_at?: string | null;
};
type PendingMedia = {
  uri: string;
  kind: "IMAGE" | "VIDEO" | "PDF" | "DOCUMENT";
  fileName: string;
  mimeType?: string | null;
  fileSize?: number | null;
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

function mentionSeenStorageKey(roomId?: string | null, userId?: string | null) {
  const rid = clean(roomId);
  const uid = clean(userId);
  if (!rid || !uid) return "";
  return `zetra_meeting_room_seen_mentions_v1:${rid}:${uid}`;
}

function mediaLocalCacheStorageKey(roomId?: string | null, userId?: string | null) {
  const rid = clean(roomId);
  const uid = clean(userId);
  if (!rid || !uid) return "";
  return `zetra_meeting_room_local_media_v1:${rid}:${uid}`;
}

function sanitizeFileName(v?: string | null) {
  const raw = clean(v);
  if (!raw) return `file-${Date.now()}`;
  return raw.replace(/[^\w.\-]+/g, "_");
}

function isLocalFileUri(v?: string | null) {
  const s = clean(v).toLowerCase();
  return s.startsWith("file://");
}

function buildPdfViewerSourceUri(url?: string | null) {
  const target = clean(url);
  if (!target) return "";
  if (isLocalFileUri(target)) return target;
  return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(target)}`;
}

function buildMeetingRoomMediaLocalDir(roomId?: string | null, userId?: string | null) {
  const rid = clean(roomId);
  const uid = clean(userId);
  const base = FileSystem.documentDirectory || FileSystem.cacheDirectory || "";
  if (!base || !rid || !uid) return "";
  return `${base}meeting-room-media/${uid}/${rid}/`;
}

function mediaCacheKeys(item: {
  attachment_path?: string | null;
  attachment_url?: string | null;
}) {
  const keys: string[] = [];

  const path = clean(item?.attachment_path);
  const url = clean(item?.attachment_url);

  if (path) keys.push(`path:${path}`);
  if (url) keys.push(`url:${url}`);

  return keys;
}

function pickCachedMediaUri(
  cache: Record<string, string>,
  item: {
    attachment_path?: string | null;
    attachment_url?: string | null;
  }
) {
  const keys = mediaCacheKeys(item);
  for (const key of keys) {
    const found = clean(cache?.[key]);
    if (found) return found;
  }
  return "";
}

async function ensureLocalDir(dir: string) {
  const target = clean(dir);
  if (!target) return;
  try {
    const info = await FileSystem.getInfoAsync(target);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(target, { intermediates: true });
    }
  } catch {
    // silent
  }
}

async function localFileExists(uri?: string | null) {
  const target = clean(uri);
  if (!target) return false;
  try {
    const info = await FileSystem.getInfoAsync(target);
    return !!info.exists;
  } catch {
    return false;
  }
}

const MEETING_ROOM_MEDIA_BUCKET = "club-media";
const MAX_IMAGE_SIZE_MB = 8;
const MAX_VIDEO_SIZE_MB = 20;
const MAX_DOCUMENT_SIZE_MB = 12;

const MR = {
  page: "#EAF2FA",
  panel: "#FFFFFF",
  panelSoft: "#F8FAFC",
  bubbleMine: "#ECFDF5",
  bubbleOther: "#FFFFFF",
  border: "rgba(15,23,42,0.10)",
  borderStrong: "rgba(5,150,105,0.34)",
  text: "#0F172A",
  muted: "#475569",
  faint: "#64748B",
  emerald: "#059669",
  danger: "#DC2626",
  inputBg: "#FFFFFF",
};

function bytesToMb(bytes?: number | null) {
  const n = Number(bytes ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n / (1024 * 1024);
}
function normalizeMessageType(v?: string | null) {
  const x = clean(v).toUpperCase();
  return x === "MEDIA" ? "MEDIA" : "TEXT";
}

function normalizeMediaKind(v?: string | null) {
  const x = clean(v).toUpperCase();
  if (x === "VIDEO") return "VIDEO";
  if (x === "AUDIO") return "AUDIO";
  if (x === "PDF") return "PDF";
  if (x === "DOCUMENT") return "DOCUMENT";
  return "IMAGE";
}

function safeFileExt(name?: string | null, mimeType?: string | null, kind?: string | null) {
  const raw = clean(name);
  const byName = raw.includes(".") ? raw.split(".").pop() : "";
  const ext = clean(byName).toLowerCase();
  if (ext) return ext;

  const mime = clean(mimeType).toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("heic")) return "heic";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("mov")) return "mov";
  if (mime.includes("m4v")) return "m4v";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("msword")) return "doc";
  if (mime.includes("wordprocessingml")) return "docx";
  if (mime.includes("spreadsheetml")) return "xlsx";
  if (mime.includes("excel")) return "xls";
  if (mime.includes("presentationml")) return "pptx";
  if (mime.includes("powerpoint")) return "ppt";
  if (mime.includes("plain")) return "txt";
  if (mime.includes("zip")) return "zip";

  if (kind === "VIDEO") return "mp4";
  if (kind === "PDF") return "pdf";
  if (kind === "DOCUMENT") return "bin";
  return "jpg";
}

async function openExternalUrl(url?: string | null) {
  const target = clean(url);
  if (!target) return;

  try {
    const supported = await Linking.canOpenURL(target);
    if (!supported) {
      Alert.alert("Open failed", "Imeshindikana kufungua media link.");
      return;
    }
    await Linking.openURL(target);
  } catch {
    Alert.alert("Open failed", "Imeshindikana kufungua media.");
  }
}
function buildPdfViewerUrl(url?: string | null) {
  const target = clean(url);
  if (!target) return "";
  return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(target)}`;
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
          color: MR.text,
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
        color: MR.text,
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
              color: MR.text,
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
 function MessageMediaBlock({
  item,
  resolvedUri,
  onOpenMedia,
}: {
  item: MessageRow;
  resolvedUri?: string | null;
  onOpenMedia: (item: MessageRow, kind: "IMAGE" | "VIDEO" | "AUDIO" | "PDF" | "DOCUMENT") => void;
}) {
  const messageType = normalizeMessageType(item.message_type);
  const mediaKind = normalizeMediaKind(item.media_kind);
  const mediaUrl = clean(resolvedUri) || clean(item.attachment_url);
  const hasLocalCopy = isLocalFileUri(resolvedUri);
  const expired = !!item.is_expired && !hasLocalCopy;

  if (messageType !== "MEDIA") return null;

  if (expired) {
    return (
      <View
        style={{
          borderRadius: 14,
          borderWidth: 1,
         borderColor: MR.border,
backgroundColor: "#F8FAFC",
          paddingHorizontal: 12,
          paddingVertical: 12,
          marginBottom: clean(item.message_text) ? 8 : 0,
        }}
      >
        <Text style={{ color: MR.muted, fontWeight: "900", fontSize: 12 }}>
          Media expired
        </Text>
        <Text
          style={{
            color: MR.faint,
            fontWeight: "700",
            fontSize: 12,
            marginTop: 4,
            lineHeight: 18,
          }}
        >
          Hii media imeisha muda wake wa kuonekana.
        </Text>
      </View>
    );
  }

  if (!mediaUrl) {
    return (
      <View
        style={{
          borderRadius: 14,
          borderWidth: 1,
        borderColor: MR.border,
backgroundColor: "#F8FAFC",
          paddingHorizontal: 12,
          paddingVertical: 12,
          marginBottom: clean(item.message_text) ? 8 : 0,
        }}
      >
        <Text style={{ color: MR.muted, fontWeight: "900", fontSize: 12 }}>
          Media unavailable
        </Text>
      </View>
    );
  }

  if (mediaKind === "IMAGE") {
    return (
      <View style={{ marginBottom: clean(item.message_text) ? 8 : 0 }}>
        {hasLocalCopy ? (
          <View
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: UI.emeraldBorder,
              backgroundColor: "#ECFDF5",
              paddingHorizontal: 10,
              paddingVertical: 8,
              marginBottom: 8,
            }}
          >
            <Text style={{ color: UI.emerald, fontWeight: "900", fontSize: 12 }}>
              Saved on this device
            </Text>
            <Text
              style={{
                color: MR.faint,
                fontWeight: "700",
                fontSize: 12,
                marginTop: 4,
                lineHeight: 18,
              }}
            >
              Hii media inasomwa kutoka kwenye simu yako.
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => onOpenMedia(item, "IMAGE")}
          style={({ pressed }) => ({
            opacity: pressed ? 0.94 : 1,
          })}
        >
          <Image
            source={{ uri: mediaUrl }}
            resizeMode="cover"
            style={{
              width: 220,
              height: 240,
              borderRadius: 16,
              backgroundColor: "rgba(255,255,255,0.05)",
            }}
          />
          <Text
            style={{
              color: MR.faint,
              fontWeight: "800",
              fontSize: 11,
              marginTop: 6,
            }}
          >
            Tap to view image
          </Text>
        </Pressable>
      </View>
    );
  }

  if (mediaKind === "VIDEO") {
    return (
      <View style={{ marginBottom: clean(item.message_text) ? 8 : 0 }}>
        {hasLocalCopy ? (
          <View
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: UI.emeraldBorder,
              backgroundColor: "#ECFDF5",
              paddingHorizontal: 10,
              paddingVertical: 8,
              marginBottom: 8,
            }}
          >
            <Text style={{ color: UI.emerald, fontWeight: "900", fontSize: 12 }}>
              Saved on this device
            </Text>
            <Text
              style={{
                color: MR.faint,
                fontWeight: "700",
                fontSize: 12,
                marginTop: 4,
                lineHeight: 18,
              }}
            >
              Hii media inasomwa kutoka kwenye simu yako.
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => onOpenMedia(item, "VIDEO")}
          style={({ pressed }) => ({
            opacity: pressed ? 0.94 : 1,
          })}
        >
          <View
            style={{
              width: 220,
              height: 240,
              borderRadius: 16,
              overflow: "hidden",
              backgroundColor: "rgba(255,255,255,0.05)",
              position: "relative",
            }}
          >
            <Video
              source={{ uri: mediaUrl }}
              style={{ width: "100%", height: "100%" }}
              resizeMode={ResizeMode.COVER}
              shouldPlay={false}
              isLooping={false}
              isMuted
              useNativeControls={false}
            />

            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                inset: 0,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(0,0,0,0.18)",
              }}
            >
              <View
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.18)",
                }}
              >
                <Ionicons name="play" size={26} color={MR.text} />
              </View>
            </View>
          </View>

          <Text
            style={{
              color: MR.faint,
              fontWeight: "800",
              fontSize: 11,
              marginTop: 6,
            }}
          >
            Tap to play video
          </Text>
        </Pressable>
      </View>
    );
  }

  if (mediaKind === "PDF" || mediaKind === "DOCUMENT") {
    return (
      <View style={{ marginBottom: clean(item.message_text) ? 8 : 0 }}>
        {hasLocalCopy ? (
          <View
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: UI.emeraldBorder,
              backgroundColor: "#ECFDF5",
              paddingHorizontal: 10,
              paddingVertical: 8,
              marginBottom: 8,
            }}
          >
            <Text style={{ color: UI.emerald, fontWeight: "900", fontSize: 12 }}>
              Saved on this device
            </Text>
            <Text
              style={{
                color: MR.faint,
                fontWeight: "700",
                fontSize: 12,
                marginTop: 4,
                lineHeight: 18,
              }}
            >
              Hii media inasomwa kutoka kwenye simu yako.
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => onOpenMedia(item, mediaKind)}
          style={({ pressed }) => ({
            borderRadius: 16,
            borderWidth: 1,
           borderColor: MR.border,
backgroundColor: "#F8FAFC",
            padding: 14,
            opacity: pressed ? 0.94 : 1,
          })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(16,185,129,0.12)",
                borderWidth: 1,
                borderColor: UI.emeraldBorder,
              }}
            >
              <Ionicons
                name={mediaKind === "PDF" ? "document-text" : "document-attach"}
                size={22}
                color={UI.emerald}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text
                style={{ color: MR.text, fontWeight: "900", fontSize: 14 }}
                numberOfLines={1}
              >
                {clean(item.file_name) || (mediaKind === "PDF" ? "PDF document" : "Document")}
              </Text>

              <Text
                style={{
                  color: MR.faint,
                  fontWeight: "800",
                  fontSize: 12,
                  marginTop: 4,
                }}
                numberOfLines={1}
              >
                {mediaKind === "PDF" ? "Tap to open PDF" : "Tap to open document"}
              </Text>
            </View>
          </View>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ marginBottom: clean(item.message_text) ? 8 : 0 }}>
      {hasLocalCopy ? (
        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: UI.emeraldBorder,
            backgroundColor: "#ECFDF5",
            paddingHorizontal: 10,
            paddingVertical: 8,
            marginBottom: 8,
          }}
        >
          <Text style={{ color: UI.emerald, fontWeight: "900", fontSize: 12 }}>
            Saved on this device
          </Text>
          <Text
            style={{
              color: MR.faint,
              fontWeight: "700",
              fontSize: 12,
              marginTop: 4,
              lineHeight: 18,
            }}
          >
            Hii media inasomwa kutoka kwenye simu yako.
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={() => onOpenMedia(item, "AUDIO")}
        style={({ pressed }) => ({
          borderRadius: 16,
          borderWidth: 1,
      borderColor: MR.border,
backgroundColor: "#F8FAFC",
          padding: 14,
          opacity: pressed ? 0.94 : 1,
        })}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(16,185,129,0.12)",
              borderWidth: 1,
              borderColor: UI.emeraldBorder,
            }}
          >
            <Ionicons name="mic" size={18} color={UI.emerald} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ color: MR.text, fontWeight: "900", fontSize: 14 }}>
              Audio attachment
            </Text>
            <Text
              style={{
                color: MR.faint,
                fontWeight: "800",
                fontSize: 12,
                marginTop: 4,
              }}
            >
              Tap to open audio
            </Text>
          </View>
        </View>
      </Pressable>
    </View>
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
  const insets = useSafeAreaInsets();

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
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [pickingMedia, setPickingMedia] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState("");
  const [viewerKind, setViewerKind] = useState<"IMAGE" | "VIDEO" | "AUDIO" | "PDF" | "DOCUMENT" | null>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);

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
  const seenMentionsHydratedRef = useRef(false);
  const mentionPersistSaveBusyRef = useRef(false);

  const [mediaCacheByKey, setMediaCacheByKey] = useState<Record<string, string>>({});
  const mediaCacheRef = useRef<Record<string, string>>({});

  useEffect(() => {
    mediaCacheRef.current = mediaCacheByKey;
  }, [mediaCacheByKey]);

  const canManageMembers = useMemo(() => {
    const rr = clean(roomRole).toUpperCase();
    return rr === "OWNER" || rr === "ADMIN";
  }, [roomRole]);

  const hydrateSeenMentions = useCallback(async () => {
    const key = mentionSeenStorageKey(roomId, myUserId);
    if (!key) {
      seenMentionIdsRef.current = new Set();
      seenMentionsHydratedRef.current = true;
      return;
    }

    try {
      const raw = await AsyncStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      const ids = Array.isArray(parsed)
        ? parsed.map((x) => clean(x)).filter(Boolean)
        : [];

      seenMentionIdsRef.current = new Set(ids);
    } catch {
      seenMentionIdsRef.current = new Set();
    } finally {
      seenMentionsHydratedRef.current = true;
    }
  }, [roomId, myUserId]);

  const persistSeenMentions = useCallback(async () => {
    const key = mentionSeenStorageKey(roomId, myUserId);
    if (!key) return;
    if (mentionPersistSaveBusyRef.current) return;

    mentionPersistSaveBusyRef.current = true;
    try {
      const ids = Array.from(seenMentionIdsRef.current).filter(Boolean).slice(-300);
      await AsyncStorage.setItem(key, JSON.stringify(ids));
    } catch {
      // silent
    } finally {
      mentionPersistSaveBusyRef.current = false;
    }
  }, [roomId, myUserId]);

  const hydrateLocalMediaCache = useCallback(async () => {
    const key = mediaLocalCacheStorageKey(roomId, myUserId);
    if (!key) {
      setMediaCacheByKey({});
      mediaCacheRef.current = {};
      return;
    }

    try {
      const raw = await AsyncStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : {};
      const next =
        parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};

      setMediaCacheByKey(next);
      mediaCacheRef.current = next;
    } catch {
      setMediaCacheByKey({});
      mediaCacheRef.current = {};
    }
  }, [roomId, myUserId]);

  const persistLocalMediaCache = useCallback(
    async (nextMap: Record<string, string>) => {
      const key = mediaLocalCacheStorageKey(roomId, myUserId);
      if (!key) return;
      try {
        await AsyncStorage.setItem(key, JSON.stringify(nextMap ?? {}));
      } catch {
        // silent
      }
    },
    [roomId, myUserId]
  );

  const rememberLocalMedia = useCallback(
    async (args: {
      attachmentPath?: string | null;
      attachmentUrl?: string | null;
      localUri?: string | null;
    }) => {
      const localUri = clean(args.localUri);
      if (!localUri) return;

      const exists = await localFileExists(localUri);
      if (!exists) return;

      const keys = mediaCacheKeys({
        attachment_path: args.attachmentPath,
        attachment_url: args.attachmentUrl,
      });

      if (keys.length === 0) return;

      const next = { ...mediaCacheRef.current };
      for (const key of keys) {
        next[key] = localUri;
      }

      mediaCacheRef.current = next;
      setMediaCacheByKey(next);
      await persistLocalMediaCache(next);
    },
    [persistLocalMediaCache]
  );

  const resolveLocalMediaUri = useCallback((item: MessageRow) => {
    return pickCachedMediaUri(mediaCacheRef.current, {
      attachment_path: item.attachment_path,
      attachment_url: item.attachment_url,
    });
  }, []);

  const cacheSourceFileToDevice = useCallback(
    async (args: {
      sourceUri: string;
      fileName?: string | null;
      mimeType?: string | null;
      kind?: string | null;
    }) => {
      const sourceUri = clean(args.sourceUri);
      const dir = buildMeetingRoomMediaLocalDir(roomId, myUserId);

      if (!sourceUri || !dir) return "";

      await ensureLocalDir(dir);

      const ext = safeFileExt(args.fileName, args.mimeType, args.kind);
      const baseName = sanitizeFileName(
        clean(args.fileName) || `media-${Date.now()}.${ext}`
      );
      const finalName = baseName.includes(".") ? baseName : `${baseName}.${ext}`;
      const destination = `${dir}${Date.now()}-${finalName}`;

      try {
        if (isLocalFileUri(sourceUri)) {
          await FileSystem.copyAsync({ from: sourceUri, to: destination });
        } else {
          await FileSystem.downloadAsync(sourceUri, destination);
        }

        const exists = await localFileExists(destination);
        return exists ? destination : "";
      } catch {
        return "";
      }
    },
    [roomId, myUserId]
  );

  const ensureMediaAvailableLocally = useCallback(
    async (item: MessageRow) => {
      const cached = resolveLocalMediaUri(item);
      if (cached) {
        const exists = await localFileExists(cached);
        if (exists) return cached;
      }

      const remoteUrl = clean(item.attachment_url);
      if (!remoteUrl) return "";

      const localUri = await cacheSourceFileToDevice({
        sourceUri: remoteUrl,
        fileName: clean(item.file_name) || `${clean(item.id) || "media"}`,
        mimeType: item.mime_type,
        kind: item.media_kind,
      });

      if (localUri) {
        await rememberLocalMedia({
          attachmentPath: item.attachment_path,
          attachmentUrl: item.attachment_url,
          localUri,
        });
      }

      return localUri || remoteUrl;
    },
    [resolveLocalMediaUri, cacheSourceFileToDevice, rememberLocalMedia]
  );

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

    const { data, error } = await supabase.rpc("get_meeting_room_messages_v7", {
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

    try {
      await persistSeenMentions();
    } catch {
      // silent
    }
  }, [roomId, persistSeenMentions]);

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
    seenMentionsHydratedRef.current = false;
    seenMentionIdsRef.current = new Set();
  }, [roomId, myUserId]);

  useEffect(() => {
    setMediaCacheByKey({});
    mediaCacheRef.current = {};
    if (!roomId || !myUserId) return;
    void hydrateLocalMediaCache();
  }, [roomId, myUserId, hydrateLocalMediaCache]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!roomId || !myUserId) return;
    if (seenMentionsHydratedRef.current) return;

    void hydrateSeenMentions();
  }, [roomId, myUserId, hydrateSeenMentions]);

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
    if (!seenMentionsHydratedRef.current) return;

    const fresh = [...messages].slice(-30);
    let changed = false;

    for (const msg of fresh) {
      const msgId = clean(msg.id);
      if (!msgId) continue;
      if (msgId.startsWith("local-")) continue;
      if (msgId.startsWith("local-media-")) continue;
      if (seenMentionIdsRef.current.has(msgId)) continue;

      const isMine =
        clean(msg.sender_user_id) && clean(msg.sender_user_id) === clean(myUserId);
      if (isMine) continue;

      const tokens = extractMentionTokens(clean(msg.message_text));
      const mentionedMe = tokens.some((t) => myMentionKeys.has(t));

      if (!mentionedMe) continue;

      seenMentionIdsRef.current.add(msgId);
      changed = true;

      const sender = displayMemberName(msg.sender_display_name, msg.sender_user_id);
      Alert.alert("Mention", `${sender} amekutaja kwenye room.`);
    }

    if (changed) {
      void persistSeenMentions();
    }
  }, [messages, myMentionKeys, myUserId, persistSeenMentions]);

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
const pickDocumentFromDevice = useCallback(async () => {
    if (!roomId) {
      Alert.alert("Room missing", "Hakuna room iliyochaguliwa.");
      return;
    }

    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "text/plain",
          "application/zip",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (res.canceled || !res.assets?.length) return;

      const asset = res.assets[0];
      const mimeType = clean((asset as any).mimeType).toLowerCase();
      const fileName = clean((asset as any).name) || "document";
      const fileSize = Number((asset as any).size ?? 0) || null;
      const sizeMb = bytesToMb(fileSize);

      if (fileSize && sizeMb > MAX_DOCUMENT_SIZE_MB) {
        Alert.alert(
          "Document too large",
          `Chagua file isiyozidi ${MAX_DOCUMENT_SIZE_MB} MB. Hii ni ${sizeMb.toFixed(1)} MB.`
        );
        return;
      }

      const kind: "PDF" | "DOCUMENT" = mimeType.includes("pdf") ? "PDF" : "DOCUMENT";

      setPendingMedia({
        uri: clean((asset as any).uri),
        kind,
        fileName,
        mimeType: mimeType || "application/octet-stream",
        fileSize,
      });
    } catch (e: any) {
      Alert.alert("Document picker failed", e?.message ?? "Imeshindikana kuchagua document.");
    }
  }, [roomId]);

const pickMediaFromLibrary = useCallback(async () => {
    if (!roomId) {
      Alert.alert("Room missing", "Hakuna room iliyochaguliwa.");
      return;
    }

    try {
      setPickingMedia(true);

      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Ruhusa ya media gallery inahitajika.");
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"] as any,
        allowsEditing: false,
        quality: 0.7,
        videoMaxDuration: 30,
        selectionLimit: 1,
      });

      if (res.canceled || !res.assets?.length) return;

      const asset = res.assets[0];
      const mime = clean((asset as any).mimeType).toLowerCase();
      const type = clean((asset as any).type).toLowerCase();

      const kind: "IMAGE" | "VIDEO" =
        type === "video" || mime.startsWith("video/") ? "VIDEO" : "IMAGE";

      const fileSize = Number((asset as any).fileSize ?? 0) || null;
      const sizeMb = bytesToMb(fileSize);

      if (kind === "IMAGE" && fileSize && sizeMb > MAX_IMAGE_SIZE_MB) {
        Alert.alert(
          "Image too large",
          `Chagua image isiyozidi ${MAX_IMAGE_SIZE_MB} MB. Hii ni ${sizeMb.toFixed(1)} MB.`
        );
        return;
      }

      if (kind === "VIDEO" && fileSize && sizeMb > MAX_VIDEO_SIZE_MB) {
        Alert.alert(
          "Video too large",
          `Chagua video isiyozidi ${MAX_VIDEO_SIZE_MB} MB na iwe fupi. Hii ni ${sizeMb.toFixed(1)} MB.`
        );
        return;
      }

      setPendingMedia({
        uri: clean(asset.uri),
        kind,
        fileName:
          clean((asset as any).fileName) ||
          `media.${kind === "VIDEO" ? "mp4" : "jpg"}`,
        mimeType:
          clean((asset as any).mimeType) ||
          (kind === "VIDEO" ? "video/mp4" : "image/jpeg"),
        fileSize,
      });
    } catch (e: any) {
      Alert.alert("Media picker failed", e?.message ?? "Imeshindikana kuchagua media.");
    } finally {
      setPickingMedia(false);
    }
  }, [roomId]);

  const uploadMeetingRoomMedia = useCallback(
    async (media: PendingMedia) => {
      if (!roomId) throw new Error("Room missing");
      if (!myUserId) throw new Error("User missing");

      const sizeMb = bytesToMb(media.fileSize);

      if (media.kind === "VIDEO" && media.fileSize && sizeMb > MAX_VIDEO_SIZE_MB) {
        throw new Error(
          `Video too large. Tafadhali tumia video isiyozidi ${MAX_VIDEO_SIZE_MB} MB.`
        );
      }

      if (media.kind === "IMAGE" && media.fileSize && sizeMb > MAX_IMAGE_SIZE_MB) {
        throw new Error(
          `Image too large. Tafadhali tumia image isiyozidi ${MAX_IMAGE_SIZE_MB} MB.`
        );
      }

      if (
        (media.kind === "PDF" || media.kind === "DOCUMENT") &&
        media.fileSize &&
        sizeMb > MAX_DOCUMENT_SIZE_MB
      ) {
        throw new Error(
          `Document too large. Tafadhali tumia file isiyozidi ${MAX_DOCUMENT_SIZE_MB} MB.`
        );
      }

      const ext = safeFileExt(media.fileName, media.mimeType, media.kind);
      const filePath = `${roomId}/${myUserId}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

      const base64 = await FileSystem.readAsStringAsync(media.uri, {
        encoding: "base64" as any,
      });

      const binary = globalThis.atob(base64);
      const fileData = Uint8Array.from(binary, (c) => c.charCodeAt(0));

      const { error: uploadError } = await supabase.storage
        .from(MEETING_ROOM_MEDIA_BUCKET)
        .upload(filePath, fileData, {
          contentType: clean(media.mimeType) || undefined,
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage
        .from(MEETING_ROOM_MEDIA_BUCKET)
        .getPublicUrl(filePath);

      const publicUrl = clean(data?.publicUrl);
      if (!publicUrl) {
        throw new Error("Failed to generate media URL");
      }

      return {
        attachmentPath: filePath,
        attachmentUrl: publicUrl,
      };
    },
    [roomId, myUserId]
  );

  const sendSelectedMedia = useCallback(async () => {
    if (!roomId) {
      Alert.alert("Room missing", "Hakuna room iliyochaguliwa.");
      return;
    }

    if (!pendingMedia) return;

    const caption = clean(text);
    const optimisticId = `local-media-${Date.now()}`;

    const optimisticMessage: MessageRow = {
      id: optimisticId,
      sender_user_id: myUserId,
      sender_display_name: "You",
      message_text:
        caption ||
        (pendingMedia.kind === "PDF"
          ? `PDF: ${pendingMedia.fileName}`
          : pendingMedia.kind === "DOCUMENT"
          ? `DOCUMENT: ${pendingMedia.fileName}`
          : null),
      attachment_url: pendingMedia.uri,
      attachment_path: null,
      message_type: "MEDIA",
      media_kind: pendingMedia.kind,
      is_expired: false,
      expires_at: null,
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
      setUploadingMedia(true);

      const uploaded = await uploadMeetingRoomMedia(pendingMedia);

      let rpcError: any = null;

      if (pendingMedia.kind === "PDF" || pendingMedia.kind === "DOCUMENT") {
        const { error } = await supabase.rpc("send_meeting_room_document_v1", {
          p_room_id: roomId,
          p_media_kind: pendingMedia.kind,
          p_attachment_url: uploaded.attachmentUrl,
          p_attachment_path: uploaded.attachmentPath,
          p_file_name: pendingMedia.fileName,
          p_file_size_bytes: pendingMedia.fileSize ?? null,
          p_mime_type: pendingMedia.mimeType ?? null,
          p_message:
            caption ||
            (pendingMedia.kind === "PDF"
              ? `PDF: ${pendingMedia.fileName}`
              : `DOCUMENT: ${pendingMedia.fileName}`),
          p_reply_to_message_id: replyTo?.id ?? null,
          p_expires_at: null,
        } as any);

        rpcError = error;
      } else {
        const { error } = await supabase.rpc("send_meeting_room_media_v1", {
          p_room_id: roomId,
          p_media_kind: pendingMedia.kind,
          p_attachment_url: uploaded.attachmentUrl,
          p_attachment_path: uploaded.attachmentPath,
          p_message:
  caption ||
  (pendingMedia.kind === "VIDEO"
    ? `VIDEO: ${pendingMedia.fileName}`
    : `IMAGE: ${pendingMedia.fileName}`), 
          p_reply_to_message_id: replyTo?.id ?? null,
          p_expires_at: null,
        } as any);

        rpcError = error;
      }

      if (rpcError) throw rpcError;

      const savedLocalUri = await cacheSourceFileToDevice({
        sourceUri: pendingMedia.uri,
        fileName: pendingMedia.fileName,
        mimeType: pendingMedia.mimeType,
        kind: pendingMedia.kind,
      });

      if (savedLocalUri) {
        await rememberLocalMedia({
          attachmentPath: uploaded.attachmentPath,
          attachmentUrl: uploaded.attachmentUrl,
          localUri: savedLocalUri,
        });
      }

      setPendingMedia(null);
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

      const details =
        e?.message ||
        e?.error_description ||
        e?.details ||
        e?.hint ||
        "Failed to send media.";

      Alert.alert("Media send failed", String(details));
      console.log("MEETING_ROOM_MEDIA_SEND_ERROR", e);
    } finally {
      setUploadingMedia(false);
    }
  }, [
    roomId,
    pendingMedia,
    text,
    myUserId,
    replyTo,
    uploadMeetingRoomMedia,
    loadMessages,
    loadTypingMembers,
    markAsReadSafe,
    setTypingStateSafe,
  ]);
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

      const { error } = await supabase.rpc("send_meeting_room_message_v4", {
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
      const textPart = clean(actionMessage.text);
      const urlPart = clean(actionMessage.attachmentUrl);

      if (textPart) {
        await Clipboard.setStringAsync(textPart);
        setActionMessage(null);
        Alert.alert("Copied", "Message imenakiliwa.");
        return;
      }

      if (urlPart) {
        await Clipboard.setStringAsync(urlPart);
        setActionMessage(null);
        Alert.alert("Copied", "File link imenakiliwa.");
        return;
      }

      Alert.alert("Nothing to copy", "Hakuna content ya kunakili kwenye item hii.");
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

  const handleShareMessage = useCallback(async () => {
    if (!actionMessage) return;

    try {
      const textPart = clean(actionMessage.text);
      const urlPart = clean(actionMessage.attachmentUrl);
      const isFile = actionMessage.messageType === "MEDIA";

      if (urlPart && textPart) {
        await Share.share({
          message: isFile ? `${textPart}\n${urlPart}` : `${textPart}\n${urlPart}`,
          url: urlPart,
        });
      } else if (urlPart) {
        await Share.share({
          message: urlPart,
          url: urlPart,
        });
      } else if (textPart) {
        await Share.share({
          message: textPart,
        });
      } else {
        Alert.alert("Nothing to share", "Hakuna content ya kushare kwenye message hii.");
        return;
      }

      setActionMessage(null);
    } catch (e: any) {
      Alert.alert("Share failed", e?.message ?? "Imeshindikana kushare message.");
    }
  }, [actionMessage]);

  const openMediaViewer = useCallback(
    async (item: MessageRow, kind: "IMAGE" | "VIDEO" | "AUDIO" | "PDF" | "DOCUMENT") => {
      const target = await ensureMediaAvailableLocally(item);
      const finalUri = clean(target) || clean(item.attachment_url);
      if (!finalUri) return;

      setViewerUrl(finalUri);
      setViewerKind(kind);
      setViewerOpen(true);
    },
    [ensureMediaAvailableLocally]
  );

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
      const resolvedMediaUri = resolveLocalMediaUri(item);

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
                    color: MR.muted,
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
                    color: MR.muted,
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
                    text:
                      clean(item.message_text) ||
                      (normalizeMessageType(item.message_type) === "MEDIA"
                        ? `[${normalizeMediaKind(item.media_kind)}]`
                        : ""),
                    mine: !!mine,
                  })
                }
              >
                <Pressable
                  onLongPress={() =>
                    setActionMessage({
                      id: clean(item.id),
                      text:
                        clean(item.message_text) ||
                        (normalizeMessageType(item.message_type) === "MEDIA"
                          ? `[${normalizeMediaKind(item.media_kind)}]`
                          : ""),
                      mine: !!mine,
                      myLoveReacted: loved,
                      myLikeReacted: liked,
                      myFireReacted: fired,
                      attachmentUrl: clean(item.attachment_url) || null,
                      messageType:
                        normalizeMessageType(item.message_type) === "MEDIA"
                          ? "MEDIA"
                          : "TEXT",
                      mediaKind:
                        normalizeMessageType(item.message_type) === "MEDIA"
                          ? normalizeMediaKind(item.media_kind)
                          : null,
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
                       borderColor: mine ? MR.borderStrong : MR.border,
backgroundColor: mine ? MR.bubbleMine : MR.bubbleOther,
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
                              color: MR.faint,
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

                      <MessageMediaBlock
                        item={item}
                        resolvedUri={resolvedMediaUri}
                        onOpenMedia={openMediaViewer}
                      />

                      {clean(item.message_text) ? (
                        <MessageTextWithMentions text={clean(item.message_text)} />
                      ) : normalizeMessageType(item.message_type) === "TEXT" ? (
                        <MessageTextWithMentions text="—" />
                      ) : null}

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
    [
      myUserId,
      messages,
      reactingId,
      toggleReaction,
      scrollToMessage,
      openMediaViewer,
      resolveLocalMediaUri,
    ]
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
        borderColor: MR.border,
backgroundColor: MR.inputBg,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Ionicons name="chevron-back" size={20} color={UI.text} />
          </Pressable>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                color: MR.text,
                fontWeight: "900",
                fontSize: 22,
              }}
              numberOfLines={1}
            >
              {title}
            </Text>

            <Text
              style={{
                color: MR.muted,
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
              <Text style={{ color: MR.text, fontWeight: "900", fontSize: 12 }}>
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
              backgroundColor: "#FFFFFF",
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
           borderColor: MR.border,
backgroundColor: MR.panel,
                padding: 12,
                gap: 10,
              }}
            >
              <Text style={{ color: MR.text, fontWeight: "900", fontSize: 14 }}>
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
              borderColor: MR.border,
backgroundColor: MR.panel,
                  color: MR.text,
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
                  <Text style={{ color: MR.text, fontWeight: "900" }}>INTERNAL</Text>
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
                  <Text style={{ color: MR.text, fontWeight: "900" }}>EXTERNAL</Text>
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
                  <Text style={{ color: MR.text, fontWeight: "900" }}>MEMBER</Text>
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
                  <Text style={{ color: MR.text, fontWeight: "900" }}>ADMIN</Text>
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
                  <Text style={{ color: MR.text, fontWeight: "900", fontSize: 14 }}>
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
                <Text style={{ color: MR.text, fontWeight: "900", fontSize: 13 }}>
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
                <Text style={{ color: MR.muted, fontWeight: "800", lineHeight: 20 }}>
                  Hakuna pending invites kwa room hii sasa hivi.
                </Text>
              ) : (
                pendingInvites.map((inv, idx) => (
                  <View
                    key={clean(inv.invite_id || inv.id) || String(idx)}
                    style={{
                      borderRadius: 14,
                      borderWidth: 1,
                    borderColor: MR.border,
backgroundColor: MR.panel,
                      padding: 10,
                      gap: 4,
                    }}
                  >
                    <Text style={{ color: MR.text, fontWeight: "900" }}>
                      {clean(inv.email) || "No email"}
                    </Text>
                    <Text style={{ color: MR.muted, fontSize: 12, fontWeight: "800" }}>
                      {niceMemberType(inv.member_type)} • {niceRole(inv.role)}
                    </Text>
                    <Text style={{ color: MR.faint, fontSize: 11, fontWeight: "800" }}>
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
                  color: MR.text,
                  fontWeight: "900",
                  fontSize: 17,
                  marginTop: 10,
                }}
              >
                No messages yet
              </Text>
              <Text
                style={{
                  color: MR.muted,
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
        borderTopColor: MR.border,
backgroundColor: MR.panel,
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
                backgroundColor: "#ECFDF5",
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
                    color: MR.text,
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
{pendingMedia ? (
            <View
              style={{
                marginBottom: 8,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: UI.emeraldBorder,
                backgroundColor: "#ECFDF5",
                padding: 10,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                {pendingMedia.kind === "IMAGE" ? (
                  <Image
                    source={{ uri: pendingMedia.uri }}
                    resizeMode="cover"
                    style={{
                      width: 68,
                      height: 68,
                      borderRadius: 14,
                      backgroundColor: "rgba(255,255,255,0.06)",
                    }}
                  />
                ) : pendingMedia.kind === "VIDEO" ? (
                  <View
                    style={{
                      width: 68,
                      height: 68,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "rgba(255,255,255,0.06)",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.10)",
                    }}
                  >
                    <Ionicons name="videocam" size={24} color={UI.emerald} />
                  </View>
                ) : (
                  <View
                    style={{
                      width: 68,
                      height: 68,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "rgba(255,255,255,0.06)",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.10)",
                    }}
                  >
                    <Ionicons
                      name={pendingMedia.kind === "PDF" ? "document-text" : "document-attach"}
                      size={24}
                      color={UI.emerald}
                    />
                  </View>
                )}

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      color: MR.text,
                      fontWeight: "900",
                      fontSize: 13,
                    }}
                  >
                    {pendingMedia.kind === "IMAGE"
                      ? "Image selected"
                      : pendingMedia.kind === "VIDEO"
                      ? "Video selected"
                      : pendingMedia.kind === "PDF"
                      ? "PDF selected"
                      : "Document selected"}
                  </Text>

                  <Text
                    style={{
                      color: MR.muted,
                      fontWeight: "800",
                      fontSize: 12,
                      marginTop: 4,
                    }}
                    numberOfLines={2}
                  >
                    {pendingMedia.fileName}
                  </Text>

                  <Text
                    style={{
                      color: MR.faint,
                      fontWeight: "800",
                      fontSize: 11,
                      marginTop: 4,
                    }}
                  >
                    {(pendingMedia.kind === "PDF"
                      ? "PDF ready to send"
                      : pendingMedia.kind === "DOCUMENT"
                      ? "Document ready to send"
                      : `${pendingMedia.kind} ready to send`) +
                      (pendingMedia.fileSize
                        ? ` • ${bytesToMb(pendingMedia.fileSize).toFixed(1)} MB`
                        : "")}
                  </Text>
                </View>

                <Pressable
                  onPress={() => setPendingMedia(null)}
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
              </View>
            </View>
          ) : null}

          {showMentionBox ? (
            <View
              style={{
                marginBottom: 8,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: UI.emeraldBorder,
                backgroundColor: "#ECFDF5",
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
                  <Text style={{ color: MR.text, fontWeight: "900", fontSize: 14 }}>
                    {member.fullName}
                  </Text>
                  <Text
                    style={{
                      color: MR.muted,
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
           borderColor: MR.border,
backgroundColor: MR.panel,
              paddingLeft: 8,
              paddingRight: 8,
              paddingTop: 8,
              paddingBottom: 8,
            }}
          >
            <Pressable
              onPress={() => setAttachMenuOpen(true)}
              disabled={pickingMedia || uploadingMedia}
              style={({ pressed }) => ({
                width: 42,
                height: 42,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
             borderColor: MR.border,
backgroundColor: "#F8FAFC",
                opacity: pressed ? 0.9 : 1,
              })}
            >
              {pickingMedia ? (
                <ActivityIndicator size="small" />
              ) : (
                <Ionicons name="attach" size={18} color={UI.text} />
              )}
            </Pressable>

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
                color: MR.text,
                fontWeight: "700",
                fontSize: 15,
                paddingVertical: 10,
              }}
            />

            <Pressable
              onPress={() =>
                void (pendingMedia ? sendSelectedMedia() : sendMessage())
              }
              disabled={sending || uploadingMedia || (!clean(text) && !pendingMedia)}
              style={({ pressed }) => ({
                width: 46,
                height: 46,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: clean(text) || pendingMedia
                  ? UI.emeraldBorder
                  : "rgba(255,255,255,0.10)",
                backgroundColor: clean(text) || pendingMedia
                  ? UI.emeraldSoft
                  : "rgba(255,255,255,0.05)",
                opacity: pressed ? 0.9 : 1,
              })}
            >
              {sending || uploadingMedia ? (
                <ActivityIndicator />
              ) : (
                <Ionicons
                  name="send"
                  size={18}
                  color={
                    clean(text) || pendingMedia
                      ? UI.emerald
                      : "rgba(255,255,255,0.45)"
                  }
                />
              )}
            </Pressable>
          </View>
        </View>

        <Modal
          visible={attachMenuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setAttachMenuOpen(false)}
        >
          <Pressable
            onPress={() => setAttachMenuOpen(false)}
            style={{
              flex: 1,
              backgroundColor: "rgba(15,23,42,0.18)",
              justifyContent: "flex-end",
              paddingBottom: 0,
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
                paddingTop: 16,
                paddingHorizontal: 16,
                paddingBottom: Math.max(insets.bottom, 14) + 18,
                gap: 10,
              }}
            >
              <Text style={{ color: MR.text, fontWeight: "900", fontSize: 16 }}>
                Attach
              </Text>

              <Pressable
                onPress={async () => {
                  setAttachMenuOpen(false);
                  await pickMediaFromLibrary();
                }}
                style={({ pressed }) => ({
                  minHeight: 48,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: UI.emeraldBorder,
                  backgroundColor: "#ECFDF5",
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: MR.text, fontWeight: "900" }}>
                  Photos / Videos
                </Text>
              </Pressable>

              <Pressable
                onPress={async () => {
                  setAttachMenuOpen(false);
                  await pickDocumentFromDevice();
                }}
                style={({ pressed }) => ({
                  minHeight: 48,
                  borderRadius: 14,
                  borderWidth: 1,
               borderColor: MR.border,
backgroundColor: MR.panel,
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: MR.text, fontWeight: "900" }}>
                  PDF / Documents
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setAttachMenuOpen(false)}
                style={({ pressed }) => ({
                  minHeight: 50,
                  borderRadius: 14,
                  borderWidth: 1,
                 borderColor: MR.border,
backgroundColor: MR.panel,
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  marginTop: 4,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: MR.muted, fontWeight: "900" }}>Cancel</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={viewerOpen}
          transparent={false}
          animationType="fade"
          onRequestClose={() => setViewerOpen(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: MR.page,
            }}
          >
            <View
              style={{
                paddingTop: 18,
                paddingHorizontal: 16,
                paddingBottom: 12,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottomWidth: 1,
                borderBottomColor: "rgba(255,255,255,0.08)",
              }}
            >
            <Text style={{ color: MR.text, fontWeight: "900", fontSize: 16 }}>
  {viewerKind === "VIDEO"
    ? "Video"
    : viewerKind === "IMAGE"
    ? "Image"
    : viewerKind === "PDF"
    ? "PDF"
    : viewerKind === "DOCUMENT"
    ? "Document"
    : "Media"}
</Text>

<View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
  {(viewerKind === "PDF" || viewerKind === "DOCUMENT") && viewerUrl ? (
    <Pressable
      onPress={() => void openExternalUrl(viewerUrl)}
      style={({ pressed }) => ({
        minWidth: 74,
        height: 40,
        paddingHorizontal: 12,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(255,255,255,0.10)",
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 12 }}>
        Open
      </Text>
    </Pressable>
  ) : null}

  <Pressable
    onPress={() => {
      setViewerOpen(false);
      setViewerUrl("");
      setViewerKind(null);
    }}
    style={({ pressed }) => ({
      width: 40,
      height: 40,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.10)",
      opacity: pressed ? 0.88 : 1,
    })}
  >
    <Ionicons name="close" size={20} color={MR.text} />
  </Pressable>
</View>  
              
            </View>

            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 10,
                paddingVertical: 10,
              }}
            >
              {viewerKind === "IMAGE" ? (
                <Image
                  source={{ uri: viewerUrl }}
                  resizeMode="contain"
                  style={{
                    width: "100%",
                    height: "100%",
                    backgroundColor: MR.page,
                  }}
                />
              ) : viewerKind === "VIDEO" ? (
                <Video
                  source={{ uri: viewerUrl }}
                  style={{
                    width: "100%",
                    height: "100%",
                    backgroundColor: MR.page,
                  }}
                  resizeMode={ResizeMode.CONTAIN}
                  useNativeControls
                  shouldPlay
                  isLooping={false}
                />
              ) : viewerKind === "PDF" ? (
  <View
    style={{
      width: "100%",
      height: "100%",
      backgroundColor: MR.page,
    }}
  >
    <WebView
      source={{ uri: buildPdfViewerSourceUri(viewerUrl) }}
      style={{ flex: 1, backgroundColor: "#000000" }}
      startInLoadingState
      renderLoading={() => (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: MR.page,
          }}
        >
          <ActivityIndicator size="large" color={MR.text} />
          <Text
            style={{
              color: "#FFFFFF",
              fontWeight: "800",
              marginTop: 12,
            }}
          >
            Loading PDF preview...
          </Text>
        </View>
      )}
      onError={() => {
        Alert.alert(
          "Preview failed",
          "PDF preview imeshindikana kufunguka ndani ya app. Tutafungua link ya file."
        );
        void openExternalUrl(viewerUrl);
      }}
    />
  </View>
) : viewerKind === "DOCUMENT" ? (
  <View
    style={{
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
      gap: 14,
    }}
  >
    <Ionicons
      name="document-attach"
      size={54}
      color={MR.text}
    />
    <Text
      style={{
        color: "#FFFFFF",
        fontWeight: "900",
        fontSize: 18,
        textAlign: "center",
      }}
    >
      Document Ready
    </Text>
    <Text
      style={{
        color: MR.muted,
        fontWeight: "700",
        fontSize: 13,
        textAlign: "center",
        lineHeight: 20,
      }}
    >
      Hii document type bado haina internal preview ya uhakika ndani ya app.
    </Text>

    <Pressable
      onPress={() => void openExternalUrl(viewerUrl)}
      style={({ pressed }) => ({
        minHeight: 48,
        minWidth: 180,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: UI.emeraldBorder,
        backgroundColor: "#ECFDF5",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
        Open Document
      </Text>
    </Pressable>
  </View>
) : (
                <Text style={{ color: "#FFFFFF", fontWeight: "800" }}>
                  Audio preview not ready yet
                </Text>
              )}
            </View>
          </View>
        </Modal>

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
                backgroundColor: MR.panel,
                paddingTop: 16,
                paddingHorizontal: 16,
                paddingBottom: Math.max(insets.bottom, 14) + 18,
                gap: 10,
              }}
            >
              <Text style={{ color: MR.text, fontWeight: "900", fontSize: 16 }}>
                Message Actions
              </Text>

              <Text
                style={{
                  color: MR.muted,
                  fontWeight: "700",
                  lineHeight: 20,
                }}
                numberOfLines={3}
              >
                {shortText(
                  actionMessage?.text ||
                    (actionMessage?.messageType === "MEDIA"
                      ? `[${clean(actionMessage?.mediaKind) || "FILE"}]`
                      : ""),
                  140
                )}
              </Text>

             {actionMessage?.messageType === "MEDIA" && clean(actionMessage?.attachmentUrl) ? (
                <Pressable
                  onPress={() => {
                    const kind =
                      actionMessage?.mediaKind === "VIDEO"
                        ? "VIDEO"
                        : actionMessage?.mediaKind === "AUDIO"
                        ? "AUDIO"
                        : actionMessage?.mediaKind === "PDF"
                        ? "PDF"
                        : actionMessage?.mediaKind === "DOCUMENT"
                        ? "DOCUMENT"
                        : "IMAGE";

                    const found = messages.find(
                      (m) => clean(m.id) === clean(actionMessage?.id)
                    );

                    setActionMessage(null);

                    if (found) {
                      void openMediaViewer(found, kind);
                      return;
                    }

                    const fallbackItem: MessageRow = {
                      id: clean(actionMessage?.id),
                      attachment_url: clean(actionMessage?.attachmentUrl),
                      attachment_path: null,
                      message_type: "MEDIA",
                      media_kind: kind,
                    };

                    void openMediaViewer(fallbackItem, kind);
                  }} 
                  style={({ pressed }) => ({
                    minHeight: 46,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: UI.emeraldBorder,
                    backgroundColor: "#ECFDF5",
                    justifyContent: "center",
                    paddingHorizontal: 14,
                    opacity: pressed ? 0.9 : 1,
                  })}
                >
                  <Text style={{ color: MR.text, fontWeight: "900" }}>Open</Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={handleReplyFromAction}
                style={({ pressed }) => ({
                  minHeight: 46,
                  borderRadius: 14,
                  borderWidth: 1,
               borderColor: MR.border,
backgroundColor: MR.panel,
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: MR.text, fontWeight: "900" }}>Reply</Text>
              </Pressable>

              <Pressable
                onPress={handleCopyMessage}
                style={({ pressed }) => ({
                  minHeight: 46,
                  borderRadius: 14,
                  borderWidth: 1,
               borderColor: MR.border,
backgroundColor: MR.panel,
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: MR.text, fontWeight: "900" }}>Copy</Text>
              </Pressable>

              <Pressable
                onPress={handleShareMessage}
                style={({ pressed }) => ({
                  minHeight: 46,
                  borderRadius: 14,
                  borderWidth: 1,
                borderColor: MR.border,
backgroundColor: MR.panel,
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: MR.text, fontWeight: "900" }}>Share</Text>
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
                  backgroundColor: "#ECFDF5",
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: MR.text, fontWeight: "900" }}>
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
                  borderColor: MR.border,
backgroundColor: MR.panel,
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: MR.text, fontWeight: "900" }}>
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
                 borderColor: MR.border,
backgroundColor: MR.panel,
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: MR.text, fontWeight: "900" }}>
                  {actionMessage?.myFireReacted ? "Remove 🔥" : "Fire 🔥"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setActionMessage(null)}
                style={({ pressed }) => ({
                  minHeight: 46,
                  borderRadius: 14,
                  borderWidth: 1,
                  bborderColor: MR.border,
backgroundColor: MR.panel,
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: MR.muted, fontWeight: "900" }}>Cancel</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </Screen>
  );
}