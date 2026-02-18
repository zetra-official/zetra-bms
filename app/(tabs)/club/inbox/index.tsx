// app/(tabs)/club/inbox/index.tsx
import { useOrg } from "@/src/context/OrgContext";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function clean(x: any) {
  return String(x ?? "").trim();
}

function safeStr(x: any, fallback = "—") {
  const s = clean(x);
  return s.length ? s : fallback;
}

export default function ClubInboxEntryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Math.max(insets.top, 10) + 8;

  const { activeStoreId, activeStoreName, activeRole } = useOrg();

  const canRedirect = useMemo(() => {
    return !!clean(activeStoreId);
  }, [activeStoreId]);

  // ✅ Redirect: Inbox tab -> Store threads list directly
  useEffect(() => {
    const sid = clean(activeStoreId);
    if (!sid) return;

    router.replace({
      pathname: "/(tabs)/club/inbox/store/[storeId]" as any,
      params: { storeId: sid },
    } as any);
  }, [activeStoreId, router]);

  return (
    <Screen scroll contentStyle={{ paddingTop: topPad }}>
      <View style={{ gap: 12 }}>
        <Card style={{ padding: 14 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
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
                <Ionicons name="mail-outline" size={18} color={theme.colors.emerald} />
              </View>

              <View>
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                  Inbox
                </Text>
                <Text style={{ color: theme.colors.faint, fontWeight: "900", fontSize: 12 }}>
                  Threads + Orders hub (store-based)
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

        <Card style={{ padding: 14, gap: 10 }}>
          <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
            Active Store:{" "}
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
              {safeStr(activeStoreName, "—")}
            </Text>
          </Text>

          <Text style={{ color: theme.colors.faint, fontWeight: "900" }}>
            Role:{" "}
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
              {safeStr(activeRole, "—").toUpperCase()}
            </Text>
          </Text>

          {!canRedirect ? (
            <Text style={{ color: theme.colors.dangerText, fontWeight: "900", marginTop: 6 }}>
              Activate store kwanza (Stores tab), kisha rudi Inbox.
            </Text>
          ) : (
            <Text style={{ color: theme.colors.faint, fontWeight: "900", marginTop: 6 }}>
              Opening store inbox...
            </Text>
          )}

          {/* Optional helper button (doesn't hurt; just in case replace is blocked by state) */}
          {canRedirect && (
            <Pressable
              onPress={() => {
                const sid = clean(activeStoreId);
                if (!sid) return;
                router.replace({
                  pathname: "/(tabs)/club/inbox/store/[storeId]" as any,
                  params: { storeId: sid },
                } as any);
              }}
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
                  marginTop: 8,
                },
              ]}
            >
              <Ionicons name="mail-unread-outline" size={18} color={theme.colors.emerald} />
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                Open Store Inbox
              </Text>
            </Pressable>
          )}
        </Card>
      </View>
    </Screen>
  );
}