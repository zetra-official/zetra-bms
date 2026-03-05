// app/org-switcher.tsx
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { useOrg } from "../src/context/OrgContext";
import { supabase } from "../src/supabase/supabaseClient";

import { Button } from "../src/ui/Button";
import { Card } from "../src/ui/Card";
import { Screen } from "../src/ui/Screen";
import { UI } from "../src/ui/theme";

type OrgItem = {
  organization_id: string;
  organization_name: string;
  role: "owner" | "admin" | "staff";
};

type PlanInfo = {
  code?: string; // e.g. "LITE"
  name?: string; // e.g. "Lite"
  max_organizations?: number; // e.g. 1
};

function normName(s: string) {
  return String(s ?? "").trim().toUpperCase();
}

function isNonEmpty(s: string) {
  return String(s ?? "").trim().length > 0;
}

function roleLabel(role: OrgItem["role"]) {
  if (role === "owner") return "owner";
  if (role === "admin") return "admin";
  return "staff";
}

function Badge({
  text,
  variant,
}: {
  text: string;
  variant: "active" | "muted";
}) {
  const bg =
    variant === "active" ? "rgba(52,211,153,0.16)" : "rgba(148,163,184,0.10)";
  const border =
    variant === "active" ? "rgba(52,211,153,0.45)" : "rgba(148,163,184,0.22)";
  const color = variant === "active" ? "rgb(52,211,153)" : UI.muted;

  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
      }}
    >
      <Text style={{ color, fontWeight: "900", fontSize: 12 }}>{text}</Text>
    </View>
  );
}

function clean(s: any) {
  return String(s ?? "").trim();
}

/**
 * Parse DB exception:
 * ORG_LIMIT_REACHED: plan=FREE | orgs_allowed=1 | owned=1
 */
function parseOrgLimitError(
  msgRaw: string
): { plan?: string; allowed?: string; owned?: string } | null {
  const msg = clean(msgRaw);
  if (!msg) return null;
  if (!msg.toUpperCase().includes("ORG_LIMIT_REACHED")) return null;

  const plan = (msg.match(/plan\s*=\s*([A-Z0-9_]+)/i)?.[1] || "").toUpperCase();
  const allowed = msg.match(/orgs_allowed\s*=\s*([0-9]+)/i)?.[1] || "";
  const owned = msg.match(/owned\s*=\s*([0-9]+)/i)?.[1] || "";
  return { plan, allowed, owned };
}

function prettyPlanLabel(p: PlanInfo) {
  const code = clean(p.code).toUpperCase();
  const name = clean(p.name);
  if (name) return name;
  if (code) return code;
  return "—";
}

function safeInt(x: any, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

async function fetchActiveOrgPlanInfo(activeOrgId: string | null | undefined): Promise<PlanInfo | null> {
  const orgId = clean(activeOrgId);
  if (!orgId) return null;

  // Uses your existing DB RPC:
  // get_org_subscription(p_org_id uuid) => returns (organization_id, code, name, ..., max_organizations, ...)
  const { data, error } = await supabase.rpc("get_org_subscription", { p_org_id: orgId });

  if (error) return null;

  // data can be array (TABLE) or single row depending on your RPC definition
  const row = Array.isArray(data) ? data?.[0] : data;

  if (!row) return null;

  const code = clean((row as any)?.code);
  const name = clean((row as any)?.name);
  const max_organizations = safeInt((row as any)?.max_organizations, 0);

  // If no meaningful info, treat as null
  if (!code && !name && !max_organizations) return null;

  return { code: code ? code.toUpperCase() : undefined, name: name || undefined, max_organizations };
}

export default function OrgSwitcherScreen() {
  const router = useRouter();

  const {
    orgs,
    activeOrgId,
    setActiveOrgId,
    refresh,
    createOrgWithStore,
    loading,
    refreshing,
  } = useOrg();

  const [orgName, setOrgName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [creating, setCreating] = useState(false);

  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState("");

  const typedOrgs = (orgs ?? []) as OrgItem[];

  const filteredOrgs = useMemo(() => {
    const query = String(q ?? "").trim().toLowerCase();
    if (!query) return typedOrgs;

    return typedOrgs.filter((o) => {
      const name = String(o.organization_name ?? "").toLowerCase();
      const role = String(o.role ?? "").toLowerCase();
      return name.includes(query) || role.includes(query);
    });
  }, [typedOrgs, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, OrgItem[]>();

    for (const o of filteredOrgs) {
      const key = `${normName(o.organization_name)}::${o.role}`;
      const list = map.get(key) ?? [];
      list.push(o);
      map.set(key, list);
    }

    const entries = Array.from(map.entries()).map(([key, list]) => {
      const isActiveInGroup = list.some((x) => x.organization_id === activeOrgId);
      const displayName = list[0]?.organization_name ?? "—";
      const role = list[0]?.role ?? "staff";
      return { key, list, displayName, role, isActiveInGroup };
    });

    entries.sort((a, b) => {
      if (a.isActiveInGroup && !b.isActiveInGroup) return -1;
      if (!a.isActiveInGroup && b.isActiveInGroup) return 1;
      return normName(a.displayName).localeCompare(normName(b.displayName));
    });

    return entries;
  }, [filteredOrgs, activeOrgId]);

  const canCreate = useMemo(() => {
    if (creating) return false;
    return isNonEmpty(orgName) && isNonEmpty(storeName);
  }, [orgName, storeName, creating]);

  const onSwitch = (orgId: string) => {
    setActiveOrgId(orgId);
    router.back();
  };

  const onPressGroup = (list: OrgItem[]) => {
    const pick = list.find((x) => x.organization_id === activeOrgId) ?? list[0] ?? null;
    if (!pick) return;
    onSwitch(pick.organization_id);
  };

  const showUpgradeRequired = (info: { planLabel: string; allowed: number }) => {
    const planLabel = clean(info.planLabel) || "—";
    const allowed = safeInt(info.allowed, 1);

    // Mpole, mfupi, premium
    const body =
      `Umefika limit ya kuongeza organizations kwenye kifurushi chako.\n\n` +
      `Kifurushi: ${planLabel}\n` +
      `Organizations zinazoruhusiwa: ${allowed}\n\n` +
      `Ili kuongeza organization nyingine, tafadhali fanya upgrade.`;

    Alert.alert("Upgrade Required", body, [{ text: "Sawa" }]);
  };

  const handleLimitPopup = async (errMsg: string) => {
    // 1) Try DB plan for ACTIVE ORG (most accurate)
    const plan = await fetchActiveOrgPlanInfo(activeOrgId);

    if (plan) {
      showUpgradeRequired({
        planLabel: prettyPlanLabel(plan),
        allowed: plan.max_organizations && plan.max_organizations > 0 ? plan.max_organizations : 1,
      });
      return;
    }

    // 2) Fallback: parse from DB exception
    const lim = parseOrgLimitError(errMsg);
    if (lim) {
      const planLabel = lim.plan ? lim.plan.toUpperCase() : "—";
      const allowed = safeInt(lim.allowed, 1);
      showUpgradeRequired({ planLabel, allowed });
      return;
    }

    // 3) Last fallback: generic
    showUpgradeRequired({ planLabel: "—", allowed: 1 });
  };

  const onCreate = async () => {
    const nameRaw = orgName.trim();
    const storeRaw = storeName.trim();

    if (!nameRaw || !storeRaw) return;

    const desired = normName(nameRaw);
    const existingSameName = typedOrgs.filter((o) => normName(o.organization_name) === desired);

    if (existingSameName.length > 0) {
      const pick =
        existingSameName.find((x) => x.organization_id === activeOrgId) ?? existingSameName[0];

      Alert.alert(
        "Organization already exists",
        `Organization "${desired}" tayari ipo. Unataka ku-switch badala ya ku-create nyingine?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Switch", onPress: () => onSwitch(pick.organization_id) },
          {
            text: "Create anyway",
            style: "destructive",
            onPress: async () => {
              setCreating(true);
              try {
                await createOrgWithStore({
                  p_org_name: nameRaw,
                  p_first_store_name: storeRaw,
                });
                setOrgName("");
                setStoreName("");
                setQ("");
                Alert.alert("Success ✅", "Organization imeundwa");
              } catch (e: any) {
                const msg = clean(e?.message);
                const lim = parseOrgLimitError(msg);
                if (lim) {
                  await handleLimitPopup(msg);
                } else {
                  Alert.alert("Failed", msg || "Failed to create organization");
                }
              } finally {
                setCreating(false);
              }
            },
          },
        ]
      );
      return;
    }

    setCreating(true);
    try {
      await createOrgWithStore({
        p_org_name: nameRaw,
        p_first_store_name: storeRaw,
      });
      setOrgName("");
      setStoreName("");
      setQ("");
      Alert.alert("Success ✅", "Organization imeundwa");
    } catch (e: any) {
      const msg = clean(e?.message);
      const lim = parseOrgLimitError(msg);
      if (lim) {
        await handleLimitPopup(msg);
      } else {
        Alert.alert("Failed", msg || "Failed to create organization");
      }
    } finally {
      setCreating(false);
    }
  };

  const topRightBusy = loading || refreshing || creating;

  return (
    <Screen>
      <View style={{ flex: 1 }}>
        {/* ===== TOP (NOT SCROLL) ===== */}
        <View>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ fontSize: 26, fontWeight: "900", color: UI.text, flex: 1 }}>
              Organizations
            </Text>

            {/* Refresh icon */}
            <Pressable
              onPress={() => refresh()}
              disabled={loading || refreshing}
              hitSlop={12}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: UI.border,
                marginRight: 10,
                opacity: loading || refreshing ? 0.6 : 1,
              }}
            >
              {loading || refreshing ? (
                <ActivityIndicator />
              ) : (
                <Text style={{ fontSize: 16, color: UI.muted, fontWeight: "900" }}>↻</Text>
              )}
            </Pressable>

            {/* Close */}
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: UI.border,
              }}
            >
              <Text style={{ fontSize: 16, color: UI.muted, fontWeight: "900" }}>✕</Text>
            </Pressable>
          </View>

          <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 6 }}>
            Switch or create another organization
          </Text>

          {/* CREATE */}
          <Card style={{ marginTop: 16, gap: 10 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
              Create Organization
            </Text>

            <TextInput
              value={orgName}
              onChangeText={setOrgName}
              placeholder="Organization / Business name"
              placeholderTextColor={UI.faint}
              style={{
                borderWidth: 1,
                borderColor: UI.border,
                borderRadius: 14,
                padding: 14,
                color: UI.text,
                fontWeight: "800",
              }}
              autoCapitalize="words"
              returnKeyType="next"
            />

            <TextInput
              value={storeName}
              onChangeText={setStoreName}
              placeholder="First store name"
              placeholderTextColor={UI.faint}
              style={{
                borderWidth: 1,
                borderColor: UI.border,
                borderRadius: 14,
                padding: 14,
                color: UI.text,
                fontWeight: "800",
              }}
              autoCapitalize="words"
              returnKeyType="done"
            />

            <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 2 }}>
              Tip: Jaza majina yote mawili ndipo “Create & Switch” iwe active.
            </Text>

            <Button
              title={creating ? "Creating..." : "Create & Switch"}
              onPress={onCreate}
              disabled={!canCreate}
              variant="primary"
            />
          </Card>

          {/* LIST HEADER + TOGGLE */}
          <View
            style={{
              marginTop: 18,
              marginBottom: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Text style={{ color: UI.muted, fontWeight: "800", flex: 1 }}>
              Your Organizations
            </Text>

            <Pressable
              onPress={() => setShowAll((v) => !v)}
              hitSlop={10}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: UI.border,
              }}
            >
              <Text style={{ color: UI.muted, fontWeight: "900" }}>
                {showAll ? "Grouped view" : "Show individual"}
              </Text>
            </Pressable>
          </View>

          {/* SEARCH */}
          <View style={{ marginBottom: 10 }}>
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search organizations (name or role)..."
              placeholderTextColor={UI.faint}
              style={{
                borderWidth: 1,
                borderColor: UI.border,
                borderRadius: 14,
                padding: 14,
                color: UI.text,
                fontWeight: "800",
              }}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
        </View>

        {/* ===== BOTTOM (SCROLL ONLY) ===== */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 18 }}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          refreshControl={
            <RefreshControl refreshing={!!refreshing} onRefresh={refresh} tintColor={UI.muted} />
          }
        >
          {/* Loading state */}
          {loading ? (
            <Card style={{ marginTop: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ActivityIndicator />
                <Text style={{ color: UI.muted, fontWeight: "800" }}>Loading organizations…</Text>
              </View>
            </Card>
          ) : null}

          {/* Empty state */}
          {!loading && filteredOrgs.length === 0 ? (
            <Card style={{ marginTop: 6 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                No organizations found
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 6 }}>
                {isNonEmpty(q)
                  ? "Hakuna kilicholingana na search yako. Jaribu maneno mengine."
                  : "Bado hujaunda organization. Tumia form ya juu ku-create."}
              </Text>
            </Card>
          ) : null}

          {!showAll
            ? grouped.map((g) => {
                const list = g.list;
                const activeInGroup = list.some((x) => x.organization_id === activeOrgId);
                const count = list.length;

                return (
                  <Pressable key={g.key} onPress={() => onPressGroup(list)} disabled={topRightBusy}>
                    <Card
                      style={{
                        marginBottom: 10,
                        borderColor: activeInGroup ? "rgba(52,211,153,0.55)" : UI.border,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                            {g.displayName}
                          </Text>

                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 8,
                              marginTop: 8,
                            }}
                          >
                            <Badge text={`ROLE: ${roleLabel(g.role).toUpperCase()}`} variant="muted" />
                            {count > 1 ? <Badge text={`${count} ITEMS`} variant="muted" /> : null}
                            {activeInGroup ? <Badge text="ACTIVE" variant="active" /> : null}
                          </View>
                        </View>

                        <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 18 }}>›</Text>
                      </View>
                    </Card>
                  </Pressable>
                );
              })
            : filteredOrgs
                .slice()
                .sort((a, b) => {
                  const aActive = a.organization_id === activeOrgId;
                  const bActive = b.organization_id === activeOrgId;
                  if (aActive && !bActive) return -1;
                  if (!aActive && bActive) return 1;
                  return normName(a.organization_name).localeCompare(normName(b.organization_name));
                })
                .map((o) => {
                  const active = o.organization_id === activeOrgId;

                  return (
                    <Pressable
                      key={o.organization_id}
                      onPress={() => onSwitch(o.organization_id)}
                      disabled={topRightBusy}
                    >
                      <Card
                        style={{
                          marginBottom: 10,
                          borderColor: active ? "rgba(52,211,153,0.55)" : UI.border,
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                              {o.organization_name}
                            </Text>

                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 8,
                                marginTop: 8,
                              }}
                            >
                              <Badge text={`ROLE: ${roleLabel(o.role).toUpperCase()}`} variant="muted" />
                              {active ? <Badge text="ACTIVE" variant="active" /> : null}
                            </View>
                          </View>

                          <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 18 }}>›</Text>
                        </View>
                      </Card>
                    </Pressable>
                  );
                })}
        </ScrollView>
      </View>
    </Screen>
  );
}