// app/(tabs)/settings/regional.tsx
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { UI } from "@/src/ui/theme";
import { useOrg } from "@/src/context/OrgContext";
import { CurrencyPickerAll } from "@/src/components/CurrencyPickerAll";
import { kv, orgCurrencyKey, orgTimezoneKey } from "@/src/storage/kv";
import { supabase } from "@/src/supabase/supabaseClient";

type ItemProps = {
  emoji: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

function Item({ emoji, title, subtitle, icon, onPress }: ItemProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 12,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          backgroundColor: "rgba(255,255,255,0.05)",
        }}
      >
        <Text style={{ fontSize: 18 }}>{emoji}</Text>
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
          {title}
        </Text>
        <Text
          style={{
            color: UI.muted,
            fontWeight: "800",
            fontSize: 12,
            marginTop: 2,
          }}
        >
          {subtitle}
        </Text>
      </View>

      <Ionicons name={icon} size={18} color="rgba(255,255,255,0.55)" />
    </Pressable>
  );
}

function Divider() {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: "rgba(255,255,255,0.10)",
        marginVertical: 8,
      }}
    />
  );
}

function clean(s: any) {
  return String(s ?? "").trim();
}
function upper(s: any) {
  return clean(s).toUpperCase();
}

function isValidTimeZone(tz: string) {
  const v = clean(tz);
  if (!v) return false;
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat("en-US", { timeZone: v }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

const TZ_QUICK = [
  "Africa/Dar_es_Salaam",
  "Africa/Nairobi",
  "Africa/Kampala",
  "Africa/Kigali",
  "Africa/Bujumbura",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Cairo",
  "Africa/Casablanca",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Australia/Sydney",
  "Australia/Perth",
  "Pacific/Auckland",
];

export default function RegionalSettings() {
  const router = useRouter();
  const org = useOrg();

  const orgId = clean(org.activeOrgId);
  const canEdit = org.activeRole === "owner" || org.activeRole === "admin";

  const headerSubtitle = useMemo(() => {
    const name = org.activeOrgName ?? "No organization";
    const role = org.activeRole ? String(org.activeRole).toUpperCase() : "—";
    return `${name} • ${role}`;
  }, [org.activeOrgName, org.activeRole]);

  const guard = (actionName: string, fn: () => void) => {
    if (!canEdit) {
      Alert.alert("Not allowed", `Only Owner/Admin can change ${actionName}.`);
      return;
    }
    fn();
  };

  // =========================
  // Currency (KV)
  // =========================
  const currencyKey = useMemo(() => {
    return orgId ? orgCurrencyKey(orgId) : "zetra_org_currency_v1_no_org";
  }, [orgId]);

  const [currencyCode, setCurrencyCode] = useState<string>("TZS");

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const saved = await kv.getString(currencyKey);
        const v = upper(saved || "");
        if (!alive) return;
        if (v) setCurrencyCode(v);
        else setCurrencyCode("TZS");
      } catch {
        if (!alive) return;
        setCurrencyCode("TZS");
      }
    })();
    return () => {
      alive = false;
    };
  }, [currencyKey]);

  // =========================
  // Timezone (DB source of truth + KV cache)
  // ✅ NOT LOCKED: user can change anytime (with confirmation)
  // =========================
  const tzKey = useMemo(() => {
    return orgId ? orgTimezoneKey(orgId) : "zetra_org_timezone_v1_no_org";
  }, [orgId]);

  const [tz, setTz] = useState<string>("Africa/Dar_es_Salaam");
  const [tzLoading, setTzLoading] = useState(false);

  const loadTimezone = useCallback(async () => {
    if (!orgId) return;
    setTzLoading(true);
    try {
      // 1) DB first
      const { data, error } = await supabase
        .from("organizations")
        .select("timezone")
        .eq("id", orgId)
        .maybeSingle();

      if (!error) {
        const dbTz = clean((data as any)?.timezone);
        if (dbTz) {
          setTz(dbTz);
          try {
            await kv.setString(tzKey, dbTz);
          } catch {}
          return;
        }
      }

      // 2) KV fallback
      const saved = await kv.getString(tzKey);
      const v = clean(saved);
      if (v) setTz(v);
      else setTz("Africa/Dar_es_Salaam");
    } catch {
      try {
        const saved = await kv.getString(tzKey);
        const v = clean(saved);
        if (v) setTz(v);
        else setTz("Africa/Dar_es_Salaam");
      } catch {
        setTz("Africa/Dar_es_Salaam");
      }
    } finally {
      setTzLoading(false);
    }
  }, [orgId, tzKey]);

  React.useEffect(() => {
    void loadTimezone();
  }, [loadTimezone]);

  // ✅ Save timezone (anytime) — CONFIRM first
  const saveTimezone = useCallback(
    async (nextTzRaw: string) => {
      const nextTz = clean(nextTzRaw);

      if (!orgId) {
        Alert.alert("No org", "Organization haijapatikana.");
        return;
      }

      if (!nextTz) {
        Alert.alert("Timezone", "Timezone haiwezi kuwa empty.");
        return;
      }

      if (!isValidTimeZone(nextTz)) {
        Alert.alert(
          "Invalid timezone",
          `Hii timezone haijatambulika:\n\n${nextTz}\n\nMfano sahihi: Africa/Dar_es_Salaam, America/New_York`
        );
        return;
      }

      if (!canEdit) {
        Alert.alert("Not allowed", "Only Owner/Admin can change timezone.");
        return;
      }

      // Nothing to do
      if (clean(nextTz) === clean(tz)) {
        Alert.alert("No changes", "Timezone ipo tayari kwenye value hiyo.");
        return;
      }

      setTzLoading(true);
      try {
        // 1) Try RPC first (if your DB has it)
        // NOTE: if RPC doesn't exist, we fallback to direct update.
        const { data: rpcOk, error: rpcErr } = await supabase.rpc("set_org_timezone", {
          p_org_id: orgId,
          p_timezone: nextTz,
        });

        if (rpcErr) {
          // 2) Fallback: direct update (requires RLS allowing owner/admin)
          const { error: upErr } = await supabase
            .from("organizations")
            .update({ timezone: nextTz } as any)
            .eq("id", orgId);

          if (upErr) throw upErr;
        } else {
          void rpcOk;
        }

        setTz(nextTz);

        try {
          await kv.setString(tzKey, nextTz);
        } catch {}

        Alert.alert(
          "Timezone updated ✅",
          `Org timezone: ${nextTz}\n\nHii itaathiri reports, daily closing, na date cutoffs.`
        );
      } catch (e: any) {
        Alert.alert("Timezone", e?.message ?? "Failed to save timezone");
      } finally {
        setTzLoading(false);
      }
    },
    [orgId, tzKey, canEdit, tz]
  );

  // =========================
  // Timezone picker modal
  // =========================
  const [tzOpen, setTzOpen] = useState(false);
  const [tzSearch, setTzSearch] = useState("");
  const [tzManual, setTzManual] = useState("");

  const tzFiltered = useMemo(() => {
    const q = clean(tzSearch).toLowerCase();
    if (!q) return TZ_QUICK;
    return TZ_QUICK.filter((x) => x.toLowerCase().includes(q));
  }, [tzSearch]);

  const openTzPicker = useCallback(() => {
    if (!canEdit) {
      Alert.alert("Not allowed", "Only Owner/Admin can change timezone.");
      return;
    }
    setTzSearch("");
    setTzManual(tz || "Africa/Dar_es_Salaam");
    setTzOpen(true);
  }, [tz, canEdit]);

  const closeTzPicker = useCallback(() => {
    setTzOpen(false);
  }, []);

  const confirmAndSaveTimezone = useCallback(
    (next: string) => {
      const nextTz = clean(next);
      if (!nextTz) return;

      Alert.alert(
        "Confirm timezone change",
        `Unataka kubadilisha timezone kuwa:\n\n${nextTz}\n\n⚠️ Itaathiri reports, daily closing, na date cutoffs.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "YES, CHANGE",
            style: "destructive",
            onPress: async () => {
              setTzOpen(false);
              await saveTimezone(nextTz);
            },
          },
        ]
      );
    },
    [saveTimezone]
  );

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 2 }}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            {
              width: 42,
              height: 42,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Ionicons name="chevron-back" size={20} color={UI.text} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 20 }}>
            Regional Settings
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
            {headerSubtitle}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 14 }}>
        <Card>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            Localization (Global-ready)
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6 }}>
            These settings control how ZETRA displays language, money, dates, and numbers.
          </Text>

          <Divider />

          {/* 🌍 Language */}
          <Item
            emoji="🌍"
            title="Language"
            subtitle="AI + UI language (select any language)"
            icon="chevron-forward"
            onPress={() =>
              guard("Language", () => {
                Alert.alert("Next step", "Tutaongeza language picker + AI language rules.");
              })
            }
          />

          <Divider />

          {/* 💱 Currency */}
          <View style={{ marginTop: 2 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14, marginBottom: 6 }}>
              💱 Currency
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginBottom: 10 }}>
              Choose any currency in the world. This is org-level (accounting consistency).
            </Text>

            <CurrencyPickerAll
              value={currencyCode}
              disabled={!canEdit}
              onChange={(code) => {
                guard("Currency", async () => {
                  const v = upper(code);
                  setCurrencyCode(v);

                  try {
                    await kv.setString(currencyKey, v);
                  } catch {}

                  Alert.alert("Currency selected", `Selected: ${v}`);
                });
              }}
              title="Currency (Global)"
            />

            {!canEdit ? (
              <Text
                style={{
                  color: "rgba(255,255,255,0.55)",
                  fontWeight: "800",
                  fontSize: 12,
                  marginTop: 10,
                }}
              >
                Staff cannot change currency. Owner/Admin only.
              </Text>
            ) : null}
          </View>

          <Divider />

          {/* 🌐 Timezone (CHANGEABLE with confirmation) */}
          <View style={{ marginTop: 2 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14, marginBottom: 6 }}>
              🌐 Timezone
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginBottom: 10 }}>
              Controls reports, daily closing, and date cutoffs (org-level). You can change it anytime
              (confirmation required).
            </Text>

            <Pressable
              onPress={() => guard("Timezone", openTzPicker)}
              disabled={!canEdit}
              style={({ pressed }) => [
                {
                  height: 52,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  paddingHorizontal: 12,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "space-between",
                  opacity: !canEdit ? 0.55 : pressed ? 0.92 : 1,
                },
              ]}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(255,255,255,0.05)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="globe-outline" size={18} color={UI.text} />
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: UI.text, fontWeight: "900" }} numberOfLines={1}>
                    {tz || "Africa/Dar_es_Salaam"}
                  </Text>
                  <Text
                    style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}
                    numberOfLines={1}
                  >
                    {canEdit ? "Tap to change (confirm)" : "Owner/Admin only"}
                  </Text>
                </View>
              </View>

              {tzLoading ? (
                <ActivityIndicator />
              ) : (
                <Ionicons name="chevron-down" size={18} color="rgba(255,255,255,0.55)" />
              )}
            </Pressable>

            {!canEdit ? (
              <Text
                style={{
                  color: "rgba(255,255,255,0.55)",
                  fontWeight: "800",
                  fontSize: 12,
                  marginTop: 10,
                }}
              >
                Staff cannot change timezone. Owner/Admin only.
              </Text>
            ) : null}
          </View>

          <Divider />

          {/* 📅 Date Format */}
          <Item
            emoji="📅"
            title="Date Format"
            subtitle="DD/MM/YYYY • MM/DD/YYYY • YYYY-MM-DD"
            icon="chevron-forward"
            onPress={() =>
              guard("Date Format", () => {
                Alert.alert("Next step", "Tutaongeza date format picker.");
              })
            }
          />

          <Divider />

          {/* 🔢 Number Format */}
          <Item
            emoji="🔢"
            title="Number Format"
            subtitle="1,234.56 • 1.234,56 • 1 234,56"
            icon="chevron-forward"
            onPress={() =>
              guard("Number Format", () => {
                Alert.alert("Next step", "Tutaongeza number format rules (locale).");
              })
            }
          />

          <View style={{ marginTop: 12 }}>
            <View
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.04)",
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                Permission rule
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 4 }}>
                Owner/Admin only • Timezone change requires confirmation.
              </Text>
            </View>
          </View>
        </Card>
      </View>

      {/* ===== Timezone Modal ===== */}
      <Modal visible={tzOpen} transparent animationType="fade" onRequestClose={closeTzPicker}>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            padding: 16,
            justifyContent: "center",
          }}
        >
          <View
            style={{
              borderRadius: 20,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(20,22,26,0.98)",
              padding: 14,
              maxHeight: "85%",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                Change Timezone
              </Text>
              <Pressable onPress={closeTzPicker} hitSlop={10}>
                <Ionicons name="close" size={22} color={UI.text} />
              </Pressable>
            </View>

            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 6 }}>
              Chagua timezone yoyote (mfano Kuwait: Asia/Kuwait). Ukisave, app itauliza uthibitishe.
            </Text>

            <View style={{ marginTop: 12, gap: 10 }}>
              <TextInput
                value={tzSearch}
                onChangeText={setTzSearch}
                placeholder="Search quick zones (e.g. Africa, Kuwait, New_York)"
                placeholderTextColor="rgba(255,255,255,0.45)"
                style={{
                  height: 46,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  color: UI.text,
                  paddingHorizontal: 12,
                  fontWeight: "800",
                }}
              />

              <TextInput
                value={tzManual}
                onChangeText={setTzManual}
                placeholder="Manual timezone (e.g. Asia/Kuwait)"
                placeholderTextColor="rgba(255,255,255,0.45)"
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  height: 46,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  color: UI.text,
                  paddingHorizontal: 12,
                  fontWeight: "800",
                }}
              />

              <Pressable
                onPress={() => confirmAndSaveTimezone(tzManual)}
                style={({ pressed }) => [
                  {
                    height: 48,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(16,185,129,0.45)",
                    backgroundColor: "rgba(16,185,129,0.18)",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "row",
                    gap: 10,
                    opacity: pressed ? 0.92 : 1,
                  },
                ]}
              >
                <Ionicons name="save-outline" size={18} color="rgba(16,185,129,1)" />
                <Text style={{ color: UI.text, fontWeight: "900" }}>SAVE TIMEZONE</Text>
              </Pressable>

              <View style={{ marginTop: 6 }}>
                <Text style={{ color: UI.text, fontWeight: "900", marginBottom: 8 }}>
                  Quick picks
                </Text>

                <View
                  style={{
                    borderRadius: 16,
                    overflow: "hidden",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                  }}
                >
                  <FlatList
                    data={tzFiltered}
                    keyExtractor={(x) => x}
                    style={{ maxHeight: 260 }}
                    renderItem={({ item }) => {
                      const active = clean(item) === clean(tz);
                      return (
                        <Pressable
                          onPress={() => setTzManual(item)}
                          style={({ pressed }) => [
                            {
                              paddingVertical: 12,
                              paddingHorizontal: 12,
                              backgroundColor: active
                                ? "rgba(16,185,129,0.14)"
                                : pressed
                                ? "rgba(255,255,255,0.06)"
                                : "rgba(255,255,255,0.03)",
                              borderBottomWidth: 1,
                              borderBottomColor: "rgba(255,255,255,0.08)",
                            },
                          ]}
                        >
                          <Text style={{ color: UI.text, fontWeight: "900" }}>{item}</Text>
                          {active ? (
                            <Text
                              style={{
                                color: "rgba(16,185,129,1)",
                                fontWeight: "900",
                                marginTop: 4,
                              }}
                            >
                              Current ✅
                            </Text>
                          ) : null}
                        </Pressable>
                      );
                    }}
                  />
                </View>

                <Text
                  style={{
                    color: UI.muted,
                    fontWeight: "800",
                    fontSize: 12,
                    marginTop: 10,
                    lineHeight: 16,
                  }}
                >
                  TIP: Andika timezone yoyote ya IANA (mfano: Europe/Rome, Asia/Seoul, America/Mexico_City).
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}