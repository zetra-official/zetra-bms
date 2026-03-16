import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { UI } from "@/src/ui/theme";
import { supabase } from "@/src/supabase/supabaseClient";
import { useOrg } from "@/src/context/OrgContext";

type RoomRow = {
  room_id: string;
  organization_id: string;
  organization_name?: string | null;
  room_name: string;
  description: string | null;
  is_archived: boolean;
  my_role: string;
  joined_at: string | null;
  members_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count?: number;
};

function clean(s: any) {
  return String(s ?? "").trim();
}

function toInt(x: any) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function niceRole(x: string) {
  const v = clean(x).toUpperCase();
  if (!v) return "MEMBER";
  return v;
}

function formatTime(ts?: string | null) {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatDateLabel(ts?: string | null) {
  if (!ts) return "No activity yet";

  try {
    const d = new Date(ts);
    const now = new Date();

    const isSameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();

    if (isSameDay) return formatTime(ts);
    return d.toLocaleDateString();
  } catch {
    return "No activity yet";
  }
}

function EmptyState({
  onCreate,
}: {
  onCreate: () => void;
}) {
  return (
    <Card style={{ gap: 12 }}>
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: UI.emeraldBorder,
          backgroundColor: UI.emeraldSoft,
        }}
      >
        <Ionicons name="albums-outline" size={24} color={UI.emerald} />
      </View>

      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
        No rooms yet
      </Text>

      <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
        Hujajiunga na room yoyote bado kwa account hii.
      </Text>

      <Pressable
        onPress={onCreate}
        style={({ pressed }) => ({
          minHeight: 48,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: UI.emeraldBorder,
          backgroundColor: UI.emeraldSoft,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.94 : 1,
        })}
      >
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
          Create Meeting Room
        </Text>
      </Pressable>
    </Card>
  );
}

function RoomCard({
  room,
  onPress,
}: {
  room: RoomRow;
  onPress: () => void;
}) {
  const unread = toInt(room.unread_count);

  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <Card
          style={{
            marginBottom: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            opacity: pressed ? 0.95 : 1,
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: UI.emeraldSoft,
              borderWidth: 1,
              borderColor: UI.emeraldBorder,
            }}
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={22}
              color={UI.emerald}
            />
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                color: UI.text,
                fontWeight: "900",
                fontSize: 15,
              }}
              numberOfLines={1}
            >
              {clean(room.room_name) || "Meeting Room"}
            </Text>

            <Text
              style={{
                color: UI.muted,
                fontSize: 12,
                marginTop: 4,
                fontWeight: "800",
              }}
              numberOfLines={1}
            >
              {clean(room.organization_name) || "Unknown Organization"} • {niceRole(room.my_role)} • {toInt(room.members_count)} members
            </Text>

            <Text
              style={{
                color: UI.faint,
                fontSize: 12,
                marginTop: 6,
                fontWeight: "700",
              }}
              numberOfLines={1}
            >
              {clean(room.last_message_preview) || clean(room.description) || "No activity yet"}
            </Text>
          </View>

          <View style={{ alignItems: "flex-end", gap: 8 }}>
            <Text
              style={{
                color: UI.faint,
                fontSize: 11,
                fontWeight: "800",
              }}
            >
              {formatDateLabel(room.last_message_at)}
            </Text>

            {unread > 0 ? (
              <View
                style={{
                  backgroundColor: UI.emerald,
                  borderRadius: 999,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  minWidth: 24,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: "#000",
                    fontSize: 11,
                    fontWeight: "900",
                  }}
                >
                  {unread}
                </Text>
              </View>
            ) : (
              <Ionicons
                name="chevron-forward"
                size={18}
                color="rgba(255,255,255,0.45)"
              />
            )}
          </View>
        </Card>
      )}
    </Pressable>
  );
}

export default function MeetingRoomListScreen() {
  const router = useRouter();
  const org = useOrg();

  const orgName = clean(org.activeOrgName || "No organization");
  const role = clean(org.activeRole || "—").toUpperCase();

  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reqRef = useRef(0);

  const activeRooms = useMemo(
    () => rooms.filter((x) => !Boolean(x.is_archived)),
    [rooms]
  );

  const loadRooms = useCallback(async () => {
    const rid = ++reqRef.current;

    try {
      if (!refreshing) setLoading(true);
      setErr(null);

      const { data, error } = await supabase.rpc("get_my_joined_meeting_rooms_v2");

      if (rid !== reqRef.current) return;
      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];

      setRooms(
        rows.map((r: any) => ({
          room_id: clean(r?.room_id),
          organization_id: clean(r?.organization_id),
          organization_name: clean(r?.organization_name) || null,
          room_name: clean(r?.room_name || "Meeting Room"),
          description: clean(r?.description) || null,
          is_archived: Boolean(r?.is_archived),
          my_role: clean(r?.my_role || "MEMBER"),
          joined_at: r?.joined_at ?? null,
          members_count: toInt(r?.members_count),
          last_message_at: r?.last_message_at ?? null,
          last_message_preview: clean(r?.last_message_preview) || null,
          unread_count: toInt(r?.unread_count),
        }))
      );
    } catch (e: any) {
      if (rid !== reqRef.current) return;
      setErr(e?.message ?? "Failed to load rooms");
    } finally {
      if (rid === reqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [refreshing]);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  useFocusEffect(
    useCallback(() => {
      void loadRooms();
    }, [loadRooms])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
  }, []);

  useEffect(() => {
    if (!refreshing) return;
    void loadRooms();
  }, [refreshing, loadRooms]);

  const openCreate = useCallback(() => {
    router.push("/(tabs)/settings/meeting-room-create");
  }, [router]);

  const openRoom = useCallback(
    (roomId: string) => {
      if (!clean(roomId)) return;

      router.push({
        pathname: "/(tabs)/settings/meeting-room-detail",
        params: { roomId },
      });
    },
    [router]
  );

  return (
    <Screen>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            width: 42,
            height: 42,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255,255,255,0.05)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <Ionicons name="chevron-back" size={20} color={UI.text} />
        </Pressable>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              color: UI.text,
              fontSize: 22,
              fontWeight: "900",
            }}
            numberOfLines={1}
          >
            My Rooms
          </Text>

          <Text
            style={{
              color: UI.muted,
              fontWeight: "800",
              marginTop: 4,
            }}
            numberOfLines={1}
          >
            {orgName} • {role}
          </Text>
        </View>

        <Pressable
          onPress={openCreate}
          style={({ pressed }) => ({
            width: 42,
            height: 42,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: UI.emeraldSoft,
            borderWidth: 1,
            borderColor: UI.emeraldBorder,
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <Ionicons name="add" size={20} color={UI.emerald} />
        </Pressable>
      </View>

      <Card style={{ marginBottom: 14, gap: 6 }}>
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
          Active Rooms
        </Text>
        <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
          Umejiunga na room {activeRooms.length} active kwa account hii.
        </Text>
      </Card>

      {err ? (
        <Card
          style={{
            marginBottom: 14,
            borderColor: "rgba(201,74,74,0.35)",
            backgroundColor: "rgba(201,74,74,0.10)",
            gap: 8,
          }}
        >
          <Text style={{ color: UI.danger, fontWeight: "900" }}>{err}</Text>
          <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
            Reload tena au rudi nyuma kisha fungua page upya.
          </Text>
        </Card>
      ) : null}

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={UI.emerald} />
        </View>
      ) : activeRooms.length === 0 ? (
        <EmptyState onCreate={openCreate} />
      ) : (
        <FlatList
          data={activeRooms}
          keyExtractor={(item) => item.room_id}
          renderItem={({ item }) => (
            <RoomCard room={item} onPress={() => openRoom(item.room_id)} />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}