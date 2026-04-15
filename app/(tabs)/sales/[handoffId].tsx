// app/(tabs)/sales/[handoffId].tsx
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

import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";
import { formatMoney, useOrgMoneyPrefs } from "@/src/ui/money";

type PayMethod = "CASH" | "MOBILE" | "BANK";

type CashierHandoffRow = {
  id: string;
  organization_id: string;
  store_id: string;
  store_name?: string | null;
  cashier_membership_id?: string | null;
  source_membership_id?: string | null;
  source_user_id?: string | null;
  items: any[] | null;
  subtotal: number | null;
  discount_amount: number | null;
  total: number | null;
  note: string | null;
  status: string | null;
  sale_id?: string | null;
  accepted_at?: string | null;
  completed_at?: string | null;
  created_at: string | null;
  updated_at?: string | null;
  item_count?: number | null;
};

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function fmtDateTimeLocal(input?: string | null) {
  if (!input) return "—";
  try {
    const d = new Date(input);
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return String(input);
  }
}

function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(v ?? "").trim()
  );
}

function normalizeHandoff(row: any): CashierHandoffRow | null {
  if (!row) return null;

  return {
    id: String(row?.id ?? "").trim(),
    organization_id: String(row?.organization_id ?? "").trim(),
    store_id: String(row?.store_id ?? "").trim(),
    store_name: row?.store_name ?? null,
    cashier_membership_id: row?.cashier_membership_id ?? null,
    source_membership_id: row?.source_membership_id ?? null,
    source_user_id: row?.source_user_id ?? null,
    items: Array.isArray(row?.items) ? row.items : [],
    subtotal: Number(row?.subtotal ?? 0),
    discount_amount: Number(row?.discount_amount ?? 0),
    total: Number(row?.total ?? 0),
    note: row?.note ?? null,
    status: String(row?.status ?? "").trim().toUpperCase() || null,
    sale_id: row?.sale_id ?? null,
    accepted_at: row?.accepted_at ?? null,
    completed_at: row?.completed_at ?? null,
    created_at: row?.created_at ?? null,
    updated_at: row?.updated_at ?? null,
    item_count: Number(row?.item_count ?? (Array.isArray(row?.items) ? row.items.length : 0)),
  };
}

function MethodChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        flex: 1,
        paddingVertical: 10,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: active ? theme.colors.emeraldBorder : theme.colors.border,
        backgroundColor: active ? theme.colors.emeraldSoft : "rgba(255,255,255,0.06)",
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <Text
        style={{
          color: active ? theme.colors.emerald : theme.colors.text,
          fontWeight: "900",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function FieldLabel({ children }: { children: any }) {
  return (
    <Text style={{ color: theme.colors.muted, fontWeight: "900", marginBottom: 6 }}>
      {children}
    </Text>
  );
}

function InputBox(props: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  multiline?: boolean;
}) {
  return (
    <TextInput
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor="rgba(255,255,255,0.35)"
      keyboardType={props.keyboardType}
      multiline={props.multiline}
      style={{
        color: theme.colors.text,
        fontWeight: "800",
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: props.multiline ? 12 : 10,
        minHeight: props.multiline ? 90 : undefined,
        textAlignVertical: props.multiline ? "top" : "center",
      }}
    />
  );
}

export default function CashierHandoffDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ handoffId?: string | string[] }>();
  const handoffId = (one(params.handoffId) ?? "").trim();

  const { activeOrgId, activeRole } = useOrg() as any;

  const money = useOrgMoneyPrefs(activeOrgId);
  const fmtMoney = useCallback(
    (n: number) =>
      formatMoney(Number(n || 0), {
        currency: money.currency || "TZS",
        locale: money.locale || "en-TZ",
      }).replace(/\s+/g, " "),
    [money.currency, money.locale]
  );

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [row, setRow] = useState<CashierHandoffRow | null>(null);

  const [saving, setSaving] = useState(false);

  const [method, setMethod] = useState<PayMethod>("CASH");
  const [channel, setChannel] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const isCashier = String(activeRole ?? "").trim().toLowerCase() === "cashier";

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      if (!handoffId) throw new Error("Missing handoffId");
      if (!isUuid(handoffId)) {
        throw new Error("Invalid handoff route");
      }

      const { data, error } = await supabase.rpc("get_cashier_handoff_by_id_v1", {
        p_handoff_id: handoffId,
      });

      if (error) throw error;

      const normalized = normalizeHandoff(Array.isArray(data) ? data[0] : data);
      if (!normalized?.id) throw new Error("Handoff not found");

      setRow(normalized);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load handoff");
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [handoffId]);

  useEffect(() => {
    void load();
  }, [load]);

  const status = String(row?.status ?? "").toUpperCase();
  const items = Array.isArray(row?.items) ? row?.items : [];

  const canAccept = useMemo(() => {
    return isCashier && !!row?.id && status === "PENDING" && !saving;
  }, [isCashier, row?.id, saving, status]);

  const canComplete = useMemo(() => {
    if (!isCashier || !row?.id || saving) return false;
    if (status !== "ACCEPTED") return false;

    if (method === "MOBILE" || method === "BANK") {
      if (!channel.trim()) return false;
      if (!reference.trim()) return false;
    }

    return true;
  }, [isCashier, row?.id, saving, status, method, channel, reference]);

  const acceptNow = useCallback(async () => {
    if (!canAccept || !row?.id) return;

    setSaving(true);
    try {
      const { error } = await supabase.rpc("accept_cashier_handoff_v1", {
        p_handoff_id: row.id,
      });

      if (error) throw error;

      Alert.alert("Accepted ✅", "Handoff imekubaliwa. Sasa unaweza kukamilisha mauzo.");
      await load();
    } catch (e: any) {
      Alert.alert("Accept failed", e?.message ?? "Failed to accept handoff");
    } finally {
      setSaving(false);
    }
  }, [canAccept, load, row?.id]);

  const completeNow = useCallback(async () => {
    if (!canComplete || !row?.id) return;

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("complete_cashier_handoff_v1", {
        p_handoff_id: row.id,
        p_payment_method: method,
        p_paid_amount: Number(row.total ?? 0),
        p_payment_channel:
          method === "MOBILE" || method === "BANK" ? channel.trim() || null : null,
        p_reference:
          method === "MOBILE" || method === "BANK" ? reference.trim() || null : null,
        p_note: note.trim() || null,
      });

      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : data;
      const saleId = String(result?.sale_id ?? "").trim();

      Alert.alert("Completed ✅", "Sale imekamilika na risiti iko tayari.");

      if (saleId) {
        router.replace({
          pathname: "/(tabs)/sales/receipt",
          params: { saleId },
        } as any);
        return;
      }

      await load();
    } catch (e: any) {
      Alert.alert("Completion failed", e?.message ?? "Failed to complete handoff");
    } finally {
      setSaving(false);
    }
  }, [canComplete, channel, load, method, note, reference, row?.id, row?.total, router]);

  const openReceipt = useCallback(() => {
    const saleId = String(row?.sale_id ?? "").trim();
    if (!saleId) return;

    router.push({
      pathname: "/(tabs)/sales/receipt",
      params: { saleId },
    } as any);
  }, [router, row?.sale_id]);

  const goShiftOpening = useCallback(() => {
    const storeId = String(row?.store_id ?? "").trim();
    const storeName = String(row?.store_name ?? "").trim();

    if (!storeId) {
      Alert.alert("Missing", "Store ya handoff haijapatikana.");
      return;
    }

    router.push({
      pathname: "/(tabs)/sales/shift-opening",
      params: {
        storeId,
        storeName,
      },
    } as any);
  }, [router, row?.store_id, row?.store_name]);

  const goCashierClosing = useCallback(() => {
    router.push("/(tabs)/settings/cashier-closing" as any);
  }, [router]);

  const pendingTone = useMemo(() => {
    if (status === "PENDING") {
      return {
        border: theme.colors.emeraldBorder,
        bg: theme.colors.emeraldSoft,
      };
    }

    if (status === "ACCEPTED") {
      return {
        border: "rgba(255,255,255,0.18)",
        bg: "rgba(255,255,255,0.06)",
      };
    }

    return {
      border: "rgba(255,255,255,0.12)",
      bg: "rgba(255,255,255,0.06)",
    };
  }, [status]);

  return (
    <Screen scroll bottomPad={180}>
      <View style={{ flex: 1, gap: 14 }}>
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
            <Text style={{ fontSize: 26, fontWeight: "900", color: theme.colors.text }}>
              Cashier Handoff
            </Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              {row?.store_name ?? "Store"} • {status || "—"}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={{ paddingTop: 18, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
              Loading handoff...
            </Text>
          </View>
        ) : err ? (
          <Card style={{ gap: 10 }}>
            <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>
              {err === "Invalid handoff route"
                ? "This route is reserved for cashier handoff only."
                : err}
            </Text>

            {err === "Invalid handoff route" ? (
              <Button title="Back" onPress={() => router.back()} variant="primary" />
            ) : (
              <Button title="Retry" onPress={load} variant="primary" />
            )}
          </Card>
        ) : !row ? (
          <Card>
            <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
              Handoff haijapatikana.
            </Text>
          </Card>
        ) : (
          <>
            <Card style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Handoff ID</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>
                    {String(row.id).slice(0, 8)}...
                  </Text>
                </View>

                <View
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: theme.radius.pill,
                    borderWidth: 1,
                    borderColor: pendingTone.border,
                    backgroundColor: pendingTone.bg,
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{status}</Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Items</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>
                    {Number(row.item_count ?? items.length)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Subtotal</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>
                    {fmtMoney(Number(row.subtotal ?? 0))}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Total</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>
                    {fmtMoney(Number(row.total ?? 0))}
                  </Text>
                </View>
              </View>

              {!!Number(row.discount_amount ?? 0) && (
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Discount: {fmtMoney(Number(row.discount_amount ?? 0))}
                </Text>
              )}

              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                Created: {fmtDateTimeLocal(row.created_at)}
              </Text>

              {!!row.accepted_at && (
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Accepted: {fmtDateTimeLocal(row.accepted_at)}
                </Text>
              )}

              {!!row.completed_at && (
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Completed: {fmtDateTimeLocal(row.completed_at)}
                </Text>
              )}

              {!!String(row.note ?? "").trim() && (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: "rgba(255,255,255,0.04)",
                    borderRadius: 14,
                    padding: 12,
                  }}
                >
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Note</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: "800", marginTop: 6 }}>
                    {String(row.note ?? "").trim()}
                  </Text>
                </View>
              )}
            </Card>

            <Card
              style={{
                gap: 10,
                borderColor: "rgba(245,158,11,0.28)",
                backgroundColor: "rgba(245,158,11,0.08)",
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                Shift Discipline
              </Text>

              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                Utaratibu sahihi wa kazi:
              </Text>

              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                1. Fungua Shift Opening
              </Text>
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                2. Kubali handoff
              </Text>
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                3. Kamilisha sale kwa cashier huyu
              </Text>
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                4. Funga kupitia Cashier Closing / PDF
              </Text>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                <View style={{ flex: 1 }}>
                  <Button title="Shift Opening" onPress={goShiftOpening} variant="secondary" />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title="Cashier Closing" onPress={goCashierClosing} variant="secondary" />
                </View>
              </View>
            </Card>

            <Card style={{ gap: 10 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                Items
              </Text>

              {items.length === 0 ? (
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>No items found.</Text>
              ) : (
                items.map((it: any, idx: number) => {
                  const qty = Math.trunc(Number(it?.qty ?? 0));
                  const unitPrice = Number(it?.unit_price ?? 0);
                  const lineTotal = Number(it?.line_total ?? qty * unitPrice);

                  return (
                    <View
                      key={`${String(it?.product_id ?? idx)}-${idx}`}
                      style={{
                        paddingVertical: 12,
                        borderTopWidth: idx === 0 ? 0 : 1,
                        borderTopColor: "rgba(255,255,255,0.06)",
                        gap: 4,
                      }}
                    >
                      <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                        {String(it?.name ?? it?.product_name ?? "Product")}
                      </Text>

                      <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                        SKU: {String(it?.sku ?? "—")} • Qty: {qty}
                      </Text>

                      <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
                        Unit: {fmtMoney(unitPrice)} • Line: {fmtMoney(lineTotal)}
                      </Text>
                    </View>
                  );
                })
              )}
            </Card>

            {status === "PENDING" ? (
              <Card style={{ gap: 10 }}>
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                  Accept Handoff
                </Text>

                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Ukibonyeza Accept, handoff hii itawekwa chini yako kisha utaendelea kukamilisha mauzo.
                </Text>

                <Text style={{ color: theme.colors.faint, fontWeight: "800" }}>
                  Hakikisha umefungua shift yako kwanza ili ripoti za cashier closing ziwe safi na za mtu husika.
                </Text>

                <Button
                  title={saving ? "Accepting..." : "Accept Handoff"}
                  onPress={acceptNow}
                  disabled={!canAccept}
                  variant="primary"
                />
              </Card>
            ) : null}

            {status === "ACCEPTED" ? (
              <Card style={{ gap: 12 }}>
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                  Complete Sale
                </Text>

                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Cashier anakusanya full amount kisha anakamilisha sale. Total ya kulipwa:{" "}
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                    {fmtMoney(Number(row.total ?? 0))}
                  </Text>
                </Text>

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <MethodChip
                    label="Cash"
                    active={method === "CASH"}
                    onPress={() => setMethod("CASH")}
                  />
                  <MethodChip
                    label="Mobile"
                    active={method === "MOBILE"}
                    onPress={() => setMethod("MOBILE")}
                  />
                  <MethodChip
                    label="Bank"
                    active={method === "BANK"}
                    onPress={() => setMethod("BANK")}
                  />
                </View>

                {(method === "MOBILE" || method === "BANK") && (
                  <>
                    <View>
                      <FieldLabel>
                        {method === "MOBILE"
                          ? "Mobile Channel (e.g. M-PESA)"
                          : "Bank Channel (e.g. NMB / CRDB)"}
                      </FieldLabel>
                      <InputBox
                        value={channel}
                        onChangeText={setChannel}
                        placeholder={method === "MOBILE" ? "M-PESA" : "NMB"}
                        keyboardType="default"
                      />
                    </View>

                    <View>
                      <FieldLabel>Reference / Transaction ID</FieldLabel>
                      <InputBox
                        value={reference}
                        onChangeText={setReference}
                        placeholder="mf: TXN12345"
                        keyboardType="default"
                      />
                    </View>
                  </>
                )}

                <View>
                  <FieldLabel>Completion Note (optional)</FieldLabel>
                  <InputBox
                    value={note}
                    onChangeText={setNote}
                    placeholder="andika maelezo ya cashier completion..."
                    keyboardType="default"
                    multiline
                  />
                </View>

                <Button
                  title={saving ? "Completing..." : "Complete Sale"}
                  onPress={completeNow}
                  disabled={!canComplete}
                  variant="primary"
                />
              </Card>
            ) : null}

            {status === "COMPLETED" ? (
              <Card style={{ gap: 10 }}>
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                  Sale Completed
                </Text>

                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Handoff hii ilikamilishwa tayari. Unaweza kufungua risiti yake hapa chini.
                </Text>

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Open Receipt"
                      onPress={openReceipt}
                      disabled={!String(row.sale_id ?? "").trim()}
                      variant="primary"
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Button title="Cashier Closing" onPress={goCashierClosing} variant="secondary" />
                  </View>
                </View>
              </Card>
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}