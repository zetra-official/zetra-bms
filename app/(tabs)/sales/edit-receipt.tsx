// app/(tabs)/sales/edit-receipt.tsx
import { useOrg } from "@/src/context/OrgContext";
import { useOrgMoneyPrefs } from "@/src/ui/money";
import { supabase } from "@/src/supabase/supabaseClient";
import { Button } from "@/src/ui/Button";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sanitizeNumberInput(v: string) {
  const cleaned = String(v ?? "").replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join("")}`;
}

function darDateKey(input?: string | null) {
  if (!input) return null;

  const d = new Date(input);
  if (!Number.isFinite(d.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Dar_es_Salaam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

function isSameDayDar(input?: string | null) {
  const saleKey = darDateKey(input);
  const nowKey = darDateKey(new Date().toISOString());
  if (!saleKey || !nowKey) return false;
  return saleKey === nowKey;
}

type EditableItem = {
  product_id: string;
  product_name: string;
  sku: string;
  qty: string;
  unit_price: string;
};

type SaleDetail = {
  sale_id?: string;
  id?: string;
  created_at?: string;

  payment_method?: string | null;
  payment_channel?: string | null;
  reference?: string | null;
  note?: string | null;

  total_amount?: number | null;
  paid_amount?: number | null;
  balance_amount?: number | null;

  edited_at?: string | null;
  edited_by?: string | null;
  edited_by_name?: string | null;
  edit_count?: number | null;
  can_edit_same_day?: boolean | null;

  items?: Array<{
    product_id: string;
    product_name?: string | null;
    sku?: string | null;
    qty: number;
    unit_price?: number | null;
    line_total?: number | null;
  }>;
};

export default function EditReceiptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ saleId?: string | string[] }>();
  const saleId = String(one(params.saleId) ?? "").trim();

  const { activeOrgId } = useOrg() as any;
  const money = useOrgMoneyPrefs(activeOrgId);
  const fmtMoney = useCallback((n: number) => money.fmt(Number(n || 0)), [money]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [originalItems, setOriginalItems] = useState<EditableItem[]>([]);
  const [note, setNote] = useState("");

  const dbCanEditSameDay = !!detail?.can_edit_same_day;
  const uiSameDayGuard = useMemo(() => isSameDayDar(detail?.created_at), [detail?.created_at]);
  const canEditSameDay = dbCanEditSameDay && uiSameDayGuard;

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      if (!saleId) throw new Error("Missing saleId");

      const res = await supabase.rpc("get_sale_detail", { p_sale_id: saleId } as any);
      if (res.error) throw res.error;

      const d = Array.isArray(res.data) ? (res.data[0] ?? null) : res.data;
      if (!d) throw new Error("Sale not found");

      const normalized: SaleDetail = {
        ...d,
        edited_at: d?.edited_at ?? null,
        edited_by: d?.edited_by ?? null,
        edited_by_name: d?.edited_by_name ?? null,
        edit_count: d?.edit_count ?? 0,
        can_edit_same_day: d?.can_edit_same_day ?? false,
      };

      setDetail(normalized);
      setNote(String(normalized.note ?? "").trim());

      const nextItems: EditableItem[] = Array.isArray(normalized.items)
        ? normalized.items.map((it: any) => ({
            product_id: String(it?.product_id ?? "").trim(),
            product_name: String(it?.product_name ?? "Product").trim() || "Product",
            sku: String(it?.sku ?? "").trim(),
            qty: String(Math.max(0, Math.trunc(Number(it?.qty ?? 0)))),
            unit_price: String(toNum(it?.unit_price ?? 0)),
          }))
        : [];

      setItems(nextItems);
      setOriginalItems(nextItems);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load editable receipt");
      setDetail(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateItem = useCallback(
    (index: number, patch: Partial<EditableItem>) => {
      setItems((prev) =>
        prev.map((it, i) => {
          if (i !== index) return it;
          return { ...it, ...patch };
        })
      );
    },
    []
  );

  const removeItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const getOriginalItem = useCallback(
    (productId: string) => {
      return originalItems.find((x) => x.product_id === productId) ?? null;
    },
    [originalItems]
  );

  const computed = useMemo(() => {
    let totalQty = 0;
    let totalAmount = 0;

    for (const it of items) {
      const qty = Math.max(0, Math.trunc(Number(it.qty || 0)));
      const unit = Math.max(0, toNum(it.unit_price || 0));
      totalQty += qty;
      totalAmount += qty * unit;
    }

    return {
      totalQty,
      totalAmount,
    };
  }, [items]);

  const originalComputed = useMemo(() => {
    let totalQty = 0;
    let totalAmount = 0;

    for (const it of originalItems) {
      const qty = Math.max(0, Math.trunc(Number(it.qty || 0)));
      const unit = Math.max(0, toNum(it.unit_price || 0));
      totalQty += qty;
      totalAmount += qty * unit;
    }

    return {
      totalQty,
      totalAmount,
    };
  }, [originalItems]);

  const isOverOriginalTotals = useMemo(() => {
    return computed.totalQty > originalComputed.totalQty || computed.totalAmount > originalComputed.totalAmount;
  }, [computed.totalAmount, computed.totalQty, originalComputed.totalAmount, originalComputed.totalQty]);

  const validateBeforeSave = useCallback(() => {
    if (!saleId) {
      Alert.alert("Missing", "saleId haipo.");
      return false;
    }

    if (!canEditSameDay) {
      Alert.alert(
        "Edit closed",
        "Risiti hii haiwezi ku-editiwa. Same-day rule ni ya leo tu kwa timezone ya Africa/Dar_es_Salaam."
      );
      return false;
    }

    if (!items.length) {
      Alert.alert("No items", "Lazima ibaki angalau item moja.");
      return false;
    }

    for (const it of items) {
      const qty = Math.max(0, Math.trunc(Number(it.qty || 0)));
      const unit = Math.max(0, toNum(it.unit_price || 0));
      const original = getOriginalItem(it.product_id);

      if (!it.product_id) {
        Alert.alert("Invalid item", "Kuna item haina product_id.");
        return false;
      }

      if (!original) {
        Alert.alert(
          "Add not allowed",
          `Huwezi kuongeza item mpya kwenye receipt edit. Toa receipt mpya kwa mauzo mapya.`
        );
        return false;
      }

      const originalQty = Math.max(0, Math.trunc(Number(original.qty || 0)));
      const originalUnit = Math.max(0, toNum(original.unit_price || 0));

      if (qty <= 0) {
        Alert.alert("Invalid quantity", `Qty ya "${it.product_name}" lazima iwe zaidi ya 0.`);
        return false;
      }

      if (unit <= 0) {
        Alert.alert("Invalid price", `Bei ya "${it.product_name}" lazima iwe zaidi ya 0.`);
        return false;
      }

      if (qty > originalQty) {
        Alert.alert(
          "Increase not allowed",
          `Qty ya "${it.product_name}" haiwezi kuongezwa kutoka ${originalQty} kwenda ${qty}. Edit ni ya kupunguza tu.`
        );
        return false;
      }

      if (unit > originalUnit) {
        Alert.alert(
          "Increase not allowed",
          `Bei ya "${it.product_name}" haiwezi kuongezwa kutoka ${fmtMoney(originalUnit)} kwenda ${fmtMoney(unit)}.`
        );
        return false;
      }
    }

    if (computed.totalAmount > originalComputed.totalAmount) {
      Alert.alert(
        "Increase not allowed",
        "Total mpya haiwezi kuwa kubwa kuliko total ya awali. Ukihitaji kuongeza, andika receipt mpya."
      );
      return false;
    }

    return true;
  }, [
    saleId,
    canEditSameDay,
    items,
    getOriginalItem,
    computed.totalAmount,
    originalComputed.totalAmount,
    fmtMoney,
  ]);

  const deleteSameDay = useCallback(() => {
    if (!saleId) return;
    if (!canEditSameDay) {
      Alert.alert(
        "Delete closed",
        "Risiti hii haiwezi kufutwa. Same-day rule ni ya leo tu kwa timezone ya Africa/Dar_es_Salaam."
      );
      return;
    }
    if (deleting) return;

    Alert.alert(
      "Delete Same Day",
      "Ukifuta risiti hii, items zote zitarudi store na sale itaondoka kabisa. Uko sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setDeleting(true);

              const { data, error } = await supabase.rpc("delete_sale_same_day_v1", {
                p_sale_id: saleId,
              } as any);

              if (error) throw error;

              const row = Array.isArray(data) ? data[0] : data;
              const restoredQty = Number(row?.restored_qty ?? 0);

              Alert.alert(
                "Deleted",
                `Receipt imefutwa vizuri. Stock restored: ${restoredQty}.`,
                [
                  {
                    text: "OK",
                    onPress: () => router.replace("/(tabs)/sales/history"),
                  },
                ]
              );
            } catch (e: any) {
              Alert.alert("Delete failed", e?.message ?? "Failed to delete same-day receipt");
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  }, [saleId, canEditSameDay, deleting, router]);

  const saveEdit = useCallback(async () => {
    if (saving) return;
    if (!validateBeforeSave()) return;

    setSaving(true);
    try {
      const payloadItems = items.map((it) => ({
        product_id: it.product_id,
        qty: Math.max(0, Math.trunc(Number(it.qty || 0))),
        unit_price: Math.max(0, toNum(it.unit_price || 0)),
      }));

      const { data, error } = await supabase.rpc("edit_sale_same_day_v1", {
        p_sale_id: saleId,
        p_items: payloadItems,
        p_note: note.trim() || null,
      } as any);

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      const nextSaleId = String(row?.sale_id ?? saleId).trim();

      Alert.alert("Success", "Receipt imehaririwa vizuri.", [
        {
          text: "Open Receipt",
          onPress: () => {
            router.replace({
              pathname: "/(tabs)/sales/receipt",
              params: { saleId: nextSaleId },
            } as any);
          },
        },
      ]);
    } catch (e: any) {
      Alert.alert("Edit failed", e?.message ?? "Failed to edit same-day receipt");
    } finally {
      setSaving(false);
    }
  }, [items, note, router, saleId, saving, validateBeforeSave]);

  return (
    <Screen scroll bottomPad={180}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 14 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          >
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 28, fontWeight: "900", color: theme.colors.text }}>
              Edit Receipt
            </Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Same-day correction only
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={{ paddingTop: 18, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
              Loading editable receipt...
            </Text>
          </View>
        ) : err ? (
          <Card style={{ gap: 10 }}>
            <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>{err}</Text>
            <Button title="Retry" onPress={load} variant="primary" />
          </Card>
        ) : !detail ? (
          <Card>
            <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
              Receipt haikupatikana.
            </Text>
          </Card>
        ) : (
          <>
            <Card
              style={{
                gap: 10,
                borderColor: canEditSameDay
                  ? "rgba(52,211,153,0.28)"
                  : "rgba(239,68,68,0.28)",
                backgroundColor: canEditSameDay
                  ? "rgba(52,211,153,0.10)"
                  : "rgba(239,68,68,0.10)",
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                Edit Window
              </Text>

              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                {canEditSameDay ? "Same-day edit allowed" : "Edit window closed"}
              </Text>

              {!uiSameDayGuard ? (
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Local guard: receipt si ya leo kwa timezone ya Africa/Dar_es_Salaam.
                </Text>
              ) : null}

              {!!detail.edited_at && (
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Last edited: {new Date(detail.edited_at).toLocaleString()}
                </Text>
              )}

              {!!detail.edited_by_name && (
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Edited by: {detail.edited_by_name}
                </Text>
              )}
            </Card>

            <Card style={{ gap: 12 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                Items
              </Text>

              {items.map((it, idx) => {
                const qtyNum = Math.max(0, Math.trunc(Number(it.qty || 0)));
                const unitNum = Math.max(0, toNum(it.unit_price || 0));
                const lineTotal = qtyNum * unitNum;

                return (
                  <View
                    key={`${it.product_id}-${idx}`}
                    style={{
                      gap: 10,
                      padding: 12,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: 16,
                      backgroundColor: "rgba(255,255,255,0.04)",
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 15 }}>
                      {it.product_name}
                    </Text>

                    <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                      SKU: {it.sku || "—"}
                    </Text>

                    <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                      Original: Qty {getOriginalItem(it.product_id)?.qty || "0"} • Price{" "}
                      {fmtMoney(toNum(getOriginalItem(it.product_id)?.unit_price || 0))}
                    </Text>

                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            color: theme.colors.muted,
                            fontWeight: "900",
                            marginBottom: 6,
                          }}
                        >
                          Qty
                        </Text>
                       <TextInput
                          value={it.qty}
                          onChangeText={(v) => {
                            const original = getOriginalItem(it.product_id);
                            const originalQty = Math.max(
                              0,
                              Math.trunc(Number(original?.qty || 0))
                            );

                            const nextQty = Math.max(
                              0,
                              Math.trunc(Number(v.replace(/[^\d]/g, "") || 0))
                            );

                            updateItem(idx, {
                              qty: String(Math.min(nextQty, originalQty)),
                            });
                          }}
                          keyboardType="number-pad"
                          style={{
                            color: theme.colors.text,
                            fontWeight: "800",
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                            backgroundColor: "rgba(255,255,255,0.06)",
                            borderRadius: 14,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                          }}
                        /> 
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            color: theme.colors.muted,
                            fontWeight: "900",
                            marginBottom: 6,
                          }}
                        >
                          Unit Price
                        </Text>
                        <TextInput
                          value={it.unit_price}
                          onChangeText={(v) => {
                            const original = getOriginalItem(it.product_id);
                            const originalUnit = Math.max(0, toNum(original?.unit_price || 0));
                            const nextUnit = Math.max(0, toNum(sanitizeNumberInput(v)));

                            updateItem(idx, {
                              unit_price: String(Math.min(nextUnit, originalUnit)),
                            });
                          }}
                          keyboardType="numeric"
                          style={{
                            color: theme.colors.text,
                            fontWeight: "800",
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                            backgroundColor: "rgba(255,255,255,0.06)",
                            borderRadius: 14,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                          }}
                        />
                      </View>
                    </View>

                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                      Line Total: {fmtMoney(lineTotal)}
                    </Text>

                    {items.length > 1 ? (
                      <Button
                        title="Remove Item"
                        onPress={() => removeItem(idx)}
                        variant="secondary"
                      />
                    ) : null}
                  </View>
                );
              })}
            </Card>

            <Card style={{ gap: 10 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                Note
              </Text>

              <TextInput
                value={note}
                onChangeText={setNote}
                multiline
                placeholder="Edit note..."
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={{
                  color: theme.colors.text,
                  fontWeight: "800",
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderRadius: 16,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  minHeight: 100,
                  textAlignVertical: "top",
                }}
              />
            </Card>

            <Card style={{ gap: 10 }}>
              <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
                New Totals
              </Text>

              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
                Qty: {computed.totalQty}
              </Text>

              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 22 }}>
                Total: {fmtMoney(computed.totalAmount)}
              </Text>

              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                Original Qty: {originalComputed.totalQty}
              </Text>

              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                Original Total: {fmtMoney(originalComputed.totalAmount)}
              </Text>

              <Text
                style={{
                  color: isOverOriginalTotals ? theme.colors.danger : theme.colors.muted,
                  fontWeight: "900",
                }}
              >
                Reduction only: huwezi kuongeza quantity, price, au total. Ukihitaji kuongeza,
                andika receipt mpya.
              </Text>
            </Card>

            <Button
              title={saving ? "Saving..." : "Save Same-Day Edit"}
              onPress={saveEdit}
              disabled={saving || deleting || !canEditSameDay || isOverOriginalTotals}
              variant="primary"
            />

            <Button
              title={deleting ? "Deleting..." : "Delete Same Day"}
              onPress={deleteSameDay}
              disabled={saving || deleting || !canEditSameDay}
              variant="secondary"
            />

            <Button
              title="Back to Receipt"
              onPress={() =>
                router.replace({
                  pathname: "/(tabs)/sales/receipt",
                  params: { saleId },
                } as any)
              }
              variant="secondary"
            />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}