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
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function clean(v: any) {
  return String(v ?? "").trim();
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

  if (!Number.isFinite(d.getTime())) {
    return null;
  }

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

type ProductOption = {
  product_id: string;
  product_name: string;
  sku: string | null;
  selling_price: number | null;
  stock_qty: number | null;
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

  const params =
    useLocalSearchParams<{
      saleId?: string | string[];
    }>();

  const saleId = clean(one(params.saleId));

  const {
    activeOrgId,
    activeStoreId,
    activeRole,
  } = useOrg() as any;

  const orgId = clean(activeOrgId);
  const storeId = clean(activeStoreId);

  const roleLower = clean(activeRole).toLowerCase();

  const isOwner = roleLower === "owner";
  const isAdmin = roleLower === "admin";
  const isStaff = roleLower === "staff";
  const isCashier = roleLower === "cashier";

  const money = useOrgMoneyPrefs(orgId);

  const fmtMoney = useCallback(
    (n: number) => money.fmt(Number(n || 0)),
    [money]
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [err, setErr] = useState<string | null>(null);

  const [detail, setDetail] = useState<SaleDetail | null>(null);

  const [items, setItems] = useState<EditableItem[]>([]);
  const [originalItems, setOriginalItems] = useState<EditableItem[]>([]);

  const [note, setNote] = useState("");
  const [editNote, setEditNote] = useState("");

  // =========================================================
  // PRODUCT PICKER
  // =========================================================

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [productLoading, setProductLoading] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  const [productOptions, setProductOptions] =
    useState<ProductOption[]>([]);

  // =========================================================
  // EDIT PERMISSION
  // =========================================================

  const uiSameDayGuard = useMemo(
    () => isSameDayDar(detail?.created_at),
    [detail?.created_at]
  );

  const canEditReceipt = useMemo(() => {
    if (isCashier) return false;

    // OWNER = ANY DATE
    if (isOwner) return true;

    // ADMIN / STAFF = SAME DAY
    if (isAdmin || isStaff) {
      return uiSameDayGuard;
    }

    return false;
  }, [
    isOwner,
    isAdmin,
    isStaff,
    isCashier,
    uiSameDayGuard,
  ]);

  const canDeleteReceipt = useMemo(() => {
    if (isCashier) return false;

    // backend delete_sale_same_day_v1 tayari
    // inaruhusu owner kufuta old receipts
    if (isOwner) return true;

    return uiSameDayGuard;
  }, [isOwner, isCashier, uiSameDayGuard]);

  // =========================================================
  // LOAD RECEIPT
  // =========================================================

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      if (!saleId) {
        throw new Error("Missing saleId");
      }

      const res = await supabase.rpc(
        "get_sale_detail",
        {
          p_sale_id: saleId,
        } as any
      );

      if (res.error) {
        throw res.error;
      }

      const d =
        Array.isArray(res.data)
          ? res.data[0] ?? null
          : res.data;

      if (!d) {
        throw new Error("Sale not found");
      }

      const normalized: SaleDetail = {
        ...d,

        edited_at:
          d?.edited_at ?? null,

        edited_by:
          d?.edited_by ?? null,

        edited_by_name:
          d?.edited_by_name ?? null,

        edit_count:
          d?.edit_count ?? 0,

        can_edit_same_day:
          d?.can_edit_same_day ?? false,
      };

      setDetail(normalized);

      setNote(
        clean(normalized.note)
      );

      setEditNote("");

      const nextItems: EditableItem[] =
        Array.isArray(normalized.items)
          ? normalized.items.map((it: any) => ({
              product_id:
                clean(it?.product_id),

              product_name:
                clean(it?.product_name) ||
                "Product",

              sku:
                clean(it?.sku),

              qty:
                sanitizeNumberInput(
                  String(
                    Number(it?.qty ?? 0)
                  )
                ),

              unit_price:
                String(
                  toNum(it?.unit_price ?? 0)
                ),
            }))
          : [];

      setItems(nextItems);

      // clone — usitumie same reference
      setOriginalItems(
        nextItems.map((x) => ({ ...x }))
      );
    } catch (e: any) {
      setErr(
        e?.message ??
          "Failed to load editable receipt"
      );

      setDetail(null);
      setItems([]);
      setOriginalItems([]);
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    void load();
  }, [load]);

  // =========================================================
  // PRODUCTS FOR "ADD ITEM"
  // =========================================================

const loadProducts = useCallback(async () => {
  if (!storeId) {
    Alert.alert(
      "Products",
      "Active store haijapatikana."
    );
    return;
  }

  setProductLoading(true);

  try {
    const { data, error } = await supabase.rpc(
      "get_products_for_receipt_edit_v1",
      {
        p_store_id: storeId,
      } as any
    );

    if (error) {
      throw error;
    }

    const rows: ProductOption[] = Array.isArray(data)
      ? data
          .map((row: any) => ({
            product_id: clean(row?.product_id),
            product_name: clean(row?.product_name) || "Product",
            sku: clean(row?.sku) || null,
            selling_price: Math.max(
              0,
              toNum(row?.selling_price ?? 0)
            ),
            stock_qty: Math.max(
              0,
              toNum(row?.stock_qty ?? 0)
            ),
          }))
          .filter((row: ProductOption) => !!row.product_id)
      : [];

    setProductOptions(rows);
  } catch (e: any) {
    Alert.alert(
      "Products",
      e?.message ??
        "Failed to load products"
    );

    setProductOptions([]);
  } finally {
    setProductLoading(false);
  }
}, [storeId]);

  const openProductPicker =
    useCallback(async () => {
      if (!canEditReceipt) {
        Alert.alert(
          "Edit not allowed",
          isOwner
            ? "Receipt edit haijaruhusiwa."
            : "Staff/Admin wanaweza ku-edit receipt ya siku hiyo hiyo tu."
        );

        return;
      }

      setProductSearch("");
      setProductModalOpen(true);

      await loadProducts();
    }, [
      canEditReceipt,
      isOwner,
      loadProducts,
    ]);

const filteredProducts = useMemo(() => {
  const q = clean(productSearch).toLowerCase();

  const currentIds = new Set(
    items.map((x) => clean(x.product_id))
  );

  return productOptions
    .filter(
      (p) =>
        !currentIds.has(
          clean(p.product_id)
        )
    )
    .filter((p) => {
      if (!q) return true;

      return (
        clean(p.product_name)
          .toLowerCase()
          .includes(q) ||
        clean(p.sku)
          .toLowerCase()
          .includes(q)
      );
    })
    .slice(0, 100);
}, [
  productOptions,
  productSearch,
  items,
]);

const addProduct = useCallback(
  (product: ProductOption) => {
    const productId = clean(
      product.product_id
    );

    if (!productId) return;

    const exists = items.some(
      (x) =>
        clean(x.product_id) ===
        productId
    );

    if (exists) {
      Alert.alert(
        "Already added",
        "Product hii tayari ipo kwenye receipt."
      );
      return;
    }

    const sellingPrice = Math.max(
      0,
      toNum(product.selling_price ?? 0)
    );

    setItems((prev) => [
      ...prev,
      {
        product_id: productId,
        product_name:
          clean(product.product_name) ||
          "Product",
        sku: clean(product.sku),
        qty: "1",
        unit_price:
          sellingPrice > 0
            ? String(sellingPrice)
            : "",
      },
    ]);

    setProductModalOpen(false);
    setProductSearch("");
  },
  [items]
);

  // =========================================================
  // ITEM EDITING
  // =========================================================

  const updateItem = useCallback(
    (
      index: number,
      patch: Partial<EditableItem>
    ) => {
      setItems((prev) =>
        prev.map((it, i) =>
          i === index
            ? {
                ...it,
                ...patch,
              }
            : it
        )
      );
    },
    []
  );

  const removeItem =
    useCallback(
      (index: number) => {
        if (!canEditReceipt) return;

        if (items.length <= 1) {
          Alert.alert(
            "Last item",
            "Huwezi kuacha receipt bila item. Kama unataka kuondoa item zote, tumia Delete Receipt."
          );

          return;
        }

        const row = items[index];

        const run = () => {
          setItems((prev) =>
            prev.filter(
              (_, i) => i !== index
            )
          );
        };

        if (Platform.OS === "web") {
          const ok = window.confirm(
            `Remove ${row?.product_name ?? "item"} from receipt?`
          );

          if (ok) run();

          return;
        }

        Alert.alert(
          "Remove Item",
          `Unataka kuondoa "${
            row?.product_name ??
            "item"
          }" kwenye receipt hii?`,
          [
            {
              text: "Cancel",
              style: "cancel",
            },
            {
              text: "Remove",
              style: "destructive",
              onPress: run,
            },
          ]
        );
      },
      [
        canEditReceipt,
        items,
      ]
    );

  const getOriginalItem =
    useCallback(
      (productId: string) => {
        return (
          originalItems.find(
            (x) =>
              clean(x.product_id) ===
              clean(productId)
          ) ?? null
        );
      },
      [originalItems]
    );

  // =========================================================
  // TOTALS
  // =========================================================

  const computed =
    useMemo(() => {
      let totalQty = 0;
      let totalAmount = 0;

      for (const it of items) {
        const qty =
          Math.max(
            0,
            toNum(it.qty)
          );

        const unit =
          Math.max(
            0,
            toNum(it.unit_price)
          );

        totalQty += qty;
        totalAmount += qty * unit;
      }

      return {
        totalQty,
        totalAmount,
      };
    }, [items]);

  const originalComputed =
    useMemo(() => {
      let totalQty = 0;
      let totalAmount = 0;

      for (const it of originalItems) {
        const qty =
          Math.max(
            0,
            toNum(it.qty)
          );

        const unit =
          Math.max(
            0,
            toNum(it.unit_price)
          );

        totalQty += qty;
        totalAmount += qty * unit;
      }

      return {
        totalQty,
        totalAmount,
      };
    }, [originalItems]);

  // =========================================================
  // VALIDATION
  // =========================================================

  const validateBeforeSave =
    useCallback(() => {
      if (!saleId) {
        Alert.alert(
          "Missing",
          "saleId haipo."
        );

        return false;
      }

      if (!canEditReceipt) {
        Alert.alert(
          "Edit closed",
          isOwner
            ? "Receipt hii haiwezi ku-editiwa."
            : "Staff/Admin wanaweza ku-edit receipt ya siku hiyo hiyo tu."
        );

        return false;
      }

      if (!items.length) {
        Alert.alert(
          "No items",
          "Receipt lazima iwe na item angalau moja."
        );

        return false;
      }

      const seen =
        new Set<string>();

      for (const it of items) {
        const productId =
          clean(it.product_id);

        const qty =
          toNum(it.qty);

        const unit =
          toNum(it.unit_price);

        if (!productId) {
          Alert.alert(
            "Invalid item",
            "Kuna item haina product_id."
          );

          return false;
        }

        if (seen.has(productId)) {
          Alert.alert(
            "Duplicate item",
            `"${it.product_name}" ipo zaidi ya mara moja.`
          );

          return false;
        }

        seen.add(productId);

        if (qty <= 0) {
          Alert.alert(
            "Invalid quantity",
            `Qty ya "${it.product_name}" lazima iwe zaidi ya 0.`
          );

          return false;
        }

        if (unit <= 0) {
          Alert.alert(
            "Invalid price",
            `Bei ya "${it.product_name}" lazima iwe zaidi ya 0.`
          );

          return false;
        }
      }

      if (
        computed.totalQty <= 0 ||
        computed.totalAmount <= 0
      ) {
        Alert.alert(
          "Invalid totals",
          "Receipt total lazima iwe zaidi ya 0."
        );

        return false;
      }

      return true;
    }, [
      saleId,
      canEditReceipt,
      isOwner,
      items,
      computed.totalQty,
      computed.totalAmount,
    ]);

  // =========================================================
  // SAVE EDIT
  // =========================================================

  const saveEdit =
    useCallback(async () => {
      if (saving || deleting) return;

      if (!validateBeforeSave()) {
        return;
      }

      const runSave = async () => {
        setSaving(true);

        try {
          const payloadItems =
            items.map((it) => ({
              product_id:
                clean(it.product_id),

              qty:
                Number(
                  Number(
                    Math.max(
                      0,
                      toNum(it.qty)
                    )
                  ).toFixed(3)
                ),

              unit_price:
                Math.max(
                  0,
                  toNum(
                    it.unit_price
                  )
                ),
            }));

          const {
            data,
            error,
          } = await supabase.rpc(
            "edit_sale_v2",
            {
              p_sale_id:
                saleId,

              p_items:
                payloadItems,

              p_note:
                clean(note) ||
                null,

              p_edit_note:
                clean(editNote) ||
                null,
            } as any
          );

          if (error) {
            throw error;
          }

          const row =
            Array.isArray(data)
              ? data[0]
              : data;

          const nextSaleId =
            clean(row?.sale_id) ||
            saleId;

          const role =
            clean(
              row?.editor_role
            ).toUpperCase();

          const successText =
            role === "OWNER"
              ? "Receipt imehaririwa vizuri. Stock, totals na payment zime-recalculate."
              : "Receipt ya leo imehaririwa vizuri. Stock na totals zimerekebishwa.";

          if (
            Platform.OS === "web"
          ) {
            window.alert(
              successText
            );

            router.replace({
              pathname:
                "/(tabs)/sales/receipt",
              params: {
                saleId:
                  nextSaleId,
              },
            } as any);

            return;
          }

          Alert.alert(
            "Success ✅",
            successText,
            [
              {
                text:
                  "Open Receipt",

                onPress: () => {
                  router.replace({
                    pathname:
                      "/(tabs)/sales/receipt",

                    params: {
                      saleId:
                        nextSaleId,
                    },
                  } as any);
                },
              },
            ]
          );
        } catch (e: any) {
          Alert.alert(
            "Edit failed",
            e?.message ??
              "Failed to edit receipt"
          );
        } finally {
          setSaving(false);
        }
      };

      const warning = isOwner
        ? "Unakaribia kubadilisha receipt. Mfumo utarudisha stock ya receipt ya zamani kisha utatumia items mpya ulizoweka. Endelea?"
        : "Unakaribia kubadilisha receipt ya leo. Stock na totals zitarekebishwa. Endelea?";

      if (Platform.OS === "web") {
        const ok =
          window.confirm(warning);

        if (!ok) return;

        await runSave();

        return;
      }

      Alert.alert(
        "Confirm Receipt Edit",
        warning,
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "SAVE EDIT",
            onPress: () => {
              void runSave();
            },
          },
        ]
      );
    }, [
      saving,
      deleting,
      validateBeforeSave,
      items,
      saleId,
      note,
      editNote,
      router,
      isOwner,
    ]);

  // =========================================================
  // DELETE RECEIPT
  // =========================================================

  const deleteReceipt =
    useCallback(async () => {
      if (!saleId) return;

      if (!canDeleteReceipt) {
        Alert.alert(
          "Delete closed",
          "Staff/Admin wanaweza kufuta receipt ya siku hiyo hiyo tu."
        );

        return;
      }

      if (deleting || saving) {
        return;
      }

      const runDelete =
        async () => {
          setDeleting(true);

          try {
            const {
              data,
              error,
            } = await supabase.rpc(
              "delete_sale_same_day_v1",
              {
                p_sale_id:
                  saleId,
              } as any
            );

            if (error) {
              throw error;
            }

            const row =
              Array.isArray(data)
                ? data[0]
                : data;

            const restoredQty =
              Number(
                row?.restored_qty ??
                  0
              );

            const msg =
              `Receipt imefutwa. Stock restored: ${restoredQty}.`;

            if (
              Platform.OS === "web"
            ) {
              window.alert(msg);

              router.replace(
                "/(tabs)/sales/history"
              );

              return;
            }

            Alert.alert(
              "Deleted ✅",
              msg,
              [
                {
                  text: "OK",
                  onPress: () =>
                    router.replace(
                      "/(tabs)/sales/history"
                    ),
                },
              ]
            );
          } catch (e: any) {
            Alert.alert(
              "Delete failed",
              e?.message ??
                "Failed to delete receipt"
            );
          } finally {
            setDeleting(false);
          }
        };

      const title =
        isOwner
          ? "Delete Receipt"
          : "Delete Same-Day Receipt";

      const message =
        "Ukifuta receipt hii, items zote zitarudi stock na sale itaondolewa. Uko sure?";

      if (Platform.OS === "web") {
        const ok =
          window.confirm(
            `${title}\n\n${message}`
          );

        if (!ok) return;

        await runDelete();

        return;
      }

      Alert.alert(
        title,
        message,
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "DELETE",
            style: "destructive",
            onPress: () => {
              void runDelete();
            },
          },
        ]
      );
    }, [
      saleId,
      canDeleteReceipt,
      deleting,
      saving,
      router,
      isOwner,
    ]);

  // =========================================================
  // UI
  // =========================================================

  return (
    <Screen
      scroll
      bottomPad={200}
    >
      {/* =====================================================
          ADD PRODUCT MODAL
      ===================================================== */}

      <Modal
        visible={productModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setProductModalOpen(false)
        }
      >
        <View
          style={{
            flex: 1,
            backgroundColor:
              "rgba(0,0,0,0.58)",
            justifyContent:
              "center",
            padding: 16,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 680,
              maxHeight: "85%",
              alignSelf: "center",

              backgroundColor:
                "#FFFFFF",

              borderRadius: 24,

              borderWidth: 1,

              borderColor:
                theme.colors.border,

              padding: 16,

              gap: 12,
            }}
          >
            <View
              style={{
                flexDirection:
                  "row",

                alignItems:
                  "center",

                gap: 10,
              }}
            >
              <View
                style={{
                  flex: 1,
                }}
              >
                <Text
                  style={{
                    color:
                      theme.colors.text,

                    fontWeight:
                      "900",

                    fontSize: 20,
                  }}
                >
                  Add Product
                </Text>

                <Text
                  style={{
                    color:
                      theme.colors.muted,

                    fontWeight:
                      "800",

                    marginTop: 3,
                  }}
                >
                  Chagua bidhaa
                  nyingine ya
                  kuongeza kwenye
                  receipt.
                </Text>
              </View>

              <Pressable
                onPress={() =>
                  setProductModalOpen(
                    false
                  )
                }
                hitSlop={10}
              >
                <Ionicons
                  name="close"
                  size={26}
                  color={
                    theme.colors.text
                  }
                />
              </Pressable>
            </View>

            <TextInput
              value={productSearch}
              onChangeText={
                setProductSearch
              }
              placeholder="Search product name or SKU..."
              placeholderTextColor="rgba(15,23,42,0.35)"
              autoFocus
              style={{
                color:
                  theme.colors.text,

                fontWeight: "800",

                borderWidth: 1,

                borderColor:
                  theme.colors.border,

                backgroundColor:
                  "#F8FAFC",

                borderRadius: 16,

                paddingHorizontal:
                  14,

                paddingVertical: 12,
              }}
            />

            {productLoading ? (
              <View
                style={{
                  paddingVertical: 20,
                  alignItems:
                    "center",
                }}
              >
                <ActivityIndicator />

                <Text
                  style={{
                    color:
                      theme.colors.muted,

                    fontWeight:
                      "800",

                    marginTop: 8,
                  }}
                >
                  Loading products...
                </Text>
              </View>
            ) : (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={
                  false
                }
              >
                <View
                  style={{
                    gap: 8,
                  }}
                >
                 {filteredProducts.map((p) => {
  const price = Math.max(
    0,
    toNum(p.selling_price ?? 0)
  );

  const stockQty = Math.max(
    0,
    toNum(p.stock_qty ?? 0)
  );

  return (
    <Pressable
      key={p.product_id}
      onPress={() => addProduct(p)}
      style={({ pressed }) => ({
        borderRadius: 16,
        borderWidth: 1,
        borderColor:
          "rgba(59,130,246,0.18)",
        backgroundColor: pressed
          ? "rgba(59,130,246,0.10)"
          : "#F8FAFC",
        padding: 12,
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: theme.colors.text,
              fontWeight: "900",
              fontSize: 15,
            }}
          >
            {p.product_name}
          </Text>

          <Text
            style={{
              color: theme.colors.muted,
              fontWeight: "800",
              marginTop: 4,
            }}
          >
            SKU: {p.sku || "—"}
          </Text>
        </View>

        <View
          style={{
            paddingHorizontal: 9,
            paddingVertical: 5,
            borderRadius: 999,
            borderWidth: 1,
            borderColor:
              stockQty > 0
                ? "rgba(52,211,153,0.28)"
                : "rgba(239,68,68,0.24)",
            backgroundColor:
              stockQty > 0
                ? "rgba(52,211,153,0.10)"
                : "rgba(239,68,68,0.08)",
          }}
        >
          <Text
            style={{
              color:
                stockQty > 0
                  ? theme.colors.emerald
                  : theme.colors.danger,
              fontWeight: "900",
              fontSize: 11,
            }}
          >
            Stock: {stockQty}
          </Text>
        </View>
      </View>

      <Text
        style={{
          color: theme.colors.text,
          fontWeight: "900",
          marginTop: 6,
        }}
      >
        {price > 0
          ? fmtMoney(price)
          : "Price not set"}
      </Text>
    </Pressable>
  );
})}

                  {!filteredProducts.length ? (
                    <Text
                      style={{
                        color:
                          theme.colors
                            .muted,

                        fontWeight:
                          "800",

                        textAlign:
                          "center",

                        paddingVertical:
                          20,
                      }}
                    >
                      Hakuna product
                      nyingine
                      iliyopatikana.
                    </Text>
                  ) : null}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={
          false
        }
        contentContainerStyle={{
          gap: 14,
        }}
      >
        {/* HEADER */}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Pressable
            onPress={() =>
              router.back()
            }
            style={{
              width: 44,
              height: 44,

              borderRadius: 999,

              alignItems: "center",
              justifyContent:
                "center",

              borderWidth: 1,

              borderColor:
                theme.colors.border,

              backgroundColor:
                "rgba(255,255,255,0.06)",
            }}
          >
            <Ionicons
              name="chevron-back"
              size={22}
              color={
                theme.colors.text
              }
            />
          </Pressable>

          <View
            style={{
              flex: 1,
            }}
          >
            <Text
              style={{
                fontSize: 28,

                fontWeight:
                  "900",

                color:
                  theme.colors.text,
              }}
            >
              Edit Receipt
            </Text>

            <Text
              style={{
                color:
                  theme.colors.muted,

                fontWeight:
                  "800",
              }}
            >
              {isOwner
                ? "Owner • Full receipt correction"
                : "Same-day correction"}
            </Text>
          </View>
        </View>

        {/* LOAD STATE */}

        {loading ? (
          <View
            style={{
              paddingTop: 18,
              alignItems: "center",
            }}
          >
            <ActivityIndicator />

            <Text
              style={{
                color:
                  theme.colors.muted,

                fontWeight:
                  "800",

                marginTop: 8,
              }}
            >
              Loading editable
              receipt...
            </Text>
          </View>
        ) : err ? (
          <Card
            style={{
              gap: 10,
            }}
          >
            <Text
              style={{
                color:
                  theme.colors.danger,

                fontWeight:
                  "900",
              }}
            >
              {err}
            </Text>

            <Button
              title="Retry"
              onPress={load}
              variant="primary"
            />
          </Card>
        ) : !detail ? (
          <Card>
            <Text
              style={{
                color:
                  theme.colors.muted,

                fontWeight:
                  "900",
              }}
            >
              Receipt
              haikupatikana.
            </Text>
          </Card>
        ) : (
          <>
            {/* EDIT WINDOW */}

            <Card
              style={{
                gap: 10,

                borderColor:
                  canEditReceipt
                    ? "rgba(52,211,153,0.32)"
                    : "rgba(239,68,68,0.30)",

                backgroundColor:
                  canEditReceipt
                    ? "rgba(52,211,153,0.10)"
                    : "rgba(239,68,68,0.10)",
              }}
            >
              <Text
                style={{
                  color:
                    theme.colors.text,

                  fontWeight:
                    "900",

                  fontSize: 16,
                }}
              >
                Edit Permission
              </Text>

              <Text
                style={{
                  color:
                    theme.colors.text,

                  fontWeight:
                    "900",
                }}
              >
                {isOwner
                  ? "Owner: Full edit allowed — any date"
                  : canEditReceipt
                    ? "Same-day edit allowed"
                    : "Edit window closed"}
              </Text>

              {!isOwner &&
              !uiSameDayGuard ? (
                <Text
                  style={{
                    color:
                      theme.colors
                        .muted,

                    fontWeight:
                      "800",
                  }}
                >
                  Staff/Admin edit
                  ni ya receipt ya
                  leo tu.
                </Text>
              ) : null}

              {isOwner &&
              !uiSameDayGuard ? (
                <Text
                  style={{
                    color:
                      theme.colors
                        .muted,

                    fontWeight:
                      "800",
                  }}
                >
                  Receipt hii ni ya
                  zamani, lakini
                  Owner ameruhusiwa
                  kuirekebisha.
                </Text>
              ) : null}

              {!!detail.edited_at ? (
                <Text
                  style={{
                    color:
                      theme.colors
                        .muted,

                    fontWeight:
                      "800",
                  }}
                >
                  Last edited:{" "}
                  {new Date(
                    detail.edited_at
                  ).toLocaleString()}
                </Text>
              ) : null}

              {!!detail.edited_by_name ? (
                <Text
                  style={{
                    color:
                      theme.colors
                        .muted,

                    fontWeight:
                      "800",
                  }}
                >
                  Edited by:{" "}
                  {
                    detail.edited_by_name
                  }
                </Text>
              ) : null}

              <Text
                style={{
                  color:
                    theme.colors
                      .muted,

                  fontWeight:
                    "800",
                }}
              >
                Edit count:{" "}
                {Number(
                  detail.edit_count ??
                    0
                )}
              </Text>
            </Card>

            {/* ITEMS */}

            <Card
              style={{
                gap: 12,
              }}
            >
              <View
                style={{
                  flexDirection:
                    "row",

                  alignItems:
                    "center",

                  gap: 10,
                }}
              >
                <View
                  style={{
                    flex: 1,
                  }}
                >
                  <Text
                    style={{
                      color:
                        theme.colors
                          .text,

                      fontWeight:
                        "900",

                      fontSize: 18,
                    }}
                  >
                    Items
                  </Text>

                  <Text
                    style={{
                      color:
                        theme.colors
                          .muted,

                      fontWeight:
                        "800",

                      marginTop: 3,
                    }}
                  >
                    Increase,
                    decrease, remove
                    or add product.
                  </Text>
                </View>

                <Pressable
                  disabled={
                    !canEditReceipt
                  }
                  onPress={
                    openProductPicker
                  }
                  style={({
                    pressed,
                  }) => ({
                    flexDirection:
                      "row",

                    alignItems:
                      "center",

                    gap: 7,

                    borderRadius:
                      14,

                    borderWidth: 1,

                    borderColor:
                      "rgba(52,211,153,0.32)",

                    backgroundColor:
                      "rgba(52,211,153,0.12)",

                    paddingHorizontal:
                      12,

                    paddingVertical:
                      10,

                    opacity:
                      !canEditReceipt
                        ? 0.45
                        : pressed
                          ? 0.9
                          : 1,
                  })}
                >
                  <Ionicons
                    name="add"
                    size={18}
                    color={
                      theme.colors
                        .emerald
                    }
                  />

                  <Text
                    style={{
                      color:
                        theme.colors
                          .text,

                      fontWeight:
                        "900",
                    }}
                  >
                    Add Item
                  </Text>
                </Pressable>
              </View>

              {items.map(
                (it, idx) => {
                  const qtyNum =
                    Math.max(
                      0,
                      toNum(it.qty)
                    );

                  const unitNum =
                    Math.max(
                      0,
                      toNum(
                        it.unit_price
                      )
                    );

                  const lineTotal =
                    qtyNum *
                    unitNum;

                  const original =
                    getOriginalItem(
                      it.product_id
                    );

                  const isNewItem =
                    !original;

                  return (
                    <View
                      key={`${it.product_id}-${idx}`}
                      style={{
                        gap: 10,

                        padding: 12,

                        borderWidth: 1,

                        borderColor:
                          isNewItem
                            ? "rgba(52,211,153,0.28)"
                            : theme
                                .colors
                                .border,

                        borderRadius:
                          16,

                        backgroundColor:
                          isNewItem
                            ? "rgba(52,211,153,0.06)"
                            : "rgba(255,255,255,0.04)",
                      }}
                    >
                      <View
                        style={{
                          flexDirection:
                            "row",

                          alignItems:
                            "flex-start",

                          gap: 10,
                        }}
                      >
                        <View
                          style={{
                            flex: 1,
                          }}
                        >
                          <Text
                            style={{
                              color:
                                theme
                                  .colors
                                  .text,

                              fontWeight:
                                "900",

                              fontSize:
                                15,
                            }}
                          >
                            {
                              it.product_name
                            }
                          </Text>

                          <Text
                            style={{
                              color:
                                theme
                                  .colors
                                  .muted,

                              fontWeight:
                                "800",

                              marginTop:
                                3,
                            }}
                          >
                            SKU:{" "}
                            {it.sku ||
                              "—"}
                          </Text>
                        </View>

                        {isNewItem ? (
                          <View
                            style={{
                              paddingHorizontal:
                                9,

                              paddingVertical:
                                5,

                              borderRadius:
                                999,

                              borderWidth:
                                1,

                              borderColor:
                                "rgba(52,211,153,0.30)",

                              backgroundColor:
                                "rgba(52,211,153,0.10)",
                            }}
                          >
                            <Text
                              style={{
                                color:
                                  theme
                                    .colors
                                    .emerald,

                                fontWeight:
                                  "900",

                                fontSize:
                                  10,
                              }}
                            >
                              NEW
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      {original ? (
                        <Text
                          style={{
                            color:
                              theme
                                .colors
                                .muted,

                            fontWeight:
                              "800",
                          }}
                        >
                          Original:
                          Qty{" "}
                          {
                            original.qty
                          }{" "}
                          • Price{" "}
                          {fmtMoney(
                            toNum(
                              original.unit_price
                            )
                          )}
                        </Text>
                      ) : (
                        <Text
                          style={{
                            color:
                              theme
                                .colors
                                .emerald,

                            fontWeight:
                              "800",
                          }}
                        >
                          New product
                          added to this
                          receipt
                        </Text>
                      )}

                      <View
                        style={{
                          flexDirection:
                            "row",

                          gap: 10,
                        }}
                      >
                        <View
                          style={{
                            flex: 1,
                          }}
                        >
                          <Text
                            style={{
                              color:
                                theme
                                  .colors
                                  .muted,

                              fontWeight:
                                "900",

                              marginBottom:
                                6,
                            }}
                          >
                            Qty
                          </Text>

                          <TextInput
                            editable={
                              canEditReceipt
                            }
                            value={
                              it.qty
                            }
                            onChangeText={(
                              v
                            ) => {
                              updateItem(
                                idx,
                                {
                                  qty:
                                    sanitizeNumberInput(
                                      v
                                    ),
                                }
                              );
                            }}
                            keyboardType="decimal-pad"
                            style={{
                              color:
                                theme
                                  .colors
                                  .text,

                              fontWeight:
                                "800",

                              borderWidth:
                                1,

                              borderColor:
                                theme
                                  .colors
                                  .border,

                              backgroundColor:
                                "#FFFFFF",

                              borderRadius:
                                14,

                              paddingHorizontal:
                                12,

                              paddingVertical:
                                10,

                              opacity:
                                canEditReceipt
                                  ? 1
                                  : 0.55,
                            }}
                          />
                        </View>

                        <View
                          style={{
                            flex: 1,
                          }}
                        >
                          <Text
                            style={{
                              color:
                                theme
                                  .colors
                                  .muted,

                              fontWeight:
                                "900",

                              marginBottom:
                                6,
                            }}
                          >
                            Unit Price
                          </Text>

                          <TextInput
                            editable={
                              canEditReceipt
                            }
                            value={
                              it.unit_price
                            }
                            onChangeText={(
                              v
                            ) => {
                              updateItem(
                                idx,
                                {
                                  unit_price:
                                    sanitizeNumberInput(
                                      v
                                    ),
                                }
                              );
                            }}
                            keyboardType="numeric"
                            style={{
                              color:
                                theme
                                  .colors
                                  .text,

                              fontWeight:
                                "800",

                              borderWidth:
                                1,

                              borderColor:
                                theme
                                  .colors
                                  .border,

                              backgroundColor:
                                "#FFFFFF",

                              borderRadius:
                                14,

                              paddingHorizontal:
                                12,

                              paddingVertical:
                                10,

                              opacity:
                                canEditReceipt
                                  ? 1
                                  : 0.55,
                            }}
                          />
                        </View>
                      </View>

                      <Text
                        style={{
                          color:
                            theme.colors
                              .text,

                          fontWeight:
                            "900",
                        }}
                      >
                        Line Total:{" "}
                        {fmtMoney(
                          lineTotal
                        )}
                      </Text>

                      <Button
                        title="Remove Item"
                        onPress={() =>
                          removeItem(
                            idx
                          )
                        }
                        disabled={
                          !canEditReceipt
                        }
                        variant="secondary"
                      />
                    </View>
                  );
                }
              )}
            </Card>

            {/* NOTE */}

            <Card
              style={{
                gap: 10,
              }}
            >
              <Text
                style={{
                  color:
                    theme.colors.text,

                  fontWeight:
                    "900",

                  fontSize: 16,
                }}
              >
                Receipt Note
              </Text>

              <TextInput
                editable={
                  canEditReceipt
                }
                value={note}
                onChangeText={
                  setNote
                }
                multiline
                placeholder="Receipt note..."
                placeholderTextColor="rgba(15,23,42,0.35)"
                style={{
                  color:
                    theme.colors.text,

                  fontWeight:
                    "800",

                  borderWidth: 1,

                  borderColor:
                    theme.colors.border,

                  backgroundColor:
                    "#FFFFFF",

                  borderRadius: 16,

                  paddingHorizontal:
                    12,

                  paddingVertical:
                    12,

                  minHeight: 90,

                  textAlignVertical:
                    "top",
                }}
              />

              <Text
                style={{
                  color:
                    theme.colors.text,

                  fontWeight:
                    "900",

                  fontSize: 16,

                  marginTop: 6,
                }}
              >
                Edit Reason
              </Text>

              <TextInput
                editable={
                  canEditReceipt
                }
                value={editNote}
                onChangeText={
                  setEditNote
                }
                multiline
                placeholder="Mfano: Customer alinunua qty 3 badala ya qty 1..."
                placeholderTextColor="rgba(15,23,42,0.35)"
                style={{
                  color:
                    theme.colors.text,

                  fontWeight:
                    "800",

                  borderWidth: 1,

                  borderColor:
                    theme.colors.border,

                  backgroundColor:
                    "#FFFFFF",

                  borderRadius: 16,

                  paddingHorizontal:
                    12,

                  paddingVertical:
                    12,

                  minHeight: 80,

                  textAlignVertical:
                    "top",
                }}
              />
            </Card>

            {/* TOTALS */}

            <Card
              style={{
                gap: 10,
              }}
            >
              <Text
                style={{
                  color:
                    theme.colors.muted,

                  fontWeight:
                    "900",
                }}
              >
                New Totals
              </Text>

              <Text
                style={{
                  color:
                    theme.colors.text,

                  fontWeight:
                    "900",

                  fontSize: 18,
                }}
              >
                Qty:{" "}
                {computed.totalQty}
              </Text>

              <Text
                style={{
                  color:
                    theme.colors.text,

                  fontWeight:
                    "900",

                  fontSize: 22,
                }}
              >
                Total:{" "}
                {fmtMoney(
                  computed.totalAmount
                )}
              </Text>

              <View
                style={{
                  height: 1,

                  backgroundColor:
                    theme.colors
                      .border,
                }}
              />

              <Text
                style={{
                  color:
                    theme.colors.muted,

                  fontWeight:
                    "800",
                }}
              >
                Original Qty:{" "}
                {
                  originalComputed.totalQty
                }
              </Text>

              <Text
                style={{
                  color:
                    theme.colors.muted,

                  fontWeight:
                    "800",
                }}
              >
                Original Total:{" "}
                {fmtMoney(
                  originalComputed.totalAmount
                )}
              </Text>

              <Text
                style={{
                  color:
                    theme.colors
                      .emerald,

                  fontWeight:
                    "900",

                  lineHeight: 20,
                }}
              >
                Full Edit:
                quantity na price
                zinaweza kuongezwa
                au kupunguzwa.
                Products zinaweza
                kuongezwa au
                kuondolewa.
              </Text>
            </Card>

            {/* SAVE */}

            <Button
              title={
                saving
                  ? "Saving..."
                  : isOwner
                    ? "Save Receipt Edit"
                    : "Save Same-Day Edit"
              }
              onPress={
                saveEdit
              }
              disabled={
                saving ||
                deleting ||
                !canEditReceipt ||
                items.length ===
                  0
              }
              variant="primary"
            />

            {/* DELETE */}

            <Button
              title={
                deleting
                  ? "Deleting..."
                  : isOwner
                    ? "Delete Receipt"
                    : "Delete Same Day"
              }
              onPress={
                deleteReceipt
              }
              disabled={
                saving ||
                deleting ||
                !canDeleteReceipt
              }
              variant="secondary"
            />

            {/* BACK */}

            <Button
              title="Back to Receipt"
              onPress={() =>
                router.replace({
                  pathname:
                    "/(tabs)/sales/receipt",

                  params: {
                    saleId,
                  },
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