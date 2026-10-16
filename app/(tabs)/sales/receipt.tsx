import {paymentMethodKey} from "@/src/i18n/presentation";
import {useDocumentText} from "@/src/i18n/useDocumentText";
import {useSystemMessageText} from "@/src/i18n/useSystemMessageText";
﻿import {useCommonText} from "@/src/i18n/useCommonText";
import { useOrg } from "@/src/context/OrgContext";
import { useOrgMoneyPrefs } from "@/src/ui/money";
import { supabase } from "@/src/supabase/supabaseClient";

import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
// Ionicons removed: web browsers were showing square boxes instead of icons.
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Share,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function shortId(id: string) {
  const s = (id ?? "").trim();
  if (!s) return "—";
  return s.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function clean(x: any) {
  return String(x ?? "").trim();
}

function parseDiscountFromNote(note: string | null | undefined) {
  const raw = String(note ?? "");
  const idx = raw.indexOf("DISCOUNT:");
  if (idx < 0) return null;

  const tag = raw.slice(idx).trim();

  const textMatch = tag.match(/DISCOUNT:\s*"(.*?)"/);
  const amtMatch = tag.match(/DISCOUNT_AMOUNT:\s*([0-9]+)/);
  const subMatch = tag.match(/SUBTOTAL:\s*([0-9]+)/);

  const discountText = (textMatch?.[1] ?? "").trim();
  const discountAmount = Number(amtMatch?.[1] ?? NaN);
  const subtotal = Number(subMatch?.[1] ?? NaN);

  const okAmt = Number.isFinite(discountAmount) ? discountAmount : 0;
  const okSub = Number.isFinite(subtotal) ? subtotal : NaN;

  return {
    discountText: discountText || "—",
    discountAmount: Math.max(0, Math.round(okAmt)),
    subtotal: Number.isFinite(okSub)
      ? Math.max(0, Math.round(okSub))
      : null,
    tag,
  };
}

function stripDiscountTag(note: string | null | undefined) {
  const raw = String(note ?? "").trim();
  if (!raw) return null;

  let cleaned = raw;

  const discountIdx = cleaned.indexOf("DISCOUNT:");
  if (discountIdx >= 0) {
    cleaned = cleaned.slice(0, discountIdx).trim();
  }

  cleaned = cleaned
    .split("\n")
    .map((x) => x.trim())
    .filter((line) => {
      if (!line) return false;

      if (/^CASHIER_HANDOFF_ID\s*:/i.test(line)) return false;
      if (/^SPLIT_PAYMENT\s*:/i.test(line)) return false;
      if (/^CREDIT_PAYMENT\s*:/i.test(line)) return false;
      if (/^CREDIT\s*:/i.test(line)) return false;

      if (/^SOLD_BY_MEMBERSHIP_ID\s*:/i.test(line)) return false;
      if (/^CASHIER_MEMBERSHIP_ID\s*:/i.test(line)) return false;

      if (/^HANDOFF_CUSTOMER_NAME\s*:/i.test(line)) return false;
      if (/^HANDOFF_CUSTOMER_PHONE\s*:/i.test(line)) return false;

      if (/^HANDOFF_SOLD_BY_MEMBERSHIP_ID\s*:/i.test(line)) {
        return false;
      }

      if (/^(customer|mteja)\s*:/i.test(line)) return false;
      if (/^(phone|simu|namba)\s*:/i.test(line)) return false;

      return true;
    })
    .join("\n")
    .trim();

  return cleaned || null;
}

function parseSplitPaymentFromNote(
  note: string | null | undefined
) {
  const raw = String(note ?? "");

  const m = raw.match(
    /SPLIT_PAYMENT:\s*CASH=([0-9]+)\s*\|\s*MOBILE=([0-9]+)\s*\|\s*BANK=([0-9]+)/i
  );

  if (!m) return null;

  const cash = Number(m[1] ?? 0);
  const mobile = Number(m[2] ?? 0);
  const bank = Number(m[3] ?? 0);

  return {
    cash: Number.isFinite(cash)
      ? Math.max(0, Math.round(cash))
      : 0,

    mobile: Number.isFinite(mobile)
      ? Math.max(0, Math.round(mobile))
      : 0,

    bank: Number.isFinite(bank)
      ? Math.max(0, Math.round(bank))
      : 0,
  };
}

function parseCreditPaymentFromNote(
  note: string | null | undefined
) {
  const raw = String(note ?? "");

  const m = raw.match(
    /CREDIT_PAYMENT:\s*PAID=([0-9]+(?:\.[0-9]+)?)\s*\|\s*BALANCE=([0-9]+(?:\.[0-9]+)?)\s*\|\s*PAID_VIA=([A-Z]+)/i
  );

  if (!m) return null;

  const paid = Number(m[1] ?? 0);
  const balance = Number(m[2] ?? 0);

  const paidVia = String(m[3] ?? "")
    .trim()
    .toUpperCase();

  return {
    paid: Number.isFinite(paid)
      ? Math.max(0, paid)
      : 0,

    balance: Number.isFinite(balance)
      ? Math.max(0, balance)
      : 0,

    paidVia: paidVia || "NONE",
  };
}

function parseCustomerFromNote(
  note: string | null | undefined
) {
  const raw = String(note ?? "");

  if (!raw.trim()) {
    return {
      name: null as string | null,
      phone: null as string | null,
    };
  }

  const cleanNoteValue = stripDiscountTag(raw) ?? "";

  const lines = String(cleanNoteValue)
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

  let name: string | null = null;
  let phone: string | null = null;

  for (const line of lines) {
    const m1 = line.match(
      /^(customer|mteja)\s*:\s*(.+)$/i
    );

    if (m1?.[2] && !name) {
      name = String(m1[2]).trim();
    }

    const m2 = line.match(
      /^(phone|simu|namba)\s*:\s*(.+)$/i
    );

    if (m2?.[2] && !phone) {
      phone = String(m2[2]).trim();
    }
  }

  return {
    name: name || null,
    phone: phone || null,
  };
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

  const year = parts.find(
    (p) => p.type === "year"
  )?.value;

  const month = parts.find(
    (p) => p.type === "month"
  )?.value;

  const day = parts.find(
    (p) => p.type === "day"
  )?.value;

  if (!year || !month || !day) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

function isSameDayDar(input?: string | null) {
  const saleKey = darDateKey(input);

  const nowKey = darDateKey(
    new Date().toISOString()
  );

  if (!saleKey || !nowKey) {
    return false;
  }

  return saleKey === nowKey;
}

function addDaysLabel(
  input: string | null | undefined,
  days: number
) {
  if (!input) return "—";

  const d = new Date(input);

  if (!Number.isFinite(d.getTime())) {
    return "—";
  }

  d.setDate(d.getDate() + days);

  try {
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return d.toDateString();
  }
}

async function shareHtmlPdfOnMobileWeb(
  html: string,
  fileName: string, uiText: (source: string) => string
) {
  if (
    Platform.OS !== "web" ||
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) {
    return false;
  }

let host: HTMLDivElement | null =
    null;

  try {
    const [
      html2canvasModule,
      jspdfModule,
    ] = await Promise.all([
      import("html2canvas"),
      import("jspdf/dist/jspdf.es.min.js"),
    ]);

    const html2canvas =
      html2canvasModule.default;

    const jsPDF =
      jspdfModule.jsPDF;

    host =
      document.createElement(
        "div"
      );

    host.style.position =
      "fixed";

    host.style.left =
      "-100000px";

    host.style.top =
      "0";

    host.style.width =
      "794px";

    host.style.background =
      "#ffffff";

    host.style.pointerEvents =
      "none";

    const iframe =
      document.createElement(
        "iframe"
      );

    iframe.style.width =
      "794px";

    iframe.style.height =
      "1123px";

    iframe.style.border =
      "0";

    iframe.style.background =
      "#ffffff";

    host.appendChild(
      iframe
    );

    document.body.appendChild(
      host
    );

    const frameDoc =
      iframe.contentDocument ??
      iframe.contentWindow?.document;

    if (!frameDoc) {
      throw new Error(
        "Unable to prepare invoice PDF."
      );
    }

    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    await new Promise<void>(
      (resolve) => {
        setTimeout(
          resolve,
          500
        );
      }
    );

    const images =
      Array.from(
        frameDoc.images ?? []
      );

    if (images.length > 0) {
      await Promise.all(
        images.map(
          (img) =>
            new Promise<void>(
              (resolve) => {
                if (img.complete) {
                  resolve();
                  return;
                }

                let finished =
                  false;

                const done =
                  () => {
                    if (finished) {
                      return;
                    }

                    finished =
                      true;

                    resolve();
                  };

                img.addEventListener(
                  "load",
                  done,
                  {
                    once: true,
                  }
                );

                img.addEventListener(
                  "error",
                  done,
                  {
                    once: true,
                  }
                );

                setTimeout(
                  done,
                  2500
                );
              }
            )
        )
      );
    }

    const page =
      frameDoc.querySelector(
        ".page"
      ) as HTMLElement | null;

    const target =
      page ??
      frameDoc.body;

    if (!target) {
      throw new Error(
        "Invoice content was not found."
      );
    }

    const canvas =
      await html2canvas(
        target,
        {
          scale: 2,
          backgroundColor:
            "#ffffff",
          useCORS: true,
          logging: false,
          windowWidth: 794,
        }
      );

    if (
      !canvas.width ||
      !canvas.height
    ) {
      throw new Error(
        "Invoice PDF canvas is empty."
      );
    }

    const imageData =
      canvas.toDataURL(
        "image/jpeg",
        0.96
      );

    const pdf =
      new jsPDF({
        orientation:
          "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });

    const pdfWidth =
      pdf.internal.pageSize
        .getWidth();

    const pdfHeight =
      pdf.internal.pageSize
        .getHeight();

    const imageHeight =
      (
        canvas.height *
        pdfWidth
      ) /
      canvas.width;

    let heightLeft =
      imageHeight;

    let position = 0;

    pdf.addImage(
      imageData,
      "JPEG",
      0,
      position,
      pdfWidth,
      imageHeight,
      undefined,
      "FAST"
    );

    heightLeft -=
      pdfHeight;

    while (heightLeft > 0) {
      position =
        heightLeft -
        imageHeight;

      pdf.addPage();

      pdf.addImage(
        imageData,
        "JPEG",
        0,
        position,
        pdfWidth,
        imageHeight,
        undefined,
        "FAST"
      );

      heightLeft -=
        pdfHeight;
    }

    const blob =
      pdf.output(
        "blob"
      );

    const safeName =
      (
        fileName ||
        "ZETRA-Invoice-Receipt.pdf"
      )
        .replace(
          /[\\/:*?"<>|]+/g,
          "-"
        )
        .replace(
          /\.pdf$/i,
          ""
        ) +
      ".pdf";

    const file =
      new File(
        [blob],
        safeName,
        {
          type:
            "application/pdf",
        }
      );

    const nav =
      navigator as Navigator & {
        canShare?: (
          data?: {
            files?: File[];
          }
        ) => boolean;
      };

    const canShareFile =
      typeof navigator.share ===
        "function" &&
      (
        typeof nav.canShare !==
          "function" ||
        nav.canShare({
          files: [file],
        })
      );

    if (canShareFile) {
      try {
        await (
          navigator.share as (
            data?: any
          ) => Promise<void>
        )({
          title:
            uiText("ZETRA Invoice Receipt"),
          text:
            uiText("ZETRA invoice receipt PDF"),
          files: [file],
        });

        return true;
      } catch (
        shareError: any
      ) {
        if (
          shareError?.name ===
          "AbortError"
        ) {
          return true;
        }

        console.warn(
          "Mobile web PDF share failed; using PDF download fallback:",
          shareError
        );
      }
    }

    /*
     * Mobile Web fallback:
     * download the REAL generated PDF.
     *
     * We intentionally return true
     * afterward so Mobile Web never
     * falls into browser print preview.
     */
    const objectUrl =
      URL.createObjectURL(
        blob
      );

    try {
      const anchor =
        document.createElement(
          "a"
        );

      anchor.href =
        objectUrl;

      anchor.download =
        safeName;

      anchor.style.display =
        "none";

      document.body.appendChild(
        anchor
      );

      anchor.click();
      anchor.remove();
    } finally {
      setTimeout(
        () => {
          URL.revokeObjectURL(
            objectUrl
          );
        },
        1500
      );
    }

    return true;
  } catch (error) {
    console.warn(
      "Mobile web PDF generation failed:",
      error
    );

    /*
     * Do NOT return false here.
     * Otherwise Mobile Web would fall
     * into the old browser print flow.
     */
    throw error;
  } finally {
    if (
      host &&
      host.parentNode
    ) {
      host.parentNode.removeChild(
        host
      );
    }
  }
}
function downloadHtmlPdfOnWeb(html: string) {
  if (
    Platform.OS !== "web" ||
    typeof document === "undefined"
  ) {
    return false;
  }

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

  customer_full_name?: string | null;
  customer_phone?: string | null;

  created_by?: string | null;

  sold_by_name?: string | null;
  sold_by_role?: string | null;

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

type SaleCashierMeta = {
  handoff_id?: string | null;

  sold_by_membership_id?: string | null;
  sold_by_email?: string | null;

  cashier_membership_id?: string | null;
  cashier_email?: string | null;

  customer_name?: string | null;
  customer_phone?: string | null;
};

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

  map_link?: string | null;

  bank_name?: string | null;

  account_name?: string | null;

  account_number?: string | null;

  mobile_money_name?: string | null;

  mobile_money_number?: string | null;

  payment_instructions?: string | null;
};

function MetaBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,

        paddingVertical: 8,
        paddingHorizontal: 10,

        borderRadius: 14,

        borderWidth: 1,

        borderColor:
          "rgba(255,255,255,0.07)",

        backgroundColor:
          "rgba(255,255,255,0.03)",
      }}
    >
      <Text
        style={{
          color: theme.colors.muted,
          fontWeight: "800",
          fontSize: 11,
        }}
      >
        {label}
      </Text>

      <Text
        style={{
          color: theme.colors.text,
          fontWeight: "900",
          marginTop: 4,
          fontSize: 13,
        }}
        numberOfLines={2}
      >
        {value || "—"}
      </Text>
    </View>
  );
}

function MoneyTile({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,

        paddingVertical: 10,
        paddingHorizontal: 12,

        borderRadius: 16,

        borderWidth: 1,

        borderColor: highlight
          ? "rgba(52,211,153,0.26)"
          : "rgba(255,255,255,0.07)",

        backgroundColor: highlight
          ? "rgba(52,211,153,0.08)"
          : "rgba(255,255,255,0.03)",
      }}
    >
      <Text
        style={{
          color: theme.colors.muted,
          fontWeight: "900",
          fontSize: 11,
        }}
      >
        {label}
      </Text>

      <Text
        style={{
          color: theme.colors.text,
          fontWeight: "900",
          fontSize: 15,
          marginTop: 4,
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

export default function ReceiptScreen() {
 const {documentText, documentLocale} = useDocumentText();
 const systemText = useSystemMessageText();
 const uiText=useCommonText();
  const router = useRouter();

  const params =
    useLocalSearchParams<{
      saleId?: string | string[];
    }>();

  const saleId = (
    one(params.saleId) ?? ""
  ).trim();

  const { width } = useWindowDimensions();

  const {
    activeOrgId,
    activeOrgName,
    activeStoreId,
    activeStoreName,
    activeRole,
  } = useOrg() as any;

  const money =
    useOrgMoneyPrefs(activeOrgId);

  const fmtMoney = useCallback(
    (n: number) =>
      money.fmt(Number(n || 0)),
    [money]
  );

  const [loading, setLoading] =
    useState(true);

  const [deleting, setDeleting] =
    useState(false);

  const [err, setErr] =
    useState<string | null>(null);

  const [detail, setDetail] =
    useState<SaleDetail | null>(null);

  const [cashierMeta, setCashierMeta] =
    useState<SaleCashierMeta | null>(null);

  const [orgProfile, setOrgProfile] =
    useState<OrgProfile | null>(null);

  const [storeProfile, setStoreProfile] =
    useState<StoreProfile | null>(null);

  const [
    showMoreOptions,
    setShowMoreOptions,
  ] = useState(false);

  const [
    showShareOptions,
    setShowShareOptions,
  ] = useState(false);

  const isDesktopWeb =
    Platform.OS === "web" &&
    width >= 1180;

  const isWideWeb =
    Platform.OS === "web" &&
    width >= 900;

  const load = useCallback(async () => {
    setErr(null);

    setLoading(true);

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

      const d = Array.isArray(res.data)
        ? res.data[0] ?? null
        : res.data;

      setDetail(
        d
          ? ({
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
                d?.can_edit_same_day ??
                false,
            } as any)
          : null
      );
    } catch (e: any) {
      setErr(
        e?.message ??
          "Failed to load receipt"
      );

      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let alive = true;

    async function loadCashierMeta() {
      try {
        if (!saleId) {
          if (alive) {
            setCashierMeta(null);
          }

          return;
        }

        const {
          data,
          error,
        } = await supabase.rpc(
          "get_sale_cashier_handoff_meta_v1",
          {
            p_sale_id: saleId,
          } as any
        );

        if (error) {
          throw error;
        }

        const row = Array.isArray(data)
          ? data[0] ?? null
          : data;

        if (alive) {
          setCashierMeta(
            (row ?? null) as
              | SaleCashierMeta
              | null
          );
        }
      } catch {
        if (alive) {
          setCashierMeta(null);
        }
      }
    }

    void loadCashierMeta();

    return () => {
      alive = false;
    };
  }, [saleId]);

  useEffect(() => {
    let alive = true;

    async function loadProfiles() {
      try {
        if (activeOrgId) {
          const { data } =
            await supabase
              .from(
                "organization_profiles"
              )
              .select("*")
              .eq(
                "organization_id",
                activeOrgId
              )
              .maybeSingle();

          if (alive) {
            setOrgProfile(
              (data ?? null) as any
            );
          }
        } else {
          setOrgProfile(null);
        }

        if (activeStoreId) {
          const { data } =
            await supabase
              .from("store_profiles")
              .select("*")
              .eq(
                "store_id",
                activeStoreId
              )
              .maybeSingle();

          if (alive) {
            setStoreProfile(
              (data ?? null) as any
            );
          }
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
  }, [
    activeOrgId,
    activeStoreId,
  ]);

  const receiptNo = useMemo(
    () => shortId(saleId),
    [saleId]
  );

  const when = useMemo(() => {
    const t = detail?.created_at;

    if (!t) return "—";

    try {
      return new Date(
        t
      ).toLocaleString();
    } catch {
      return String(t);
    }
  }, [detail?.created_at]);

  const items =
    detail?.items ?? [];

  const computedTotal =
    useMemo(() => {
      const dbTotal = Number(
        detail?.total_amount ?? NaN
      );

      if (
        Number.isFinite(dbTotal)
      ) {
        return dbTotal;
      }

      return items.reduce(
        (a, it) =>
          a +
          Number(
            it.line_total ?? 0
          ),
        0
      );
    }, [
      detail?.total_amount,
      items,
    ]);

  const computedQty =
    useMemo(
      () =>
        items.reduce(
          (a, it) =>
            a +
            Number(it.qty ?? 0),
          0
        ),
      [items]
    );

  const payLabel = (
    detail?.payment_method ??
    "CASH"
  ).toUpperCase();

  const channelLabel = (
    detail?.payment_channel ?? ""
  ).trim();

  const referenceLabel = (
    detail?.reference ?? ""
  ).trim();

  const discountMeta = useMemo(
    () =>
      parseDiscountFromNote(
        detail?.note
      ),
    [detail?.note]
  );

  const splitPaymentMeta =
    useMemo(
      () =>
        parseSplitPaymentFromNote(
          detail?.note
        ),
      [detail?.note]
    );

  const creditPaymentMeta =
    useMemo(
      () =>
        parseCreditPaymentFromNote(
          detail?.note
        ),
      [detail?.note]
    );

  const cleanNote = useMemo(
    () =>
      stripDiscountTag(
        detail?.note
      ),
    [detail?.note]
  );

  const isCredit = useMemo(
    () =>
      payLabel === "CREDIT" ||
      !!creditPaymentMeta,
    [
      payLabel,
      creditPaymentMeta,
    ]
  );

  const parsedCustomer =
    useMemo(
      () =>
        parseCustomerFromNote(
          detail?.note
        ),
      [detail?.note]
    );

  const customerName =
    useMemo(() => {
      const saleName = String(
        detail?.customer_full_name ??
          ""
      ).trim();

      const handoffName = String(
        cashierMeta?.customer_name ??
          ""
      ).trim();

      return (
        saleName ||
        handoffName ||
        parsedCustomer.name
      );
    }, [
      detail?.customer_full_name,
      cashierMeta?.customer_name,
      parsedCustomer.name,
    ]);

  const customerPhone =
    useMemo(() => {
      const salePhone = String(
        detail?.customer_phone ?? ""
      ).trim();

      const handoffPhone = String(
        cashierMeta?.customer_phone ??
          ""
      ).trim();

      return (
        salePhone ||
        handoffPhone ||
        parsedCustomer.phone
      );
    }, [
      detail?.customer_phone,
      cashierMeta?.customer_phone,
      parsedCustomer.phone,
    ]);

  const soldByLabel =
    useMemo(() => {
      const name = String(
        detail?.sold_by_name ?? ""
      ).trim();

      const role = String(
        detail?.sold_by_role ?? ""
      ).trim();

      const handoffSoldBy =
        String(
          cashierMeta?.sold_by_email ??
            ""
        ).trim();

      if (name && role) {
        return `${role.toUpperCase()} • ${name}`;
      }

      if (name) {
        return name;
      }

      if (handoffSoldBy) {
        return `STAFF • ${handoffSoldBy}`;
      }

      const r = (
        activeRole ?? "staff"
      ).toUpperCase();

      return `${r} (You)`;
    }, [
      detail?.sold_by_name,
      detail?.sold_by_role,
      cashierMeta?.sold_by_email,
      activeRole,
    ]);

  const cashierLabel =
    useMemo(() => {
      const email = String(
        cashierMeta?.cashier_email ??
          ""
      ).trim();

      return email || null;
    }, [
      cashierMeta?.cashier_email,
    ]);

  const isOwner =
    String(
      activeRole ?? ""
    ).toLowerCase() ===
    "owner";

  const dbCanEditSameDay =
    !!detail?.can_edit_same_day;

  const uiSameDayGuard =
    useMemo(
      () =>
        isSameDayDar(
          detail?.created_at
        ),
      [detail?.created_at]
    );

  const canEditReceipt =
    isOwner ||
    (dbCanEditSameDay &&
      uiSameDayGuard);

  const canDeleteReceipt =
    isOwner ||
    (dbCanEditSameDay &&
      uiSameDayGuard);

  const editCountLabel =
    useMemo(() => {
      const n = Number(
        detail?.edit_count ?? 0
      );

      return Number.isFinite(n)
        ? Math.max(
            0,
            Math.trunc(n)
          )
        : 0;
    }, [
      detail?.edit_count,
    ]);

  const editedByLabel =
    useMemo(() => {
      const name = String(
        detail?.edited_by_name ?? ""
      ).trim();

      const raw = String(
        detail?.edited_by ?? ""
      ).trim();

      if (name) return name;
      if (raw) return raw;

      return "—";
    }, [
      detail?.edited_by_name,
      detail?.edited_by,
    ]);

  const editedAtLabel =
    useMemo(() => {
      const t = String(
        detail?.edited_at ?? ""
      ).trim();

      if (!t) return "—";

      try {
        return new Date(
          t
        ).toLocaleString();
      } catch {
        return t;
      }
    }, [
      detail?.edited_at,
    ]);

  const paidAmount =
    useMemo(() => {
      if (!isCredit) {
        return computedTotal;
      }

      if (creditPaymentMeta) {
        return Math.max(
          0,
          Math.min(
            computedTotal,
            Number(
              creditPaymentMeta.paid ??
                0
            )
          )
        );
      }

      const p = Number(
        detail?.paid_amount ?? NaN
      );

      if (
        !Number.isFinite(p)
      ) {
        return 0;
      }

      return Math.max(
        0,
        Math.min(
          computedTotal,
          p
        )
      );
    }, [
      isCredit,
      creditPaymentMeta,
      detail?.paid_amount,
      computedTotal,
    ]);

  const dueAmount =
    useMemo(() => {
      if (!isCredit) {
        return 0;
      }

      if (creditPaymentMeta) {
        return Math.max(
          0,
          Number(
            creditPaymentMeta.balance ??
              0
          )
        );
      }

      return Math.max(
        0,
        computedTotal -
          Math.max(
            0,
            paidAmount
          )
      );
    }, [
      isCredit,
      creditPaymentMeta,
      computedTotal,
      paidAmount,
    ]);

  const paymentTitle =
    useMemo(() => {
      if (splitPaymentMeta) {
        return "SPLIT";
      }

      if (isCredit) {
        return "CREDIT";
      }

      return payLabel;
    }, [
      splitPaymentMeta,
      isCredit,
      payLabel,
    ]);

  const creditPaidViaLabel =
    useMemo(() => {
      if (!creditPaymentMeta) {
        return null;
      }

      const via = String(
        creditPaymentMeta.paidVia ??
          ""
      )
        .trim()
        .toUpperCase();

      if (
        !via ||
        via === "NONE"
      ) {
        return null;
      }

      return via;
    }, [
      creditPaymentMeta,
    ]);

  const deleteSameDay =
    useCallback(async () => {
      if (!saleId) return;

      if (!canDeleteReceipt) {
        Alert.alert(
          uiText("Delete closed"),
          uiText("Risiti hii haiwezi kufutwa. Staff/Admin wanaweza kufuta za leo tu. Owner pekee anaweza kufuta risiti za zamani.")
        );

        return;
      }

      if (deleting) {
        return;
      }

      const runDelete =
        async () => {
          try {
            setDeleting(true);

            const {
              data,
              error,
            } =
              await supabase.rpc(
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

            Alert.alert(
              uiText("Deleted"),
              uiText("Receipt imefutwa vizuri. Stock restored: {p0}.", {p0: (restoredQty)})
            );

            router.replace(
              "/(tabs)/sales/history"
            );
          } catch (e: any) {
            Alert.alert(
              uiText("Delete failed"),
              e?.message ??
                uiText("Failed to delete same-day receipt")
            );
          } finally {
            setDeleting(false);
          }
        };

      if (
        Platform.OS === "web"
      ) {
        const ok =
          window.confirm(
            uiText("Delete Same Day\n\nUkifuta risiti hii, items zote zitarudi store na sale itaondoka kabisa. Uko sure?")
          );

        if (!ok) return;

        await runDelete();

        return;
      }

      Alert.alert(
        uiText("Delete Same Day"),
        uiText("Ukifuta risiti hii, items zote zitarudi store na sale itaondoka kabisa. Uko sure?"),
        [
          {
            text: uiText("Cancel"),
            style: "cancel",
          },
          {
            text: uiText("Delete"),
            style:
              "destructive",
            onPress:
              runDelete,
          },
        ]
      );
    }, [
      saleId,
      canDeleteReceipt,
      deleting,
      router,
    ]);

  const businessDisplayName =
    clean(
      orgProfile?.business_name
    ) ||
    activeOrgName ||
    "—";

  const storeDisplayName =
    clean(
      storeProfile?.store_display_name
    ) ||
    activeStoreName ||
    "—";

  const orgTin =
    clean(orgProfile?.tin);

  const orgVrn =
    clean(orgProfile?.vrn);

  const orgRegNo =
    clean(
      orgProfile?.registration_no
    );

  const orgEmail =
    clean(orgProfile?.email);

  const orgWebsite =
    clean(orgProfile?.website);

  const orgTagline =
    clean(orgProfile?.tagline);

  const receiptFooterText =
    clean(
      orgProfile?.receipt_footer
    ) ||
    uiText("Thank you for shopping with us.");

  const storePhone =
    clean(storeProfile?.phone);

  const storeWhatsapp =
    clean(storeProfile?.whatsapp);

  const storeEmail =
    clean(storeProfile?.email);

  const storeRegion =
    clean(storeProfile?.region);

  const storeCity =
    clean(storeProfile?.city);

  const storeAddress =
    clean(storeProfile?.address);

  const storeBankName =
    clean(
      storeProfile?.bank_name
    );

  const storeAccountName =
    clean(
      storeProfile?.account_name
    );

  const storeAccountNumber =
    clean(
      storeProfile?.account_number
    );

  const storeMobileMoneyName =
    clean(
      storeProfile?.mobile_money_name
    );

  const storeMobileMoneyNumber =
    clean(
      storeProfile?.mobile_money_number
    );

  const storePaymentInstructions =
    clean(
      storeProfile?.payment_instructions
    );

  const documentType =
    isCredit
      ? uiText("Credit Sale")
      : splitPaymentMeta
        ? uiText("Split Payment Sale")
        : uiText("Cash Sale");

  const dueDateLabel =
    isCredit
      ? addDaysLabel(
          detail?.created_at,
          7
        )
      : "—";

  const shareReceipt =
    useCallback(async () => {
      if (!saleId) return;

      const org =
        businessDisplayName;

      const store =
        storeDisplayName;

      const header = [
        uiText("🧾 INVOICE RECEIPT"),

        uiText("Receipt No: {p0}", {p0: (receiptNo)}),

        uiText("Business: {p0}", {p0: (org)}),

        orgTagline
          ? uiText("Slogan: {p0}", {p0: (orgTagline)})
          : null,

        orgTin
          ? `TIN: ${orgTin}`
          : null,

        orgVrn
          ? `VRN: ${orgVrn}`
          : null,

        orgRegNo
          ? uiText("Reg No: {p0}", {p0: (orgRegNo)})
          : null,

        "",

        uiText("Store: {p0}", {p0: (store)}),

        storePhone
          ? uiText("Phone: {p0}", {p0: (storePhone)})
          : null,

        storeWhatsapp
          ? uiText("WhatsApp: {p0}", {p0: (storeWhatsapp)})
          : null,

        storeAddress ||
        storeCity ||
        storeRegion
          ? uiText("Location: {p0}", {p0: ([
              storeAddress,
              storeCity,
              storeRegion,
            ]
              .filter(
                Boolean
              )
              .join(", "))})
          : null,

        "",

        uiText("Date: {p0}", {p0: (when)}),

        uiText("Sold By: {p0}", {p0: (soldByLabel)}),

        cashierLabel
          ? uiText("Received By / Cashier: {p0}", {p0: (cashierLabel)})
          : null,

        uiText("Payment: {p0}", {p0: (uiText(paymentMethodKey(paymentTitle)))}),

        isCredit &&
        creditPaidViaLabel
          ? uiText("Paid Via: {p0}", {p0: (uiText(creditPaidViaLabel))})
          : null,

        channelLabel
          ? uiText("Channel: {p0}", {p0: (channelLabel)})
          : null,

        referenceLabel
          ? uiText("Reference: {p0}", {p0: (referenceLabel)})
          : null,

        "",
      ].filter(
        Boolean
      ) as string[];

      if (
        splitPaymentMeta
      ) {
        header.push(
          uiText("Cash Paid: {p0}", {p0: (fmtMoney(
            splitPaymentMeta.cash
          ))})
        );

        header.push(
          uiText("Mobile Paid: {p0}", {p0: (fmtMoney(
            splitPaymentMeta.mobile
          ))})
        );

        header.push(
          uiText("Bank Paid: {p0}", {p0: (fmtMoney(
            splitPaymentMeta.bank
          ))})
        );

        header.push("");
      }

      if (
        customerName ||
        customerPhone
      ) {
        header.push(
          uiText("Customer: {p0}", {p0: (customerName || "—")})
        );

        if (
          customerPhone
        ) {
          header.push(
            uiText("Phone: {p0}", {p0: (customerPhone)})
          );
        }

        header.push("");
      }

      const body =
        items.length === 0
          ? [
              uiText("Items: —"),
              "",
            ]
          : [
              uiText("Items ({p0}) • Qty ({p1})", {p0: (items.length), p1: (computedQty)}),

              ...items.map(
                (it) => {
                  const unitPrice =
                    Number(
                      it.unit_price ??
                        0
                    );

                  const lineTotal =
                    Number(
                      it.line_total ??
                        unitPrice *
                          Number(
                            it.qty ??
                              0
                          )
                    );

                  const name =
                    it.product_name ??
                    uiText("Product");

                  const sku =
                    it.sku
                      ? ` (SKU: ${it.sku})`
                      : "";

                  return `- ${name}${sku} | ${it.qty} × ${fmtMoney(
                    unitPrice
                  )} = ${fmtMoney(
                    lineTotal
                  )}`;
                }
              ),

              "",
            ];

      const moneyBlock:
        string[] = [];

      if (discountMeta) {
        const subtotal =
          discountMeta.subtotal;

        if (
          typeof subtotal ===
          "number"
        ) {
          moneyBlock.push(
            uiText("SUBTOTAL: {p0}", {p0: (fmtMoney(
              subtotal
            ))})
          );
        }

        moneyBlock.push(
          uiText("DISCOUNT: -{p0} ({p1})", {p0: (fmtMoney(
            discountMeta.discountAmount
          )), p1: (discountMeta.discountText)})
        );

        moneyBlock.push(
          uiText("TOTAL (AFTER DISCOUNT): {p0}", {p0: (fmtMoney(
            computedTotal
          ))})
        );

        moneyBlock.push("");
      }

      if (isCredit) {
        if (!discountMeta) {
          moneyBlock.push(
            uiText("TOTAL SALE: {p0}", {p0: (fmtMoney(
              computedTotal
            ))})
          );
        }

        moneyBlock.push("");

        moneyBlock.push(
          uiText("TOTAL PAID: {p0}", {p0: (fmtMoney(
            paidAmount
          ))})
        );

        moneyBlock.push(
          uiText("OUTSTANDING BALANCE: {p0}", {p0: (fmtMoney(
            dueAmount
          ))})
        );

        moneyBlock.push(
          uiText("DUE DATE: {p0}", {p0: (dueDateLabel)})
        );

        moneyBlock.push(
          uiText("STATUS: {p0}", {p0: (dueAmount > 0
              ? "OUTSTANDING"
              : "CLEARED")})
        );

        moneyBlock.push("");
      }

      const footer = [
        !discountMeta &&
        !isCredit
          ? uiText("TOTAL MONEY IN: {p0}", {p0: (fmtMoney(
              computedTotal
            ))})
          : null,

        cleanNote
          ? ""
          : null,

        cleanNote
          ? uiText("NOTE: {p0}", {p0: (cleanNote)})
          : null,

        "",

        `${receiptFooterText} 🙏`,
      ].filter(
        Boolean
      ) as string[];

      const message = [
        ...header,
        ...body,
        ...moneyBlock,
        ...footer,
      ].join("\n");

      try {
        await Share.share({
          message,
        });
      } catch {}
    }, [
      saleId,
      businessDisplayName,
      storeDisplayName,
      receiptNo,
      paymentTitle,
      channelLabel,
      referenceLabel,
      when,
      soldByLabel,
      cashierLabel,
      customerName,
      customerPhone,
      items,
      computedQty,
      computedTotal,
      discountMeta,
      splitPaymentMeta,
      creditPaymentMeta,
      creditPaidViaLabel,
      cleanNote,
      isCredit,
      paidAmount,
      dueAmount,
      fmtMoney,
      orgTin,
      orgVrn,
      orgRegNo,
      orgTagline,
      receiptFooterText,
      storePhone,
      storeWhatsapp,
      storeRegion,
      storeCity,
      storeAddress,
      storeBankName,
      storeAccountName,
      storeAccountNumber,
      storeMobileMoneyName,
      storeMobileMoneyNumber,
      storePaymentInstructions,
      dueDateLabel,
    ]);

  const shareReceiptPdf =
    useCallback(async () => {
      if (!saleId) return;

      const esc = (
        v: any
      ) =>
        String(v ?? "")
          .replace(
            /&/g,
            "&amp;"
          )
          .replace(
            /</g,
            "&lt;"
          )
          .replace(
            />/g,
            "&gt;"
          )
          .replace(
            /"/g,
            "&quot;"
          );

      const org =
        businessDisplayName;

      const store =
        storeDisplayName;

      const statusLabel =
        isCredit
          ? dueAmount > 0
            ? uiText("OUTSTANDING")
            : uiText("CLEARED")
          : uiText("PAID");

      const rowsHtml =
        items.length === 0
          ? `<tr><td colspan="5">${documentText("No items found.")}</td></tr>`
          : items
              .map(
                (
                  it,
                  idx
                ) => {
                  const qty =
                    Number(
                      it.qty ??
                        0
                    );

                  const unitPrice =
                    Number(
                      it.unit_price ??
                        0
                    );

                  const lineTotal =
                    Number(
                      it.line_total ??
                        unitPrice *
                          qty
                    );

                  return `
<tr>
  <td>${idx + 1}</td>

  <td>
    <b>${esc(
      it.product_name ??
        "Product"
    )}</b>

    <br/>

    <span class="muted">
      SKU: ${esc(
        it.sku ?? "—"
      )}
    </span>
  </td>

  <td class="right">
    ${esc(qty)}
  </td>

  <td class="right">
    ${esc(
      fmtMoney(
        unitPrice
      )
    )}
  </td>

  <td class="right">
    ${esc(
      fmtMoney(
        lineTotal
      )
    )}
  </td>
</tr>
`;
                }
              )
              .join("");

      const splitHtml =
        splitPaymentMeta
          ? `
<table
  class="info-table"
  style="margin-top:8px;"
>
  <tr>
    <td>
      <b>${documentText("Cash Paid")}</b>
      <br/>
      ${esc(
        fmtMoney(
          splitPaymentMeta.cash
        )
      )}
    </td>

    <td>
      <b>${documentText("Mobile Paid")}</b>
      <br/>
      ${esc(
        fmtMoney(
          splitPaymentMeta.mobile
        )
      )}
    </td>

    <td>
      <b>${documentText("Bank Paid")}</b>
      <br/>
      ${esc(
        fmtMoney(
          splitPaymentMeta.bank
        )
      )}
    </td>
  </tr>
</table>
`
          : "";

      const discountRows =
        discountMeta
          ? `
<tr>
  <td>
    <b>${documentText("Subtotal")}</b>
  </td>

  <td class="right">
    ${esc(
      fmtMoney(
        discountMeta.subtotal ??
          computedTotal
      )
    )}
  </td>
</tr>

<tr>
  <td>
    <b>
      ${documentText("Discount (")}${esc(
        discountMeta.discountText
      )})
    </b>
  </td>

  <td class="right">
    -${esc(
      fmtMoney(
        discountMeta.discountAmount
      )
    )}
  </td>
</tr>
`
          : "";

      const creditRows =
        isCredit
          ? `
<tr>
  <td>
    <b>${documentText("Total Paid")}</b>
  </td>

  <td class="right">
    ${esc(
      fmtMoney(
        paidAmount
      )
    )}
  </td>
</tr>

<tr>
  <td>
    <b>
      ${documentText("Outstanding Balance")}
    </b>
  </td>

  <td class="right">
    ${esc(
      fmtMoney(
        dueAmount
      )
    )}
  </td>
</tr>

<tr>
  <td>
    <b>${documentText("Due Date")}</b>
  </td>

  <td class="right">
    ${esc(
      dueDateLabel
    )}
  </td>
</tr>
`
          : "";

      const logoUrl =
        clean(
          orgProfile?.logo_url
        );

      const orgIdentityHtml =
        [
          orgTin
            ? `TIN: ${esc(
                orgTin
              )}`
            : "",

          orgVrn
            ? `VRN: ${esc(
                orgVrn
              )}`
            : "",

          orgRegNo
            ? `Reg No: ${esc(
                orgRegNo
              )}`
            : "",

          orgEmail
            ? `Email: ${esc(
                orgEmail
              )}`
            : "",

          orgWebsite
            ? `Website: ${esc(
                orgWebsite
              )}`
            : "",
        ]
          .filter(Boolean)
          .join(
            " &nbsp;•&nbsp; "
          );

      const storeLocationText =
        [
          storeAddress,
          storeCity,
          storeRegion,
        ]
          .filter(Boolean)
          .join(", ");

      const storeContactHtml =
        [
          storePhone
            ? `Phone: ${esc(
                storePhone
              )}`
            : "",

          storeWhatsapp
            ? `WhatsApp: ${esc(
                storeWhatsapp
              )}`
            : "",

          storeEmail
            ? `Email: ${esc(
                storeEmail
              )}`
            : "",

          storeLocationText
            ? `Location: ${esc(
                storeLocationText
              )}`
            : "",
        ]
          .filter(Boolean)
          .join("<br/>");

      const paymentDetailsHtml =
        storeBankName ||
        storeAccountName ||
        storeAccountNumber ||
        storeMobileMoneyName ||
        storeMobileMoneyNumber ||
        storePaymentInstructions
          ? `
<div class="section-title">
  ${documentText("Payment Details")}
</div>

<table class="info-table compact">
  <tr>
    <td>
      <span class="label">
        ${documentText("Bank")}
      </span>

      <div class="strong">
        ${esc(
          [
            storeBankName,
            storeAccountName,
          ]
            .filter(Boolean)
            .join(" • ") ||
            "—"
        )}
      </div>

      ${
        storeAccountNumber
          ? `
<div class="muted">
  ${documentText("Account No:")} ${esc(
    storeAccountNumber
  )}
</div>
`
          : ""
      }
    </td>

    <td>
      <span class="label">
        ${documentText("Mobile Money")}
      </span>

      <div class="strong">
        ${esc(
          storeMobileMoneyName ||
            "—"
        )}
      </div>

      ${
        storeMobileMoneyNumber
          ? `
<div class="muted">
  ${documentText("Lipa / Pay No:")} ${esc(
    storeMobileMoneyNumber
  )}
</div>
`
          : ""
      }
    </td>

    <td>
      <span class="label">
        ${documentText("Instructions")}
      </span>

      <div>
        ${esc(
          storePaymentInstructions ||
            "—"
        )}
      </div>
    </td>
  </tr>
</table>
`
          : "";

      const html = `
<!doctype html>

<html lang="${documentLocale().language}" dir="${documentLocale().direction}">
<head>
  <meta charset="utf-8" />

  <title>
    ${documentText("Invoice Receipt")} ${esc(
      receiptNo
    )}
  </title>

  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 10mm;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    img {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    html,
    body {
      margin: 0 !important;
      padding: 0 !important;

      background: #ffffff;
      color: #111827;

      font-family:
        Arial,
        Helvetica,
        sans-serif;

      font-size: 10px;
      line-height: 1.35;
    }

    .page {
      width: 100%;
      background: #ffffff;
    }

    .topbar {
      display: table;
      width: 100%;

      border-bottom:
        2px solid #111827;

      padding-bottom: 10px;
      margin-bottom: 10px;
    }

    .brand {
      display: table-cell;

      vertical-align: top;

      width: 62%;
    }

    .doc-meta {
      display: table-cell;

      vertical-align: top;

      width: 38%;

      text-align: right;

      color: #111827;

      font-size: 9.5px;

      line-height: 1.45;
    }

    .logo-wrap {
      width: 92px;
      height: 92px;

      border:
        1px solid #94a3b8;

      border-radius: 16px;

      overflow: hidden;

      display: inline-block;

      vertical-align: top;

      margin-right: 14px;

      background: #f8fafc;
    }

    .logo-wrap img {
      width: 100%;
      height: 100%;

      object-fit: contain;

      image-rendering: auto;

      -webkit-print-color-adjust:
        exact;

      print-color-adjust:
        exact;

      filter: none;
      opacity: 1;
    }

    .brand-info {
      display: inline-block;

      vertical-align: top;

      max-width: 72%;

      padding-top: 2px;
    }

    .brand-title {
      font-size: 21px;
      font-weight: 900;

      letter-spacing: 0.2px;

      text-transform:
        uppercase;

      color: #0f172a;
    }

    .brand-sub {
      margin-top: 3px;

      font-size: 9.5px;

      font-weight: 800;

      color: #111827;
    }

    .doc-title {
      font-size: 18px;
      font-weight: 900;

      color: #0f172a;

      text-transform:
        uppercase;

      letter-spacing:
        0.3px;
    }

    .badge {
      display:
        inline-block;

      border:
        1px solid #10b981;

      background:
        #ecfdf5;

      color:
        #047857;

      border-radius:
        999px;

      padding:
        4px 9px;

      font-weight: 900;

      margin-top:
        5px;

      font-size:
        9px;
    }

    .section-title {
      font-size:
        11px;

      font-weight:
        900;

      text-transform:
        uppercase;

      color:
        #0f172a;

      margin:
        11px 0 5px;

      padding-bottom:
        4px;

      border-bottom:
        1px solid #94a3b8;

      letter-spacing:
        0.2px;
    }

    .info-table,
    .data-table,
    .summary-table {
      width:
        100%;

      border-collapse:
        collapse;

      table-layout:
        fixed;

      margin-top:
        6px;
    }

    .info-table td,
    .summary-table td {
      border:
        1px solid #94a3b8;

      padding:
        7px;

      vertical-align:
        top;

      word-break:
        break-word;
    }

    .info-table.compact td {
      padding:
        6px;
    }

    .data-table th,
    .data-table td {
      border:
        1px solid #94a3b8;

      padding:
        6px;

      text-align:
        left;

      vertical-align:
        top;

      word-break:
        break-word;
    }

    .data-table th {
      background:
        #f1f5f9;

      font-size:
        8.5px;

      font-weight:
        900;

      text-transform:
        uppercase;

      color:
        #111827;
    }

    .data-table td {
      font-size:
        9px;
    }

    .label {
      display:
        block;

      color:
        #111827;

      font-weight:
        900;

      font-size:
        8.5px;

      text-transform:
        uppercase;

      margin-bottom:
        3px;
    }

    .strong {
      font-weight:
        900;

      color:
        #111827;
    }

    .muted {
      color:
        #111827;

      font-weight:
        700;
    }

    .right {
      text-align:
        right;

      white-space:
        nowrap;
    }

    .note {
      border:
        1px solid #94a3b8;

      background:
        #f8fafc;

      padding:
        8px;

      margin-top:
        8px;

      font-size:
        9px;
    }

    .summary-wrap {
      display:
        table;

      width:
        100%;

      margin-top:
        10px;

      page-break-inside:
        avoid;

      break-inside:
        avoid;
    }

    .summary-left {
      display:
        table-cell;

      width:
        56%;

      vertical-align:
        top;

      padding-right:
        10px;
    }

    .summary-right {
      display:
        table-cell;

      width:
        44%;

      vertical-align:
        top;
    }

    .total-box {
      border:
        1.5px solid #10b981;

      background:
        #ecfdf5;

      padding:
        11px;

      text-align:
        right;
    }

    .total-label {
      color:
        #047857;

      font-weight:
        900;

      font-size:
        9px;

      text-transform:
        uppercase;
    }

    .total-value {
      font-size:
        22px;

      font-weight:
        900;

      margin-top:
        3px;

      color:
        #0f172a;
    }

    .sign-section {
      display:
        table;

      width:
        100%;

      table-layout:
        fixed;

      border-spacing:
        8px 0;

      margin-top:
        13px;

      page-break-inside:
        avoid;

      break-inside:
        avoid;
    }

    .sign-box {
      display:
        table-cell;

      border:
        1px solid #94a3b8;

      padding:
        9px;

      vertical-align:
        bottom;

      height:
        58px;

      font-size:
        9px;
    }

    .sign-line {
      border-top:
        1px solid #111827;

      margin-top:
        20px;

      margin-bottom:
        6px;
    }

    .terms {
      margin-top:
        9px;

      border:
        1px solid #94a3b8;

      background:
        #f8fafc;

      padding:
        7px;

      font-size:
        8.8px;

      color:
        #334155;

      font-weight:
        700;
    }

    .footer {
      margin-top:
        9px;

      padding-top:
        7px;

      border-top:
        1px solid #cbd5e1;

      color:
        #64748b;

      text-align:
        center;

      font-size:
        8.8px;

      font-weight:
        800;
    }
  </style>
</head>

<body>
  <div class="page">

    <div class="topbar">

      <div class="brand">

        ${
          logoUrl
            ? `
<span class="logo-wrap">
  <img
    src="${esc(
      logoUrl
    )}"
    crossorigin="anonymous"
  />
</span>
`
            : ""
        }

        <span class="brand-info">

          <div class="brand-title">
            ${esc(org)}
          </div>

          ${
            orgTagline
              ? `
<div class="brand-sub">
  ${esc(
    orgTagline
  )}
</div>
`
              : ""
          }

          ${
            orgIdentityHtml
              ? `
<div class="brand-sub">
  ${orgIdentityHtml}
</div>
`
              : ""
          }

          ${
            storeContactHtml
              ? `
<div class="brand-sub">
  ${storeContactHtml}
</div>
`
              : ""
          }

        </span>

      </div>

      <div class="doc-meta">

        <div class="doc-title">
          ${documentText("Invoice Receipt")}
        </div>

        <b>${documentText("No:")}</b>
        ${esc(
          receiptNo
        )}
        <br/>

        <b>
          ${documentText("Document Type:")}
        </b>

        ${esc(
          documentType
        )}

        <br/>

        <b>${documentText("Date:")}</b>

        ${esc(when)}

        <br/>

        ${
          isCredit
            ? `
<b>
  ${documentText("Due Date:")}
</b>

${esc(
  dueDateLabel
)}

<br/>
`
            : ""
        }

        <b>${documentText("Store:")}</b>

        ${esc(store)}

        <br/>

        <span class="badge">

          ${documentText(paymentMethodKey(paymentTitle))}

          •

          ${documentText(statusLabel)}

        </span>

        <br/>

      </div>

    </div>

    <div class="section-title">
      ${documentText("Sale Information")}
    </div>

    <table class="info-table">

      <tr>

        <td>

          <span class="label">
            ${documentText("Sold By / Staff")}
          </span>

          <div class="strong">
            ${esc(
              soldByLabel
            )}
          </div>

        </td>

        <td>

          <span class="label">
            ${documentText("Received By / Cashier")}
          </span>

          <div class="strong">
            ${esc(
              cashierLabel ||
                "—"
            )}
          </div>

        </td>

        <td>

          <span class="label">
            ${documentText("Customer")}
          </span>

          <div class="strong">

            ${esc(
              customerName ||
                "Walk-in Customer"
            )}

          </div>

          ${
            customerPhone
              ? `
<div class="muted">
  ${documentText("Phone:")} ${esc(
    customerPhone
  )}
</div>
`
              : ""
          }

        </td>

        <td>

          <span class="label">
            ${documentText("Payment")}
          </span>

          <div class="strong">
            ${documentText(paymentMethodKey(paymentTitle))}
          </div>

          ${
            isCredit &&
            creditPaidViaLabel
              ? `
<div class="muted">
  ${documentText("Paid Via:")}
  ${documentText(creditPaidViaLabel)}
</div>
`
              : ""
          }

          ${
            channelLabel
              ? `
<div class="muted">
  ${documentText("Channel:")}
  ${esc(
    channelLabel
  )}
</div>
`
              : ""
          }

          ${
            referenceLabel
              ? `
<div class="muted">
  ${documentText("Ref:")}
  ${esc(
    referenceLabel
  )}
</div>
`
              : ""
          }

        </td>

      </tr>

    </table>

    ${splitHtml}

    <div class="section-title">
      ${documentText("Items (")}${items.length}${documentText(") • Qty (")}${computedQty})
    </div>

    <table class="data-table">

      <thead>

        <tr>

          <th style="width:5%">
            #
          </th>

          <th style="width:45%">
            ${documentText("Item")}
          </th>

          <th
            style="width:10%"
            class="right"
          >
            ${documentText("Qty")}
          </th>

          <th
            style="width:20%"
            class="right"
          >
            ${documentText("Unit Price")}
          </th>

          <th
            style="width:20%"
            class="right"
          >
            ${documentText("Total")}
          </th>

        </tr>

      </thead>

      <tbody>
        ${rowsHtml}
      </tbody>

    </table>

    ${
      cleanNote
        ? `
<div class="note">

  <b>
    ${documentText("Note:")}
  </b>

  <br/>

  ${esc(
    cleanNote
  )}

</div>
`
        : ""
    }

    <div class="summary-wrap">

      <div class="summary-left">

        <div class="section-title">
          ${documentText("Payment Summary")}
        </div>

        <table class="summary-table">

          ${discountRows}

          ${creditRows}

          ${
            !isCredit
              ? `
<tr>

  <td>
    <b>
      ${documentText("Total Paid")}
    </b>
  </td>

  <td class="right">
    ${esc(
      fmtMoney(
        computedTotal
      )
    )}
  </td>

</tr>
`
              : ""
          }

          <tr>

            <td>
              <b>
                ${documentText("Status")}
              </b>
            </td>

            <td class="right">
              <b>
                ${documentText(statusLabel)}
              </b>
            </td>

          </tr>

        </table>

      </div>

      <div class="summary-right">

        <div class="total-box">

          <div class="total-label">

            ${
              isCredit
                ? "Total Sale"
                : "Total Amount"
            }

          </div>

          <div class="total-value">

            ${esc(
              fmtMoney(
                computedTotal
              )
            )}

          </div>

        </div>

      </div>

    </div>

    <div class="sign-section">

      <div class="sign-box">

        <div class="sign-line">
        </div>

        <b>
          ${documentText("Sold By / Staff")}
        </b>

        <br/>

        <span>
          ${esc(
            soldByLabel
          )}
        </span>

      </div>

      ${
        cashierLabel
          ? `
<div class="sign-box">

  <div class="sign-line">
  </div>

  <b>
    ${documentText("Received By / Cashier")}
  </b>

  <br/>

  <span>
    ${esc(
      cashierLabel
    )}
  </span>

</div>
`
          : ""
      }

      <div class="sign-box">

        <div class="sign-line">
        </div>

        <b>
          ${documentText("Customer Signature")}
        </b>

        <br/>

        <span>

          ${esc(
            customerName ||
              "Customer"
          )}

        </span>

      </div>

      <div class="sign-box">

        <div class="sign-line">
        </div>

        <b>
          ${documentText("Business Stamp / Signature")}
        </b>

        <br/>

        <span>
          ${esc(store)}
        </span>

      </div>

    </div>

    ${paymentDetailsHtml}

    <div class="terms">

      <b>
        ${documentText("Terms:")}
      </b>

      ${documentText("Please keep this receipt for reference. Goods received in good condition unless otherwise stated.")}

    </div>

    <div class="footer">

      ${esc(
        receiptFooterText
      )}

      ${
        storePhone ||
        storeWhatsapp
          ? `
• Contact:
${esc(
  [
    storePhone,
    storeWhatsapp,
  ]
    .filter(Boolean)
    .join(" / ")
)}
`
          : ""
      }

      ${documentText("• Powered by ZETRA BMS")}

    </div>

  </div>
</body>

</html>
`;

      try {
        if (
          await shareHtmlPdfOnMobileWeb(
            html,
            `ZETRA-Invoice-${receiptNo || saleId || "Receipt"}.pdf`, uiText
          )
        ) {
          return;
        }

        if (
          downloadHtmlPdfOnWeb(
            html
          )
        ) {
          return;
        }

        const file =
          await Print.printToFileAsync(
            {
              html,
            }
          );

        if (
          await Sharing.isAvailableAsync()
        ) {
          await Sharing.shareAsync(
            file.uri,
            {
              mimeType:
                "application/pdf",

              dialogTitle:
                "Share Invoice Receipt PDF",
            }
          );
        } else {
          await Print.printAsync({
            uri: file.uri,
          });
        }
      } catch (e: any) {
        Alert.alert(
          uiText("PDF failed"),
          e?.message ??
            uiText("Failed to create PDF invoice receipt.")
        );
      }
    }, [
      saleId,

      orgProfile?.logo_url,

      businessDisplayName,
      storeDisplayName,

      receiptNo,

      items,

      fmtMoney,

      computedTotal,
      computedQty,

      when,

      paymentTitle,

      soldByLabel,
      cashierLabel,

      customerName,
      customerPhone,

      channelLabel,
      referenceLabel,

      splitPaymentMeta,
      discountMeta,
      creditPaymentMeta,
      creditPaidViaLabel,

      cleanNote,

      isCredit,

      paidAmount,
      dueAmount,

      orgTin,
      orgVrn,
      orgRegNo,
      orgEmail,
      orgWebsite,
      orgTagline,

      receiptFooterText,

      storePhone,
      storeWhatsapp,
      storeEmail,
      storeRegion,
      storeCity,
      storeAddress,

      storeBankName,
      storeAccountName,
      storeAccountNumber,

      storeMobileMoneyName,
      storeMobileMoneyNumber,

      storePaymentInstructions,

      documentType,
      dueDateLabel,
    ]);

  const headerCard = (
    <Card
      style={{
        gap: 10,
        padding: 12,

        borderWidth: 1,

        borderColor: isCredit
          ? "rgba(251,191,36,0.18)"
          : "rgba(52,211,153,0.18)",

        backgroundColor:
          "rgba(255,255,255,0.03)",
      }}
    >
      <View
        style={{
          flexDirection:
            isWideWeb
              ? "row"
              : "column",

          justifyContent:
            "space-between",

          gap: 10,
        }}
      >
        <MetaBlock
          label={uiText("Business")}
          value={
            businessDisplayName
          }
        />

        <MetaBlock
          label={uiText("Store")}
          value={
            storeDisplayName
          }
        />
      </View>

      <View
        style={{
          flexDirection:
            isWideWeb
              ? "row"
              : "column",

          justifyContent:
            "space-between",

          gap: 10,
        }}
      >
        <MetaBlock
          label={uiText("When")}
          value={when}
        />

        <MetaBlock
          label={uiText("Sold By / Staff")}
          value={soldByLabel}
        />
      </View>

      {!!cashierLabel && (
        <View
          style={{
            flexDirection:
              isWideWeb
                ? "row"
                : "column",

            justifyContent:
              "space-between",

            gap: 10,
          }}
        >
          <MetaBlock
            label={uiText("Received By / Cashier")}
            value={
              cashierLabel
            }
          />

          <MetaBlock
            label={uiText("Payment")}
            value={
              isCredit &&
              creditPaidViaLabel
                ? uiText("CREDIT • Paid Via {p0}", {p0: uiText(creditPaidViaLabel)})
                : paymentTitle
            }
          />
        </View>
      )}

      {(channelLabel ||
        referenceLabel) && (
        <View
          style={{
            flexDirection:
              isWideWeb
                ? "row"
                : "column",

            justifyContent:
              "space-between",

            gap: 10,
          }}
        >
          <MetaBlock
            label={uiText("Channel")}
            value={
              channelLabel ||
              "—"
            }
          />

          <MetaBlock
            label={uiText("Reference")}
            value={
              referenceLabel ||
              "—"
            }
          />
        </View>
      )}

      {(isCredit ||
        !!customerName ||
        !!customerPhone) && (
        <View
          style={{
            paddingVertical:
              8,

            paddingHorizontal:
              10,

            borderRadius:
              14,

            borderWidth:
              1,

            borderColor:
              "rgba(255,255,255,0.07)",

            backgroundColor:
              "rgba(255,255,255,0.03)",
          }}
        >
          <Text
            style={{
              color:
                theme.colors.muted,

              fontWeight:
                "800",

              fontSize:
                12,
            }}
          >
            {uiText("Customer")}</Text>

          <Text
            style={{
              color:
                theme.colors.text,

              fontWeight:
                "900",

              marginTop:
                6,
            }}
          >
            {customerName ||
              "—"}
          </Text>

          {!!customerPhone && (
            <Text
              style={{
                color:
                  theme.colors.muted,

                fontWeight:
                  "800",

                marginTop:
                  6,
              }}
            >
              {uiText("Phone:")}{" "}
              {customerPhone}
            </Text>
          )}
        </View>
      )}

      {(editCountLabel >
        0 ||
        dbCanEditSameDay ||
        uiSameDayGuard) && (
        <View
          style={{
            paddingVertical:
              8,

            paddingHorizontal:
              10,

            borderRadius:
              14,

            borderWidth:
              1,

            borderColor:
              canEditReceipt
                ? "rgba(52,211,153,0.24)"
                : "rgba(255,255,255,0.07)",

            backgroundColor:
              canEditReceipt
                ? "rgba(52,211,153,0.08)"
                : "rgba(255,255,255,0.03)",
          }}
        >
          <Text
            style={{
              color:
                theme.colors.muted,

              fontWeight:
                "800",

              fontSize:
                11,
            }}
          >
            {uiText("Edit Status")}</Text>

          <Text
            style={{
              color:
                theme.colors.text,

              fontWeight:
                "900",

              marginTop:
                4,

              fontSize:
                13,
            }}
          >
            {canEditReceipt
              ? isOwner
                ? uiText("Owner edit/delete allowed")
                : uiText("Same-day edit allowed")
              : uiText("Edit window closed")}
          </Text>

          {!uiSameDayGuard ? (
            <Text
              style={{
                color:
                  theme.colors.muted,

                fontWeight:
                  "800",

                marginTop:
                  8,
              }}
            >
              {uiText("Local guard: receipt si ya leo kwa timezone ya Africa/Dar_es_Salaam.")}</Text>
          ) : null}

          {editCountLabel >
            0 && (
            <>
              <Text
                style={{
                  color:
                    theme
                      .colors
                      .muted,

                  fontWeight:
                    "800",

                  marginTop:
                    8,
                }}
              >
                {uiText("Edited by:")}{" "}

                <Text
                  style={{
                    color:
                      theme
                        .colors
                        .text,
                  }}
                >
                  {
                    editedByLabel
                  }
                </Text>
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
                    4,
                }}
              >
                {uiText("Edited at:")}{" "}

                <Text
                  style={{
                    color:
                      theme
                        .colors
                        .text,
                  }}
                >
                  {
                    editedAtLabel
                  }
                </Text>
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
                    4,
                }}
              >
                {uiText("Edit count:")}{" "}

                <Text
                  style={{
                    color:
                      theme
                        .colors
                        .text,
                  }}
                >
                  {
                    editCountLabel
                  }
                </Text>
              </Text>
            </>
          )}
        </View>
      )}

      {!!cleanNote &&
        cleanNote.trim() && (
          <View
            style={{
              paddingVertical:
                8,

              paddingHorizontal:
                10,

              borderRadius:
                14,

              borderWidth:
                1,

              borderColor:
                "rgba(255,255,255,0.07)",

              backgroundColor:
                "rgba(255,255,255,0.03)",
            }}
          >
            <Text
              style={{
                color:
                  theme.colors.muted,

                fontWeight:
                  "800",

                fontSize:
                  12,
              }}
            >
              {uiText("Note")}</Text>

            <Text
              style={{
                color:
                  theme.colors.text,

                fontWeight:
                  "900",

                marginTop:
                  6,
              }}
            >
              {cleanNote}
            </Text>
          </View>
        )}
    </Card>
  );

  const itemsCard = (
    <Card
      style={{
        gap: 8,
        padding: 12,
      }}
    >
      <View
        style={{
          flexDirection:
            "row",

          justifyContent:
            "space-between",

          gap: 10,
        }}
      >
        <Text
          style={{
            color:
              theme.colors.text,

            fontWeight:
              "900",

            fontSize:
              14,
          }}
        >{uiText("Items ({p0})", {p0: (items.length)})}</Text>

        <Text
          style={{
            color:
              theme.colors.muted,

            fontWeight:
              "900",

            fontSize:
              12,
          }}
        >{uiText("Qty ({p0})", {p0: (computedQty)})}</Text>
      </View>

      {items.length ===
      0 ? (
        <Text
          style={{
            color:
              theme.colors.muted,

            fontWeight:
              "800",
          }}
        >
          {uiText("No items found.")}</Text>
      ) : (
        items.map(
          (it, idx) => {
            const unitPrice =
              Number(
                it.unit_price ??
                  0
              );

            const lineTotal =
              Number(
                it.line_total ??
                  unitPrice *
                    Number(
                      it.qty ??
                        0
                    )
              );

            return (
              <View
                key={`${it.product_id}-${idx}`}
                style={{
                  flexDirection:
                    "row",

                  justifyContent:
                    "space-between",

                  alignItems:
                    "center",

                  gap: 10,

                  paddingVertical:
                    9,

                  borderTopWidth:
                    idx === 0
                      ? 0
                      : 1,

                  borderTopColor:
                    "rgba(255,255,255,0.05)",
                }}
              >
                <View
                  style={{
                    flex: 1,
                    minWidth:
                      0,
                    gap: 3,
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
                        13,
                    }}
                    numberOfLines={
                      1
                    }
                  >
                    {it.product_name ??
                      uiText("Product")}
                  </Text>

                  <Text
                    style={{
                      color:
                        theme
                          .colors
                          .muted,

                      fontWeight:
                        "800",

                      fontSize:
                        11,
                    }}
                    numberOfLines={
                      1
                    }
                  >
                    {uiText("SKU:")}{" "}
                    {it.sku ??
                      "—"}
                  </Text>

                  <Text
                    style={{
                      color:
                        theme
                          .colors
                          .muted,

                      fontWeight:
                        "900",

                      fontSize:
                        11,
                    }}
                  >
                    {Number(
                      it.qty ??
                        0
                    )}{" "}
                    ×{" "}
                    {fmtMoney(
                      unitPrice
                    )}
                  </Text>
                </View>

                <View
                  style={{
                    minWidth:
                      isDesktopWeb
                        ? 140
                        : 96,

                    alignItems:
                      "flex-end",

                    justifyContent:
                      "center",
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
                        13,
                    }}
                    numberOfLines={
                      1
                    }
                  >
                    {fmtMoney(
                      lineTotal
                    )}
                  </Text>
                </View>
              </View>
            );
          }
        )
      )}
    </Card>
  );

  const totalsCard = (
    <Card
      style={{
        gap: 10,
        padding: 12,
      }}
    >
      <View
        style={{
          flexDirection:
            isWideWeb
              ? "row"
              : "column",

          gap: 10,
        }}
      >
        {splitPaymentMeta ? (
          <>
            <MoneyTile
              label={uiText("Cash Paid")}
              value={fmtMoney(
                splitPaymentMeta.cash
              )}
            />

            <MoneyTile
              label={uiText("Mobile Paid")}
              value={fmtMoney(
                splitPaymentMeta.mobile
              )}
            />

            <MoneyTile
              label={uiText("Bank Paid")}
              value={fmtMoney(
                splitPaymentMeta.bank
              )}
            />

            <MoneyTile
              label={uiText("Total Paid")}
              value={fmtMoney(
                splitPaymentMeta.cash +
                  splitPaymentMeta.mobile +
                  splitPaymentMeta.bank
              )}
              highlight
            />
          </>
        ) : isCredit ? (
          <>
            {discountMeta ? (
              <>
                <MoneyTile
                  label={uiText("Subtotal")}
                  value={fmtMoney(
                    discountMeta.subtotal ??
                      computedTotal
                  )}
                />

                <MoneyTile
                  label={uiText("Discount ({p0})", {p0: (discountMeta.discountText)})}
                  value={`-${fmtMoney(
                    discountMeta.discountAmount
                  )}`}
                />
              </>
            ) : null}

            <MoneyTile
              label={uiText("Total")}
              value={fmtMoney(
                computedTotal
              )}
            />

            <MoneyTile
              label={uiText("Paid")}
              value={fmtMoney(
                paidAmount
              )}
            />

            <MoneyTile
              label={uiText("Due (Credit)")}
              value={fmtMoney(
                dueAmount
              )}
              highlight
            />
          </>
        ) : discountMeta ? (
          <>
            <MoneyTile
              label={uiText("Subtotal")}
              value={fmtMoney(
                discountMeta.subtotal ??
                  computedTotal
              )}
            />

            <MoneyTile
              label={uiText("Discount ({p0})", {p0: (discountMeta.discountText)})}
              value={`-${fmtMoney(
                discountMeta.discountAmount
              )}`}
            />

            <MoneyTile
              label={uiText("Total After Discount")}
              value={fmtMoney(
                computedTotal
              )}
              highlight
            />
          </>
        ) : (
          <MoneyTile
            label={uiText("Total Money In")}
            value={fmtMoney(
              computedTotal
            )}
            highlight
          />
        )}
      </View>

      {isCredit ? (
        <View
          style={{
            paddingVertical:
              8,

            paddingHorizontal:
              10,

            borderRadius:
              14,

            borderWidth:
              1,

            borderColor:
              dueAmount > 0
                ? "rgba(251,191,36,0.24)"
                : "rgba(52,211,153,0.24)",

            backgroundColor:
              dueAmount > 0
                ? "rgba(251,191,36,0.08)"
                : "rgba(52,211,153,0.08)",
          }}
        >
          <Text
            style={{
              color:
                theme.colors.text,

              fontWeight:
                "900",

              fontSize:
                12,
            }}
          >
            {uiText("Status:")}{" "}
            {dueAmount >
            0
              ? uiText("OUTSTANDING")
              : uiText("CLEARED")}
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={() =>
          setShowShareOptions(
            (v) => !v
          )
        }
        style={({
          pressed,
        }) => ({
          minHeight:
            46,

          borderRadius:
            16,

          borderWidth:
            1,

          borderColor:
            "rgba(52,211,153,0.26)",

          backgroundColor:
            "rgba(52,211,153,0.10)",

          alignItems:
            "center",

          justifyContent:
            "center",

          paddingHorizontal:
            14,

          opacity:
            pressed
              ? 0.92
              : 1,
        })}
      >
        <View
          style={{
            flexDirection:
              "row",

            alignItems:
              "center",

            justifyContent:
              "center",

            gap: 8,
          }}
        >
          <Text
            style={{
              color:
                theme.colors.emerald,

              fontWeight:
                "900",

              fontSize:
                16,
            }}
          >
            {uiText("Share")}</Text>

          <Text
            style={{
              color:
                theme.colors.text,

              fontWeight:
                "900",

              fontSize:
                13,
            }}
          >
            {uiText("Share Invoice Receipt")}</Text>
        </View>
      </Pressable>

      {showShareOptions ? (
        <View
          style={{
            gap: 8,
          }}
        >
          <Pressable
            onPress={() =>
              void shareReceipt()
            }
            style={({
              pressed,
            }) => ({
              minHeight:
                40,

              borderRadius:
                14,

              borderWidth:
                1,

              borderColor:
                "rgba(52,211,153,0.20)",

              backgroundColor:
                "rgba(52,211,153,0.07)",

              alignItems:
                "center",

              justifyContent:
                "center",

              paddingHorizontal:
                12,

              opacity:
                pressed
                  ? 0.92
                  : 1,
            })}
          >
            <View
              style={{
                flexDirection:
                  "row",

                alignItems:
                  "center",

                justifyContent:
                  "center",

                gap: 8,
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
                    14,
                }}
              >
                TXT
              </Text>

              <Text
                style={{
                  color:
                    theme
                      .colors
                      .text,

                  fontWeight:
                    "900",

                  fontSize:
                    12,
                }}
              >
                {uiText("Share as Text")}</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() =>
              void shareReceiptPdf()
            }
            style={({
              pressed,
            }) => ({
              minHeight:
                40,

              borderRadius:
                14,

              borderWidth:
                1,

              borderColor:
                "rgba(52,211,153,0.20)",

              backgroundColor:
                "rgba(52,211,153,0.07)",

              alignItems:
                "center",

              justifyContent:
                "center",

              paddingHorizontal:
                12,

              opacity:
                pressed
                  ? 0.92
                  : 1,
            })}
          >
            <View
              style={{
                flexDirection:
                  "row",

                alignItems:
                  "center",

                justifyContent:
                  "center",

                gap: 8,
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
                    14,
                }}
              >
                PDF
              </Text>

              <Text
                style={{
                  color:
                    theme
                      .colors
                      .text,

                  fontWeight:
                    "900",

                  fontSize:
                    12,
                }}
              >
                {uiText("Share / Download PDF")}</Text>
            </View>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        onPress={() =>
          setShowMoreOptions(
            (v) => !v
          )
        }
        style={({
          pressed,
        }) => ({
          minHeight:
            42,

          borderRadius:
            16,

          borderWidth:
            1,

          borderColor:
            "rgba(255,255,255,0.08)",

          backgroundColor:
            "rgba(255,255,255,0.04)",

          alignItems:
            "center",

          justifyContent:
            "center",

          paddingHorizontal:
            14,

          opacity:
            pressed
              ? 0.92
              : 1,
        })}
      >
        <Text
          style={{
            color:
              theme.colors.text,

            fontWeight:
              "900",

            fontSize:
              13,
          }}
        >
          {showMoreOptions
            ? uiText("Hide Options")
            : uiText("More Options")}
        </Text>
      </Pressable>

      {showMoreOptions ? (
        <View
          style={{
            gap: 8,
          }}
        >
          {canEditReceipt ||
          canDeleteReceipt ? (
            <>
              <Pressable
                onPress={() =>
                  router.push(
                    {
                      pathname:
                        "/(tabs)/sales/edit-receipt",

                      params:
                        {
                          saleId,
                        },
                    } as any
                  )
                }
                style={({
                  pressed,
                }) => ({
                  minHeight:
                    40,

                  borderRadius:
                    14,

                  borderWidth:
                    1,

                  borderColor:
                    "rgba(52,211,153,0.20)",

                  backgroundColor:
                    "rgba(52,211,153,0.07)",

                  alignItems:
                    "center",

                  justifyContent:
                    "center",

                  paddingHorizontal:
                    12,

                  opacity:
                    pressed
                      ? 0.92
                      : 1,
                })}
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
                      12,
                  }}
                >
                  {isOwner
                    ? uiText("Edit Receipt")
                    : uiText("Edit Same Day")}
                </Text>
              </Pressable>

              <Pressable
                onPress={
                  deleteSameDay
                }
                disabled={
                  deleting
                }
                style={({
                  pressed,
                }) => ({
                  minHeight:
                    40,

                  borderRadius:
                    14,

                  borderWidth:
                    1,

                  borderColor:
                    "rgba(255,255,255,0.08)",

                  backgroundColor:
                    "rgba(255,255,255,0.04)",

                  alignItems:
                    "center",

                  justifyContent:
                    "center",

                  paddingHorizontal:
                    12,

                  opacity:
                    deleting
                      ? 0.55
                      : pressed
                        ? 0.92
                        : 1,
                })}
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
                      12,
                  }}
                >
                  {deleting
                    ? uiText("Deleting...")
                    : isOwner
                      ? uiText("Delete Receipt")
                      : uiText("Delete Same Day")}
                </Text>
              </Pressable>
            </>
          ) : null}

          <Pressable
            onPress={() =>
              router.replace(
                "/(tabs)/sales/history"
              )
            }
            style={({
              pressed,
            }) => ({
              minHeight:
                40,

              borderRadius:
                14,

              borderWidth:
                1,

              borderColor:
                "rgba(255,255,255,0.08)",

              backgroundColor:
                "rgba(255,255,255,0.04)",

              alignItems:
                "center",

              justifyContent:
                "center",

              paddingHorizontal:
                12,

              opacity:
                pressed
                  ? 0.92
                  : 1,
            })}
          >
            <Text
              style={{
                color:
                  theme.colors.text,

                fontWeight:
                  "900",

                fontSize:
                  12,
              }}
            >
              {uiText("Back to History")}</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        onPress={() =>
          router.back()
        }
        style={({
          pressed,
        }) => ({
          minHeight:
            42,

          borderRadius:
            16,

          borderWidth:
            1,

          borderColor:
            "rgba(255,255,255,0.08)",

          backgroundColor:
            "rgba(255,255,255,0.04)",

          alignItems:
            "center",

          justifyContent:
            "center",

          paddingHorizontal:
            14,

          opacity:
            pressed
              ? 0.92
              : 1,
        })}
      >
        <Text
          style={{
            color:
              theme.colors.text,

            fontWeight:
              "900",

            fontSize:
              13,
          }}
        >
          {uiText("Back")}</Text>
      </Pressable>
    </Card>
  );

  return (
    <Screen
      scroll
      bottomPad={150}
    >
      <View
        style={{
          flex: 1,
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
          <Pressable
            onPress={() =>
              router.back()
            }
            style={{
              width:
                40,

              height:
                40,

              borderRadius:
                999,

              alignItems:
                "center",

              justifyContent:
                "center",

              borderWidth:
                1,

              borderColor:
                theme.colors.border,

              backgroundColor:
                "rgba(255,255,255,0.05)",
            }}
          >
            <Text
              style={{
                color:
                  theme.colors.emerald,

                fontWeight:
                  "900",

                fontSize:
                  24,
              }}
            >
              ‹
            </Text>
          </Pressable>

          <View
            style={{
              flex: 1,
              minWidth: 0,
            }}
          >
            <Text
              style={{
                fontSize:
                  24,

                fontWeight:
                  "900",

                color:
                  theme.colors.text,

                marginTop:
                  2,
              }}
            >
              {uiText("Invoice Receipt")}</Text>

            <Text
              style={{
                color:
                  theme.colors.muted,

                fontWeight:
                  "800",

                fontSize:
                  12,

                marginTop:
                  2,
              }}
              numberOfLines={
                1
              }
            >
              {uiText("No.")}{" "}
              {receiptNo}
            </Text>
          </View>

          <View
            style={{
              paddingHorizontal:
                11,

              paddingVertical:
                7,

              borderRadius:
                theme.radius.pill,

              borderWidth:
                1,

              borderColor:
                isCredit
                  ? "rgba(251,191,36,0.35)"
                  : "rgba(52,211,153,0.35)",

              backgroundColor:
                isCredit
                  ? "rgba(251,191,36,0.10)"
                  : "rgba(52,211,153,0.10)",
            }}
          >
            <Text
              style={{
                color:
                  isCredit
                    ? "rgba(251,191,36,1)"
                    : theme.colors.emerald,

                fontWeight:
                  "900",

                fontSize:
                  12,
              }}
            >
              {uiText(paymentMethodKey(paymentTitle))}
            </Text>
          </View>
        </View>

        {loading ? (
          <View
            style={{
              paddingTop:
                18,

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

                marginTop:
                  8,
              }}
            >
              {uiText("Loading receipt...")}</Text>
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
              {systemText(err)}
            </Text>

            <Pressable
              onPress={
                load
              }
              style={({
                pressed,
              }) => ({
                minHeight:
                  46,

                borderRadius:
                  16,

                borderWidth:
                  1,

                borderColor:
                  "rgba(52,211,153,0.26)",

                backgroundColor:
                  "rgba(52,211,153,0.10)",

                alignItems:
                  "center",

                justifyContent:
                  "center",

                paddingHorizontal:
                  14,

                opacity:
                  pressed
                    ? 0.92
                    : 1,
              })}
            >
              <Text
                style={{
                  color:
                    theme.colors.text,

                  fontWeight:
                    "900",

                  fontSize:
                    13,
                }}
              >
                {uiText("Retry")}</Text>
            </Pressable>
          </Card>
        ) : isDesktopWeb ? (
          <View
            style={{
              flexDirection:
                "row",

              alignItems:
                "flex-start",

              gap: 16,
            }}
          >
            <View
              style={{
                flex:
                  1.15,

                minWidth:
                  0,

                gap:
                  12,
              }}
            >
              {headerCard}

              {itemsCard}
            </View>

            <View
              style={{
                width:
                  340,

                minWidth:
                  340,

                gap:
                  12,
              }}
            >
              {totalsCard}
            </View>
          </View>
        ) : (
          <>
            {headerCard}

            {itemsCard}

            {totalsCard}
          </>
        )}
      </View>
    </Screen>
  );
}