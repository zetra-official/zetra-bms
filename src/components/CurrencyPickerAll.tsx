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
  getRuntimeCurrencyCatalog,
  localizedCurrencyName,
} from "@/src/services/currencyCatalog";
import {useLanguage} from "@/src/i18n/LanguageProvider";
import {currencyMessages} from "@/src/i18n/currencyMessages";

function clean(s: any) {
  return String(s ?? "").trim();
}
function upper(s: any) {
  return clean(s).toUpperCase();
}

function displayLabel(c: CurrencyMeta, locale: string) {
  const sym = clean(c.symbolNative || c.symbol || "");
  const left = sym ? `${sym} ` : "";
  return `${left}${c.code} • ${localizedCurrencyName(c.code,locale,c.name)}`;
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
  title,
  disabled,
}: PickerProps) {
  const {language}=useLanguage();
  const copy=currencyMessages[language];
  const [open, setOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<"FAST"|"FULL"|"OFFLINE"|null>(null);

  const [all, setAll] = useState<CurrencyMeta[]>(getRuntimeCurrencyCatalog);
  const [query, setQuery] = useState("");

  const [search,setSearch]=useState("");
  useEffect(()=>{const timer=setTimeout(()=>setSearch(query),120);return()=>clearTimeout(timer)},[query]);

  const selected = useMemo(() => {
    const v = upper(value);
    if (!v) return null;
    return all.find((c) => upper(c.code) === v) ?? null;
  }, [value, all]);

  const filtered = useMemo(() => {
    const q = clean(search).toLowerCase();
    if (!q) return [...all].sort((a,b)=>a.code==='TZS'?-1:b.code==='TZS'?1:a.code.localeCompare(b.code));
    return all.filter((c) => {
      const code = upper(c.code).toLowerCase();
      const name = clean(localizedCurrencyName(c.code,language,c.name)).toLocaleLowerCase(language);
      return code.includes(q) || name.includes(q) || c.name.toLowerCase().includes(q) || c.countries?.some(country=>country.toLowerCase().includes(q));
    });
  }, [all, search, language]);

  useEffect(()=>{if(!open){setQuery("");setSearch("");return;}setAll(getRuntimeCurrencyCatalog());setLoading(false);setNote("FULL");},[open]);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{disabled:!!disabled,expanded:open}}
        accessibilityLabel={title||copy.select}
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
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>{title||copy.currency}</Text>
          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 2 }}>
            {selected ? displayLabel(selected,language) : copy.any}
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
              direction: language==='ar'?'rtl':'ltr',
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: UI.background,
              overflow: "hidden",
              height: "85%",
              maxHeight: 640,
              maxWidth: 640,
              width: "100%",
              alignSelf: "center",
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
                    {copy.select}
                  </Text>
                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 2 }}>
                    {copy.hint}
                  </Text>
                </View>

                <Pressable
                  onPress={() => setOpen(false)}
                  style={({ pressed }) => [
                    {
                      width: 44,
                      height: 44,
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
                  placeholder={copy.search}
                  placeholderTextColor={UI.faint}
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
                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                  {note==='OFFLINE'?copy.offline:(note==='FULL'?copy.loaded:copy.available).replace('{count}',new Intl.NumberFormat(language).format(all.length))}
                </Text>
              </View>
            </View>

            {/* List */}
            <FlatList
              style={{flex:1,minHeight:0}}
              initialNumToRender={12}
              maxToRenderPerBatch={12}
              windowSize={5}
              keyboardDismissMode="on-drag"
              data={filtered}
              extraData={language}
              keyExtractor={(it) => it.code}
              keyboardShouldPersistTaps="always"
              renderItem={({ item }) => {
                const active = upper(item.code) === upper(value);
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={item.code+" — "+localizedCurrencyName(item.code,language,item.name)}
                    accessibilityState={{selected:active}}
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
                          {localizedCurrencyName(item.code,language,item.name)}
                        </Text>
                        <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 2 }}>
                          {clean(item.symbolNative || item.symbol)
                            ? `${copy.symbol}: ${item.symbolNative || item.symbol}`
                            : `${copy.symbol}: —`}
                          {typeof item.decimals === "number" ? ` • ${copy.digits}: ${item.decimals}` : ""}
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
                    {copy.empty} “{query}”
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
