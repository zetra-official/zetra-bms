// src/components/LanguagePickerAll.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
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
function lower(s: any) {
  return clean(s).toLowerCase();
}

type LangMeta = {
  locale: string; // e.g. "sw-TZ"
  label: string; // e.g. "Swahili"
  subtitle?: string; // e.g. "Tanzania"
  emoji?: string; // e.g. "🇹🇿"
};

const LANGS: LangMeta[] = [
  { locale: "sw-TZ", label: "Swahili", subtitle: "Tanzania", emoji: "🇹🇿" },
  { locale: "en-TZ", label: "English", subtitle: "Tanzania", emoji: "🇹🇿" },
  { locale: "en-US", label: "English", subtitle: "United States", emoji: "🇺🇸" },
  { locale: "en-GB", label: "English", subtitle: "United Kingdom", emoji: "🇬🇧" },

  { locale: "ar", label: "Arabic", subtitle: "العربية", emoji: "🇸🇦" },
  { locale: "fr-FR", label: "French", subtitle: "France", emoji: "🇫🇷" },
  { locale: "de-DE", label: "German", subtitle: "Deutschland", emoji: "🇩🇪" },
  { locale: "es-ES", label: "Spanish", subtitle: "España", emoji: "🇪🇸" },
  { locale: "pt-BR", label: "Portuguese", subtitle: "Brasil", emoji: "🇧🇷" },

  { locale: "tr-TR", label: "Turkish", subtitle: "Türkiye", emoji: "🇹🇷" },
  { locale: "ru-RU", label: "Russian", subtitle: "Россия", emoji: "🇷🇺" },
  { locale: "hi-IN", label: "Hindi", subtitle: "India", emoji: "🇮🇳" },
  { locale: "ur-PK", label: "Urdu", subtitle: "Pakistan", emoji: "🇵🇰" },

  { locale: "zh-CN", label: "Chinese (Simplified)", subtitle: "中国", emoji: "🇨🇳" },
  { locale: "zh-TW", label: "Chinese (Traditional)", subtitle: "台灣", emoji: "🇹🇼" },
  { locale: "ja-JP", label: "Japanese", subtitle: "日本", emoji: "🇯🇵" },
  { locale: "ko-KR", label: "Korean", subtitle: "대한민국", emoji: "🇰🇷" },

  { locale: "it-IT", label: "Italian", subtitle: "Italia", emoji: "🇮🇹" },
  { locale: "nl-NL", label: "Dutch", subtitle: "Nederland", emoji: "🇳🇱" },
  { locale: "sv-SE", label: "Swedish", subtitle: "Sverige", emoji: "🇸🇪" },
];

function displayTitle(x: LangMeta) {
  const em = clean(x.emoji);
  return `${em ? `${em} ` : ""}${x.label}`;
}

function isActive(a: string | null | undefined, b: string) {
  return lower(a) === lower(b);
}

type Props = {
  value: string | null;
  onChange: (locale: string) => void;
  title?: string;
  disabled?: boolean;
  hint?: string;
};

export function LanguagePickerAll({
  value,
  onChange,
  title = "Language",
  disabled,
  hint = "Select language (drives AI + UI)",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(() => {
    const v = lower(value);
    if (!v) return null;
    return LANGS.find((x) => lower(x.locale) === v) ?? null;
  }, [value]);

  const filtered = useMemo(() => {
    const q = lower(query);
    if (!q) return LANGS;
    return LANGS.filter((x) => {
      return (
        lower(x.locale).includes(q) ||
        lower(x.label).includes(q) ||
        lower(x.subtitle).includes(q)
      );
    });
  }, [query]);

  useEffect(() => {
    if (!open) setQuery("");
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
          <Ionicons name="language-outline" size={20} color={UI.emerald} />
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
            {selected
              ? `${displayTitle(selected)} • Locale: ${selected.locale}`
              : hint}
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
                    Select Language
                  </Text>
                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 2 }}>
                    Search by name (Swahili) or locale (sw-TZ)
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
                  placeholder="Search language…"
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
                    <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.55)" />
                  </Pressable>
                ) : null}
              </View>

              <View style={{ marginTop: 10 }}>
                <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "800", fontSize: 12 }}>
                  {filtered.length} languages available
                </Text>
              </View>
            </View>

            {/* List */}
            <FlatList
              data={filtered}
              keyExtractor={(it) => it.locale}
              keyboardShouldPersistTaps="always"
              renderItem={({ item }) => {
                const active = isActive(value, item.locale);
                return (
                  <Pressable
                    onPress={() => {
                      onChange(item.locale);
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
                        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                          {clean(item.emoji) || "🌍"}
                        </Text>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
                          {item.label}
                        </Text>
                        <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 2 }}>
                          Locale: {item.locale}
                          {clean(item.subtitle) ? ` • ${item.subtitle}` : ""}
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
                    No language found for “{query}”
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