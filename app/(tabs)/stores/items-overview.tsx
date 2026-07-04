// app/stores/items-overview.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { formatMoney, useOrgMoneyPrefs } from "@/src/ui/money";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
function downloadHtmlPdfOnWeb(html: string) {
  if (Platform.OS !== "web" || typeof document === "undefined") return false;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();

    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {}
    }, 1500);
  }, 500);

  return true;
}
type ScopeMode = "STORE" | "ORG";

type OrgProfile = {
  business_name?: string | null;
  logo_url?: string | null;
  tin?: string | null;
  vrn?: string | null;
  registration_no?: string | null;
  email?: string | null;
  website?: string | null;
  tagline?: string | null;
  receipt_footer?: string | null;
};

type StoreProfile = {
  store_display_name?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  region?: string | null;
  city?: string | null;
  address?: string | null;
  bank_name?: string | null;
  account_name?: string | null;
  account_number?: string | null;
  mobile_money_name?: string | null;
  mobile_money_number?: string | null;
  payment_instructions?: string | null;
};

function clean(x: any) {
  return String(x ?? "").trim();
}

type ItemRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  qty: number;
  isLowStock: boolean;
  sellingPrice: number | null;
  costPrice: number | null;
  imageUrl: string | null;
  storeId: string | null;
  storeName: string | null;
};

export default function ItemsOverviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    orgId?: string;
    storeId?: string;
    storeName?: string;
    scope?: ScopeMode;
  }>();

  const { activeOrgId, activeOrgName, activeRole, stores, activeStoreId, activeStoreName } =
    useOrg() as any;
  const money = useOrgMoneyPrefs(activeOrgId ?? "");

  const orgId = String(params?.orgId ?? activeOrgId ?? "").trim();
  const startStoreId = String(params?.storeId ?? activeStoreId ?? "").trim();
  const startStoreName = String(params?.storeName ?? activeStoreName ?? "Active Store").trim();

  const roleLower = String(activeRole ?? "").trim().toLowerCase();
const isOwner = roleLower === "owner";
const isStaff = roleLower === "staff";

const [scope, setScope] = useState<ScopeMode>(
  isStaff ? "STORE" : params?.scope === "ORG" ? "ORG" : "STORE"
);
  const [selectedStoreId, setSelectedStoreId] = useState(startStoreId);
  const [selectedStoreName, setSelectedStoreName] = useState(startStoreName);
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
const [expandedItemKey, setExpandedItemKey] = useState<string | null>(null);
const [selectMode, setSelectMode] = useState(false);
const [selectedPdfItems, setSelectedPdfItems] = useState<Record<string, boolean>>({});
const [exportingPdf, setExportingPdf] = useState(false);
const [orgProfile, setOrgProfile] = useState<OrgProfile | null>(null);
const [storeProfile, setStoreProfile] = useState<StoreProfile | null>(null);
  const C: any = (theme as any)?.colors ?? {};
  const TEXT = C?.text ?? "#0F172A";
  const MUTED = C?.muted ?? "#64748B";
  const FAINT = C?.faint ?? "#94A3B8";
  const BORDER = C?.borderSoft ?? "#E5EAF1";
  const EMERALD = C?.emerald ?? "#10B981";

const storeChoices = useMemo(() => {
  const list = (stores ?? [])
    .filter((s: any) => {
      const sidOrg = String(
        s?.organization_id ?? s?.org_id ?? s?.active_org_id ?? orgId ?? ""
      ).trim();

      return !orgId || !sidOrg || sidOrg === orgId;
    })
    .map((s: any) => ({
      id: String(s?.store_id ?? s?.id ?? "").trim(),
      name: String(s?.store_name ?? s?.name ?? "Store").trim(),
    }))
    .filter((s: { id: string; name: string }) => !!s.id);

  const hasStartStore = list.some((s: { id: string; name: string }) => s.id === startStoreId);

  if (startStoreId && !hasStartStore) {
    return [
      {
        id: startStoreId,
        name: startStoreName || "Active Store",
      },
      ...list,
    ];
  }

  return list;
}, [stores, orgId, startStoreId, startStoreName]);

  const loadStoreItems = useCallback(
    async (sid: string, sname: string) => {
      const { data, error } = await supabase.rpc("get_items_overview_v1", {
        p_org_id: orgId,
        p_store_id: sid,
      });

      if (error) throw error;

      return (Array.isArray(data) ? data : [])
        .map((r: any, index: number): ItemRow => {
          const qty = Number(
            r?.qty ??
              r?.quantity ??
              r?.quantity_on_hand ??
              r?.on_hand_qty ??
              r?.stock ??
              r?.stock_on_hand ??
              r?.stock_qty ??
              r?.current_stock ??
              r?.current_qty ??
              r?.available_qty ??
              r?.total_qty ??
              r?.balance_qty ??
              r?.remaining_qty ??
              0
          );

          const sellingPrice =
            r?.selling_price ??
            r?.sellingPrice ??
            r?.sale_price ??
            r?.price ??
            r?.unit_price ??
            null;

          const costPrice =
            r?.cost_price ??
            r?.costPrice ??
            r?.buying_price ??
            r?.buyingPrice ??
            r?.purchase_price ??
            null;

          const lowStockLimit = Number(r?.alert_level ?? r?.low_stock_threshold ?? 5);

          return {
            id: String(
              r?.product_id ??
                r?.item_id ??
                r?.inventory_id ??
                r?.id ??
                `${sid}-${index}`
            ),
            name: String(
              r?.product_name ??
                r?.item_name ??
                r?.name ??
                r?.title ??
                "Unnamed Product"
            ),
            sku: r?.sku || r?.product_sku ? String(r?.sku ?? r?.product_sku) : null,
            unit:
              r?.unit || r?.product_unit || r?.uom
                ? String(r?.unit ?? r?.product_unit ?? r?.uom)
                : null,
            qty,
            isLowStock: qty > 0 && qty <= lowStockLimit,
            sellingPrice: sellingPrice != null ? Number(sellingPrice) : null,
            costPrice: isOwner && costPrice != null ? Number(costPrice) : null,
            imageUrl:
              r?.image_url ||
              r?.product_image_url ||
              r?.photo_url ||
              r?.imageUrl ||
              r?.picture_url
                ? String(
                    r?.image_url ??
                      r?.product_image_url ??
                      r?.photo_url ??
                      r?.imageUrl ??
                      r?.picture_url
                  )
                : null,
            storeId: String(r?.store_id ?? sid),
            storeName: String(r?.store_name ?? sname),
          };
        })
        .filter((r) => !!r.id && !!r.name && Number(r.qty || 0) > 0);
    },
    [isOwner, orgId]
  );

  const loadData = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!orgId) {
        Alert.alert("Missing organization", "Organization haijapatikana.");
        return;
      }

      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);

      try {
        let nextRows: ItemRow[] = [];

     if (scope === "ORG" && !isStaff) {
  const allowedStores = storeChoices;
 const batches = await Promise.all(
  allowedStores.map((s: { id: string; name: string }) =>
    loadStoreItems(s.id, s.name)
  )
);
  nextRows = batches.flat();
} else {
  const sid = selectedStoreId || startStoreId;
  const sname = selectedStoreName || startStoreName || "Active Store";

  if (!sid) {
    Alert.alert("Select store", "Chagua store kwanza.");
    nextRows = [];
  } else {
    nextRows = await loadStoreItems(sid, sname);
  }
}

        nextRows.sort((a, b) => a.name.localeCompare(b.name));
        setRows(nextRows);
      } catch (err: any) {
        Alert.alert("Failed", err?.message ?? "Imeshindikana kupakia items.");
        setRows([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
  orgId,
  scope,
  isStaff,
  selectedStoreId,
  selectedStoreName,
  startStoreId,
  startStoreName,
  storeChoices,
  loadStoreItems,
]
  );

  useEffect(() => {
    void loadData("initial");
  }, [loadData]);

useEffect(() => {
  let alive = true;

  async function loadProfiles() {
    try {
      if (orgId) {
        const { data } = await supabase
          .from("organization_profiles")
          .select("*")
          .eq("organization_id", orgId)
          .maybeSingle();

        if (alive) setOrgProfile((data ?? null) as any);
      } else {
        setOrgProfile(null);
      }

      const sid = selectedStoreId || startStoreId || activeStoreId;

      if (sid) {
        const { data } = await supabase
          .from("store_profiles")
          .select("*")
          .eq("store_id", sid)
          .maybeSingle();

        if (alive) setStoreProfile((data ?? null) as any);
      } else {
        setStoreProfile(null);
      }
    } catch {
      if (alive) {
        setOrgProfile(null);
        setStoreProfile(null);
      }
    }
  }

  void loadProfiles();

  return () => {
    alive = false;
  };
}, [orgId, selectedStoreId, startStoreId, activeStoreId]);

useEffect(() => {
  if (isStaff && scope !== "STORE") {
    setScope("STORE");
  }
}, [isStaff, scope]);
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((item) => {
      const hay = `${item.name} ${item.sku ?? ""} ${item.storeName ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, query]);

  const totalQty = useMemo(
    () => rows.reduce((sum, item) => sum + Number(item.qty || 0), 0),
    [rows]
  );

  const totalSellingValue = useMemo(
    () =>
      rows.reduce(
        (sum, item) => sum + Number(item.qty || 0) * Number(item.sellingPrice || 0),
        0
      ),
    [rows]
  );

  const totalCostValue = useMemo(
    () =>
      rows.reduce(
        (sum, item) => sum + Number(item.qty || 0) * Number(item.costPrice || 0),
        0
      ),
    [rows]
  );
const getItemKey = useCallback((item: ItemRow, index: number) => {
  return `${item.storeId ?? "store"}-${item.id}-${index}`;
}, []);

const selectedRowsForPdf = useMemo(() => {
  return filteredRows.filter((item: ItemRow, index: number) => {
    return !!selectedPdfItems[getItemKey(item, index)];
  });
}, [filteredRows, selectedPdfItems, getItemKey]);

const selectedPdfCount = useMemo(() => {
  return filteredRows.filter((item: ItemRow, index: number) => {
    return !!selectedPdfItems[getItemKey(item, index)];
  }).length;
}, [filteredRows, selectedPdfItems, getItemKey]);

const togglePdfItem = useCallback((item: ItemRow, index: number) => {
  const key = getItemKey(item, index);

  setSelectedPdfItems((prev) => ({
    ...prev,
    [key]: !prev[key],
  }));
}, [getItemKey]);

const clearPdfSelection = useCallback(() => {
  setSelectedPdfItems({});
  setSelectMode(false);
}, []);

const exportItemsPdf = useCallback(async (customerCatalog = false) => {
 if (exportingPdf) return;

const pdfIsOwnerReport = isOwner && !customerCatalog;

// Kama user hajawasha Choose Items,
// toa bidhaa zote.
const rowsForPdf = selectMode
  ? selectedRowsForPdf
  : filteredRows;

// Kama yupo kwenye Choose Items lakini hajachagua hata moja.
if (selectMode && rowsForPdf.length === 0) {
  Alert.alert(
    "No items selected",
    "Chagua angalau bidhaa moja au bonyeza Done Selecting ili kutoa PDF ya bidhaa zote."
  );
  return;
}

if (rowsForPdf.length === 0) {
  Alert.alert("No items", "Hakuna bidhaa za kutoa PDF.");
  return;
}

setExportingPdf(true);

  try {
    const esc = (v: any) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

const pdfQty = rowsForPdf.reduce(
  (sum, item) => sum + Number(item.qty || 0),
  0
);

const pdfSell = rowsForPdf.reduce(
  (sum, item) =>
    sum + Number(item.qty || 0) * Number(item.sellingPrice || 0),
  0
);

const pdfCost = rowsForPdf.reduce(
  (sum, item) =>
    sum + Number(item.qty || 0) * Number(item.costPrice || 0),
  0
);
const businessName = clean(orgProfile?.business_name) || clean(activeOrgName) || "Business";
const storeTitle = clean(storeProfile?.store_display_name) || selectedStoreName || "Active Store";
const logoUrl = clean(orgProfile?.logo_url);

const orgTin = clean(orgProfile?.tin);
const orgVrn = clean(orgProfile?.vrn);
const orgRegNo = clean(orgProfile?.registration_no);
const orgEmail = clean(orgProfile?.email);
const orgWebsite = clean(orgProfile?.website);
const orgTagline = clean(orgProfile?.tagline);

const storePhone = clean(storeProfile?.phone);
const storeWhatsapp = clean(storeProfile?.whatsapp);
const storeEmail = clean(storeProfile?.email);
const storeAddress = clean(storeProfile?.address);
const storeCity = clean(storeProfile?.city);
const storeRegion = clean(storeProfile?.region);

const storeLocationText = [storeAddress, storeCity, storeRegion].filter(Boolean).join(", ");

const orgIdentityHtml = [
  orgTin ? `TIN: ${esc(orgTin)}` : "",
  orgVrn ? `VRN: ${esc(orgVrn)}` : "",
  orgRegNo ? `Reg No: ${esc(orgRegNo)}` : "",
  orgEmail ? `Email: ${esc(orgEmail)}` : "",
  orgWebsite ? `Website: ${esc(orgWebsite)}` : "",
].filter(Boolean).join(" &nbsp;•&nbsp; ");

const storeContactHtml = [
  storePhone ? `Phone: ${esc(storePhone)}` : "",
  storeWhatsapp ? `WhatsApp: ${esc(storeWhatsapp)}` : "",
  storeEmail ? `Email: ${esc(storeEmail)}` : "",
  storeLocationText ? `Location: ${esc(storeLocationText)}` : "",
].filter(Boolean).join("<br/>");

const reportTitle = pdfIsOwnerReport ? "Items Overview Report" : "Price Catalog";
const rowsHtml = rowsForPdf
  .map((item, index) => {
    const sellPrice = Number(item.sellingPrice || 0);
    const sellTotal = Number(item.qty || 0) * sellPrice;
    const costPrice = Number(item.costPrice || 0);
    const costTotal = Number(item.qty || 0) * costPrice;

    return `
      <tr>
        <td class="num">${index + 1}</td>
        <td>
          <div class="name">${esc(item.name)}</div>

        </td>
        <td>${esc(item.sku || "—")}</td>
        <td>${esc(item.unit || "—")}</td>
        ${pdfIsOwnerReport ? `<td class="num">${esc(item.qty)}</td>` : ""}
        <td class="amount">${esc(formatMoney(sellPrice, money))}</td>
        ${pdfIsOwnerReport ? `<td class="amount">${esc(formatMoney(sellTotal, money))}</td>` : ""}
        ${
          pdfIsOwnerReport
            ? `<td class="amount">${esc(formatMoney(costPrice, money))}</td>
               <td class="amount">${esc(formatMoney(costTotal, money))}</td>`
            : ""
        }
      </tr>
    `;
  })
  .join("");

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            @page { size: A4; margin: 22px; }
            * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            body { font-family: Arial, sans-serif; color: #0F172A; font-size: 10.5px; line-height: 1.35; }
            .header {
              display: table;
              width: 100%;
              border-bottom: 3px solid #10B981;
              padding-bottom: 12px;
              margin-bottom: 12px;
            }
            .brand-area { display: table-cell; width: 66%; vertical-align: top; }
            .doc-area { display: table-cell; width: 34%; vertical-align: top; text-align: right; }
            .logo-wrap {
              width: 76px;
              height: 76px;
              border: 1px solid #CBD5E1;
              border-radius: 14px;
              overflow: hidden;
              display: inline-block;
              vertical-align: top;
              margin-right: 12px;
              background: #F8FAFC;
            }
            .logo-wrap img { width: 100%; height: 100%; object-fit: contain; }
            .brand-info { display: inline-block; vertical-align: top; max-width: 76%; }
            .brand { font-size: 20px; font-weight: 900; letter-spacing: .3px; text-transform: uppercase; }
            .tagline { font-size: 9.5px; font-weight: 800; margin-top: 2px; color: #111827; }
            .muted { color: #64748B; font-size: 9px; font-weight: 700; margin-top: 3px; }
            .title { font-size: 16px; font-weight: 900; color: #047857; text-transform: uppercase; }
            .badge {
              display: inline-block;
              border: 1px solid #10B981;
              background: #ECFDF5;
              color: #047857;
              border-radius: 999px;
              padding: 4px 9px;
              font-weight: 900;
              margin-top: 5px;
              font-size: 9px;
            }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0 14px; }
            .grid.staff { grid-template-columns: repeat(3, 1fr); }
            .box { border: 1px solid #DDE3EA; border-radius: 10px; padding: 9px; background: #F8FAFC; }
            .label { color: #64748B; font-size: 8.5px; font-weight: 900; text-transform: uppercase; margin-bottom: 4px; }
            .value { font-size: 11.5px; font-weight: 900; }
            table { width: 100%; border-collapse: collapse; table-layout: ${pdfIsOwnerReport ? "fixed" : "auto"}; }
            th { background: #ECFDF5; color: #064E3B; border: 1px solid #A7F3D0; padding: 7px; font-size: 9px; text-align: left; }
            td { border: 1px solid #E5E7EB; padding: 7px; vertical-align: top; word-break: break-word; }
            .name { font-weight: 900; font-size: 10.5px; }
            .num { text-align: center; font-weight: 900; white-space: nowrap; }
            .amount { text-align: right; font-weight: 900; white-space: nowrap; }
            .footer { margin-top: 16px; border-top: 1px solid #E5E7EB; padding-top: 8px; text-align: center; color: #64748B; font-size: 8.8px; font-weight: 800; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="brand-area">
              ${logoUrl ? `<span class="logo-wrap"><img src="${esc(logoUrl)}" crossorigin="anonymous" /></span>` : ""}
              <span class="brand-info">
                <div class="brand">${esc(businessName)}</div>
                ${orgTagline ? `<div class="tagline">${esc(orgTagline)}</div>` : ""}
                ${orgIdentityHtml ? `<div class="tagline">${orgIdentityHtml}</div>` : ""}
                ${storeContactHtml ? `<div class="tagline">${storeContactHtml}</div>` : ""}
              </span>
            </div>

            <div class="doc-area">
              <div class="title">${esc(reportTitle)}</div>
              <div class="muted">${esc(new Date().toLocaleString())}</div>
              <div class="muted"><b>Store:</b> ${esc(storeTitle)}</div>
              <span class="badge">${pdfIsOwnerReport ? "OWNER REPORT" : "CUSTOMER PRICE LIST"}</span>
            </div>
          </div>

          <div class="grid ${pdfIsOwnerReport ? "" : "staff"}">
            <div class="box"><div class="label">Store</div><div class="value">${esc(storeTitle)}</div></div>
            <div class="box"><div class="label">Items</div><div class="value">${esc(rowsForPdf.length)}</div></div>
            ${pdfIsOwnerReport ? `<div class="box"><div class="label">Total Qty</div><div class="value">${esc(pdfQty)}</div></div>` : ""}
            ${
              pdfIsOwnerReport
                ? `<div class="box"><div class="label">Selling Value</div><div class="value">${esc(formatMoney(pdfSell, money))}</div></div>`
                : ""
            }
          </div>

          ${
            pdfIsOwnerReport
              ? `<div class="grid">
                   <div class="box"><div class="label">Cost Value</div><div class="value">${esc(formatMoney(pdfCost, money))}</div></div>
                   <div class="box"><div class="label">Visibility</div><div class="value">Owner Report</div></div>
                 </div>`
              : ""
          }

          <table>
            <thead>
              <tr>
                <th style="width:5%">#</th>
                <th>Item Name</th>
                <th>SKU</th>
                <th>Unit</th>
                ${pdfIsOwnerReport ? `<th>Qty</th>` : ""}
                <th>Sell Price</th>
                ${pdfIsOwnerReport ? `<th>Sell Total</th><th>Cost Price</th><th>Cost Total</th>` : ""}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="footer">
            ${esc(businessName)}
            ${
              storePhone || storeWhatsapp
                ? ` • Contact: ${esc([storePhone, storeWhatsapp].filter(Boolean).join(" / "))}`
                : ""
            }
          </div>
        </body>
      </html>
    `;

   if (downloadHtmlPdfOnWeb(html)) return;

const { uri } = await Print.printToFileAsync({ html });

if (await Sharing.isAvailableAsync()) {
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle: "Items Overview PDF",
  });
} else {
  await Print.printAsync({ uri });
}
  } catch (e: any) {
    Alert.alert("PDF Failed", e?.message ?? "Imeshindikana kutengeneza PDF.");
  } finally {
    setExportingPdf(false);
  }
}, [
  exportingPdf,
  selectMode,
  selectedRowsForPdf,
  filteredRows,
  selectedStoreName,
  money,
  isOwner,
  orgProfile,
  storeProfile,
  activeOrgName,
]);
  return (
    <Screen scroll={false} contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}>
      <FlatList
        data={filteredRows}
        keyExtractor={(item, index) => `${item.storeId}-${item.id}-${index}`}
        refreshing={refreshing}
        onRefresh={() => void loadData("refresh")}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 140,
          gap: 10,
        }}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
              <Pressable
                onPress={() => router.back()}
                style={{
                  borderWidth: 1,
                  borderColor: BORDER,
                  backgroundColor: "#FFFFFF",
                  borderRadius: 999,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                }}
              >
                <Text style={{ color: TEXT, fontWeight: "900" }}>← Back</Text>
              </Pressable>

              <Pressable
                onPress={() => void loadData("refresh")}
                style={{
                  borderWidth: 1,
                  borderColor: BORDER,
                  backgroundColor: "#FFFFFF",
                  borderRadius: 999,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                }}
              >
                <Text style={{ color: TEXT, fontWeight: "900" }}>Refresh</Text>
              </Pressable>
            </View>

            <Card style={{ gap: 12, backgroundColor: "#FFFFFF", borderColor: BORDER }}>
              <Text style={{ color: FAINT, fontWeight: "900", letterSpacing: 1, fontSize: 11 }}>
                ITEMS OVERVIEW
              </Text>

              <Text style={{ color: TEXT, fontWeight: "900", fontSize: 24 }}>
                {scope === "ORG" ? "Organization Items" : selectedStoreName || "Store Items"}
              </Text>

              <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 20 }}>
                {isOwner
  ? "Angalia bidhaa, picha, quantity, selling price na owner-only buying price."
  : "Angalia bidhaa, picha, quantity na selling price ya store yako."}
              </Text>

              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <Pressable
                  onPress={() => setScope("STORE")}
                  style={{
                    borderWidth: 1,
                    borderColor: scope === "STORE" ? "rgba(16,185,129,0.35)" : BORDER,
                    backgroundColor: scope === "STORE" ? "rgba(16,185,129,0.12)" : "#F8FAFC",
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: scope === "STORE" ? EMERALD : TEXT, fontWeight: "900" }}>
                    Active Store
                  </Text>
                </Pressable>

            {!isStaff ? (
  <Pressable
    onPress={() => setScope("ORG")}
    style={{
      borderWidth: 1,
      borderColor: scope === "ORG" ? "rgba(16,185,129,0.35)" : BORDER,
      backgroundColor: scope === "ORG" ? "rgba(16,185,129,0.12)" : "#F8FAFC",
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    }}
  >
    <Text style={{ color: scope === "ORG" ? EMERALD : TEXT, fontWeight: "900" }}>
      Organization
    </Text>
  </Pressable>
) : null}
              </View>

              {scope === "STORE" ? (
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {(isStaff
  ? storeChoices.filter((s: { id: string; name: string }) => s.id === (selectedStoreId || startStoreId))
  : storeChoices
).map((s: { id: string; name: string }) => (
                    <Pressable
                      key={s.id}
                      onPress={() => {
                        setSelectedStoreId(s.id);
                        setSelectedStoreName(s.name);
                      }}
                      style={{
                        borderWidth: 1,
                        borderColor: selectedStoreId === s.id ? "rgba(59,130,246,0.45)" : BORDER,
                        backgroundColor: selectedStoreId === s.id ? "#EFF6FF" : "#F8FAFC",
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                      }}
                    >
                      <Text style={{ color: TEXT, fontWeight: "900", fontSize: 12 }}>
                        {s.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
                  <Text style={{ color: TEXT, fontWeight: "900" }}>{rows.length} Items</Text>
                </View>

                <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
                  <Text style={{ color: TEXT, fontWeight: "900" }}>Qty {totalQty}</Text>
                </View>

                {isOwner ? (
                  <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
                    <Text style={{ color: TEXT, fontWeight: "900" }}>
                      Sell {formatMoney(totalSellingValue, money)}
                    </Text>
                  </View>
                ) : null}

                {isOwner ? (
                  <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
                    <Text style={{ color: TEXT, fontWeight: "900" }}>
                      Cost {formatMoney(totalCostValue, money)}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 16, backgroundColor: "#F8FAFC", paddingHorizontal: 12 }}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search item, SKU or store..."
                  placeholderTextColor={FAINT}
                  style={{
                    color: TEXT,
                    fontWeight: "800",
                    paddingVertical: 11,
                  }}
                />
              </View>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
  <Pressable
    onPress={() => setSelectMode((v) => !v)}
    style={{
      borderWidth: 1,
      borderColor: selectMode ? "rgba(16,185,129,0.45)" : BORDER,
      backgroundColor: selectMode ? "rgba(16,185,129,0.12)" : "#FFFFFF",
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 9,
    }}
  >
    <Text style={{ color: selectMode ? EMERALD : TEXT, fontWeight: "900", fontSize: 12 }}>
      {selectMode ? "Done Selecting" : "Choose Items"}
    </Text>
  </Pressable>

  <Pressable
    onPress={() => {
      if (isOwner) {
        Alert.alert(
          "PDF kwa ajili ya mteja?",
          "Ukichagua Yes, PDF itaficha total quantity, selling total, cost na visibility kama staff/customer catalog. Ukichagua No, itatoa full owner report.",
          [
            {
              text: "Yes",
              onPress: () => void exportItemsPdf(true),
            },
            {
              text: "No",
              onPress: () => void exportItemsPdf(false),
            },
            {
              text: "Cancel",
              style: "cancel",
            },
          ]
        );
        return;
      }

      void exportItemsPdf(true);
    }}
    disabled={exportingPdf || filteredRows.length === 0}
    style={{
      borderWidth: 1,
      borderColor: "rgba(16,185,129,0.45)",
      backgroundColor: "rgba(16,185,129,0.12)",
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 9,
      opacity: exportingPdf || filteredRows.length === 0 ? 0.55 : 1,
    }}
  >
    <Text style={{ color: TEXT, fontWeight: "900", fontSize: 12 }}>
      {exportingPdf
        ? "Creating PDF..."
        : selectedPdfCount > 0
        ? `Export PDF (${selectedPdfCount})`
        : "Export PDF"}
    </Text>
  </Pressable>

  {selectedPdfCount > 0 ? (
    <Pressable
      onPress={clearPdfSelection}
      style={{
        borderWidth: 1,
        borderColor: BORDER,
        backgroundColor: "#F8FAFC",
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 9,
      }}
    >
      <Text style={{ color: MUTED, fontWeight: "900", fontSize: 12 }}>
        Clear
      </Text>
    </Pressable>
  ) : null}
</View>

{selectMode ? (
  <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 18 }}>
    Chagua bidhaa unazotaka kwenye PDF. Usipochagua, PDF itatoa bidhaa zote zilizo kwenye list hii.
  </Text>
) : null}
            </Card>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingTop: 24, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ color: MUTED, fontWeight: "800", marginTop: 10 }}>
                Loading items...
              </Text>
            </View>
          ) : (
            <Card style={{ backgroundColor: "#FFFFFF", borderColor: BORDER }}>
              <Text style={{ color: TEXT, fontWeight: "900" }}>
                No items found
              </Text>
              <Text style={{ color: MUTED, fontWeight: "800", marginTop: 6 }}>
                Hakuna bidhaa zenye stock kwenye scope hii.
              </Text>
            </Card>
          )
        }
      renderItem={({ item, index }) => {
const itemKey = getItemKey(item, index);
const expanded = expandedItemKey === itemKey;
const selectedForPdf = !!selectedPdfItems[itemKey];

  return (
    <Pressable
      onPress={() => {
  if (selectMode) {
    togglePdfItem(item, index);
    return;
  }

  setExpandedItemKey(expanded ? null : itemKey);
}}
      style={({ pressed }) => ({
        borderRadius: 24,
        opacity: pressed ? 0.94 : 1,
      })}
    >
      <Card
  style={{
    backgroundColor: selectedForPdf ? "rgba(16,185,129,0.10)" : "#FFFFFF",
    borderColor: selectedForPdf ? "rgba(16,185,129,0.45)" : BORDER,
    padding: 12,
  }}
>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
          <View style={{ alignItems: "center", gap: 5 }}>
            {selectMode ? (
  <View
    style={{
      minWidth: 28,
      height: 24,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: selectedForPdf ? "rgba(16,185,129,0.65)" : BORDER,
      backgroundColor: selectedForPdf ? EMERALD : "#FFFFFF",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 8,
    }}
  >
    <Text style={{ color: selectedForPdf ? "#FFFFFF" : MUTED, fontWeight: "900", fontSize: 11 }}>
      {selectedForPdf ? "✓" : ""}
    </Text>
  </View>
) : null}
            <View
              style={{
                minWidth: 28,
                height: 24,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: BORDER,
                backgroundColor: "#F8FAFC",
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 8,
              }}
            >
              <Text style={{ color: TEXT, fontWeight: "900", fontSize: 11 }}>
                {index + 1}
              </Text>
            </View>

            <View
              style={{
                width: 58,
                height: 58,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: BORDER,
                backgroundColor: "#F8FAFC",
                overflow: "hidden",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
              ) : (
                <Text style={{ fontSize: 24 }}>📦</Text>
              )}
            </View>
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{ color: TEXT, fontWeight: "900", fontSize: 15, lineHeight: 20 }}
              numberOfLines={expanded ? undefined : 1}
            >
              {item.name}
            </Text>

            <Text
              style={{ color: MUTED, fontWeight: "800", marginTop: 4, fontSize: 12, lineHeight: 18 }}
              numberOfLines={expanded ? undefined : 1}
            >
              SKU: {item.sku || "—"} {item.unit ? ` | Unit: ${item.unit}` : ""}
            </Text>

            {scope === "ORG" ? (
              <Text style={{ color: FAINT, fontWeight: "800", marginTop: 4, fontSize: 12, lineHeight: 18 }}>
                Store: {item.storeName || "—"}
              </Text>
            ) : null}

            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <Text style={{ color: TEXT, fontWeight: "900", fontSize: 12 }}>
                Qty {item.qty}
              </Text>

              {item.isLowStock ? ( 
                <Text style={{ color: "#DC2626", fontWeight: "900", fontSize: 12 }}>
                  LOW STOCK
                </Text>
              ) : null}

              <Text style={{ color: EMERALD, fontWeight: "900", fontSize: 12 }}>
                Sell {formatMoney(item.sellingPrice ?? 0, money)}
              </Text>

              {isOwner ? (
                <Text style={{ color: "#B45309", fontWeight: "900", fontSize: 12 }}>
                  Cost {formatMoney(item.costPrice ?? 0, money)}
                </Text>
              ) : null}
            </View>

            {expanded ? (
              <View
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTopWidth: 1,
                  borderTopColor: BORDER,
                  gap: 6,
                }}
              >
                <Text style={{ color: TEXT, fontWeight: "900", fontSize: 13 }}>
                  Full Item Details
                </Text>

                <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 19 }}>
                  Name: {item.name}
                </Text>

                <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 19 }}>
                  SKU: {item.sku || "—"}
                </Text>

                <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 19 }}>
                  Unit: {item.unit || "—"}
                </Text>

                <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 19 }}>
                  Quantity: {item.qty}
                </Text>

                <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 19 }}>
                  Selling Price: {formatMoney(item.sellingPrice ?? 0, money)}
                </Text>

                {isOwner ? (
                  <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 19 }}>
                    Cost Price: {formatMoney(item.costPrice ?? 0, money)}
                  </Text>
                ) : null}

                {scope === "ORG" ? (
                  <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 19 }}>
                    Store: {item.storeName || "—"}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}}
        ListFooterComponent={
          filteredRows.length > 0 ? (
            <Text style={{ color: MUTED, fontWeight: "800", textAlign: "center", marginTop: 8 }}>
              Showing {filteredRows.length} of {rows.length} items
            </Text>
          ) : null
        }
      />
    </Screen>
  );
}