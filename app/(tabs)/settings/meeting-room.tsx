import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { UI } from "@/src/ui/theme";
import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";

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
};

type InviteRow = {
  invite_id?: string | null;
  id?: string | null;
  room_id: string;
  organization_id: string;
  room_name: string;
  email: string;
  member_type: string;
  role: string;
  status: string;
  invited_by: string;
  created_at: string;
  invited_user_id?: string | null;
  accepted_at?: string | null;
  cancelled_at?: string | null;
};

function toInt(x: any) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function clean(s: any) {
  return String(s ?? "").trim();
}

function niceRole(x: string) {
  const v = clean(x).toUpperCase();
  if (!v) return "MEMBER";
  return v;
}

function niceMemberType(x?: string | null) {
  const v = clean(x).toUpperCase();
  return v || "INTERNAL";
}

function timeAgo(ts: string | null) {
  if (!ts) return "No message yet";

  const then = new Date(ts).getTime();
  if (!Number.isFinite(then)) return "No message yet";

  const now = Date.now();
  const diff = Math.max(0, now - then);

  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;

  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day ago`;

  return new Date(ts).toLocaleDateString();
}

const MR = {
  pageBg: "#F4F8FC",
  card: "#FFFFFF",
  card2: "#F8FAFC",
  border: "rgba(15,23,42,0.12)",
  borderStrong: "rgba(5,150,105,0.38)",
  text: "#0F172A",
  muted: "#475569",
  faint: "#64748B",
  emerald: "#047857",
  emeraldSoft: "#ECFDF5",
  iconSoft: "#F0FDF4",
  danger: "#B91C1C",
};

function StatPill({
  icon,
  label,
  value,
  hint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: MR.border,
        backgroundColor: MR.card2,
        padding: 13,
        gap: 8,
        shadowColor: "#000",
        shadowOpacity: 0.16,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
        elevation: 4,
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 15,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: MR.borderStrong,
          backgroundColor: "rgba(16,185,129,0.12)",
        }}
      >
        <Ionicons name={icon} size={18} color={MR.emerald} />
      </View>

      <Text style={{ color: MR.faint, fontWeight: "900", fontSize: 11 }} numberOfLines={1}>
        {label}
      </Text>

      <Text style={{ color: MR.text, fontWeight: "900", fontSize: 16 }} numberOfLines={1}>
        {value}
      </Text>

      {!!hint ? (
        <Text style={{ color: MR.muted, fontWeight: "800", fontSize: 12 }} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}


function ActionButton({
  title,
  subtitle,
  icon,
  onPress,
  primary,
  rightText,
}: {
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  primary?: boolean;
  rightText?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: primary ? MR.borderStrong : MR.border,
        backgroundColor: primary ? "rgba(16,185,129,0.14)" : MR.card2,
        padding: 14,
        opacity: pressed ? 0.92 : 1,
        shadowColor: primary ? MR.emerald : "#000",
        shadowOpacity: primary ? 0.16 : 0.10,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
        elevation: primary ? 4 : 2,
      })}
    >
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: primary ? MR.borderStrong : MR.border,
backgroundColor: primary ? MR.iconSoft : "#FFFFFF",
        }}
      >
        <Ionicons
          name={icon}
          size={20}
          color={primary ? MR.emerald : MR.text}
        />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: MR.text, fontWeight: "900", fontSize: 15 }}>
          {title}
        </Text>

        {!!subtitle ? (
          <Text
            style={{
              color: MR.muted,
              fontWeight: "800",
              fontSize: 12,
              marginTop: 4,
            }}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {!!rightText ? (
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            borderWidth: 1,
           borderColor: primary ? MR.borderStrong : MR.border,
backgroundColor: primary ? MR.emeraldSoft : "#FFFFFF",
          }}
        >
          <Text style={{ color: MR.text, fontWeight: "900", fontSize: 12 }}>
            {rightText}
          </Text>
        </View>
      ) : (
        <Ionicons
          name="chevron-forward"
          size={18}
          color="rgba(255,255,255,0.55)"
        />
      )}
    </Pressable>
  );
}

function SmallRoomCard({
  row,
  onPress,
}: {
  row: RoomRow;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: MR.border,
backgroundColor: MR.card2,
            padding: 12,
            gap: 8,
            opacity: pressed ? 0.94 : 1,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: UI.emeraldBorder,
                backgroundColor: UI.emeraldSoft,
              }}
            >
              <Ionicons name="chatbubbles-outline" size={18} color={MR.emerald} />
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{ color: MR.text, fontWeight: "900", fontSize: 14 }}
                numberOfLines={1}
              >
                {row.room_name}
              </Text>
              <Text
                style={{
                  color: MR.muted,
                  fontWeight: "800",
                  fontSize: 12,
                  marginTop: 2,
                }}
                numberOfLines={1}
              >
                {clean(row.organization_name) || "Unknown Organization"} • {niceRole(row.my_role)} • {row.members_count} members
              </Text>
            </View>

            <Text style={{ color: MR.faint, fontWeight: "800", fontSize: 11 }}>
              {timeAgo(row.last_message_at)}
            </Text>
          </View>

          <Text
            style={{ color: UI.muted, fontWeight: "800", lineHeight: 18 }}
            numberOfLines={2}
          >
            {clean(row.last_message_preview) || clean(row.description) || "No activity yet."}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export default function MeetingRoomScreen() {
  const router = useRouter();
  const org = useOrg();

  const orgName = clean(org.activeOrgName || "No organization");
  const role = clean(org.activeRole || "—").toUpperCase();
  const store = clean(org.activeStoreName || "—");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const reqRef = useRef(0);

  const canCreateRoom = role === "OWNER" || role === "ADMIN";

  const activeRooms = useMemo(
    () => rooms.filter((x) => !Boolean(x.is_archived)),
    [rooms]
  );

  const archivedRooms = useMemo(
    () => rooms.filter((x) => Boolean(x.is_archived)),
    [rooms]
  );

  const recentRooms = useMemo(() => activeRooms.slice(0, 3), [activeRooms]);

  const goBackSafe = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.push("/(tabs)/settings");
  }, [router]);

  const load = useCallback(async () => {
    const rid = ++reqRef.current;

    setLoading(true);
    setErr(null);

    try {
      const [roomsRes, invitesRes] = await Promise.allSettled([
        supabase.rpc("get_my_joined_meeting_rooms_v2"),
        supabase.rpc("get_my_meeting_room_invites_v2"),
      ]);

      if (rid !== reqRef.current) return;

      let nextRooms: RoomRow[] = [];
      let nextInvites: InviteRow[] = [];
      let firstErr: string | null = null;

      if (roomsRes.status === "fulfilled") {
        const payload: any = roomsRes.value;
        if (payload?.error) {
          firstErr = payload.error.message ?? "Failed to load rooms";
        } else {
          const rows = Array.isArray(payload?.data) ? payload.data : [];
          nextRooms = rows.map((r: any) => ({
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
          }));
        }
      } else {
        firstErr = roomsRes.reason?.message ?? "Failed to load rooms";
      }

      if (invitesRes.status === "fulfilled") {
        const payload: any = invitesRes.value;
        if (payload?.error) {
          if (!firstErr) firstErr = payload.error.message ?? "Failed to load invites";
        } else {
          const rows = Array.isArray(payload?.data) ? payload.data : [];
          nextInvites = rows.map((r: any) => ({
            invite_id: clean(r?.invite_id || r?.id) || null,
            id: clean(r?.id) || null,
            room_id: clean(r?.room_id),
            organization_id: clean(r?.organization_id),
            room_name: clean(r?.room_name || "Meeting Room"),
            email: clean(r?.email),
            member_type: clean(r?.member_type),
            role: clean(r?.role),
            status: clean(r?.status),
            invited_by: clean(r?.invited_by),
            created_at: clean(r?.created_at),
            invited_user_id: clean(r?.invited_user_id) || null,
            accepted_at: clean(r?.accepted_at) || null,
            cancelled_at: clean(r?.cancelled_at) || null,
          }));
        }
      } else {
        if (!firstErr) firstErr = invitesRes.reason?.message ?? "Failed to load invites";
      }

      setRooms(nextRooms);
      setInvites(nextInvites);
      setErr(firstErr);
    } catch (e: any) {
      if (rid !== reqRef.current) return;
      setErr(e?.message ?? "Failed to load meeting room data");
    } finally {
      if (rid === reqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const openCreate = useCallback(() => {
    if (!canCreateRoom) {
      Alert.alert("Not allowed", "Only Owner/Admin can create meeting rooms.");
      return;
    }

    router.push("/(tabs)/settings/meeting-room-create");
  }, [canCreateRoom, router]);

  const openRooms = useCallback(() => {
    router.push("/(tabs)/settings/meeting-room-list");
  }, [router]);

  const openRoomDetail = useCallback(
    (roomId: string) => {
      if (!clean(roomId)) return;
      router.push({
        pathname: "/(tabs)/settings/meeting-room-detail",
        params: { roomId },
      });
    },
    [router]
  );

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

        await load();
        Alert.alert("Accepted", "Invitation imekubaliwa successfully.");
      } catch (e: any) {
        Alert.alert("Accept failed", e?.message ?? "Failed to accept invite.");
      } finally {
        setAcceptingId(null);
      }
    },
    [load]
  );

  const openInvites = useCallback(() => {
    router.push("/(tabs)/settings/meeting-room-invites");
  }, [router]);

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 2 }}>
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
backgroundColor: MR.card,
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <Ionicons name="chevron-back" size={20} color={UI.text} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={{ color: MR.text, fontWeight: "900", fontSize: 24 }}>
            Meeting Room
          </Text>
          <Text style={{ color: MR.muted, fontWeight: "800", marginTop: 4 }}>
            {orgName} • {role}
          </Text>
        </View>

        <Pressable
          onPress={() => void load()}
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

      <View style={{ marginTop: 14 }}>
        <Card
          style={{
            gap: 14,
            borderColor: MR.borderStrong,
            backgroundColor: MR.card,
            shadowColor: MR.emerald,
            shadowOpacity: 0.12,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
            elevation: 5,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 54,
                height: 54,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: UI.emeraldBorder,
                backgroundColor: UI.emeraldSoft,
              }}
            >
              <Ionicons name="chatbubbles-outline" size={24} color={UI.emerald} />
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: MR.text, fontWeight: "900", fontSize: 17 }}>
                Organization Communication Hub
              </Text>
              <Text
                style={{
                  color: MR.muted,
                  fontWeight: "800",
                  fontSize: 12,
                  marginTop: 4,
                }}
              >
                Create rooms, invite ZETRA users, share updates, and coordinate operational work across your joined rooms.
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <StatPill
              icon="business-outline"
              label="Organization"
              value={orgName || "—"}
            />
            <StatPill
              icon="storefront-outline"
              label="Active Store"
              value={store || "—"}
            />
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <StatPill
              icon="albums-outline"
              label="My Active Rooms"
              value={String(activeRooms.length)}
              hint={archivedRooms.length > 0 ? `${archivedRooms.length} archived` : "live rooms"}
            />
            <StatPill
              icon="mail-open-outline"
              label="Pending Invites"
              value={String(invites.length)}
              hint="linked to ZETRA accounts"
            />
          </View>
        </Card>
      </View>

      {!!err ? (
        <View style={{ marginTop: 14 }}>
          <Card
            style={{
              borderColor: "rgba(201,74,74,0.35)",
              backgroundColor: "rgba(201,74,74,0.10)",
              gap: 8,
            }}
          >
            <Text style={{ color: UI.danger, fontWeight: "900" }}>
              {err}
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
              Baadhi ya SQL readers zime-load, lakini kuna sehemu bado inahitaji kufungwa kwenye hatua inayofuata.
            </Text>
          </Card>
        </View>
      ) : null}

      <View style={{ marginTop: 14 }}>
        <Card style={{ gap: 12 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
            Quick Start
          </Text>

          <ActionButton
            title="Create Meeting Room"
            subtitle="Start a new room for staff, suppliers, customers, leadership, or any ZETRA users"
            icon="add-circle-outline"
            primary
            rightText={canCreateRoom ? "READY" : "LOCKED"}
            onPress={openCreate}
          />

          <ActionButton
            title="Open My Rooms"
            subtitle="View all rooms you belong to across joined organizations/rooms"
            icon="albums-outline"
            rightText={String(activeRooms.length)}
            onPress={openRooms}
          />

          <ActionButton
            title="Invitations"
            subtitle="Manage invited people, ZETRA-account participants, and membership flow"
            icon="mail-open-outline"
            rightText={String(invites.length)}
            onPress={openInvites}
          />
        </Card>
      </View>

      <View style={{ marginTop: 14 }}>
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15, flex: 1 }}>
              My Pending Invites
            </Text>
          </View>

          {invites.length === 0 ? (
            <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
              No pending invites for your account right now.
            </Text>
          ) : (
            invites.map((inv, idx) => {
              const inviteId = clean(inv.invite_id || inv.id);

              return (
                <View
                  key={inviteId || `${inv.room_id}-${idx}`}
                  style={{
                    borderRadius: 18,
                    borderWidth: 1,
                   borderColor: MR.border,
backgroundColor: MR.card2,
                    padding: 12,
                    gap: 8,
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                    {clean(inv.room_name) || "Meeting Room"}
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                    {niceMemberType(inv.member_type)} • {niceRole(inv.role)}
                  </Text>

                  <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 12 }}>
                    {clean(inv.email)}
                  </Text>

                  <Pressable
                    onPress={() => void acceptInvite(inviteId)}
                    disabled={acceptingId === inviteId}
                    style={({ pressed }) => ({
                      minHeight: 42,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: UI.emeraldBorder,
                      backgroundColor: UI.emeraldSoft,
                      opacity: pressed ? 0.92 : 1,
                    })}
                  >
                    {acceptingId === inviteId ? (
                      <ActivityIndicator />
                    ) : (
                      <Text style={{ color: UI.text, fontWeight: "900" }}>
                        Accept Invite
                      </Text>
                    )}
                  </Pressable>
                </View>
              );
            })
          )}
        </Card>
      </View>

      <View style={{ marginTop: 14 }}>
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15, flex: 1 }}>
              Recent Rooms Preview
            </Text>

            {activeRooms.length > 0 ? (
              <Pressable onPress={openRooms}>
                {({ pressed }) => (
                  <Text
                    style={{
                      color: UI.emerald,
                      fontWeight: "900",
                      fontSize: 12,
                      opacity: pressed ? 0.85 : 1,
                    }}
                  >
                    View all
                  </Text>
                )}
              </Pressable>
            ) : null}
          </View>

          {loading ? <ActivityIndicator /> : null}

          {recentRooms.length ? (
            recentRooms.map((row) => (
              <SmallRoomCard
                key={row.room_id}
                row={row}
                onPress={() => openRoomDetail(row.room_id)}
              />
            ))
          ) : (
            <View
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.04)",
                padding: 14,
                gap: 8,
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900" }}>
                No rooms yet
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
                Start with one room like Leadership, Suppliers, Wafanyakazi, Sales Team, au Stock Requests.
              </Text>
            </View>
          )}
        </Card>
      </View>

      <View style={{ marginTop: 14 }}>
        <Card style={{ gap: 10 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
            What this will support
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 21 }}>
            • Unlimited meeting rooms inside one organization.
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 21 }}>
            • Room names like Leadership, Suppliers, Stock Requests, Customer Care, Wafanyakazi, or Project Teams.
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 21 }}>
            • Invite any person mwenye akaunti ya ZETRA, then chat inside app like a business-focused group.
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 21 }}>
            • Messages, replies, updates, operational coordination, and proof sharing.
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 21 }}>
            • Future support for images, pinned messages, announcements, and stronger permissions.
          </Text>
        </Card>
      </View>

      

      <View style={{ height: 24 }} />
    </Screen>
  );
}