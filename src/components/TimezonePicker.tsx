// src/components/TimezonePicker.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { UI } from "@/src/ui/theme";

function clean(s: any) {
  return String(s ?? "").trim();
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

export const DEFAULT_TZ_QUICK = [
  // Africa (core)
  "Africa/Dar_es_Salaam",
  "Africa/Nairobi",
  "Africa/Kampala",
  "Africa/Kigali",
  "Africa/Bujumbura",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Cairo",
  "Africa/Casablanca",

  // Europe
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",

  // Middle East / Asia
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",

  // Americas
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",

  // Oceania
  "Australia/Sydney",
  "Australia/Perth",
  "Pacific/Auckland",
];

type Props = {
  value: string;
  onChange: (tz: string) => void;

  title?: string;
  subtitle?: string;

  // Confirm checkbox (optional)
  requireConfirm?: boolean;
  confirmed?: boolean;
  onConfirmedChange?: (v: boolean) => void;
  confirmLabel?: string;

  // Disable whole picker
  disabled?: boolean;

  // Quick zones override
  quickZones?: string[];
};

export function TimezonePicker({
  value,
  onChange,
  title = "Timezone",
  subtitle = "Controls reports, daily closing, and date cutoffs.",
  requireConfirm = false,
  confirmed = false,
  onConfirmedChange,
  confirmLabel = "I confirm this timezone is correct for reports & daily closing.",
  disabled,
  quickZones = DEFAULT_TZ_QUICK,
}: Props) {
  const [open, setOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [manual, setManual] = useState(value || "Africa/Dar_es_Salaam");
  const [note, setNote] = useState<string | null>(null);

  const openOnceRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    // reset on open
    setQuery("");
    setManual(value || "Africa/Dar_es_Salaam");
    setNote(null);

    // tiny UX note once
    if (!openOnceRef.current) {
      openOnceRef.current = true;
      setNote("Search by region (Africa) or city (New_York)");
    }
  }, [open, value]);

  const filtered = useMemo(() => {
    const q = clean(query).toLowerCase();
    if (!q) return quickZones;
    return quickZones.filter((x) => x.toLowerCase().includes(q));
  }, [query, quickZones]);

  const displayValue = clean(value) || "Africa/Dar_es_Salaam";

  const setAndInvalidateConfirm = (next: string) => {
    onChange(next);
    if (requireConfirm && onConfirmedChange) onConfirmedChange(false);
  };

  return (
    <View>
      <Pressable
        disabled={!!disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          {
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: disabled ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.12)",
            backgroundColor: disabled ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.06)",
            opacity: disabled ? 0.55 : pressed ? 0.92 : 1,
          },
        ]}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255,255,255,0.05)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
          }}
        >
          <Ionicons name="globe-outline" size={20} color={UI.emerald} />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>{title}</Text>
          <Text
            style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 2 }}
            numberOfLines={1}
          >
            {displayValue}
          </Text>
        </View>

        <Ionicons name="chevron-down" size={18} color="rgba(255,255,255,0.65)" />
      </Pressable>

      {/* Optional confirm checkbox */}
      {requireConfirm ? (
        <Pressable
          onPress={() => {
            const tz = clean(value);
            if (!tz) {
              setNote("Timezone haiwezi kuwa empty.");
              return;
            }
            if (!isValidTimeZone(tz)) {
              setNote(`Invalid timezone: ${tz}`);
              return;
            }
            onConfirmedChange?.(!confirmed);
          }}
          style={({ pressed }) => [
            {
              marginTop: 12,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.04)",
              borderRadius: 18,
              padding: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              opacity: pressed ? 0.92 : 1,
            },
          ]}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderWidth: 2,
              borderRadius: 6,
              alignItems: "center",
              justifyContent: "center",
              borderColor: "rgba(255,255,255,0.35)",
              backgroundColor: confirmed ? "rgba(16,185,129,0.95)" : "transparent",
            }}
          >
            {confirmed ? <Text style={{ color: "#0B0F14", fontWeight: "900" }}>✓</Text> : null}
          </View>

          <Text style={{ color: UI.text, fontWeight: "900", flex: 1 }}>
            {confirmLabel}
          </Text>
        </Pressable>
      ) : null}

      {note ? (
        <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.65)", fontWeight: "800", fontSize: 12 }}>
          {note}
        </Text>
      ) : null}

      {/* Modal */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.65)",
            padding: 16,
            justifyContent: "flex-end",
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              borderRadius: 24,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: UI.background,
              overflow: "hidden",
              maxHeight: "88%",
            }}
          >
            {/* Header */}
            <View
              style={{
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: "rgba(255,255,255,0.10)",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(16,185,129,0.16)",
                    borderWidth: 1,
                    borderColor: "rgba(16,185,129,0.45)",
                  }}
                >
                  <Ionicons name="globe-outline" size={20} color={UI.emerald} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                    Select Timezone
                  </Text>
                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 2 }}>
                    Tap a quick pick or type manual (IANA)
                  </Text>
                </View>

                <Pressable
                  onPress={() => setOpen(false)}
                  style={({ pressed }) => [
                    {
                      width: 40,
                      height: 40,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.12)",
                      backgroundColor: pressed
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(255,255,255,0.04)",
                    },
                  ]}
                >
                  <Ionicons name="close" size={18} color={UI.text} />
                </Pressable>
              </View>

              {/* Search */}
              <View
                style={{
                  marginTop: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  borderRadius: 18,
                  paddingHorizontal: 12,
                  paddingVertical: Platform.OS === "ios" ? 10 : 8,
                }}
              >
                <Ionicons name="search" size={16} color="rgba(255,255,255,0.65)" />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search (e.g. Africa, New_York)…"
                  placeholderTextColor="rgba(255,255,255,0.40)"
                  style={{
                    flex: 1,
                    color: UI.text,
                    fontWeight: "800",
                    fontSize: 13,
                    paddingVertical: 0,
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {query ? (
                  <Pressable onPress={() => setQuery("")} hitSlop={10}>
                    <Ionicons
                      name="close-circle"
                      size={16}
                      color="rgba(255,255,255,0.55)"
                    />
                  </Pressable>
                ) : null}
              </View>

              {/* Manual */}
              <View
                style={{
                  marginTop: 10,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  borderRadius: 18,
                  paddingHorizontal: 12,
                  paddingVertical: Platform.OS === "ios" ? 10 : 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Ionicons name="create-outline" size={16} color="rgba(255,255,255,0.65)" />
                <TextInput
                  value={manual}
                  onChangeText={(v) => setManual(v)}
                  placeholder="Manual timezone (e.g. Africa/Dar_es_Salaam)"
                  placeholderTextColor="rgba(255,255,255,0.40)"
                  style={{
                    flex: 1,
                    color: UI.text,
                    fontWeight: "800",
                    fontSize: 13,
                    paddingVertical: 0,
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Pressable
                  onPress={() => {
                    const next = clean(manual);
                    if (!next) {
                      setNote("Timezone haiwezi kuwa empty.");
                      return;
                    }
                    if (!isValidTimeZone(next)) {
                      setNote(`Invalid timezone: ${next}`);
                      return;
                    }
                    setAndInvalidateConfirm(next);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    {
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: "rgba(16,185,129,0.45)",
                      backgroundColor: pressed
                        ? "rgba(16,185,129,0.22)"
                        : "rgba(16,185,129,0.16)",
                    },
                  ]}
                >
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>SET</Text>
                </Pressable>
              </View>
            </View>

            {/* List */}
            <FlatList
              data={filtered}
              keyExtractor={(it) => it}
              keyboardShouldPersistTaps="always"
              renderItem={({ item }) => {
                const active = clean(item) === clean(value);
                return (
                  <Pressable
                    onPress={() => {
                      setAndInvalidateConfirm(item);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [
                      {
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        borderBottomWidth: 1,
                        borderBottomColor: "rgba(255,255,255,0.06)",
                        backgroundColor: active
                          ? "rgba(16,185,129,0.14)"
                          : pressed
                          ? "rgba(255,255,255,0.04)"
                          : "transparent",
                      },
                    ]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View
                        style={{
                          width: 46,
                          height: 38,
                          borderRadius: 14,
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: 1,
                          borderColor: active ? "rgba(16,185,129,0.45)" : "rgba(255,255,255,0.10)",
                          backgroundColor: active ? "rgba(16,185,129,0.16)" : "rgba(255,255,255,0.04)",
                        }}
                      >
                        <Ionicons name="globe-outline" size={16} color={active ? UI.emerald : UI.text} />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
                          {item}
                        </Text>
                        <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 2 }}>
                          {active ? "Selected ✅" : "Tap to select"}
                        </Text>
                      </View>

                      {active ? (
                        <Ionicons name="checkmark-circle" size={18} color={UI.emerald} />
                      ) : (
                        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.35)" />
                      )}
                    </View>
                  </Pressable>
                );
              }}
              ListEmptyComponent={() => (
                <View style={{ padding: 16 }}>
                  <Text style={{ color: UI.muted, fontWeight: "800" }}>
                    No timezone found for “{query}”
                  </Text>
                </View>
              )}
              contentContainerStyle={{ paddingBottom: 12 }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}