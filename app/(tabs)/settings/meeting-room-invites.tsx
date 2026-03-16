import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

type InviteRow = {
  invite_id?: string | null;
  id?: string | null;
  room_id?: string | null;
  organization_id?: string | null;
  room_name?: string | null;
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

function clean(v: any) {
  return String(v ?? "").trim();
}

function niceRole(v?: string | null) {
  const x = clean(v).toUpperCase();
  return x || "MEMBER";
}

function niceMemberType(v?: string | null) {
  const x = clean(v).toUpperCase();
  return x || "INTERNAL";
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

export default function MeetingRoomInvitesScreen() {
  const router = useRouter();
  const org = useOrg();

  const orgName = clean(org.activeOrgName || "No organization");
  const role = clean(org.activeRole || "—").toUpperCase();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [invites, setInvites] = useState<InviteRow[]>([]);

  const reqRef = useRef(0);

  const loadInvites = useCallback(async () => {
    const rid = ++reqRef.current;

    try {
      if (!refreshing) setLoading(true);
      setError(null);

      const { data, error } = await supabase.rpc("get_my_meeting_room_invites_v2");

      if (rid !== reqRef.current) return;
      if (error) throw error;

      const rows = Array.isArray(data) ? (data as InviteRow[]) : [];
      setInvites(rows);
    } catch (e: any) {
      if (rid !== reqRef.current) return;
      setInvites([]);
      setError(e?.message ?? "Failed to load meeting room invites.");
    } finally {
      if (rid === reqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [refreshing]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  useFocusEffect(
    useCallback(() => {
      void loadInvites();
    }, [loadInvites])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
  }, []);

  useEffect(() => {
    if (!refreshing) return;
    void loadInvites();
  }, [refreshing, loadInvites]);

  const acceptInvite = useCallback(
    async (inviteId: string) => {
      const id = clean(inviteId);
      if (!id) return;

      try {
        setAcceptingId(id);

        const { error } = await supabase.rpc("accept_meeting_room_invite_v2", {
          p_invite_id: id,
        } as any);

        if (error) throw error;

        await loadInvites();

        Alert.alert(
          "Accepted",
          "Invitation imekubaliwa successfully. Room sasa itaonekana kwenye My Rooms."
        );
      } catch (e: any) {
        Alert.alert(
          "Accept failed",
          e?.message ?? "Failed to accept invitation."
        );
      } finally {
        setAcceptingId(null);
      }
    },
    [loadInvites]
  );

  const openRoom = useCallback(
    (roomId?: string | null) => {
      const id = clean(roomId);
      if (!id) return;

      router.push({
        pathname: "/(tabs)/settings/meeting-room-detail",
        params: { roomId: id },
      });
    },
    [router]
  );

  const renderInvite = ({ item }: { item: InviteRow }) => {
    const inviteId = clean(item.invite_id || item.id);
    const roomId = clean(item.room_id);
    const isAccepting = acceptingId === inviteId;

    return (
      <Card style={{ marginBottom: 12, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: UI.emeraldBorder,
              backgroundColor: UI.emeraldSoft,
            }}
          >
            <Ionicons name="mail-open-outline" size={20} color={UI.emerald} />
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}
              numberOfLines={1}
            >
              {clean(item.room_name) || "Meeting Room"}
            </Text>

            <Text
              style={{
                color: UI.muted,
                fontWeight: "800",
                fontSize: 12,
                marginTop: 4,
              }}
              numberOfLines={1}
            >
              {niceMemberType(item.member_type)} • {niceRole(item.role)}
            </Text>
          </View>
        </View>

        <Text
          style={{ color: UI.faint, fontWeight: "800", fontSize: 12 }}
          numberOfLines={1}
        >
          {clean(item.email) || "No email"}
        </Text>

        {!!clean(item.created_at) ? (
          <Text style={{ color: UI.faint, fontWeight: "700", fontSize: 11 }}>
            Invited: {formatDateTime(item.created_at)}
          </Text>
        ) : null}

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => void acceptInvite(inviteId)}
            disabled={isAccepting || !inviteId}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 44,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: UI.emeraldBorder,
              backgroundColor: UI.emeraldSoft,
              opacity: pressed ? 0.92 : 1,
            })}
          >
            {isAccepting ? (
              <ActivityIndicator />
            ) : (
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
                Accept Invite
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => openRoom(roomId)}
            disabled={!roomId}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 44,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              opacity: pressed ? 0.92 : 1,
            })}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
              Open Room
            </Text>
          </Pressable>
        </View>
      </Card>
    );
  };

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
            style={{ color: UI.text, fontWeight: "900", fontSize: 22 }}
            numberOfLines={1}
          >
            Meeting Room Invites
          </Text>
          <Text
            style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}
            numberOfLines={1}
          >
            {orgName} • {role}
          </Text>
        </View>

        <Pressable
          onPress={() => void loadInvites()}
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
          {loading ? (
            <ActivityIndicator />
          ) : (
            <Ionicons name="refresh-outline" size={18} color={UI.text} />
          )}
        </Pressable>
      </View>

      <Card style={{ marginBottom: 14, gap: 8 }}>
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
          My Pending Invites
        </Text>
        <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
          Hapa utaona invitations zote za meeting rooms ambazo bado hujazikubali.
        </Text>
      </Card>

      {error ? (
        <Card
          style={{
            marginBottom: 14,
            borderColor: "rgba(201,74,74,0.35)",
            backgroundColor: "rgba(201,74,74,0.10)",
          }}
        >
          <Text style={{ color: UI.danger, fontWeight: "900" }}>{error}</Text>
        </Card>
      ) : null}

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={UI.emerald} />
        </View>
      ) : invites.length === 0 ? (
        <Card>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
            No pending invites
          </Text>
          <Text
            style={{
              color: UI.muted,
              fontWeight: "800",
              lineHeight: 20,
              marginTop: 8,
            }}
          >
            Hakuna pending meeting-room invites kwa account yako sasa hivi.
          </Text>
        </Card>
      ) : (
        <FlatList
          data={invites}
          keyExtractor={(item, index) =>
            clean(item.invite_id || item.id) || `${clean(item.room_id)}-${index}`
          }
          renderItem={renderInvite}
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