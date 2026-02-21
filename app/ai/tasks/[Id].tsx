// app/ai/tasks/[id].tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "@/src/supabaseClient";
import { useOrg } from "@/src/context/OrgContext";
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

function asId(param: unknown): string | null {
  if (Array.isArray(param)) {
    const first = clean(param[0]);
    return first ? first : null;
  }
  const v = clean(param);
  return v ? v : null;
}

export default function TaskDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const org = useOrg();

  const params = useLocalSearchParams<Record<string, any>>();

  // ✅ Critical fix: accept id / Id / taskId
  const taskId = useMemo(() => {
    return (
      asId(params?.id) ||
      asId((params as any)?.Id) || // <-- key yenye I kubwa (ndiyo iliyoonekana kwenye debug)
      asId(params?.taskId) ||
      null
    );
  }, [params]);

  const [row, setRow] = useState<TaskRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const headerSubtitle = useMemo(() => {
    const orgName = org.activeOrgName ?? "—";
    const storeName = org.activeStoreName ?? "—";
    const role = org.activeRole ?? "—";
    return `${orgName} • ${storeName} • ${role}`;
  }, [org.activeOrgName, org.activeRole, org.activeStoreName]);

  const load = useCallback(async () => {
    setErrMsg(null);

    if (!taskId) {
      setRow(null);
      setLoading(false);
      setErrMsg("Missing route param: task id haijapita kwenye route.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("tasks")
      .select("id, organization_id, store_id, title, steps, priority, eta, status, created_at")
      .eq("id", taskId)
      .maybeSingle();

    if (error) {
      setRow(null);
      setLoading(false);
      setErrMsg(clean(error.message) || "Unknown error");
      return;
    }

    if (!data) {
      setRow(null);
      setLoading(false);
      setErrMsg("No row returned. Inawezekana RLS inazuia SELECT au task haipo.");
      return;
    }

    // Optional guard: org mismatch
    const activeOrgId = clean(org.activeOrgId);
    if (activeOrgId && clean(data.organization_id) && clean(data.organization_id) !== activeOrgId) {
      setRow(null);
      setLoading(false);
      setErrMsg("Org mismatch: task hii ni ya org nyingine (active orgId haifanani).");
      return;
    }

    setRow((data ?? null) as TaskRow | null);
    setLoading(false);
  }, [taskId, org.activeOrgId]);

  useEffect(() => {
    void load();
  }, [load]);

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
              Task
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 2 }} numberOfLines={1}>
              {headerSubtitle}
            </Text>
          </View>

          <Pressable
            onPress={() => void load()}
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

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 26 }}>
        {loading ? (
          <View style={{ paddingTop: 30, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ color: UI.muted, marginTop: 10, fontWeight: "800" }}>Loading…</Text>
          </View>
        ) : !row ? (
          <Card style={{ padding: 14, borderRadius: 18 }}>
            <Text style={{ color: UI.text, fontWeight: "900" }}>Task haijapatikana</Text>

            <Text style={{ color: UI.muted, marginTop: 6, fontWeight: "700" }}>
              {errMsg
                ? errMsg
                : "Inawezekana huna ruhusa (RLS) au task imefutwa, au id haikupita vizuri."}
            </Text>

            {/* Debug block */}
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11 }}>Debug:</Text>
              <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11, marginTop: 4 }}>
                route taskId: {taskId ?? "—"}
              </Text>
              <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11, marginTop: 4 }}>
                activeOrgId: {clean(org.activeOrgId) || "—"}
              </Text>
              <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11, marginTop: 4 }}>
                raw params: {clean(JSON.stringify(params))}
              </Text>
            </View>
          </Card>
        ) : (
          <View style={{ gap: 12 }}>
            <Card style={{ padding: 14, borderRadius: 18 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}>
                {clean(row.title) || "Untitled"}
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 8 }}>
                Status: {clean(row.status) || "OPEN"}
                {row.priority ? ` • Priority: ${row.priority}` : ""}
                {row.eta ? ` • ETA: ${row.eta}` : ""}
              </Text>

              <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 8, fontSize: 11 }}>
                Task ID: {row.id}
              </Text>
            </Card>

            <Card style={{ padding: 14, borderRadius: 18 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>Steps</Text>

              {Array.isArray(row.steps) && row.steps.length ? (
                <View style={{ marginTop: 10, gap: 8 }}>
                  {row.steps.map((s, idx) => (
                    <View
                      key={`${row.id}_step_${idx}`}
                      style={{
                        flexDirection: "row",
                        gap: 10,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.10)",
                        backgroundColor: "rgba(255,255,255,0.05)",
                      }}
                    >
                      <Text style={{ color: UI.muted, fontWeight: "900" }}>{idx + 1}.</Text>
                      <Text style={{ color: UI.text, fontWeight: "800", flex: 1 }}>{clean(s)}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 8 }}>
                  No steps for this task.
                </Text>
              )}
            </Card>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}