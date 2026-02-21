// app/settings/subscription.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOrg } from "@/src/context/OrgContext";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { UI } from "@/src/ui/theme";

import { getProUntilForOrg, isProActiveForOrg, setProForOrg } from "@/src/ai/subscription";

type PlanMonths = 1 | 3 | 6 | 12;

function Pill({ label }: { label: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 10,
        height: 28,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "rgba(255,255,255,0.06)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 12 }}>{label}</Text>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  danger,
  disabled,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const border = danger ? "rgba(239,68,68,0.35)" : UI.colors.emeraldBorder;
  const bg = danger ? "rgba(239,68,68,0.12)" : UI.colors.emeraldSoft;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      style={({ pressed }) => ({
        height: 48,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: disabled ? "rgba(255,255,255,0.12)" : border,
        backgroundColor: disabled ? "rgba(255,255,255,0.06)" : bg,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.55 : pressed ? 0.95 : 1,
      })}
    >
      <Text style={{ color: UI.text, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function SmallPlanBtn({
  label,
  onPress,
  disabled,
  selected,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  const borderColor = selected ? UI.colors.emeraldBorder : "rgba(255,255,255,0.12)";
  const bgColor = selected ? "rgba(16,185,129,0.18)" : "rgba(255,255,255,0.06)";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      style={({ pressed }) => ({
        flex: 1,
        height: 46,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: disabled ? "rgba(255,255,255,0.12)" : borderColor,
        backgroundColor: disabled ? "rgba(255,255,255,0.06)" : bgColor,
        alignItems: "center",
        justifyContent: "center",
        // ✅ hii inazuia “stuka-stuka” ya mwanga (flicker) sana
        opacity: disabled ? 0.55 : pressed ? 0.98 : 1,
      })}
    >
      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
        {selected ? `✓ ${label}` : label}
      </Text>
    </Pressable>
  );
}

function fmtUntil(ts: number) {
  if (!ts || ts <= 0) return "—";
  try {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${dd} ${hh}:${mm}`;
  } catch {
    return "—";
  }
}

// ✅ Infer plan kutoka PRO until (ili hata ukirudi screen, plan ionekane)
// Tunachukua tofauti ya miezi “karibu” kati ya sasa na until, kisha tunaichagua 1/3/6/12 iliyo karibu.
function inferPlanFromUntil(untilTs: number): PlanMonths | null {
  if (!untilTs || untilTs <= 0) return null;

  const now = new Date();
  const end = new Date(untilTs);

  // if already expired, no plan
  if (end.getTime() <= now.getTime()) return null;

  const startY = now.getFullYear();
  const startM = now.getMonth(); // 0-11
  const endY = end.getFullYear();
  const endM = end.getMonth();

  // rough month diff
  let diff = (endY - startY) * 12 + (endM - startM);

  // since until is month-end, treat it as inclusive => +1 month
  diff = Math.max(1, diff + 1);

  const candidates: PlanMonths[] = [1, 3, 6, 12];
  let best: PlanMonths = 1;
  let bestAbs = Number.POSITIVE_INFINITY;

  for (const c of candidates) {
    const a = Math.abs(diff - c);
    if (a < bestAbs) {
      bestAbs = a;
      best = c;
    }
  }

  return best;
}

function planLabel(m: PlanMonths | null) {
  if (!m) return "—";
  if (m === 1) return "1 Month";
  return `${m} Months`;
}

export default function SubscriptionDevScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const org = useOrg();

  const topPad = Math.max(insets.top, 10) + 8;

  const activeOrgId = org.activeOrgId ?? null;
  const activeOrgName = org.activeOrgName ?? "—";
  const activeRole = org.activeRole ?? "—";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [proActiveOrgIds, setProActiveOrgIds] = useState<Record<string, boolean>>({});
  const [proUntilOrgIds, setProUntilOrgIds] = useState<Record<string, number>>({});

  // ✅ selected plan (UI)
  const [selectedPlan, setSelectedPlan] = useState<PlanMonths | null>(null);

  const canToggle = useMemo(() => {
    const r = String(activeRole).toLowerCase();
    return r === "owner" || r === "admin";
  }, [activeRole]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const proMap: Record<string, boolean> = {};
      const untilMap: Record<string, number> = {};

      const ids = new Set<string>();
      if (activeOrgId) ids.add(activeOrgId);
      for (const o of org.orgs ?? []) {
        if (o.organization_id) ids.add(o.organization_id);
      }

      for (const id of Array.from(ids)) {
        proMap[id] = await isProActiveForOrg(id);
        untilMap[id] = await getProUntilForOrg(id);
      }

      setProActiveOrgIds(proMap);
      setProUntilOrgIds(untilMap);

      // ✅ IMPORTANT: usi-reset selectedPlan hapa.
      // Instead, infer from current active org until:
      if (activeOrgId) {
        const u = Number(untilMap[activeOrgId] ?? 0);
        const inferred = inferPlanFromUntil(u);
        if (inferred) setSelectedPlan(inferred);
      }
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, org.orgs]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // ✅ when active org changes, recompute selection from its until
  useEffect(() => {
    if (!activeOrgId) {
      setSelectedPlan(null);
      return;
    }
    const u = Number(proUntilOrgIds[activeOrgId] ?? 0);
    const inferred = inferPlanFromUntil(u);
    setSelectedPlan(inferred);
  }, [activeOrgId, proUntilOrgIds]);

  const activeIsPro = useMemo(() => {
    if (!activeOrgId) return false;
    return !!proActiveOrgIds[activeOrgId];
  }, [activeOrgId, proActiveOrgIds]);

  const activeUntil = useMemo(() => {
    if (!activeOrgId) return 0;
    return Number(proUntilOrgIds[activeOrgId] ?? 0);
  }, [activeOrgId, proUntilOrgIds]);

  const enablePlan = useCallback(
    async (months: PlanMonths) => {
      if (!activeOrgId) return;

      // ✅ highlight immediately (before network)
      setSelectedPlan(months);

      setSaving(true);
      try {
        await setProForOrg(activeOrgId, true, months);
        await loadStatus();
      } finally {
        setSaving(false);
      }
    },
    [activeOrgId, loadStatus]
  );

  const disable = useCallback(async () => {
    if (!activeOrgId) return;
    setSaving(true);
    try {
      await setProForOrg(activeOrgId, false);
      await loadStatus();
      setSelectedPlan(null);
    } finally {
      setSaving(false);
    }
  }, [activeOrgId, loadStatus]);

  return (
    <Screen scroll={false} contentStyle={{ paddingTop: 0, paddingHorizontal: 0, paddingBottom: 0 }}>
      {/* Top Bar */}
      <View
        style={{
          paddingTop: topPad,
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
              opacity: pressed ? 0.95 : 1,
            })}
          >
            <Ionicons name="chevron-back" size={22} color={UI.text} />
          </Pressable>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }} numberOfLines={1}>
              Subscription
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 2 }} numberOfLines={1}>
              DEV control (temporary)
            </Text>
          </View>

          <Pill label="DEV" />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          gap: 12,
          paddingBottom: Math.max(insets.bottom, 12) + 18,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Card style={{ padding: 14, borderRadius: 18 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>Active Organization</Text>

          <View style={{ marginTop: 10, gap: 6 }}>
            <Text style={{ color: UI.muted, fontWeight: "800" }}>
              Org: <Text style={{ color: UI.text }}>{activeOrgName}</Text>
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800" }}>
              Role: <Text style={{ color: UI.text }}>{String(activeRole)}</Text>
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800" }}>
              PRO:{" "}
              <Text style={{ color: UI.text }}>
                {loading ? "…" : activeIsPro ? "ACTIVE" : "NOT ACTIVE"}
              </Text>
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800" }}>
              PRO until: <Text style={{ color: UI.text }}>{loading ? "…" : fmtUntil(activeUntil)}</Text>
            </Text>

            {/* ✅ show selected plan clearly */}
            <Text style={{ color: UI.muted, fontWeight: "900" }}>
              Selected plan:{" "}
              <Text style={{ color: UI.text }}>{loading ? "…" : planLabel(selectedPlan)}</Text>
            </Text>

            <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 6 }}>
              Rule: Plans are formula-based (1M/3M/6M/12M). Until = month-end 23:59 local time.
            </Text>
          </View>

          <View style={{ marginTop: 12, gap: 10 }}>
            {loading ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ActivityIndicator />
                <Text style={{ color: UI.muted, fontWeight: "900" }}>Loading status…</Text>
              </View>
            ) : (
              <>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <SmallPlanBtn
                    label={saving ? "Saving…" : "1 Month"}
                    onPress={() => void enablePlan(1)}
                    disabled={!activeOrgId || saving || !canToggle}
                    selected={selectedPlan === 1}
                  />
                  <SmallPlanBtn
                    label={saving ? "Saving…" : "3 Months"}
                    onPress={() => void enablePlan(3)}
                    disabled={!activeOrgId || saving || !canToggle}
                    selected={selectedPlan === 3}
                  />
                </View>

                <View style={{ flexDirection: "row", gap: 8 }}>
                  <SmallPlanBtn
                    label={saving ? "Saving…" : "6 Months"}
                    onPress={() => void enablePlan(6)}
                    disabled={!activeOrgId || saving || !canToggle}
                    selected={selectedPlan === 6}
                  />
                  <SmallPlanBtn
                    label={saving ? "Saving…" : "12 Months"}
                    onPress={() => void enablePlan(12)}
                    disabled={!activeOrgId || saving || !canToggle}
                    selected={selectedPlan === 12}
                  />
                </View>

                <PrimaryButton
                  label={saving ? "Saving…" : "Disable PRO for this Org"}
                  onPress={() => void disable()}
                  danger
                  disabled={!activeOrgId || saving || !canToggle || !activeIsPro}
                />

                {!canToggle ? (
                  <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 6 }}>
                    Staff cannot manage subscription. Owner/Admin only.
                  </Text>
                ) : null}
              </>
            )}
          </View>
        </Card>

        <Card style={{ padding: 14, borderRadius: 18 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>Orgs overview (DEV)</Text>

          <View style={{ marginTop: 10, gap: 10 }}>
            {(org.orgs ?? []).map((o) => {
              const id = o.organization_id;
              const isPro = !!proActiveOrgIds[id];
              const until = Number(proUntilOrgIds[id] ?? 0);
              const isActive = id === activeOrgId;

              return (
                <View
                  key={id}
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: isActive ? UI.colors.emeraldBorder : "rgba(255,255,255,0.10)",
                    backgroundColor: isActive ? "rgba(16,185,129,0.10)" : "rgba(255,255,255,0.04)",
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900" }} numberOfLines={1}>
                    {o.organization_name}
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
                    role: {o.role} • PRO: {isPro ? "ACTIVE" : "NOT ACTIVE"}
                    {until > 0 ? ` • until: ${fmtUntil(until)}` : ""}
                  </Text>
                </View>
              );
            })}
          </View>

          <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11, marginTop: 12 }}>
            DEV-only control. Later we will replace with real billing (Stripe/M-Pesa etc) but keep the same gating logic.
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}