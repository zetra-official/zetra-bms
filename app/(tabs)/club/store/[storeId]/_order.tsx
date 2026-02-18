import { supabase } from "@/src/supabase/supabaseClient";
import { Button } from "@/src/ui/Button";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function clean(x: any) {
  return String(x ?? "").trim();
}
function upper(x: any) {
  return clean(x).toUpperCase();
}
function num(x: any, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}
function int(x: any, fallback = 1) {
  const n = Math.floor(Number(x));
  return Number.isFinite(n) ? n : fallback;
}

function fmtMoney(n: number, currency = "TZS") {
  const v = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat("en-TZ", {
      style: "currency",
      currency: currency || "TZS",
      maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return `${currency || "TZS"} ${Math.round(v)}`;
  }
}

type Preview = {
  post_id: string;
  store_id: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  currency: string;
  caption: string | null;
};

type PaymentMethod = "COD" | "CASH" | "MOBILE" | "BANK";

export default function ClubOrderFromPostScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{
    storeId?: string;
    storeName?: string;
    postId?: string;
  }>();

  const storeId = clean(params.storeId);
  const storeName = clean(params.storeName) || "Store";
  const postId = clean(params.postId);

  const topPad = Math.max(insets.top, 10) + 8;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [preview, setPreview] = useState<Preview | null>(null);

  // customer inputs
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");

  // order inputs
  const [qtyText, setQtyText] = useState("1");

  // payment
  const [method, setMethod] = useState<PaymentMethod>("COD");
  const [channel, setChannel] = useState(""); // e.g. M-Pesa/AirtelMoney/CRDB etc
  const [reference, setReference] = useState(""); // txn id
  const [submitting, setSubmitting] = useState(false);

  const qty = useMemo(() => {
    const v = int(qtyText, 1);
    return Math.max(1, v);
  }, [qtyText]);

  const unitPrice = useMemo(() => num(preview?.unit_price, 0), [preview?.unit_price]);
  const currency = useMemo(() => clean(preview?.currency) || "TZS", [preview?.currency]);

  const total = useMemo(() => {
    return Math.max(0, qty * unitPrice);
  }, [qty, unitPrice]);

  const loadPreview = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      if (!postId) throw new Error("Missing postId");
      const { data, error } = await supabase.rpc("get_club_post_order_preview", {
        p_post_id: postId,
      });
      if (error) throw error;

      const row = Array.isArray(data) ? (data?.[0] as any) : (data as any);
      if (!row?.post_id) throw new Error("Preview not found (post invalid).");

      setPreview({
        post_id: String(row.post_id),
        store_id: String(row.store_id),
        product_id: String(row.product_id),
        product_name: String(row.product_name),
        unit_price: Number(row.unit_price) || 0,
        currency: String(row.currency || "TZS"),
        caption: row.caption ?? null,
      });
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load order preview");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const canSubmit = useMemo(() => {
    if (loading || submitting) return false;
    if (!preview?.post_id) return false;
    if (!clean(customerName)) return false;
    if (qty <= 0) return false;

    // MOBILE/BANK require channel + reference (professional confirm flow)
    if (method === "MOBILE" || method === "BANK") {
      if (!clean(channel) || !clean(reference)) return false;
    }

    return true;
  }, [channel, customerName, loading, method, preview?.post_id, qty, reference, submitting]);

  const submit = useCallback(async () => {
    if (!canSubmit) return;

    setErr(null);
    setSubmitting(true);

    try {
      const payload = {
        p_post_id: postId,
        p_customer_name: clean(customerName),
        p_phone: clean(phone),
        p_location: clean(location),
        p_note: clean(note),
        p_qty: qty,
        p_payment_method: upper(method),
        p_payment_channel: clean(channel) || null,
        p_payment_reference: clean(reference) || null,
      };

      const { data, error } = await supabase.rpc("create_club_order_from_post", payload);
      if (error) throw error;

      const oid =
        (Array.isArray(data) ? data?.[0]?.order_id : (data as any)?.order_id) ?? null;

      Alert.alert(
        "Order Sent ✅",
        method === "COD" || method === "CASH"
          ? "Order imepokelewa. Malipo yatakuwa wakati wa delivery/pickup."
          : "Order imepokelewa. Tafadhali hakikisha malipo yamefanyika na reference iko sahihi."
      );

      // Forward-only: go back to store page (safe), passing hint
      router.replace({
        pathname: "/(tabs)/club/store/[storeId]" as any,
        params: { storeId, storeName, newOrderId: String(oid ?? "") },
      } as any);
    } catch (e: any) {
      setErr(e?.message ?? "Order failed");
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    channel,
    customerName,
    location,
    method,
    note,
    phone,
    postId,
    qty,
    reference,
    router,
    storeId,
    storeName,
  ]);

  const PaymentChip = ({
    value,
    label,
    icon,
  }: {
    value: PaymentMethod;
    label: string;
    icon: any;
  }) => {
    const active = method === value;
    return (
      <Pressable
        onPress={() => setMethod(value)}
        hitSlop={10}
        style={({ pressed }) => [
          {
            flex: 1,
            height: 44,
            borderRadius: theme.radius.pill,
            borderWidth: 1,
            borderColor: active ? theme.colors.emeraldBorder : "rgba(255,255,255,0.12)",
            backgroundColor: active ? theme.colors.emeraldSoft : "rgba(255,255,255,0.06)",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        <Ionicons name={icon} size={16} color={active ? theme.colors.emerald : theme.colors.text} />
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <Screen scroll contentStyle={{ paddingTop: topPad }}>
      <View style={{ gap: 12 }}>
        {/* header */}
        <Card style={{ padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={({ pressed }) => [
                {
                  width: 44,
                  height: 40,
                  borderRadius: theme.radius.pill,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
            >
              <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                Order Form
              </Text>
              <Text style={{ color: theme.colors.faint, fontWeight: "900", fontSize: 12 }}>
                {storeName}
              </Text>
            </View>

            <Pressable onPress={() => void loadPreview()} hitSlop={10} style={{ padding: 8 }}>
              <Ionicons name="refresh" size={18} color={theme.colors.faint} />
            </Pressable>
          </View>
        </Card>

        {!!err && (
          <Card style={{ backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.dangerBorder }}>
            <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>{err}</Text>
          </Card>
        )}

        {/* product preview */}
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Product</Text>

          {loading ? (
            <Text style={{ marginTop: 8, color: theme.colors.muted, fontWeight: "900" }}>
              Loading product info...
            </Text>
          ) : preview ? (
            <View style={{ marginTop: 10, gap: 6 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                {preview.product_name}
              </Text>
              <Text style={{ color: theme.colors.emerald, fontWeight: "900", fontSize: 16 }}>
                {fmtMoney(unitPrice, currency)}
              </Text>
              {!!clean(preview.caption) && (
                <Text style={{ color: theme.colors.faint, fontWeight: "800" }} numberOfLines={2}>
                  Post: {preview.caption}
                </Text>
              )}
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                Bei hii inatoka DB (snapshot ya post) — form itatumia bei hiyo.
              </Text>
            </View>
          ) : (
            <Text style={{ marginTop: 8, color: theme.colors.dangerText, fontWeight: "900" }}>
              Preview haijapatikana.
            </Text>
          )}
        </Card>

        {/* qty + totals */}
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Quantity</Text>
          <TextInput
            value={qtyText}
            onChangeText={(t) => setQtyText(t.replace(/[^\d]/g, ""))}
            placeholder="1"
            placeholderTextColor={theme.colors.faint}
            keyboardType="number-pad"
            style={{
              marginTop: 8,
              height: 46,
              borderRadius: theme.radius.xl,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              paddingHorizontal: 12,
              color: theme.colors.text,
              fontWeight: "900",
            }}
          />

          <View style={{ marginTop: 10, flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: theme.colors.faint, fontWeight: "900" }}>Total</Text>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
              {fmtMoney(total, currency)}
            </Text>
          </View>
        </Card>

        {/* customer */}
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Customer Details</Text>

          <Text style={{ marginTop: 10, color: theme.colors.faint, fontWeight: "900" }}>Full name *</Text>
          <TextInput
            value={customerName}
            onChangeText={setCustomerName}
            placeholder="Mf: Asha Mohamed"
            placeholderTextColor={theme.colors.faint}
            style={{
              marginTop: 6,
              height: 46,
              borderRadius: theme.radius.xl,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              paddingHorizontal: 12,
              color: theme.colors.text,
              fontWeight: "800",
            }}
          />

          <Text style={{ marginTop: 10, color: theme.colors.faint, fontWeight: "900" }}>Phone</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="07xxxxxxxx"
            placeholderTextColor={theme.colors.faint}
            keyboardType="phone-pad"
            style={{
              marginTop: 6,
              height: 46,
              borderRadius: theme.radius.xl,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              paddingHorizontal: 12,
              color: theme.colors.text,
              fontWeight: "800",
            }}
          />

          <Text style={{ marginTop: 10, color: theme.colors.faint, fontWeight: "900" }}>Location</Text>
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="Mf: Soweto / Mbeya"
            placeholderTextColor={theme.colors.faint}
            style={{
              marginTop: 6,
              height: 46,
              borderRadius: theme.radius.xl,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              paddingHorizontal: 12,
              color: theme.colors.text,
              fontWeight: "800",
            }}
          />

          <Text style={{ marginTop: 10, color: theme.colors.faint, fontWeight: "900" }}>Note (hiari)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Maelekezo ya delivery/pickup..."
            placeholderTextColor={theme.colors.faint}
            multiline
            style={{
              marginTop: 6,
              minHeight: 80,
              borderRadius: theme.radius.xl,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: theme.colors.text,
              fontWeight: "800",
            }}
          />
        </Card>

        {/* payment */}
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Payment Method</Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <PaymentChip value="COD" label="COD" icon="bicycle-outline" />
            <PaymentChip value="CASH" label="CASH" icon="cash-outline" />
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <PaymentChip value="MOBILE" label="MOBILE" icon="phone-portrait-outline" />
            <PaymentChip value="BANK" label="BANK" icon="card-outline" />
          </View>

          {(method === "MOBILE" || method === "BANK") && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: theme.colors.faint, fontWeight: "900" }}>
                {method === "MOBILE" ? "Network/Wallet *" : "Bank/Channel *"}
              </Text>
              <TextInput
                value={channel}
                onChangeText={setChannel}
                placeholder={method === "MOBILE" ? "Mf: M-Pesa / AirtelMoney" : "Mf: CRDB / NMB"}
                placeholderTextColor={theme.colors.faint}
                style={{
                  marginTop: 6,
                  height: 46,
                  borderRadius: theme.radius.xl,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  paddingHorizontal: 12,
                  color: theme.colors.text,
                  fontWeight: "800",
                }}
              />

              <Text style={{ marginTop: 10, color: theme.colors.faint, fontWeight: "900" }}>
                Reference / Transaction ID *
              </Text>
              <TextInput
                value={reference}
                onChangeText={setReference}
                placeholder="Mf: TXN123456"
                placeholderTextColor={theme.colors.faint}
                style={{
                  marginTop: 6,
                  height: 46,
                  borderRadius: theme.radius.xl,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  paddingHorizontal: 12,
                  color: theme.colors.text,
                  fontWeight: "800",
                }}
              />

              <Text style={{ marginTop: 10, color: theme.colors.muted, fontWeight: "800" }}>
                Hapa tunafunga “confirm flow”: bila channel + reference order haitatuma.
              </Text>
            </View>
          )}

          {method === "COD" && (
            <Text style={{ marginTop: 10, color: theme.colors.muted, fontWeight: "800" }}>
              COD = Payment wakati wa delivery/pickup.
            </Text>
          )}
        </Card>

        <Button title={submitting ? "Sending..." : "Send Order"} onPress={submit} disabled={!canSubmit} />
      </View>
    </Screen>
  );
}