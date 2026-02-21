// app/ai/tasks/index.tsx
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabaseClient";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { UI } from "@/src/ui/theme";

type TaskRow = {
  id: string;
  organization_id: string;
  store_id: string | null;
  title: string;
  steps: string[] | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | null;
  eta: string | null;
  status: string | null;
  created_at?: string;
};

function clean(s: any) {
  return String(s ?? "").trim();
}

function badgeColor(priority: TaskRow["priority"]) {
  if (priority === "HIGH") return { border: "rgba(16,185,129,0.50)", bg: "rgba(16,185,129,0.14)" };
  if (priority === "MEDIUM") return { border: "rgba(255,255,255,0.16)", bg: "rgba(255,255,255,0.08)" };
  return { border: "rgba(255,255,255,0.12)", bg: "rgba(255,255,255,0.06)" };
}

export default function TasksListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const org = useOrg();

  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const orgId = org.activeOrgId ?? null;

  const headerSubtitle = useMemo(() => {
    const orgName = org.activeOrgName ?? "—";
    const storeName = org.activeStoreName ?? "All stores";
    const role = org.activeRole ?? "—";
    return `${orgName} • ${storeName} • ${role}`;
  }, [org.activeOrgName, org.activeRole, org.activeStoreName]);

  const fetchTasks = useCallback(async () => {
    if (!orgId) {
      setRows([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("tasks")
      .select("id, organization_id, store_id, title, steps, priority, eta, status, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      Alert.alert("Tasks", error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as TaskRow[]);
    setLoading(false);
  }, [orgId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void fetchTasks();
    }, [fetchTasks])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchTasks();
    } finally {
      setRefreshing(false);
    }
  }, [fetchTasks]);

  return (
    <Screen scroll={false} contentStyle={{ paddingTop: 0, paddingHorizontal: 0, paddingBottom: 0 }}>
      {/* Top bar */}
      <View
        style={{
          paddingTop: Math.max(insets.top, 10) + 8,
          paddingBottom: 12,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.08)",
          backgroundColor: UI.colors.background,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.06)",
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.92 : 1,
            })}
          >
            <Ionicons name="chevron-back" size={22} color={UI.text} />
          </Pressable>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }} numberOfLines={1}>
              Tasks
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 2 }} numberOfLines={1}>
              {headerSubtitle}
            </Text>
          </View>

          <Pressable
            onPress={() => void fetchTasks()}
            hitSlop={10}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.06)",
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.92 : 1,
            })}
          >
            <Ionicons name="refresh" size={20} color={UI.text} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 26 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI.text} />}
      >
        {!orgId ? (
          <Card style={{ padding: 14, borderRadius: 18 }}>
            <Text style={{ color: UI.text, fontWeight: "900" }}>No active organization</Text>
            <Text style={{ color: UI.muted, marginTop: 6, fontWeight: "700" }}>
              Chagua organization kwanza, kisha Tasks zitaonekana hapa.
            </Text>
          </Card>
        ) : loading ? (
          <View style={{ paddingTop: 24, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ color: UI.muted, marginTop: 10, fontWeight: "800" }}>Loading tasks…</Text>
          </View>
        ) : rows.length === 0 ? (
          <Card style={{ padding: 14, borderRadius: 18 }}>
            <Text style={{ color: UI.text, fontWeight: "900" }}>Hakuna tasks bado</Text>
            <Text style={{ color: UI.muted, marginTop: 6, fontWeight: "700" }}>
              Nenda ZETRA AI, uliza swali litakalotoa “ACTIONS” — zitajisave automatically hapa.
            </Text>
          </Card>
        ) : (
          <View style={{ gap: 10 }}>
            {rows.map((t) => {
              const pr = badgeColor(t.priority);
              const stepsCount = Array.isArray(t.steps) ? t.steps.length : 0;

              return (
                <Pressable
                  key={t.id}
                  onPress={() =>
                    router.push({
                      pathname: "/ai/tasks/[id]",
                      params: { id: t.id },
                    })
                  }
                  style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
                >
                  <Card style={{ padding: 14, borderRadius: 18 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }} numberOfLines={2}>
                          {clean(t.title) || "Untitled"}
                        </Text>

                        <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6 }} numberOfLines={1}>
                          {stepsCount ? `${stepsCount} steps` : "No steps"} • {clean(t.status) || "OPEN"}
                          {t.eta ? ` • ETA: ${t.eta}` : ""}
                        </Text>
                      </View>

                      {t.priority ? (
                        <View
                          style={{
                            paddingHorizontal: 10,
                            height: 30,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: pr.border,
                            backgroundColor: pr.bg,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text style={{ color: UI.text, fontWeight: "900" }}>{t.priority}</Text>
                        </View>
                      ) : null}
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11, marginTop: 14 }}>
          Note: Tasks hizi ni za organization yako (orgId). Owner/Admin ndio access kamili (kulingana na RLS).
        </Text>
      </ScrollView>
    </Screen>
  );
}