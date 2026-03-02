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
import { LanguagePickerAll } from "@/src/components/LanguagePickerAll";
import { kv } from "@/src/storage/kv";
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
function lower(s: any) {
  return clean(s).toLowerCase();
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

// =========================
// Date + Number formats (simple)
// =========================
type DateFmtKey = "DMY" | "MDY" | "ISO";
type NumFmtKey = "US" | "EU_DOT" | "EU_SPACE";

const DATE_FORMATS: Array<{ key: DateFmtKey; label: string; example: string }> =
  [
    { key: "DMY", label: "DD/MM/YYYY", example: "17/03/2026" },
    { key: "MDY", label: "MM/DD/YYYY", example: "03/17/2026" },
    { key: "ISO", label: "YYYY-MM-DD", example: "2026-03-17" },
  ];

const NUMBER_FORMATS: Array<{
  key: NumFmtKey;
  label: string;
  example: string;
  locale: string;
}> = [
  { key: "US", label: "1,234.56", example: "1,234.56", locale: "en-US" },
  { key: "EU_DOT", label: "1.234,56", example: "1.234,56", locale: "de-DE" },
  // fr-FR uses space grouping + comma decimals (close to "1 234,56")
  { key: "EU_SPACE", label: "1 234,56", example: "1 234,56", locale: "fr-FR" },
];

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function formatDatePreview(d: Date, fmt: DateFmtKey) {
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());

  if (fmt === "ISO") return `${yyyy}-${mm}-${dd}`;
  if (fmt === "MDY") return `${mm}/${dd}/${yyyy}`;
  return `${dd}/${mm}/${yyyy}`; // DMY
}

function formatNumberPreview(n: number, locale: string) {
  try {
    return new Intl.NumberFormat(locale, {
      style: "decimal",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return String(n);
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

function guessLangLabelFromLocale(locale: string) {
  const l = lower(locale);
  if (!l) return "—";
  if (l.startsWith("sw")) return "Swahili";
  if (l.startsWith("en")) return "English";
  if (l.startsWith("ar")) return "Arabic";
  if (l.startsWith("fr")) return "French";
  if (l.startsWith("de")) return "German";
  if (l.startsWith("es")) return "Spanish";
  if (l.startsWith("pt")) return "Portuguese";
  if (l.startsWith("tr")) return "Turkish";
  if (l.startsWith("ru")) return "Russian";
  if (l.startsWith("hi")) return "Hindi";
  if (l.startsWith("ur")) return "Urdu";
  if (l.startsWith("zh")) return "Chinese";
  if (l.startsWith("ja")) return "Japanese";
  if (l.startsWith("ko")) return "Korean";
  if (l.startsWith("it")) return "Italian";
  if (l.startsWith("nl")) return "Dutch";
  if (l.startsWith("sv")) return "Swedish";
  return "Language";
}

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
  // Language (KV) — org locale drives AI + UI
  // =========================
  const [orgLocale, setOrgLocale] = useState<string>("en-US");

  React.useEffect(() => {
    let alive = true;
    (async () => {
      if (!orgId) {
        if (alive) setOrgLocale("en-US");
        return;
      }
      try {
        const saved = await kv.getOrgLocale(orgId);
        const v = clean(saved);
        if (!alive) return;
        setOrgLocale(v || "en-US");
      } catch {
        if (!alive) return;
        setOrgLocale("en-US");
      }
    })();
    return () => {
      alive = false;
    };
  }, [orgId]);

  const languageSubtitle = useMemo(() => {
    const loc = clean(orgLocale) || "en-US";
    const label = guessLangLabelFromLocale(loc);
    return `${label} • Locale: ${loc}`;
  }, [orgLocale]);

  // =========================
  // Currency (KV) — CANONICAL HELPERS ONLY
  // =========================
  const [currencyCode, setCurrencyCode] = useState<string>("TZS");

  React.useEffect(() => {
    let alive = true;
    (async () => {
      if (!orgId) {
        if (alive) setCurrencyCode("TZS");
        return;
      }
      try {
        const saved = await kv.getOrgCurrency(orgId);
        const v = upper(saved || "");
        if (!alive) return;
        setCurrencyCode(v || "TZS");
      } catch {
        if (!alive) return;
        setCurrencyCode("TZS");
      }
    })();
    return () => {
      alive = false;
    };
  }, [orgId]);

  // =========================
  // Timezone (DB source of truth + KV cache) — Option 1 (RPC only)
  // =========================
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
            await kv.setOrgTimezone(orgId, dbTz);
          } catch {}
          return;
        }
      }

      // 2) KV fallback
      const saved = await kv.getOrgTimezone(orgId);
      const v = clean(saved);
      if (v) setTz(v);
      else setTz("Africa/Dar_es_Salaam");
    } catch {
      try {
        const saved = await kv.getOrgTimezone(orgId);
        const v = clean(saved);
        if (v) setTz(v);
        else setTz("Africa/Dar_es_Salaam");
      } catch {
        setTz("Africa/Dar_es_Salaam");
      }
    } finally {
      setTzLoading(false);
    }
  }, [orgId]);

  React.useEffect(() => {
    void loadTimezone();
  }, [loadTimezone]);

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

      if (clean(nextTz) === clean(tz)) {
        Alert.alert("No changes", "Timezone ipo tayari kwenye value hiyo.");
        return;
      }

      setTzLoading(true);
      try {
        // ✅ Option 1: RPC only (RLS-first). No direct table update fallback.
        const { error: rpcErr } = await supabase.rpc("set_org_timezone", {
          p_org_id: orgId,
          p_timezone: nextTz,
        });

        if (rpcErr) {
          Alert.alert(
            "Timezone blocked",
            "Timezone haikuweza ku-save kwa sababu RPC `set_org_timezone` haipo au haina permission.\n\nTunahitaji kuweka/kuruhusu RPC hiyo kwenye DB (RLS-first)."
          );
          return;
        }

        setTz(nextTz);

        try {
          await kv.setOrgTimezone(orgId, nextTz);
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
    [orgId, canEdit, tz]
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

  // =========================
  // Date Format (KV) — CANONICAL HELPERS ONLY
  // =========================
  const [dateFmt, setDateFmt] = useState<DateFmtKey>("ISO");
  const [dateOpen, setDateOpen] = useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      if (!orgId) {
        if (alive) setDateFmt("ISO");
        return;
      }
      try {
        const saved = await kv.getOrgDateFormat(orgId);
        const v = upper(saved || "") as DateFmtKey;
        if (!alive) return;
        if (v === "DMY" || v === "MDY" || v === "ISO") setDateFmt(v);
        else setDateFmt("ISO");
      } catch {
        if (!alive) return;
        setDateFmt("ISO");
      }
    })();
    return () => {
      alive = false;
    };
  }, [orgId]);

  const openDatePicker = useCallback(() => {
    guard("Date Format", () => setDateOpen(true));
  }, [guard]);

  const closeDatePicker = useCallback(() => setDateOpen(false), []);

  const saveDateFormat = useCallback(
    async (next: DateFmtKey) => {
      if (!orgId) {
        Alert.alert("No org", "Organization haijapatikana.");
        return;
      }
      if (!canEdit) {
        Alert.alert("Not allowed", "Only Owner/Admin can change date format.");
        return;
      }

      setDateFmt(next);

      try {
        await kv.setOrgDateFormat(orgId, next);
      } catch {}

      Alert.alert(
        "Date format saved ✅",
        `Selected: ${DATE_FORMATS.find((x) => x.key === next)?.label}`
      );
    },
    [orgId, canEdit]
  );

  const datePreview = useMemo(() => {
    const d = new Date();
    return formatDatePreview(d, dateFmt);
  }, [dateFmt]);

  // =========================
  // Number Format (KV) + Locale driving — CANONICAL HELPERS ONLY
  // =========================
  const [numFmt, setNumFmt] = useState<NumFmtKey>("US");
  const [numOpen, setNumOpen] = useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      if (!orgId) {
        if (alive) setNumFmt("US");
        return;
      }
      try {
        const saved = await kv.getOrgNumberFormat(orgId);
        const v = upper(saved || "") as NumFmtKey;
        if (!alive) return;
        if (v === "US" || v === "EU_DOT" || v === "EU_SPACE") setNumFmt(v);
        else setNumFmt("US");
      } catch {
        if (!alive) return;
        setNumFmt("US");
      }
    })();
    return () => {
      alive = false;
    };
  }, [orgId]);

  const openNumPicker = useCallback(() => {
    guard("Number Format", () => setNumOpen(true));
  }, [guard]);

  const closeNumPicker = useCallback(() => setNumOpen(false), []);

  const saveNumberFormat = useCallback(
    async (next: NumFmtKey) => {
      if (!orgId) {
        Alert.alert("No org", "Organization haijapatikana.");
        return;
      }
      if (!canEdit) {
        Alert.alert("Not allowed", "Only Owner/Admin can change number format.");
        return;
      }

      const cfg = NUMBER_FORMATS.find((x) => x.key === next) || NUMBER_FORMATS[0];

      setNumFmt(next);

      try {
        // 1) Save enum (for display/settings)
        await kv.setOrgNumberFormat(orgId, next);

        // 2) Drive locale used by money formatting across the app
        //    (money.ts reads kv.getOrgLocale(orgId))
        await kv.setOrgLocale(orgId, cfg.locale);
        setOrgLocale(cfg.locale); // keep UI state synced immediately
      } catch {}

      Alert.alert(
        "Number format saved ✅",
        `Selected: ${cfg.label}\n\nThis will affect how money & numbers display in the app.`
      );
    },
    [orgId, canEdit]
  );

  const numLocale = useMemo(() => {
    const cfg = NUMBER_FORMATS.find((x) => x.key === numFmt) || NUMBER_FORMATS[0];
    return cfg.locale;
  }, [numFmt]);

  const numPreview = useMemo(() => {
    return formatNumberPreview(1234.56, numLocale);
  }, [numLocale]);

  const dateSubtitle = useMemo(() => {
    const cfg = DATE_FORMATS.find((x) => x.key === dateFmt) || DATE_FORMATS[2];
    return `${cfg.label} • Example: ${datePreview}`;
  }, [dateFmt, datePreview]);

  const numSubtitle = useMemo(() => {
    const cfg = NUMBER_FORMATS.find((x) => x.key === numFmt) || NUMBER_FORMATS[0];
    return `${cfg.label} • Example: ${numPreview}`;
  }, [numFmt, numPreview]);

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
          <View style={{ marginTop: 2 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14, marginBottom: 6 }}>
              🌍 Language
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginBottom: 10 }}>
              Drives AI + UI language using org locale. (Owner/Admin only)
            </Text>

            <LanguagePickerAll
              value={orgLocale}
              disabled={!canEdit}
              onChange={(locale) => {
                guard("Language", async () => {
                  if (!orgId) {
                    Alert.alert("No org", "Organization haijapatikana.");
                    return;
                  }

                  const next = clean(locale) || "en-US";

                  try {
                    await kv.setOrgLocale(orgId, next);
                  } catch {}

                  setOrgLocale(next);

                  Alert.alert(
                    "Language saved ✅",
                    `Selected: ${guessLangLabelFromLocale(next)}\nLocale: ${next}\n\nAI + UI will follow this.`
                  );
                });
              }}
              title="Language (Global)"
              hint="Select any language (global)"
            />

            <View style={{ marginTop: 10 }}>
              <Text style={{ color: "rgba(255,255,255,0.60)", fontWeight: "800", fontSize: 12 }}>
                Current: {languageSubtitle}
              </Text>
            </View>

            {!canEdit ? (
              <Text
                style={{
                  color: "rgba(255,255,255,0.55)",
                  fontWeight: "800",
                  fontSize: 12,
                  marginTop: 10,
                }}
              >
                Staff cannot change language. Owner/Admin only.
              </Text>
            ) : null}
          </View>

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
                  if (!orgId) {
                    Alert.alert("No org", "Organization haijapatikana.");
                    return;
                  }

                  const v = upper(code);
                  setCurrencyCode(v || "TZS");

                  try {
                    await kv.setOrgCurrency(orgId, v || null);
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

          {/* 🌐 Timezone */}
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
            subtitle={dateSubtitle}
            icon="chevron-forward"
            onPress={openDatePicker}
          />

          <Divider />

          {/* 🔢 Number Format */}
          <Item
            emoji="🔢"
            title="Number Format"
            subtitle={numSubtitle}
            icon="chevron-forward"
            onPress={openNumPicker}
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

      {/* ===== Date Format Modal ===== */}
      <Modal visible={dateOpen} transparent animationType="fade" onRequestClose={closeDatePicker}>
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
              maxHeight: "75%",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                Date Format
              </Text>
              <Pressable onPress={closeDatePicker} hitSlop={10}>
                <Ionicons name="close" size={22} color={UI.text} />
              </Pressable>
            </View>

            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 6 }}>
              Hii ni display-only (haitabadilisha DB). Inaathiri jinsi tarehe zinavyoonekana kwenye UI.
            </Text>

            <View style={{ marginTop: 12 }}>
              {DATE_FORMATS.map((x) => {
                const active = x.key === dateFmt;
                const preview = formatDatePreview(new Date(), x.key);
                return (
                  <Pressable
                    key={x.key}
                    onPress={() => saveDateFormat(x.key)}
                    style={({ pressed }) => [
                      {
                        paddingVertical: 12,
                        paddingHorizontal: 12,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: active
                          ? "rgba(16,185,129,0.45)"
                          : "rgba(255,255,255,0.10)",
                        backgroundColor: active
                          ? "rgba(16,185,129,0.14)"
                          : pressed
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(255,255,255,0.03)",
                        marginBottom: 10,
                      },
                    ]}
                  >
                    <Text style={{ color: UI.text, fontWeight: "900" }}>
                      {x.label} {active ? "✅" : ""}
                    </Text>
                    <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6 }}>
                      Example: {preview}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Number Format Modal ===== */}
      <Modal visible={numOpen} transparent animationType="fade" onRequestClose={closeNumPicker}>
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
              maxHeight: "75%",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                Number Format
              </Text>
              <Pressable onPress={closeNumPicker} hitSlop={10}>
                <Ionicons name="close" size={22} color={UI.text} />
              </Pressable>
            </View>

            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 6 }}>
              Hii ina-control separators (comma/dot/space). Pia ita-drive money formatting kupitia locale.
            </Text>

            <View style={{ marginTop: 12 }}>
              {NUMBER_FORMATS.map((x) => {
                const active = x.key === numFmt;
                const preview = formatNumberPreview(1234.56, x.locale);
                return (
                  <Pressable
                    key={x.key}
                    onPress={() => saveNumberFormat(x.key)}
                    style={({ pressed }) => [
                      {
                        paddingVertical: 12,
                        paddingHorizontal: 12,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: active
                          ? "rgba(16,185,129,0.45)"
                          : "rgba(255,255,255,0.10)",
                        backgroundColor: active
                          ? "rgba(16,185,129,0.14)"
                          : pressed
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(255,255,255,0.03)",
                        marginBottom: 10,
                      },
                    ]}
                  >
                    <Text style={{ color: UI.text, fontWeight: "900" }}>
                      {x.label} {active ? "✅" : ""}
                    </Text>
                    <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6 }}>
                      Example: {preview}  •  Locale: {x.locale}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 8 }}>
              NOTE: “1 234,56” kwenye baadhi ya simu inaweza kuonekana kama space special. Ni normal.
            </Text>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}