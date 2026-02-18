import { supabase } from "@/src/supabase/supabaseClient";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type DraftItem = {
  key: string;
  product_id?: string | null;
  product_name: string;
  unit_price: string; // string input
  qty: string; // string input
};

type PreviewRow = {
  post_id: string;
  store_id: string | null;
  product_id: string | null;
  product_name: string | null;
  unit_price: number | string | null;
  currency: string | null;
  caption?: string | null;
};

function clean(x: any) {
  return String(x ?? "").trim();
}

function upper(x: any) {
  return clean(x).toUpperCase();
}

function asQty(x: string) {
  const n = Number(clean(x));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function asMoney(x: string) {
  const n = Number(clean(x));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

function fmtMoney(n: number, currency = "TZS") {
  try {
    return new Intl.NumberFormat("en-TZ", {
      style: "currency",
      currency: currency || "TZS",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency || "TZS"} ${Math.round(n)}`;
  }
}

export default function CreateClubOrderScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{
    storeId?: string;
    storeName?: string;
    postId?: string;
    postCaption?: string;
    postImageUrl?: string;
  }>();

  // Route params
  const paramStoreId = clean(params?.storeId);
  const storeName = clean(params?.storeName) || "";
  const postId = clean(params?.postId);

  const topPad = Math.max(insets.top, 10) + 8;

  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // ✅ Customer details (required)
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  // ✅ Auto-fill mode (when order is created from a post)
  const fromPost = useMemo(() => !!postId, [postId]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string>("TZS");

  // ✅ Effective storeId (keep stability; allow fallback if param missing)
  const [storeId, setStoreId] = useState<string>(paramStoreId);

  const [items, setItems] = useState<DraftItem[]>([
    { key: "1", product_name: "", unit_price: "", qty: "1", product_id: null },
  ]);

  // ✅ Load order preview from post (auto product + price)
  const loadPreview = useCallback(async () => {
    if (!postId) return;

    setPreviewErr(null);
    setPreviewLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_club_post_order_preview_v2", {
        p_post_id: postId,
      });

      if (error) throw error;

      const row = (Array.isArray(data) ? data?.[0] : data) as PreviewRow | undefined;
      const pName = clean(row?.product_name);
      const pId = clean(row?.product_id);
      const pStore = clean(row?.store_id);
      const pCurrency = upper(row?.currency || "TZS");
      const unit = row?.unit_price as any;
      const pUnit = Number(unit);
      const unitPrice = Number.isFinite(pUnit) ? pUnit : 0;

      if (!pName) throw new Error("Preview missing product_name");
      if (!pId) throw new Error("Preview missing product_id");

      // StoreId fallback (should already match param)
      if (!storeId && pStore) setStoreId(pStore);
      setCurrency(pCurrency || "TZS");

      // ✅ Force Item #1 to match post snapshot (readonly in UI)
      setItems((prev) => {
        const first =
          prev?.[0] ?? { key: "1", product_name: "", unit_price: "", qty: "1", product_id: null };
        const qtyKeep = asQty(first.qty) >= 1 ? first.qty : "1";
        const nextFirst: DraftItem = {
          key: "1",
          product_id: pId,
          product_name: pName,
          unit_price: String(unitPrice),
          qty: qtyKeep,
        };
        return [nextFirst];
      });
    } catch (e: any) {
      setPreviewErr(e?.message ?? "Failed to load post order preview");
    } finally {
      setPreviewLoading(false);
    }
  }, [postId, storeId]);

  useEffect(() => {
    if (!postId) return;
    void loadPreview();
  }, [loadPreview, postId]);

  const subtotal = useMemo(() => {
    let s = 0;
    for (const it of items) {
      const q = asQty(it.qty);
      const p = asMoney(it.unit_price);
      if (!clean(it.product_name).length) continue;
      if (q < 1) continue;
      s += p * q;
    }
    return s;
  }, [items]);

  const totalQty = useMemo(() => {
    let q = 0;
    for (const it of items) {
      if (!clean(it.product_name).length) continue;
      q += asQty(it.qty);
    }
    return q;
  }, [items]);

  const canSubmit = useMemo(() => {
    if (!storeId) return false;

    // customer required
    if (clean(customerName).length < 2) return false;
    if (clean(customerPhone).length < 6) return false;

    // items valid
    const valid = items.some((it) => clean(it.product_name).length && asQty(it.qty) >= 1);
    return valid && !busy && !previewLoading;
  }, [busy, customerName, customerPhone, items, previewLoading, storeId]);

  const addLine = useCallback(() => {
    // ✅ In post-mode: lock to single item (product from post)
    if (fromPost) return;

    setItems((prev) => {
      const nextKey = String(prev.length + 1);
      return [...prev, { key: nextKey, product_name: "", unit_price: "", qty: "1", product_id: null }];
    });
  }, [fromPost]);

  const removeLine = useCallback(
    (key: string) => {
      // ✅ In post-mode: do not allow removing the only item
      if (fromPost) return;

      setItems((prev) => {
        const next = prev.filter((x) => x.key !== key);
        return next.length ? next : [{ key: "1", product_name: "", unit_price: "", qty: "1", product_id: null }];
      });
    },
    [fromPost]
  );

  const updateLine = useCallback(
    (key: string, patch: Partial<DraftItem>) => {
      setItems((prev) =>
        prev.map((x) => {
          if (x.key !== key) return x;

          // ✅ In post-mode: lock name + price, allow qty only
          if (fromPost && x.key === "1") {
            return { ...x, qty: patch.qty ?? x.qty };
          }

          return { ...x, ...patch };
        })
      );
    },
    [fromPost]
  );

  // ✅ SUBMIT (PATCHED): safeNote + customer route
  const submit = useCallback(async () => {
    if (!storeId) return;
    if (!canSubmit) return;

    // ✅ safety: in post-mode, ensure we have product_id + price
    if (fromPost) {
      const first = items?.[0];
      if (!clean(first?.product_id)) {
        Alert.alert("Order", "Product haijajazwa. Tafadhali rudi u-open post tena.");
        return;
      }
      if (!clean(first?.product_name)) {
        Alert.alert("Order", "Product name haijajazwa. Tafadhali rudi u-open post tena.");
        return;
      }
    }

    const payloadItems = items
      .map((it) => ({
        product_id: clean(it.product_id),
        product_name: clean(it.product_name),
        unit_price: String(asMoney(it.unit_price)),
        qty: String(asQty(it.qty) || 1),
      }))
      .filter((x) => x.product_name.length && Number(x.qty) >= 1);

    if (!payloadItems.length) {
      Alert.alert("Order", "Weka angalau item 1 (jina + qty).");
      return;
    }

    // ✅ ONLY CHANGE: note NOT NULL safety
    const safeNote = clean(note) || "—";

    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_club_order_with_items", {
        p_store_id: storeId,
        p_note: safeNote,
        p_items: payloadItems,
        p_customer_name: clean(customerName),
        p_customer_phone: clean(customerPhone),
      });

      if (error) throw error;

      const orderId = clean(data);

      Alert.alert("Order", "Order imetumwa ✅", [
        {
          text: "OPEN",
          onPress: () => {
            if (!orderId) return router.back();

            // ✅ Customer route (NOT staff confirm screen)
            router.replace({
              pathname: "/(tabs)/club/orders/customer/[orderId]" as any,
              params: { orderId, storeId, storeName },
            } as any);
          },
        },
        { text: "OK" },
      ]);
    } catch (e: any) {
      Alert.alert("Order", e?.message ?? "Failed to create order");
    } finally {
      setBusy(false);
    }
  }, [storeId, canSubmit, fromPost, items, note, customerName, customerPhone, router, storeName]);

  const title = "Create Order";

  return (
    <Screen scroll contentStyle={{ paddingTop: topPad }}>
      <View style={{ gap: 12 }}>
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: theme.colors.emeraldBorder,
                  backgroundColor: theme.colors.emeraldSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="bag-handle-outline" size={18} color={theme.colors.emerald} />
              </View>

              <View>
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>{title}</Text>
                <Text style={{ color: theme.colors.faint, fontWeight: "900", fontSize: 12 }}>
                  Store: {storeName ? storeName : storeId ? storeId.slice(0, 8) + "…" : "—"}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={({ pressed }) => [
                {
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
            >
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Back</Text>
            </Pressable>
          </View>
        </Card>

        {/* ✅ Preview state (post-mode) */}
        {fromPost ? (
          <Card style={{ padding: 14, backgroundColor: theme.colors.surface2, borderColor: theme.colors.borderSoft }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="sparkles-outline" size={18} color={theme.colors.emerald} />
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Post auto-fill</Text>
              </View>

              <Pressable
                onPress={() => void loadPreview()}
                hitSlop={10}
                style={({ pressed }) => [
                  {
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: theme.colors.emeraldBorder,
                    backgroundColor: theme.colors.emeraldSoft,
                    opacity: pressed ? 0.92 : 1,
                  },
                ]}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                  {previewLoading ? "Loading..." : "Refresh"}
                </Text>
              </Pressable>
            </View>

            {!!previewErr ? (
              <Text style={{ marginTop: 10, color: theme.colors.dangerText, fontWeight: "900" }}>
                {previewErr}
              </Text>
            ) : null}

            {previewLoading ? (
              <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ActivityIndicator />
                <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Loading product + price from post…</Text>
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* ✅ Customer block */}
        <Card style={{ padding: 14, gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 14 }}>Customer details</Text>

          <TextInput
            value={customerName}
            onChangeText={setCustomerName}
            placeholder="Customer name (required)"
            placeholderTextColor={theme.colors.muted}
            style={{
              height: 44,
              paddingHorizontal: 12,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.06)",
              color: theme.colors.text,
              fontWeight: "800",
            }}
          />

          <TextInput
            value={customerPhone}
            onChangeText={setCustomerPhone}
            placeholder="Phone (required)"
            placeholderTextColor={theme.colors.muted}
            keyboardType="phone-pad"
            style={{
              height: 44,
              paddingHorizontal: 12,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.06)",
              color: theme.colors.text,
              fontWeight: "800",
            }}
          />

          <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 12, lineHeight: 16 }}>
            NOTE: Hizi details zinaenda kwa muuzaji (anaye-receive order) ili athibitishe na kuendelea na malipo.
          </Text>
        </Card>

        {/* ✅ Items */}
        <Card style={{ padding: 14, gap: 12 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 14 }}>Items</Text>

          {items.map((it) => {
            const lockItem = fromPost && it.key === "1";
            return (
              <Card
                key={it.key}
                style={{
                  padding: 12,
                  backgroundColor: theme.colors.surface2,
                  borderColor: theme.colors.borderSoft,
                  gap: 10,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: theme.colors.faint, fontWeight: "900" }}>Item #{it.key}</Text>

                  {!fromPost ? (
                    <Pressable
                      onPress={() => removeLine(it.key)}
                      hitSlop={10}
                      style={({ pressed }) => [
                        {
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: theme.colors.dangerBorder,
                          backgroundColor: theme.colors.dangerSoft,
                          opacity: pressed ? 0.92 : 1,
                        },
                      ]}
                    >
                      <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>Remove</Text>
                    </Pressable>
                  ) : (
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: theme.colors.emeraldBorder,
                        backgroundColor: theme.colors.emeraldSoft,
                      }}
                    >
                      <Text style={{ color: theme.colors.text, fontWeight: "900" }}>AUTO</Text>
                    </View>
                  )}
                </View>

                <TextInput
                  value={it.product_name}
                  onChangeText={(v) => updateLine(it.key, { product_name: v })}
                  editable={!lockItem}
                  placeholder="Product name"
                  placeholderTextColor={theme.colors.muted}
                  style={{
                    height: 44,
                    paddingHorizontal: 12,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: lockItem ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.06)",
                    color: theme.colors.text,
                    fontWeight: "800",
                    opacity: lockItem ? 0.92 : 1,
                  }}
                />

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.faint, fontWeight: "900", marginBottom: 6 }}>Qty</Text>
                    <TextInput
                      value={it.qty}
                      onChangeText={(v) => updateLine(it.key, { qty: v })}
                      keyboardType="numeric"
                      placeholder="1"
                      placeholderTextColor={theme.colors.muted}
                      style={{
                        height: 44,
                        paddingHorizontal: 12,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.12)",
                        backgroundColor: "rgba(255,255,255,0.06)",
                        color: theme.colors.text,
                        fontWeight: "800",
                      }}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.faint, fontWeight: "900", marginBottom: 6 }}>
                      Price ({upper(currency) || "TZS"})
                    </Text>
                    <TextInput
                      value={it.unit_price}
                      onChangeText={(v) => updateLine(it.key, { unit_price: v })}
                      keyboardType="numeric"
                      editable={!lockItem}
                      placeholder="0"
                      placeholderTextColor={theme.colors.muted}
                      style={{
                        height: 44,
                        paddingHorizontal: 12,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.12)",
                        backgroundColor: lockItem ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.06)",
                        color: theme.colors.text,
                        fontWeight: "800",
                        opacity: lockItem ? 0.92 : 1,
                      }}
                    />
                  </View>
                </View>

                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Line total: {fmtMoney(asMoney(it.unit_price) * asQty(it.qty), upper(currency) || "TZS")}
                </Text>

                {lockItem ? (
                  <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 12, lineHeight: 16 }}>
                    Product & price zimetoka kwenye post (snapshot). Customer anaweka qty tu.
                  </Text>
                ) : null}
              </Card>
            );
          })}

          {!fromPost ? (
            <Pressable
              onPress={addLine}
              hitSlop={10}
              style={({ pressed }) => [
                {
                  height: 44,
                  borderRadius: theme.radius.pill,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 10,
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
            >
              <Ionicons name="add-circle-outline" size={18} color={theme.colors.text} />
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Add item</Text>
            </Pressable>
          ) : null}

          <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 6 }}>Note</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Optional note..."
            placeholderTextColor={theme.colors.muted}
            multiline
            style={{
              minHeight: 70,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.06)",
              color: theme.colors.text,
              fontWeight: "800",
            }}
          />

          <Card style={{ padding: 12, backgroundColor: theme.colors.surface2, borderColor: theme.colors.borderSoft }}>
            <Text style={{ color: theme.colors.faint, fontWeight: "900" }}>Summary</Text>
            <View style={{ marginTop: 8, gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Total qty</Text>
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{String(totalQty)}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Subtotal</Text>
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                  {fmtMoney(subtotal, upper(currency) || "TZS")}
                </Text>
              </View>
            </View>
          </Card>

          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            hitSlop={10}
            style={({ pressed }) => [
              {
                height: 48,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: theme.colors.emeraldBorder,
                backgroundColor: theme.colors.emeraldSoft,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 10,
                opacity: !canSubmit ? 0.6 : pressed ? 0.92 : 1,
              },
            ]}
          >
            <Ionicons name="send-outline" size={18} color={theme.colors.emerald} />
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
              {busy ? "Sending..." : "Submit Order"}
            </Text>
          </Pressable>

          <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 12, lineHeight: 16 }}>
            NOTE: Totals zinahesabiwa UI kwa preview; DB bado inafanya validation/usalama kwenye function.
          </Text>
        </Card>
      </View>
    </Screen>
  );
}