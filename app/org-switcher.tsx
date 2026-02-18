import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useOrg } from "../src/context/OrgContext";
import { Button } from "../src/ui/Button";
import { Card } from "../src/ui/Card";
import { Screen } from "../src/ui/Screen";
import { UI } from "../src/ui/theme";

type OrgItem = {
  organization_id: string;
  organization_name: string;
  role: "owner" | "admin" | "staff";
};

function normName(s: string) {
  return String(s ?? "").trim().toUpperCase();
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

  const typedOrgs = (orgs ?? []) as OrgItem[];

  const grouped = useMemo(() => {
    const map = new Map<string, OrgItem[]>();

    for (const o of typedOrgs) {
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
  }, [typedOrgs, activeOrgId]);

  const onSwitch = (orgId: string) => {
    setActiveOrgId(orgId);
    router.back();
  };

  const onPressGroup = (list: OrgItem[]) => {
    const pick =
      list.find((x) => x.organization_id === activeOrgId) ?? list[0] ?? null;
    if (!pick) return;
    onSwitch(pick.organization_id);
  };

  const onCreate = async () => {
    const nameRaw = orgName.trim();
    const storeRaw = storeName.trim();

    if (!nameRaw || !storeRaw) {
      Alert.alert("Missing", "Jaza jina la organization na store ya kwanza.");
      return;
    }

    const desired = normName(nameRaw);
    const existingSameName = typedOrgs.filter(
      (o) => normName(o.organization_name) === desired
    );

    if (existingSameName.length > 0) {
      const pick =
        existingSameName.find((x) => x.organization_id === activeOrgId) ??
        existingSameName[0];

      Alert.alert(
        "Already exists",
        `Organization "${desired}" tayari ipo (${existingSameName.length}). Unataka ku-switch badala ya ku-create nyingine?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Switch",
            onPress: () => onSwitch(pick.organization_id),
          },
          {
            text: "Create Anyway",
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
                Alert.alert("Success ✅", "Organization imeundwa");
              } catch (e: any) {
                Alert.alert("Failed", e?.message ?? "Failed to create organization");
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
      Alert.alert("Success ✅", "Organization imeundwa");
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Failed to create organization");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Screen>
      {/* ✅ Outer container makes only bottom list scroll */}
      <View style={{ flex: 1 }}>
        {/* ===== TOP (NOT SCROLL) ===== */}
        <View>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ fontSize: 26, fontWeight: "900", color: UI.text, flex: 1 }}>
              Organizations
            </Text>

            <Pressable onPress={() => router.back()}>
              <Text style={{ fontSize: 22, color: UI.muted }}>✕</Text>
            </Pressable>
          </View>

          <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 4 }}>
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
            />

            <Button
              title={creating ? "Creating..." : "Create & Switch"}
              onPress={onCreate}
              disabled={creating}
              variant="primary"
            />

            <View style={{ height: 2 }} />

            <Button
              title={loading ? "Loading..." : refreshing ? "Refreshing..." : "Refresh"}
              onPress={refresh}
              disabled={loading || refreshing}
              variant="secondary"
            />
          </Card>

          {/* LIST HEADER + TOGGLE */}
          <View
            style={{
              marginTop: 18,
              marginBottom: 8,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Text style={{ color: UI.muted, fontWeight: "800", flex: 1 }}>
              Your Organizations
            </Text>

            <Pressable onPress={() => setShowAll((v) => !v)}>
              <Text style={{ color: UI.muted, fontWeight: "900" }}>
                {showAll ? "Hide duplicates" : "Show all"}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ===== BOTTOM (SCROLL ONLY) ===== */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 18 }}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {!showAll ? (
            grouped.map((g) => {
              const list = g.list;
              const activeInGroup = list.some((x) => x.organization_id === activeOrgId);
              const count = list.length;

              return (
                <Pressable key={g.key} onPress={() => onPressGroup(list)}>
                  <Card
                    style={{
                      marginBottom: 10,
                      borderColor: activeInGroup
                        ? "rgba(52,211,153,0.55)"
                        : UI.border,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                          {g.displayName}
                        </Text>
                        <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 2 }}>
                          Role: {g.role}
                          {count > 1 ? `  •  (${count} same-name orgs)` : ""}
                        </Text>

                        {activeInGroup && (
                          <Text
                            style={{
                              marginTop: 6,
                              color: "rgb(52,211,153)",
                              fontWeight: "900",
                            }}
                          >
                            Active ✓
                          </Text>
                        )}
                      </View>

                      <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 18 }}>
                        ›
                      </Text>
                    </View>
                  </Card>
                </Pressable>
              );
            })
          ) : (
            typedOrgs.map((o) => {
              const active = o.organization_id === activeOrgId;

              return (
                <Pressable key={o.organization_id} onPress={() => onSwitch(o.organization_id)}>
                  <Card
                    style={{
                      marginBottom: 10,
                      borderColor: active ? "rgba(52,211,153,0.55)" : UI.border,
                    }}
                  >
                    <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                      {o.organization_name}
                    </Text>

                    <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 2 }}>
                      Role: {o.role}
                    </Text>

                    {active && (
                      <Text
                        style={{
                          marginTop: 6,
                          color: "rgb(52,211,153)",
                          fontWeight: "900",
                        }}
                      >
                        Active ✓
                      </Text>
                    )}
                  </Card>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </View>
    </Screen>
  );
}