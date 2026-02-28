// src/components/CurrencyPickerAll.tsx
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
import {
  CurrencyMeta,
  loadCurrencyCatalogFast,
  refreshCurrencyCatalog,
} from "@/src/services/currencyCatalog";

function clean(s: any) {
  return String(s ?? "").trim();
}
function upper(s: any) {
  return clean(s).toUpperCase();
}

function displayLabel(c: CurrencyMeta) {
  const sym = clean(c.symbolNative || c.symbol || "");
  const left = sym ? `${sym} ` : "";
  return `${left}${c.code} • ${c.name}`;
}

type PickerProps = {
  value: string | null;
  onChange: (code: string) => void;
  title?: string;
  disabled?: boolean;
};

export function CurrencyPickerAll({
  value,
  onChange,
  title = "Currency",
  disabled,
}: PickerProps) {
  const [open, setOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const [all, setAll] = useState<CurrencyMeta[]>([]);
  const [query, setQuery] = useState("");

  const refreshedOnceRef = useRef(false);

  const selected = useMemo(() => {
    const v = upper(value);
    if (!v) return null;
    return all.find((c) => upper(c.code) === v) ?? null;
  }, [value, all]);

  const filtered = useMemo(() => {
    const q = clean(query).toLowerCase();
    if (!q) return all;
    return all.filter((c) => {
      const code = upper(c.code).toLowerCase();
      const name = clean(c.name).toLowerCase();
      return code.includes(q) || name.includes(q);
    });
  }, [all, query]);

  useEffect(() => {
    if (!open) return;

    let alive = true;

    (async () => {
      // ✅ instant list (cache/fallback)
      const fast = await loadCurrencyCatalogFast();
      if (!alive) return;
      setAll(fast);
      setNote(`${fast.length} currencies available`);

      // ✅ refresh full list once (download then cache)
      if (refreshedOnceRef.current) return;
      refreshedOnceRef.current = true;

      try {
        setLoading(true);
        const full = await refreshCurrencyCatalog();
        if (!alive) return;
        setAll(full);
        setNote(`${full.length} currencies loaded`);
      } catch {
        if (!alive) return;
        setNote("Offline • showing cached/fallback list");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [open]);

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
            borderColor: disabled ? "rgba(255,255,255,0.08)" : UI.emeraldBorder,
            backgroundColor: disabled ? "rgba(255,255,255,0.04)" : UI.emeraldSoft,
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
            backgroundColor: "rgba(0,0,0,0.25)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
          }}
        >
          <Ionicons name="cash-outline" size={20} color={UI.emerald} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>{title}</Text>
          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 2 }}>
            {selected ? displayLabel(selected) : "Select any currency (global)"}
          </Text>
        </View>

        <Ionicons name="chevron-down" size={18} color="rgba(255,255,255,0.65)" />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
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
              maxHeight: "85%",
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
                    backgroundColor: UI.emeraldSoft,
                    borderWidth: 1,
                    borderColor: UI.emeraldBorder,
                  }}
                >
                  <Ionicons name="globe-outline" size={20} color={UI.emerald} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                    Select Currency
                  </Text>
                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 2 }}>
                    Search by code (USD) or name (Dollar)
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
                  placeholder="Search currency…"
                  placeholderTextColor="rgba(255,255,255,0.40)"
                  style={{
                    flex: 1,
                    color: UI.text,
                    fontWeight: "800",
                    fontSize: 13,
                    paddingVertical: 0,
                  }}
                  autoCapitalize="characters"
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

              {/* Status */}
              <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
                {loading ? <ActivityIndicator /> : null}
                <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "800", fontSize: 12 }}>
                  {note ?? `${all.length} currencies available`}
                </Text>
              </View>
            </View>

            {/* List */}
            <FlatList
              data={filtered}
              keyExtractor={(it) => it.code}
              keyboardShouldPersistTaps="always"
              renderItem={({ item }) => {
                const active = upper(item.code) === upper(value);
                return (
                  <Pressable
                    onPress={() => {
                      onChange(item.code);
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
                          borderColor: active ? UI.emeraldBorder : "rgba(255,255,255,0.10)",
                          backgroundColor: active ? UI.emeraldSoft : "rgba(255,255,255,0.04)",
                        }}
                      >
                        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                          {item.code}
                        </Text>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
                          {item.name}
                        </Text>
                        <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 2 }}>
                          {clean(item.symbolNative || item.symbol)
                            ? `Symbol: ${item.symbolNative || item.symbol}`
                            : "Symbol: —"}
                          {typeof item.decimals === "number" ? ` • Decimals: ${item.decimals}` : ""}
                        </Text>
                      </View>

                      {active ? (
                        <Ionicons name="checkmark-circle" size={18} color={UI.emerald} />
                      ) : null}
                    </View>
                  </Pressable>
                );
              }}
              ListEmptyComponent={() => (
                <View style={{ padding: 16 }}>
                  <Text style={{ color: UI.muted, fontWeight: "800" }}>
                    No currency found for “{query}”
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