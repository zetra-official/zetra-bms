// app/customers/[id].tsx

import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  Text,
  View,
} from "react-native";

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";

import { useOrg } from "../../src/context/OrgContext";
import { supabase } from "../../src/supabase/supabaseClient";
import { Card } from "../../src/ui/Card";
import { Screen } from "../../src/ui/Screen";
import { formatMoney, useOrgMoneyPrefs } from "../../src/ui/money";

const UI = {
  bg0: "#F3F7FC",
  card: "#FFFFFF",
  soft: "#F8FAFC",
  border: "rgba(15,23,42,0.10)",
  text: "#0F172A",
  muted: "#64748B",
  faint: "#94A3B8",
  emerald: "#059669",
  emeraldSoft: "rgba(5,150,105,0.10)",
  danger: "#E11D48",
};

type CustomerRow = {
  id: string;
  store_id: string | null;
  organization_id: string | null;
  full_name: string | null;
  phone: string | null;
  normalized_phone: string | null;
  total_orders: number | null;
  total_spent: number | null;
  last_seen_at: string | null;
  created_at: string | null;
  updated_at: string | null;
avatar_url: string | null;
};

type SaleRow = {
  id: string;
  store_id: string | null;
  customer_id: string | null;
  customer_phone: string | null;
  total_amount: number | null;
  created_at: string | null;
};

type PurchaseDetailRow = {
  sale_id: string;
  purchase_date: string | null;
  payment_method: string | null;
  product_id: string | null;
  product_name: string | null;
  sku: string | null;
  qty: number | null;
  unit_price: number | null;
  line_total: number | null;
};

function clean(v: any) {
  return String(v ?? "").trim();
}

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function waPhone(raw: string) {
  const s = clean(raw).replace(/[^\d+]/g, "");

  if (!s) return "";

  if (s.startsWith("+")) {
    return s.replace(/[^\d]/g, "");
  }

  const digits = s.replace(/[^\d]/g, "");

  if (digits.startsWith("0") && digits.length >= 9) {
    return `255${digits.slice(1)}`;
  }

  if (digits.startsWith("255")) {
    return digits;
  }

  return digits;
}

function prettyDate(raw?: string | null) {
  if (!raw) return "—";

  const d = new Date(raw);

  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleString();
}

function esc(v: any) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function WebIcon({
  label,
  size = 22,
  color,
}: {
  label: string;
  size?: number;
  color: string;
}) {
  return (
    <Text
      style={{
        color,
        fontSize: size,
        fontWeight: "900",
        lineHeight: size + 4,
      }}
    >
      {label}
    </Text>
  );
}

function uriToBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.onload = () => {
      resolve(xhr.response);
    };

    xhr.onerror = () => {
      reject(new Error("Failed to read selected image."));
    };

    xhr.responseType = "blob";
    xhr.open("GET", uri, true);
    xhr.send(null);
  });
}

export default function CustomerProfileScreen() {
  const router = useRouter();

  const params = useLocalSearchParams<{ id?: string | string[] }>();

  const customerId = clean(one(params.id));

  const org: any = useOrg();

  const activeOrgId = clean(org.activeOrgId);

  const money = useOrgMoneyPrefs(activeOrgId);

  const fmt = useCallback(
    (n: number) =>
      formatMoney(n, {
        currency: money.currency || "TZS",
        locale: money.locale || "en-TZ",
      }).replace(/\s+/g, " "),
    [money.currency, money.locale]
  );

  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [sales, setSales] = useState<SaleRow[]>([]);
const [purchaseDetails, setPurchaseDetails] = useState<PurchaseDetailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  const load = useCallback(async () => {
    if (!customerId) {
      setErrorText("Missing customer id.");
      setLoading(false);
      return;
    }

    setErrorText("");

    const customerRes = await supabase
      .from("customers")
      .select(
        "id, store_id, organization_id, full_name, phone, normalized_phone, total_orders, total_spent, last_seen_at, created_at, updated_at, avatar_url"
      )
      .eq("id", customerId)
      .maybeSingle();

    if (customerRes.error) {
      setErrorText(customerRes.error.message);
      setLoading(false);
      return;
    }

   const salesRes = await supabase
  .from("sales")
  .select(
    "id, store_id, customer_id, customer_phone, total_amount, created_at"
  )
  .eq("customer_id", customerId)
  .order("created_at", { ascending: false })
  .limit(50);

if (salesRes.error) {
  setErrorText(salesRes.error.message);
  setLoading(false);
  return;
}

const detailsRes = await supabase.rpc("get_customer_purchase_details_v1", {
  p_customer_id: customerId,
});

if (detailsRes.error) {
  setErrorText(detailsRes.error.message);
  setLoading(false);
  return;
}

setCustomer(customerRes.data as CustomerRow | null);
setSales((salesRes.data ?? []) as SaleRow[]);
setPurchaseDetails((detailsRes.data ?? []) as PurchaseDetailRow[]);
setLoading(false);
  }, [customerId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const name = clean(customer?.full_name) || "Customer";

  const phone =
    clean(customer?.phone) || clean(customer?.normalized_phone);

  const phoneForAction =
    clean(customer?.normalized_phone) || clean(customer?.phone);

  const orders = Number(customer?.total_orders ?? sales.length ?? 0);

  const spent = Number(customer?.total_spent ?? 0);

  const canContact = !!phoneForAction;

  const callCustomer = useCallback(async () => {
    if (!phoneForAction) return;

    await Linking.openURL(`tel:${phoneForAction}`);
  }, [phoneForAction]);

  const smsCustomer = useCallback(async () => {
    if (!phoneForAction) return;

    await Linking.openURL(`sms:${phoneForAction}`);
  }, [phoneForAction]);

  const whatsappCustomer = useCallback(async () => {
    if (!phoneForAction) return;

    const digits = waPhone(phoneForAction);

    if (!digits) {
      Alert.alert(
        "Invalid phone",
        "Customer phone is not valid for WhatsApp."
      );
      return;
    }

    await Linking.openURL(`https://wa.me/${digits}`);
  }, [phoneForAction]);
const uploadCustomerAvatar = useCallback(async () => {
  if (!customer?.id) return;

  try {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        "Please allow gallery access."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (result.canceled || !result.assets?.[0]?.uri) {
      return;
    }

    const asset = result.assets[0];

    const response = await fetch(asset.uri);

    const arrayBuffer =
      await response.arrayBuffer();

    const filePath =
      `customers/${customer.id}/${Date.now()}.jpg`;

    const upload = await supabase.storage
      .from("club-media")
      .upload(filePath, arrayBuffer, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (upload.error) {
      throw upload.error;
    }

    const publicUrl = supabase.storage
      .from("club-media")
      .getPublicUrl(filePath);

    const avatarUrl =
      publicUrl.data.publicUrl;

    const updateRes = await supabase
      .from("customers")
      .update({
        avatar_url: avatarUrl,
      })
      .eq("id", customer.id);

    if (updateRes.error) {
      throw updateRes.error;
    }

    setCustomer((prev) =>
      prev
        ? {
            ...prev,
            avatar_url: avatarUrl,
          }
        : prev
    );

    Alert.alert(
      "Success",
      "Customer profile picture updated."
    );
  } catch (e: any) {
    Alert.alert(
      "Upload failed",
      e?.message ?? "Failed to upload image."
    );
  }
}, [customer]);
 const topSale = useMemo(() => {
  return sales.reduce((max, s) => {
    const n = Number(s.total_amount ?? 0);
    return n > max ? n : max;
  }, 0);
}, [sales]);

const purchaseTotal = useMemo(() => {
  return purchaseDetails.reduce((sum, x) => sum + Number(x.line_total ?? 0), 0);
}, [purchaseDetails]);

const totalQty = useMemo(() => {
  return purchaseDetails.reduce((sum, x) => sum + Number(x.qty ?? 0), 0);
}, [purchaseDetails]);

const averageSale = useMemo(() => {
  if (!sales.length) return 0;
  return purchaseTotal / sales.length;
}, [purchaseTotal, sales.length]);

const favoriteProducts = useMemo(() => {
  const map = new Map<string, { name: string; qty: number; total: number }>();

  for (const x of purchaseDetails) {
    const key = clean(x.product_id) || clean(x.product_name) || "unknown";
    const prev = map.get(key) ?? {
      name: clean(x.product_name) || "Product",
      qty: 0,
      total: 0,
    };

    prev.qty += Number(x.qty ?? 0);
    prev.total += Number(x.line_total ?? 0);

    map.set(key, prev);
  }

  return Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, 5);
}, [purchaseDetails]);

  const exportCustomerPdf = useCallback(async () => {
    if (!customer) return;

    const rowsHtml = sales
      .map(
        (s) => `
        <tr>
          <td>${esc(prettyDate(s.created_at))}</td>
          <td class="right">${esc(fmt(Number(s.total_amount ?? 0)))}</td>
        </tr>`
      )
      .join("");

    const html = `
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 28px;
              color: #101827;
            }

            .brand {
              font-size: 30px;
              font-weight: 900;
              color: #059669;
            }

            .sub {
              color: #667085;
              font-weight: 700;
              margin-top: 4px;
            }

            .card {
              border: 1px solid #D0D5DD;
              border-radius: 18px;
              padding: 18px;
              margin-top: 18px;
            }

            .name {
              font-size: 24px;
              font-weight: 900;
            }

            .grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
              margin-top: 14px;
            }

            .box {
              background: #F8FAFC;
              border-radius: 14px;
              padding: 14px;
            }

            .label {
              color: #667085;
              font-size: 12px;
              font-weight: 800;
            }

            .value {
              font-size: 18px;
              font-weight: 900;
              margin-top: 6px;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 12px;
            }

            th, td {
              padding: 12px;
              border-bottom: 1px solid #EAECF0;
              text-align: left;
            }

            th {
              background: #ECFDF3;
              color: #047857;
            }

            .right {
              text-align: right;
              font-weight: 800;
            }

            .footer {
              margin-top: 24px;
              color: #667085;
              font-size: 12px;
            }
          </style>
        </head>

        <body>
          <div class="brand">${esc(name)}</div>

          <div class="sub">
            Customer Statement • Generated:
            ${esc(prettyDate(new Date().toISOString()))}
          </div>

          <div class="card">
            <div class="name">${esc(name)}</div>

            <div class="sub">${esc(phone || "No phone")}</div>

            <div class="grid">
              <div class="box">
                <div class="label">Orders</div>
                <div class="value">${orders}</div>
              </div>

              <div class="box">
                <div class="label">Total Spent</div>
                <div class="value">${esc(fmt(spent))}</div>
              </div>

              <div class="box">
                <div class="label">Last Seen</div>
                <div class="value">
                  ${esc(prettyDate(customer.last_seen_at))}
                </div>
              </div>

              <div class="box">
                <div class="label">Highest Sale</div>
                <div class="value">${esc(fmt(topSale))}</div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="name" style="font-size:18px;">
              Purchase History
            </div>

            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th class="right">Amount</th>
                </tr>
              </thead>

              <tbody>
                ${
                  rowsHtml ||
                  `<tr><td colspan="2">No linked sales found.</td></tr>`
                }
              </tbody>
            </table>
          </div>

          <div class="footer">
            Powered by ZETRA BMS • Premium business records
          </div>
        </body>
      </html>
    `;

    const file = await Print.printToFileAsync({ html });

    await Sharing.shareAsync(file.uri);
  }, [customer, fmt, name, orders, phone, sales, spent, topSale]);

  return (
    <Screen
      scroll
      bottomPad={120}
      contentStyle={{
        backgroundColor: UI.bg0,
      }}
    >
      <View style={{ gap: 14 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: UI.border,
              backgroundColor: "#FFFFFF",
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <WebIcon label="‹" size={30} color={UI.text} />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: UI.text,
                fontWeight: "900",
                fontSize: 26,
              }}
            >
              Customer Profile
            </Text>

            <Text
              style={{
                color: UI.muted,
                fontWeight: "800",
                marginTop: 4,
              }}
            >
              View history and contact customer
            </Text>
          </View>
        </View>

        {loading ? (
          <Card
            style={{
              alignItems: "center",
              gap: 10,
              backgroundColor: UI.card,
            }}
          >
            <ActivityIndicator />

            <Text
              style={{
                color: UI.muted,
                fontWeight: "800",
              }}
            >
              Loading profile...
            </Text>
          </Card>
        ) : errorText ? (
          <Card style={{ backgroundColor: UI.card }}>
            <Text
              style={{
                color: UI.danger,
                fontWeight: "900",
              }}
            >
              {errorText}
            </Text>
          </Card>
        ) : !customer ? (
          <Card style={{ backgroundColor: UI.card }}>
            <Text
              style={{
                color: UI.muted,
                fontWeight: "900",
              }}
            >
              Customer not found.
            </Text>
          </Card>
        ) : (
          <>
            <Card
              style={{
                gap: 14,
                backgroundColor: UI.card,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  gap: 12,
                  alignItems: "center",
                }}
              >
               <Pressable
  onPress={uploadCustomerAvatar}
  style={({ pressed }) => ({
    width: 74,
    height: 74,
    borderRadius: 999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(52,211,153,0.28)",
    backgroundColor: "rgba(52,211,153,0.10)",
    opacity: pressed ? 0.9 : 1,
    position: "relative",
  })}
>
  {customer?.avatar_url ? (
    <Image
      source={{ uri: customer.avatar_url }}
      style={{
        width: "100%",
        height: "100%",
      }}
      resizeMode="cover"
    />
  ) : (
    <Ionicons
      name="person"
      size={34}
      color={UI.emerald}
    />
  )}

  <View
    style={{
      position: "absolute",
      right: 0,
      bottom: 0,
      width: 24,
      height: 24,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: UI.emerald,
      borderWidth: 2,
      borderColor: "#FFFFFF",
    }}
  >
    <Ionicons
      name="camera"
      size={12}
      color="#FFFFFF"
    />
  </View>
</Pressable>

                <View
                  style={{
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <Text
                    style={{
                      color: UI.text,
                      fontWeight: "900",
                      fontSize: 22,
                    }}
                    numberOfLines={2}
                  >
                    {name}
                  </Text>

                  <Text
                    style={{
                      color: UI.muted,
                      fontWeight: "800",
                      marginTop: 4,
                    }}
                    numberOfLines={1}
                  >
                    {phone || "No phone"}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={exportCustomerPdf}
                style={({ pressed }) => ({
                  paddingVertical: 12,
                  borderRadius: 16,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: "rgba(52,211,153,0.28)",
                  backgroundColor: "rgba(52,211,153,0.10)",
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text
                  style={{
                    color: UI.emerald,
                    fontWeight: "900",
                  }}
                >
                  Export Customer PDF
                </Text>
              </Pressable>

              <View
                style={{
                  flexDirection: "row",
                  gap: 10,
                }}
              >
                <Pressable
                  disabled={!canContact}
                  onPress={callCustomer}
                  style={({ pressed }) => ({
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 16,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: "rgba(52,211,153,0.24)",
                    backgroundColor: "rgba(52,211,153,0.10)",
                    opacity: !canContact ? 0.45 : pressed ? 0.9 : 1,
                  })}
                >
                  <WebIcon
                    label="☎"
                    size={20}
                    color={UI.emerald}
                  />

                  <Text
                    style={{
                      color: UI.text,
                      fontWeight: "900",
                      marginTop: 6,
                    }}
                  >
                    Call
                  </Text>
                </Pressable>

                <Pressable
                  disabled={!canContact}
                  onPress={smsCustomer}
                  style={({ pressed }) => ({
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 16,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: UI.border,
                    backgroundColor: UI.soft,
                    opacity: !canContact ? 0.45 : pressed ? 0.9 : 1,
                  })}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={24} color={UI.text} />

                  <Text
                    style={{
                      color: UI.text,
                      fontWeight: "900",
                      marginTop: 6,
                    }}
                  >
                    SMS
                  </Text>
                </Pressable>

                <Pressable
                  disabled={!canContact}
                  onPress={whatsappCustomer}
                  style={({ pressed }) => ({
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 16,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: "rgba(52,211,153,0.24)",
                    backgroundColor: "rgba(52,211,153,0.10)",
                    opacity: !canContact ? 0.45 : pressed ? 0.9 : 1,
                  })}
                >
                  <Ionicons name="logo-whatsapp" size={26} color={UI.emerald} />

                  <Text
                    style={{
                      color: UI.text,
                      fontWeight: "900",
                      marginTop: 6,
                    }}
                  >
                    WhatsApp
                  </Text>
                </Pressable>
              </View>
            </Card>

          <Card style={{ gap: 12, backgroundColor: UI.card }}>
  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 20 }}>
    Customer Purchase Intelligence
  </Text>

  <View style={{ flexDirection: "row", gap: 10 }}>
    <View style={{ flex: 1, padding: 12, borderRadius: 16, backgroundColor: UI.emeraldSoft }}>
      <Text style={{ color: UI.muted, fontWeight: "900" }}>Total Spent</Text>
      <Text style={{ color: UI.text, fontWeight: "900", marginTop: 4 }}>
        {fmt(purchaseTotal || spent)}
      </Text>
    </View>

    <View style={{ flex: 1, padding: 12, borderRadius: 16, backgroundColor: UI.soft }}>
      <Text style={{ color: UI.muted, fontWeight: "900" }}>Items Qty</Text>
      <Text style={{ color: UI.text, fontWeight: "900", marginTop: 4 }}>{totalQty}</Text>
    </View>
  </View>

  <View style={{ flexDirection: "row", gap: 10 }}>
    <View style={{ flex: 1, padding: 12, borderRadius: 16, backgroundColor: UI.soft }}>
      <Text style={{ color: UI.muted, fontWeight: "900" }}>Receipts</Text>
      <Text style={{ color: UI.text, fontWeight: "900", marginTop: 4 }}>{sales.length}</Text>
    </View>

    <View style={{ flex: 1, padding: 12, borderRadius: 16, backgroundColor: UI.emeraldSoft }}>
      <Text style={{ color: UI.muted, fontWeight: "900" }}>Avg / Sale</Text>
      <Text style={{ color: UI.text, fontWeight: "900", marginTop: 4 }}>{fmt(averageSale)}</Text>
    </View>
  </View>

  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 17, marginTop: 6 }}>
    Most Bought Products
  </Text>

  {favoriteProducts.length === 0 ? (
    <Text style={{ color: UI.muted, fontWeight: "800" }}>No product analytics yet.</Text>
  ) : (
    favoriteProducts.map((p, index) => (
      <View
        key={`${p.name}-${index}`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          padding: 12,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: UI.border,
          backgroundColor: index === 0 ? UI.emeraldSoft : UI.soft,
        }}
      >
        <Text style={{ color: UI.emerald, fontWeight: "900", width: 24 }}>#{index + 1}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: UI.text, fontWeight: "900" }} numberOfLines={1}>
            {p.name}
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 3 }}>
            Qty {p.qty} • {fmt(p.total)}
          </Text>
        </View>
      </View>
    ))
  )}

  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 17, marginTop: 6 }}>
    Full Purchase Details
  </Text>

  {purchaseDetails.length === 0 ? (
    <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
      No linked purchase items found for this customer.
    </Text>
  ) : (
    purchaseDetails.map((x, index) => (
      <View
        key={`${x.sale_id}-${x.product_id}-${index}`}
        style={{
          padding: 12,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: UI.border,
          backgroundColor: UI.soft,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: UI.text, fontWeight: "900" }} numberOfLines={2}>
              {clean(x.product_name) || "Product"}
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 3 }}>
              SKU: {clean(x.sku) || "—"}
            </Text>
          </View>

          <Text style={{ color: UI.emerald, fontWeight: "900" }}>
            {fmt(Number(x.line_total ?? 0))}
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Text style={{ color: UI.muted, fontWeight: "800", flex: 1 }}>
            Qty: {Number(x.qty ?? 0)}
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", flex: 1 }}>
            Unit: {fmt(Number(x.unit_price ?? 0))}
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", flex: 1 }}>
            {clean(x.payment_method) || "CASH"}
          </Text>
        </View>

        <Text style={{ color: UI.faint, fontWeight: "800" }}>
          {prettyDate(x.purchase_date)}
        </Text>
      </View>
    ))
  )}
</Card>
          </>
        )}
      </View>
    </Screen>
  );
}