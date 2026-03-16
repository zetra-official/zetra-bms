import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { UI } from "@/src/ui/theme";
import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";

function clean(s: any) {
  return String(s ?? "").trim();
}

function CountPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View
      style={{
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(255,255,255,0.05)",
        minWidth: 120,
      }}
    >
      <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 11 }}>
        {label}
      </Text>
      <Text
        style={{
          color: UI.text,
          fontWeight: "900",
          fontSize: 16,
          marginTop: 4,
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

export default function MeetingRoomCreateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const org = useOrg();

  const orgId = clean(org.activeOrgId);
  const orgName = clean(org.activeOrgName || "No organization");
  const role = clean(org.activeRole || "").toUpperCase();
  const storeName = clean(org.activeStoreName || "—");

  const canCreate = role === "OWNER" || role === "ADMIN";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const trimmedName = useMemo(() => clean(name), [name]);
  const trimmedDescription = useMemo(() => clean(description), [description]);

  const nameCount = trimmedName.length;
  const descCount = trimmedDescription.length;

  const disabled = !canCreate || !orgId || !trimmedName || loading;

  const onCreate = useCallback(async () => {
    if (!orgId) {
      Alert.alert("No organization", "Hakuna organization active kwa sasa.");
      return;
    }

    if (!canCreate) {
      Alert.alert("Not allowed", "Only Owner/Admin can create meeting rooms.");
      return;
    }

    const roomName = clean(name);
    const roomDescription = clean(description);

    if (!roomName) {
      Alert.alert("Room name required", "Andika jina la meeting room kwanza.");
      return;
    }

    if (roomName.length < 2) {
      Alert.alert("Name too short", "Jina la room liwe angalau herufi 2.");
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase.rpc("create_meeting_room", {
        p_org_id: orgId,
        p_name: roomName,
        p_description: roomDescription || null,
      } as any);

      if (error) throw error;

      const roomId = clean(data);

      if (!roomId) {
        throw new Error("Room created but room ID was not returned.");
      }

      setName("");
      setDescription("");

      Alert.alert(
        "Meeting Room created ✅",
        `Room "${roomName}" imeundwa successfully ndani ya ${orgName}.`,
        [
          {
            text: "Open Room",
            onPress: () => {
              router.replace({
                pathname: "/(tabs)/settings/meeting-room-detail",
                params: {
                  roomId,
                  roomName,
                },
              });
            },
          },
        ]
      );
    } catch (e: any) {
      Alert.alert("Create failed", e?.message ?? "Failed to create meeting room.");
    } finally {
      setLoading(false);
    }
  }, [orgId, orgName, canCreate, name, description, router]);

  return (
    <Screen
      scroll
      contentStyle={{
        paddingBottom: Math.max(insets.bottom, 16) + 110,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginTop: 2,
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
            Create Meeting Room
          </Text>
          <Text
            style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}
            numberOfLines={1}
          >
            {orgName} • {role || "—"}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 14 }}>
        <Card
          style={{
            gap: 14,
            borderColor: UI.emeraldBorder,
            backgroundColor: "rgba(16,185,129,0.06)",
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
              <Ionicons name="add-circle-outline" size={24} color={UI.emerald} />
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{ color: UI.text, fontWeight: "900", fontSize: 17 }}
                numberOfLines={2}
              >
                New Organization Room
              </Text>
              <Text
                style={{
                  color: UI.muted,
                  fontWeight: "800",
                  fontSize: 12,
                  marginTop: 4,
                  lineHeight: 20,
                }}
              >
                Tengeneza room mpya kwa ajili ya leadership, suppliers, wafanyakazi,
                sales team, customer care, au project discussions ndani ya organization.
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            <CountPill label="Organization" value={orgName || "—"} />
            <CountPill label="Active Store" value={storeName || "—"} />
          </View>
        </Card>
      </View>

      {!canCreate ? (
        <View style={{ marginTop: 14 }}>
          <Card
            style={{
              borderColor: "rgba(201,74,74,0.35)",
              backgroundColor: "rgba(201,74,74,0.10)",
              gap: 8,
            }}
          >
            <Text style={{ color: UI.danger, fontWeight: "900" }}>
              Not allowed
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
              Meeting rooms can only be created by Owner/Admin.
            </Text>
          </Card>
        </View>
      ) : null}

      <View style={{ marginTop: 14 }}>
        <Card style={{ gap: 14 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
            Room Details
          </Text>

          <View style={{ gap: 8 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
              Room Name
            </Text>

            <TextInput
              value={name}
              onChangeText={setName}
              editable={!loading && canCreate}
              placeholder="e.g. Leadership, Suppliers, Sales Team"
              placeholderTextColor="rgba(255,255,255,0.38)"
              maxLength={80}
              style={{
                minHeight: 58,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.05)",
                color: UI.text,
                paddingHorizontal: 14,
                fontWeight: "800",
                fontSize: 15,
              }}
            />

            <Text
              style={{
                color: UI.faint,
                fontWeight: "800",
                fontSize: 12,
                lineHeight: 18,
              }}
            >
              You decide the group purpose here. Example: Wafanyakazi, Suppliers,
              Leadership, Stock Requests.
            </Text>

            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11 }}>
                {nameCount}/80
              </Text>
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
              Description
            </Text>

            <TextInput
              value={description}
              onChangeText={setDescription}
              editable={!loading && canCreate}
              placeholder="Optional note about what this room will be used for"
              placeholderTextColor="rgba(255,255,255,0.38)"
              multiline
              textAlignVertical="top"
              maxLength={240}
              style={{
                minHeight: 132,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.05)",
                color: UI.text,
                paddingHorizontal: 14,
                paddingTop: 14,
                paddingBottom: 14,
                fontWeight: "800",
                fontSize: 14,
              }}
            />

            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11 }}>
                {descCount}/240
              </Text>
            </View>
          </View>
        </Card>
      </View>

      <View style={{ marginTop: 14 }}>
        <Card style={{ gap: 10 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
            What happens next
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 21 }}>
            • Room will be created inside this organization.
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 21 }}>
            • You become the first active room member automatically.
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 21 }}>
            • After opening the room, utaweza ku-invite mtu yeyote mwenye akaunti ya ZETRA hata kama hayupo kwenye organization hiyo.
          </Text>
        </Card>
      </View>

      <View style={{ marginTop: 14, gap: 10 }}>
        <Pressable
          onPress={onCreate}
          disabled={disabled}
          style={({ pressed }) => ({
            minHeight: 56,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: disabled ? "rgba(255,255,255,0.10)" : UI.emeraldBorder,
            backgroundColor: disabled ? "rgba(255,255,255,0.05)" : UI.emeraldSoft,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 10,
            opacity: pressed ? 0.94 : 1,
          })}
        >
          {loading ? (
            <ActivityIndicator />
          ) : (
            <Ionicons
              name="checkmark-circle-outline"
              size={20}
              color={disabled ? "rgba(255,255,255,0.45)" : UI.emerald}
            />
          )}

          <Text
            style={{
              color: disabled ? "rgba(255,255,255,0.45)" : UI.text,
              fontWeight: "900",
              fontSize: 15,
            }}
          >
            {loading ? "Creating..." : "Create & Open Room"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          disabled={loading}
          style={({ pressed }) => ({
            minHeight: 52,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(255,255,255,0.04)",
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.94 : 1,
          })}
        >
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            Cancel
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}