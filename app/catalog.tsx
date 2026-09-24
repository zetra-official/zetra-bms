// app/catalog.tsx

import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Alert,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { useOrg } from "../src/context/OrgContext";
import { supabase } from "../src/supabase/supabaseClient";
import { Screen } from "../src/ui/Screen";
import { theme } from "../src/ui/theme";
import { useOrgMoneyPrefs } from "../src/ui/money";

type CatalogTab = "GLOBAL" | "GENERATE" | "ENTER";

type PreviewProductRow = {
  product_id: string;
  product_name: string;

  sku?: string | null;
  barcode?: string | null;
  unit?: string | null;
  category?: string | null;
  image_url?: string | null;

  cost_price?: number | null;
  selling_price?: number | null;

  source_organization_id?: string | null;
  source_organization_name?: string | null;

  source_store_id?: string | null;
  source_store_name?: string | null;

  share_cost_price?: boolean | null;
  share_selling_price?: boolean | null;

  expires_at?: string | null;
  max_uses?: number | null;
  used_count?: number | null;

  is_precision_product?: boolean | null;
  precision_pack_size?: number | null;
  precision_base_unit?: string | null;
  precision_sell_mode?: string | null;
  precision_allow_box_sales?: boolean | null;
  precision_allow_unit_sales?: boolean | null;
};

type ShareProductRow = {
  id: string;
  organization_id?: string | null;
  store_id?: string | null;

  name: string;
  sku?: string | null;
  barcode?: string | null;
  unit?: string | null;
  category?: string | null;

  selling_price?: number | null;
  cost_price?: number | null;

  image_url?: string | null;
  is_active?: boolean | null;
};

type CreatedShareResult = {
  share_id?: string | null;
  share_code?: string | null;
  code?: string | null;
  expires_at?: string | null;
  max_uses?: number | null;
  product_count?: number | null;
};

type ImportResult = {
  imported_count?: number | null;
  skipped_count?: number | null;
  total_selected?: number | null;
  share_used_count?: number | null;
  share_max_uses?: number | null;
};

function cleanText(value: any) {
  return String(value ?? "").trim();
}

function normalizeSearch(value: any) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ");
}

function getErrorMessage(error: any) {
  const raw = cleanText(error?.message);

  if (!raw) return "Unknown error";

  const lower = raw.toLowerCase();

  if (
    lower.includes("product limit") ||
    lower.includes("free plan limit") ||
    lower.includes("upgrade to continue")
  ) {
    return raw;
  }

  if (
    lower.includes("maximum uses") ||
    lower.includes("max uses")
  ) {
    return "Catalog Code hii tayari imefikia kiwango chake cha matumizi.";
  }

  if (lower.includes("expired")) {
    return "Catalog Code hii ime-expire.";
  }

  if (lower.includes("revoked")) {
    return "Catalog Code hii imefutwa na mwenye catalog.";
  }

  if (
    lower.includes("invalid catalog share code") ||
    lower.includes("invalid")
  ) {
    return "Catalog Code si sahihi.";
  }

  return raw;
}

function formatDate(value?: string | null) {
  const raw = cleanText(value);

  if (!raw) return "—";

  try {
    return new Date(raw).toLocaleString();
  } catch {
    return raw;
  }
}

export default function CatalogScreen() {
  const router = useRouter();

  const {
    activeOrgId,
    activeOrgName,
    activeRole,
    activeStoreId,
    activeStoreName,
  } = useOrg();

  const money = useOrgMoneyPrefs(activeOrgId ?? "");

  const canManage = useMemo(
    () => (activeRole ?? "staff") === "owner",
    [activeRole]
  );

  const [activeTab, setActiveTab] =
    useState<CatalogTab>("GENERATE");

  // =========================================================
  // ENTER CODE / IMPORT
  // =========================================================

  const [catalogShareCode, setCatalogShareCode] =
    useState("");

  const [catalogPreviewRows, setCatalogPreviewRows] =
    useState<PreviewProductRow[]>([]);

  const [catalogPreviewLoading, setCatalogPreviewLoading] =
    useState(false);

  const [catalogPreviewError, setCatalogPreviewError] =
    useState<string | null>(null);

  const [catalogImportLoading, setCatalogImportLoading] =
    useState(false);

  const [selectedImportIds, setSelectedImportIds] =
    useState<string[]>([]);

  // =========================================================
  // GENERATE CODE
  // =========================================================

  const [shareProducts, setShareProducts] =
    useState<ShareProductRow[]>([]);

  const [shareProductsLoading, setShareProductsLoading] =
    useState(false);

  const [shareProductsError, setShareProductsError] =
    useState<string | null>(null);

  const [shareSearch, setShareSearch] = useState("");

  const [selectedShareIds, setSelectedShareIds] =
    useState<string[]>([]);

  const [shareCostPrice, setShareCostPrice] =
    useState(false);

  const [shareSellingPrice, setShareSellingPrice] =
    useState(true);

  const [shareGenerating, setShareGenerating] =
    useState(false);

  const [generatedShareCode, setGeneratedShareCode] =
    useState("");

  const [generatedShareMeta, setGeneratedShareMeta] =
    useState<CreatedShareResult | null>(null);

  // =========================================================
  // GLOBAL CATALOG
  // =========================================================

  const [globalSearch, setGlobalSearch] = useState("");

  // Global Catalog backend bado haijathibitishwa.
  // Hatu-call RPC ya kubuni.

  // =========================================================
  // PREVIEW ENTERED CODE
  // =========================================================

  const previewCatalogShare = useCallback(async () => {
    if (!canManage) {
      Alert.alert("No Access", "Owner only.");
      return;
    }

    const code = cleanText(catalogShareCode).toUpperCase();

    if (!code) {
      Alert.alert(
        "Enter Code",
        "Weka Catalog Code uliyopewa."
      );
      return;
    }

    setCatalogPreviewLoading(true);
    setCatalogPreviewError(null);
    setCatalogPreviewRows([]);
    setSelectedImportIds([]);

    try {
   const { data, error } = await supabase.rpc(
  "preview_product_catalog_share_v1",
  {
    p_share_code: code,
  }
);

      if (error) throw error;

      const nextRows =
        ((data ?? []) as PreviewProductRow[]).filter(
          (item) => !!item?.product_id
        );

      if (nextRows.length === 0) {
        throw new Error(
          "Catalog hii haina bidhaa zinazoweza ku-import."
        );
      }

      setCatalogPreviewRows(nextRows);

      // Default: products zote selected.
      setSelectedImportIds(
        nextRows.map((item) => item.product_id)
      );
    } catch (error: any) {
      const message = getErrorMessage(error);

      setCatalogPreviewError(message);
      setCatalogPreviewRows([]);
      setSelectedImportIds([]);
    } finally {
      setCatalogPreviewLoading(false);
    }
  }, [canManage, catalogShareCode]);

  // =========================================================
  // IMPORT PRODUCTS
  // =========================================================

  const importCatalogShare = useCallback(async () => {
    if (!canManage) {
      Alert.alert("No Access", "Owner only.");
      return;
    }

    if (!activeOrgId) {
      Alert.alert(
        "Missing",
        "No active organization."
      );
      return;
    }

    const code = cleanText(catalogShareCode).toUpperCase();

    if (!code) {
      Alert.alert(
        "Missing",
        "Catalog Code haipo."
      );
      return;
    }

    if (selectedImportIds.length === 0) {
      Alert.alert(
        "Select Products",
        "Chagua angalau product moja ya ku-import."
      );
      return;
    }

    const runImport = async () => {
      setCatalogImportLoading(true);

      try {
        const { data, error } = await supabase.rpc(
          "import_product_catalog_share_v1",
          {
            p_code: code,
            p_target_org_id: activeOrgId,
            p_target_store_id: activeStoreId ?? null,
            p_product_ids: selectedImportIds,
          }
        );

        if (error) throw error;

        const result = Array.isArray(data)
          ? ((data[0] ?? {}) as ImportResult)
          : ((data ?? {}) as ImportResult);

        const imported = Number(
          result?.imported_count ?? 0
        );

        const skipped = Number(
          result?.skipped_count ?? 0
        );

        const total = Number(
          result?.total_selected ??
            selectedImportIds.length
        );

        const used = Number(
          result?.share_used_count ?? 0
        );

        const maxUses = Number(
          result?.share_max_uses ?? 0
        );

        Alert.alert(
          "Products Imported ✅",
          `Selected: ${total}\nImported: ${imported}\nSkipped existing: ${skipped}${
            maxUses > 0
              ? `\nCode usage: ${used}/${maxUses}`
              : ""
          }`
        );

        setCatalogShareCode("");
        setCatalogPreviewRows([]);
        setCatalogPreviewError(null);
        setSelectedImportIds([]);
      } catch (error: any) {
        Alert.alert(
          "Import Failed",
          getErrorMessage(error)
        );
      } finally {
        setCatalogImportLoading(false);
      }
    };

    if (Platform.OS === "web") {
      const ok = window.confirm(
        `Import ${selectedImportIds.length} selected product${
          selectedImportIds.length === 1 ? "" : "s"
        } into ${activeOrgName ?? "this organization"}?`
      );

      if (!ok) return;

      await runImport();
      return;
    }

    Alert.alert(
      "Import Products?",
      `Products ${selectedImportIds.length} zitaongezwa kwenye ${
        activeOrgName ?? "organization"
      }.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Import",
          onPress: () => void runImport(),
        },
      ]
    );
  }, [
    activeOrgId,
    activeOrgName,
    activeStoreId,
    canManage,
    catalogShareCode,
    selectedImportIds,
  ]);

  // =========================================================
  // LOAD PRODUCTS FOR GENERATE CODE
  // =========================================================

  const loadShareProducts = useCallback(async () => {
    if (!activeOrgId || !canManage) {
      setShareProducts([]);
      return;
    }

    setShareProductsLoading(true);
    setShareProductsError(null);

    try {
      const { data, error } = await supabase.rpc(
        "get_products_manage",
        {
          p_org_id: activeOrgId,
          p_store_id: null,
        }
      );

      if (error) throw error;

      const products = ((data ?? []) as ShareProductRow[])
        .filter((item) => item.is_active !== false)
        .sort((a, b) =>
          cleanText(a.name).localeCompare(
            cleanText(b.name),
            undefined,
            {
              sensitivity: "base",
            }
          )
        );

      setShareProducts(products);
    } catch (error: any) {
      setShareProducts([]);
      setShareProductsError(
        getErrorMessage(error)
      );
    } finally {
      setShareProductsLoading(false);
    }
  }, [activeOrgId, canManage]);

  useEffect(() => {
    if (activeTab === "GENERATE") {
      void loadShareProducts();
    }
  }, [activeTab, loadShareProducts]);

  const filteredShareProducts = useMemo(() => {
    const q = normalizeSearch(shareSearch);

    if (!q) return shareProducts;

    return shareProducts.filter((product) => {
      const haystack = normalizeSearch(
        [
          product.name,
          product.sku,
          product.barcode,
          product.category,
          product.unit,
        ].join(" ")
      );

      return haystack.includes(q);
    });
  }, [shareProducts, shareSearch]);

  // =========================================================
  // IMPORT SELECTION
  // =========================================================

  const allPreviewSelected =
    catalogPreviewRows.length > 0 &&
    catalogPreviewRows.every((product) =>
      selectedImportIds.includes(product.product_id)
    );

  const toggleImportProduct = useCallback(
    (productId: string) => {
      setSelectedImportIds((current) =>
        current.includes(productId)
          ? current.filter((id) => id !== productId)
          : [...current, productId]
      );
    },
    []
  );

  const toggleAllImportProducts = useCallback(() => {
    if (allPreviewSelected) {
      setSelectedImportIds([]);
      return;
    }

    setSelectedImportIds(
      catalogPreviewRows.map(
        (product) => product.product_id
      )
    );
  }, [allPreviewSelected, catalogPreviewRows]);

  // =========================================================
  // GENERATE SELECTION
  // =========================================================

  const allVisibleShareSelected =
    filteredShareProducts.length > 0 &&
    filteredShareProducts.every((product) =>
      selectedShareIds.includes(product.id)
    );

  const toggleShareProduct = useCallback(
    (productId: string) => {
      setSelectedShareIds((current) =>
        current.includes(productId)
          ? current.filter((id) => id !== productId)
          : [...current, productId]
      );
    },
    []
  );

  const toggleAllVisibleShareProducts =
    useCallback(() => {
      const visibleIds = filteredShareProducts.map(
        (product) => product.id
      );

      if (visibleIds.length === 0) return;

      setSelectedShareIds((current) => {
        const everySelected = visibleIds.every((id) =>
          current.includes(id)
        );

        if (everySelected) {
          return current.filter(
            (id) => !visibleIds.includes(id)
          );
        }

        return Array.from(
          new Set([...current, ...visibleIds])
        );
      });
    }, [filteredShareProducts]);

  // =========================================================
  // GENERATE SECURE CODE
  // =========================================================

  const generateCatalogShare = useCallback(async () => {
    if (!canManage) {
      Alert.alert("No Access", "Owner only.");
      return;
    }

    if (!activeOrgId) {
      Alert.alert(
        "Missing",
        "No active organization."
      );
      return;
    }

    if (selectedShareIds.length === 0) {
      Alert.alert(
        "Select Products",
        "Chagua angalau product moja."
      );
      return;
    }

    setShareGenerating(true);

    try {
   const { data, error } = await supabase.rpc(
  "generate_product_catalog_share_v1",
  {
    p_org_id: activeOrgId,
    p_store_id: activeStoreId ?? null,
    p_product_ids: selectedShareIds,
    p_share_cost_price: shareCostPrice,
    p_share_selling_price: shareSellingPrice,
    p_expires_in_hours: 24,
    p_max_uses: 1,
  }
);

      if (error) throw error;

      const result = Array.isArray(data)
        ? ((data[0] ?? {}) as CreatedShareResult)
        : ((data ?? {}) as CreatedShareResult);

      const code = cleanText(
        result?.share_code ?? result?.code
      );

      if (!code) {
        throw new Error(
          "Code imetengenezwa lakini haikurudishwa na server."
        );
      }

      setGeneratedShareCode(code);
      setGeneratedShareMeta(result);


    } catch (error: any) {
      Alert.alert(
        "Generate Failed",
        getErrorMessage(error)
      );
    } finally {
      setShareGenerating(false);
    }
  }, [
    activeOrgId,
    activeStoreId,
    canManage,
    selectedShareIds,
    shareCostPrice,
    shareSellingPrice,
  ]);

  const copyGeneratedCode = useCallback(async () => {
    const code = cleanText(generatedShareCode);

    if (!code) return;

    try {
      if (
        Platform.OS === "web" &&
        typeof navigator !== "undefined" &&
        navigator.clipboard
      ) {
        await navigator.clipboard.writeText(code);
      } else {
        await Clipboard.setStringAsync(code);
      }

      Alert.alert(
        "Code Copied ✅",
        "Catalog Code imekopiwa. Sasa unaweza kuituma kwa mpokeaji."
      );
    } catch {
      Alert.alert(
        "Copy Failed",
        "Imeshindikana kukopi Catalog Code."
      );
    }
  }, [generatedShareCode]);

  const resetGeneratedCode = useCallback(() => {
    setGeneratedShareCode("");
    setGeneratedShareMeta(null);
  }, []);

  // =========================================================
  // TAB BUTTON
  // =========================================================

  const tabButton = (
    key: CatalogTab,
    label: string,
    icon: any
  ) => {
    const selected = activeTab === key;

    return (
      <Pressable
        onPress={() => setActiveTab(key)}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 54,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 6,
          paddingHorizontal: 6,
          backgroundColor: selected
            ? "#059669"
            : pressed
            ? "#E2E8F0"
            : "#FFFFFF",
          borderWidth: 1,
          borderColor: selected
            ? "#059669"
            : "rgba(148,163,184,0.28)",
        })}
      >
        <Ionicons
          name={icon}
          size={18}
          color={
            selected
              ? "#FFFFFF"
              : theme.colors.text
          }
        />

        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={{
            color: selected
              ? "#FFFFFF"
              : theme.colors.text,
            fontWeight: "900",
            fontSize: 12,
          }}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  // =========================================================
  // OWNER ACCESS
  // =========================================================

  if (!canManage) {
    return (
      <Screen scroll>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              borderWidth: 1,
              borderColor:
                "rgba(148,163,184,0.24)",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#FFFFFF",
            }}
          >
            <Ionicons
              name="arrow-back"
              size={21}
              color={theme.colors.text}
            />
          </Pressable>

          <Text
            style={{
              color: theme.colors.text,
              fontWeight: "900",
              fontSize: 26,
            }}
          >
            Product Catalog
          </Text>
        </View>

        <View
          style={{
            marginTop: 18,
            padding: 18,
            borderRadius: 22,
            borderWidth: 1,
            borderColor:
              theme.colors.dangerBorder,
            backgroundColor:
              theme.colors.dangerSoft,
          }}
        >
          <Text
            style={{
              color: theme.colors.danger,
              fontWeight: "900",
              fontSize: 16,
            }}
          >
            Owner Access Only
          </Text>

          <Text
            style={{
              color: theme.colors.muted,
              fontWeight: "800",
              marginTop: 6,
              lineHeight: 21,
            }}
          >
            Catalog import na catalog code generation
            ni operations za owner.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      {/* =====================================================
          HEADER
      ====================================================== */}

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: 14,
            borderWidth: 1,
            borderColor:
              "rgba(148,163,184,0.24)",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed
              ? "#F1F5F9"
              : "#FFFFFF",
          })}
        >
          <Ionicons
            name="arrow-back"
            size={21}
            color={theme.colors.text}
          />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: theme.colors.text,
              fontWeight: "900",
              fontSize: 28,
            }}
          >
            Product Catalog
          </Text>

          <Text
            style={{
              color: theme.colors.muted,
              fontWeight: "800",
              marginTop: 2,
              lineHeight: 19,
            }}
          >
            Find products or move a catalog securely.
          </Text>
        </View>
      </View>

      {/* =====================================================
          ACTIVE BUSINESS
      ====================================================== */}

      <View
        style={{
          marginTop: 16,
          padding: 16,
          borderRadius: 22,
          borderWidth: 1,
          borderColor:
            "rgba(16,185,129,0.24)",
          backgroundColor:
            "rgba(16,185,129,0.07)",
        }}
      >
        <Text
          style={{
            color: theme.colors.muted,
            fontWeight: "800",
            fontSize: 12,
          }}
        >
          ACTIVE BUSINESS
        </Text>

        <Text
          style={{
            color: theme.colors.text,
            fontWeight: "900",
            fontSize: 17,
            marginTop: 4,
          }}
        >
          {activeOrgName ?? "—"}
        </Text>

        <Text
          style={{
            color: theme.colors.muted,
            fontWeight: "800",
            marginTop: 4,
          }}
        >
          Store: {activeStoreName ?? "Organization level"}
        </Text>
      </View>

      {/* =====================================================
          SIMPLE NAVIGATION
      ====================================================== */}

      <View
        style={{
          flexDirection: "row",
          gap: 8,
          marginTop: 16,
        }}
      >
        {tabButton(
          "GLOBAL",
          "Global",
          "globe-outline"
        )}

        {tabButton(
          "GENERATE",
          "Generate Code",
          "key-outline"
        )}

        {tabButton(
          "ENTER",
          "Enter Code",
          "download-outline"
        )}
      </View>

      {/* =====================================================
          GLOBAL CATALOG
      ====================================================== */}

      {activeTab === "GLOBAL" && (
        <View
          style={{
            marginTop: 16,
            gap: 12,
          }}
        >
          <View
            style={{
              padding: 18,
              borderRadius: 24,
              borderWidth: 1,
              borderColor:
                "rgba(148,163,184,0.22)",
              backgroundColor: "#FFFFFF",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 15,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor:
                    "rgba(16,185,129,0.10)",
                }}
              >
                <Ionicons
                  name="globe-outline"
                  size={24}
                  color="#059669"
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontWeight: "900",
                    fontSize: 18,
                  }}
                >
                  ZETRA Global Catalog
                </Text>

                <Text
                  style={{
                    color: theme.colors.muted,
                    fontWeight: "800",
                    marginTop: 3,
                    lineHeight: 20,
                  }}
                >
                  Find ready-to-use products from the
                  ZETRA master catalog.
                </Text>
              </View>
            </View>

            <TextInput
              value={globalSearch}
              onChangeText={setGlobalSearch}
              placeholder="Search global products..."
              placeholderTextColor={
                theme.colors.faint
              }
              autoCorrect={false}
              style={{
                marginTop: 16,
                borderWidth: 1,
                borderColor:
                  theme.colors.border,
                borderRadius: 16,
                backgroundColor: "#FFFFFF",
                paddingHorizontal: 14,
                paddingVertical: 13,
                color: theme.colors.text,
                fontWeight: "800",
              }}
            />

            <View
              style={{
                marginTop: 14,
                padding: 14,
                borderRadius: 16,
                backgroundColor: "#F8FAFC",
                borderWidth: 1,
                borderColor:
                  "rgba(148,163,184,0.18)",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Ionicons
                  name="construct-outline"
                  size={19}
                  color={theme.colors.muted}
                />

                <Text
                  style={{
                    color: theme.colors.text,
                    fontWeight: "900",
                  }}
                >
                  Global Catalog
                </Text>
              </View>

              <Text
                style={{
                  color: theme.colors.muted,
                  fontWeight: "800",
                  marginTop: 7,
                  lineHeight: 20,
                }}
              >
                Global master catalog backend ndiyo hatua
                inayofuata. Private stock, profit, sales,
                customers na supplier data hazitawekwa
                kwenye global catalog.
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* =====================================================
          GENERATE CODE
      ====================================================== */}

      {activeTab === "GENERATE" && (
        <View
          style={{
            marginTop: 16,
            gap: 12,
          }}
        >
          {/* INTRO */}

          <View
            style={{
              padding: 18,
              borderRadius: 24,
              borderWidth: 1,
              borderColor:
                "rgba(16,185,129,0.24)",
              backgroundColor: "#FFFFFF",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 11,
              }}
            >
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 15,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor:
                    "rgba(16,185,129,0.10)",
                }}
              >
                <Ionicons
                  name="key-outline"
                  size={24}
                  color="#059669"
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontWeight: "900",
                    fontSize: 19,
                  }}
                >
                  Generate Catalog Code
                </Text>

                <Text
                  style={{
                    color: theme.colors.muted,
                    fontWeight: "800",
                    marginTop: 3,
                    lineHeight: 20,
                  }}
                >
                  Chagua bidhaa, ruhusu bei unazotaka,
                  kisha tengeneza code.
                </Text>
              </View>
            </View>

            <View
              style={{
                marginTop: 15,
                padding: 13,
                borderRadius: 15,
                backgroundColor: "#F8FAFC",
              }}
            >
              <Text
                style={{
                  color: theme.colors.muted,
                  fontWeight: "800",
                  lineHeight: 20,
                }}
              >
                Stock, sales, profit, customers, supplier
                data na finance history havitashirikishwa.
              </Text>
            </View>
          </View>

          {/* GENERATED CODE */}

          {!!generatedShareCode && (
            <View
              style={{
                padding: 18,
                borderRadius: 24,
                borderWidth: 1.5,
                borderColor: "#059669",
                backgroundColor:
                  "rgba(16,185,129,0.08)",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={24}
                  color="#059669"
                />

                <Text
                  style={{
                    color: theme.colors.text,
                    fontWeight: "900",
                    fontSize: 18,
                  }}
                >
                  Code Ready
                </Text>
              </View>

                <View
                style={{
                  marginTop: 14,
                  flexDirection: "row",
                  alignItems: "stretch",
                  borderRadius: 17,
                  backgroundColor: "#FFFFFF",
                  borderWidth: 1,
                  borderColor: theme.colors.emeraldBorder,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    flex: 1,
                    minHeight: 62,
                    paddingHorizontal: 14,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    selectable
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                    style={{
                      color: "#047857",
                      fontWeight: "900",
                      fontSize: 21,
                      letterSpacing: 1,
                      textAlign: "center",
                    }}
                  >
                    {generatedShareCode}
                  </Text>
                </View>

                <Pressable
                  onPress={copyGeneratedCode}
                  hitSlop={4}
                  style={({ pressed }) => ({
                    minWidth: 82,
                    paddingHorizontal: 13,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: pressed
                      ? "#047857"
                      : "#059669",
                  })}
                >
                  <Ionicons
                    name="copy-outline"
                    size={20}
                    color="#FFFFFF"
                  />

                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontWeight: "900",
                      fontSize: 11,
                      marginTop: 3,
                    }}
                  >
                    COPY
                  </Text>
                </Pressable>
              </View>

              {!!generatedShareMeta?.product_count && (
                <Text
                  style={{
                    color: theme.colors.muted,
                    fontWeight: "800",
                    marginTop: 10,
                  }}
                >
                  Products:{" "}
                  {generatedShareMeta.product_count}
                </Text>
              )}

              {!!generatedShareMeta?.expires_at && (
                <Text
                  style={{
                    color: theme.colors.muted,
                    fontWeight: "800",
                    marginTop: 5,
                  }}
                >
                  Expires:{" "}
                  {formatDate(
                    generatedShareMeta.expires_at
                  )}
                </Text>
              )}

              <View
                style={{
                  marginTop: 14,
                  padding: 14,
                  borderRadius: 16,
                  backgroundColor: "#FFFFFF",
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.20)",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 9,
                  }}
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={21}
                    color="#059669"
                  />

                  <Text
                    style={{
                      flex: 1,
                      color: theme.colors.muted,
                      fontWeight: "800",
                      lineHeight: 20,
                    }}
                  >
                    Copy code hii na umtumie mpokeaji. Ataifungua
                    ZETRA Product Catalog, achague Enter Code na
                    ku-paste code hiyo. Kisha ataweza kuona na
                    ku-import products ulizomruhusu kushiriki.
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={resetGeneratedCode}
                style={({ pressed }) => ({
                  alignSelf: "flex-end",
                  minHeight: 42,
                  paddingHorizontal: 15,
                  marginTop: 12,
                  borderRadius: 13,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: pressed
                    ? "#F1F5F9"
                    : "#FFFFFF",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 6,
                })}
              >
                <Ionicons
                  name="add-outline"
                  size={17}
                  color={theme.colors.text}
                />

                <Text
                  style={{
                    color: theme.colors.text,
                    fontWeight: "900",
                    fontSize: 12,
                  }}
                >
                  New Code
                </Text>
              </Pressable>
            </View>
          )}

          {/* PRICE PERMISSIONS */}

          <View
            style={{
              padding: 16,
              borderRadius: 22,
              borderWidth: 1,
              borderColor:
                "rgba(148,163,184,0.22)",
              backgroundColor: "#FFFFFF",
            }}
          >
            <Text
              style={{
                color: theme.colors.text,
                fontWeight: "900",
                fontSize: 16,
              }}
            >
              Price Permissions
            </Text>

            <Text
              style={{
                color: theme.colors.muted,
                fontWeight: "800",
                marginTop: 4,
                lineHeight: 19,
              }}
            >
              Chagua bei ambazo mpokeaji ataruhusiwa kuona.
            </Text>

            <View
              style={{
                marginTop: 13,
                gap: 9,
              }}
            >
              <Pressable
                onPress={() =>
                  setShareCostPrice(
                    (current) => !current
                  )
                }
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent:
                    "space-between",
                  minHeight: 54,
                  paddingHorizontal: 14,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor:
                    shareCostPrice
                      ? "rgba(16,185,129,0.45)"
                      : theme.colors.border,
                  backgroundColor:
                    shareCostPrice
                      ? "rgba(16,185,129,0.06)"
                      : "#F8FAFC",
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color:
                        theme.colors.text,
                      fontWeight: "900",
                    }}
                  >
                    Include Cost Price
                  </Text>

                  <Text
                    style={{
                      color:
                        theme.colors.muted,
                      fontWeight: "800",
                      marginTop: 2,
                      fontSize: 12,
                    }}
                  >
                    Sensitive buying price
                  </Text>
                </View>

                <Ionicons
                  name={
                    shareCostPrice
                      ? "checkbox"
                      : "square-outline"
                  }
                  size={26}
                  color={
                    shareCostPrice
                      ? "#059669"
                      : theme.colors.muted
                  }
                />
              </Pressable>

              <Pressable
                onPress={() =>
                  setShareSellingPrice(
                    (current) => !current
                  )
                }
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent:
                    "space-between",
                  minHeight: 54,
                  paddingHorizontal: 14,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor:
                    shareSellingPrice
                      ? "rgba(16,185,129,0.45)"
                      : theme.colors.border,
                  backgroundColor:
                    shareSellingPrice
                      ? "rgba(16,185,129,0.06)"
                      : "#F8FAFC",
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color:
                        theme.colors.text,
                      fontWeight: "900",
                    }}
                  >
                    Include Selling Price
                  </Text>

                  <Text
                    style={{
                      color:
                        theme.colors.muted,
                      fontWeight: "800",
                      marginTop: 2,
                      fontSize: 12,
                    }}
                  >
                    Current selling price
                  </Text>
                </View>

                <Ionicons
                  name={
                    shareSellingPrice
                      ? "checkbox"
                      : "square-outline"
                  }
                  size={26}
                  color={
                    shareSellingPrice
                      ? "#059669"
                      : theme.colors.muted
                  }
                />
              </Pressable>
            </View>
          </View>

          {/* PRODUCT SEARCH + SELECTION SUMMARY */}

          <View
            style={{
              padding: 16,
              borderRadius: 22,
              borderWidth: 1,
              borderColor:
                "rgba(148,163,184,0.22)",
              backgroundColor: "#FFFFFF",
            }}
          >
            <Text
              style={{
                color: theme.colors.text,
                fontWeight: "900",
                fontSize: 16,
              }}
            >
              Select Products
            </Text>

            <TextInput
              value={shareSearch}
              onChangeText={setShareSearch}
              placeholder="Search products..."
              placeholderTextColor={
                theme.colors.faint
              }
              autoCorrect={false}
              style={{
                marginTop: 12,
                borderWidth: 1,
                borderColor:
                  theme.colors.border,
                borderRadius: 16,
                backgroundColor: "#FFFFFF",
                paddingHorizontal: 14,
                paddingVertical: 13,
                color: theme.colors.text,
                fontWeight: "800",
              }}
            />

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent:
                  "space-between",
                marginTop: 12,
                gap: 10,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color:
                      theme.colors.text,
                    fontWeight: "900",
                    fontSize: 15,
                  }}
                >
                  {selectedShareIds.length} selected
                </Text>

                <Text
                  style={{
                    color:
                      theme.colors.muted,
                    fontWeight: "800",
                    marginTop: 2,
                    fontSize: 12,
                  }}
                >
                  {filteredShareProducts.length} visible
                </Text>
              </View>

              <Pressable
                onPress={
                  toggleAllVisibleShareProducts
                }
                disabled={
                  filteredShareProducts.length === 0
                }
                style={({ pressed }) => ({
                  minHeight: 44,
                  paddingHorizontal: 14,
                  borderRadius: 13,
                  borderWidth: 1,
                  borderColor:
                    theme.colors.border,
                  backgroundColor: pressed
                    ? "#F1F5F9"
                    : "#FFFFFF",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity:
                    filteredShareProducts.length === 0
                      ? 0.5
                      : 1,
                })}
              >
                <Text
                  style={{
                    color: theme.colors.text,
                    fontWeight: "900",
                    fontSize: 12,
                  }}
                >
                  {allVisibleShareSelected
                    ? "Unselect All"
                    : "Select All"}
                </Text>
              </Pressable>
            </View>

            {/* IMPORTANT:
                Generate action is visible BEFORE the long product list.
            */}

            <Pressable
              onPress={generateCatalogShare}
              disabled={
                shareGenerating ||
                selectedShareIds.length === 0
              }
              style={({ pressed }) => ({
                minHeight: 58,
                borderRadius: 17,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
                backgroundColor:
                  shareGenerating ||
                  selectedShareIds.length === 0
                    ? "rgba(16,185,129,0.42)"
                    : "#059669",
                opacity: pressed ? 0.9 : 1,
                marginTop: 14,
              })}
            >
              <Ionicons
                name="key-outline"
                size={20}
                color="#FFFFFF"
              />

              <Text
                style={{
                  color: "#FFFFFF",
                  fontWeight: "900",
                  fontSize: 16,
                }}
              >
                {shareGenerating
                  ? "Generating Code..."
                  : selectedShareIds.length === 0
                  ? "Select Products First"
                  : `Generate Code (${selectedShareIds.length})`}
              </Text>
            </Pressable>
          </View>

          {/* PRODUCT LIST */}

          {shareProductsLoading ? (
            <View
              style={{
                padding: 18,
                borderRadius: 20,
                backgroundColor: "#FFFFFF",
                borderWidth: 1,
                borderColor:
                  "rgba(148,163,184,0.22)",
              }}
            >
              <Text
                style={{
                  color: theme.colors.muted,
                  fontWeight: "900",
                }}
              >
                Loading products...
              </Text>
            </View>
          ) : !!shareProductsError ? (
            <View
              style={{
                padding: 18,
                borderRadius: 20,
                backgroundColor:
                  theme.colors.dangerSoft,
                borderWidth: 1,
                borderColor:
                  theme.colors.dangerBorder,
              }}
            >
              <Text
                style={{
                  color:
                    theme.colors.danger,
                  fontWeight: "900",
                }}
              >
                {shareProductsError}
              </Text>

              <Pressable
                onPress={loadShareProducts}
                style={{
                  marginTop: 12,
                  minHeight: 44,
                  borderRadius: 14,
                  backgroundColor: "#FFFFFF",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: theme.colors.text,
                    fontWeight: "900",
                  }}
                >
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : filteredShareProducts.length === 0 ? (
            <View
              style={{
                padding: 18,
                borderRadius: 20,
                backgroundColor: "#FFFFFF",
                borderWidth: 1,
                borderColor:
                  "rgba(148,163,184,0.22)",
              }}
            >
              <Text
                style={{
                  color: theme.colors.text,
                  fontWeight: "900",
                }}
              >
                No products found
              </Text>
            </View>
          ) : (
            filteredShareProducts.map((product) => {
              const selected =
                selectedShareIds.includes(product.id);

              return (
                <Pressable
                  key={product.id}
                  onPress={() =>
                    toggleShareProduct(product.id)
                  }
                  style={({ pressed }) => ({
                    padding: 15,
                    borderRadius: 20,
                    borderWidth: selected
                      ? 1.5
                      : 1,
                    borderColor: selected
                      ? "#059669"
                      : "rgba(148,163,184,0.22)",
                    backgroundColor: selected
                      ? "rgba(16,185,129,0.07)"
                      : pressed
                      ? "#F8FAFC"
                      : "#FFFFFF",
                  })}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 12,
                      alignItems: "flex-start",
                    }}
                  >
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        borderWidth: 2,
                        borderColor: selected
                          ? "#059669"
                          : "#CBD5E1",
                        backgroundColor: selected
                          ? "#059669"
                          : "#FFFFFF",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {selected && (
                        <Ionicons
                          name="checkmark"
                          size={17}
                          color="#FFFFFF"
                        />
                      )}
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: theme.colors.text,
                          fontWeight: "900",
                          fontSize: 15,
                        }}
                      >
                        {product.name}
                      </Text>

                      <Text
                        style={{
                          color: theme.colors.muted,
                          fontWeight: "800",
                          marginTop: 5,
                        }}
                      >
                        Category:{" "}
                        {product.category ?? "—"}
                      </Text>

                      <Text
                        style={{
                          color: theme.colors.muted,
                          fontWeight: "800",
                          marginTop: 3,
                        }}
                      >
                        Unit: {product.unit ?? "—"}
                      </Text>

                      {shareSellingPrice && (
                        <Text
                          style={{
                            color:
                              theme.colors.muted,
                            fontWeight: "800",
                            marginTop: 3,
                          }}
                        >
                          Selling:{" "}
                          {product.selling_price != null
                            ? money.fmt(
                                Number(
                                  product.selling_price
                                )
                              )
                            : "—"}
                        </Text>
                      )}

                      {shareCostPrice && (
                        <Text
                          style={{
                            color:
                              theme.colors.muted,
                            fontWeight: "800",
                            marginTop: 3,
                          }}
                        >
                          Cost:{" "}
                          {product.cost_price != null
                            ? money.fmt(
                                Number(
                                  product.cost_price
                                )
                              )
                            : "—"}
                        </Text>
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            })
          )}

          {/* SECOND GENERATE BUTTON:
              Useful after user manually scrolls/selects products.
          */}

          {filteredShareProducts.length > 0 && (
            <Pressable
              onPress={generateCatalogShare}
              disabled={
                shareGenerating ||
                selectedShareIds.length === 0
              }
              style={({ pressed }) => ({
                minHeight: 60,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
                backgroundColor:
                  shareGenerating ||
                  selectedShareIds.length === 0
                    ? "rgba(16,185,129,0.42)"
                    : "#059669",
                opacity: pressed ? 0.9 : 1,
                marginBottom: 12,
              })}
            >
              <Ionicons
                name="key-outline"
                size={20}
                color="#FFFFFF"
              />

              <Text
                style={{
                  color: "#FFFFFF",
                  fontWeight: "900",
                  fontSize: 16,
                }}
              >
                {shareGenerating
                  ? "Generating Code..."
                  : `Generate Code (${selectedShareIds.length})`}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {/* =====================================================
          ENTER CODE
      ====================================================== */}

      {activeTab === "ENTER" && (
        <View
          style={{
            marginTop: 16,
            gap: 12,
          }}
        >
          {/* CODE ENTRY */}

          <View
            style={{
              padding: 18,
              borderRadius: 24,
              borderWidth: 1,
              borderColor:
                "rgba(16,185,129,0.26)",
              backgroundColor: "#FFFFFF",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 11,
              }}
            >
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 15,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor:
                    "rgba(16,185,129,0.10)",
                }}
              >
                <Ionicons
                  name="download-outline"
                  size={24}
                  color="#059669"
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontWeight: "900",
                    fontSize: 19,
                  }}
                >
                  Enter Catalog Code
                </Text>

                <Text
                  style={{
                    color: theme.colors.muted,
                    fontWeight: "800",
                    marginTop: 3,
                    lineHeight: 20,
                  }}
                >
                  Weka code uliyopewa na biashara nyingine.
                </Text>
              </View>
            </View>

            <TextInput
              value={catalogShareCode}
              onChangeText={(text) => {
                setCatalogShareCode(
                  text.toUpperCase()
                );

                setCatalogPreviewRows([]);
                setSelectedImportIds([]);
                setCatalogPreviewError(null);
              }}
              placeholder="ZT-XXXXXX-XXXXXX"
              placeholderTextColor={
                theme.colors.faint
              }
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!catalogPreviewLoading}
              style={{
                marginTop: 16,
                borderWidth: 1,
                borderColor:
                  theme.colors.border,
                borderRadius: 16,
                backgroundColor: "#FFFFFF",
                paddingHorizontal: 14,
                paddingVertical: 15,
                color: theme.colors.text,
                fontWeight: "900",
                fontSize: 16,
                letterSpacing: 0.8,
                textAlign: "center",
              }}
            />

            <Pressable
              onPress={previewCatalogShare}
              disabled={
                catalogPreviewLoading ||
                !catalogShareCode.trim()
              }
              style={({ pressed }) => ({
                minHeight: 56,
                borderRadius: 17,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 7,
                backgroundColor:
                  catalogPreviewLoading ||
                  !catalogShareCode.trim()
                    ? "rgba(16,185,129,0.42)"
                    : "#059669",
                marginTop: 12,
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <Ionicons
                name="arrow-forward"
                size={19}
                color="#FFFFFF"
              />

              <Text
                style={{
                  color: "#FFFFFF",
                  fontWeight: "900",
                  fontSize: 15,
                }}
              >
                {catalogPreviewLoading
                  ? "Checking Code..."
                  : "Continue"}
              </Text>
            </Pressable>

            {!!catalogPreviewError && (
              <View
                style={{
                  marginTop: 12,
                  padding: 13,
                  borderRadius: 15,
                  borderWidth: 1,
                  borderColor:
                    theme.colors.dangerBorder,
                  backgroundColor:
                    theme.colors.dangerSoft,
                }}
              >
                <Text
                  style={{
                    color:
                      theme.colors.danger,
                    fontWeight: "900",
                    lineHeight: 20,
                  }}
                >
                  {catalogPreviewError}
                </Text>
              </View>
            )}
          </View>

          {/* VERIFIED CATALOG */}

          {catalogPreviewRows.length > 0 && (
            <>
              <View
                style={{
                  padding: 16,
                  borderRadius: 22,
                  borderWidth: 1,
                  borderColor:
                    theme.colors.emeraldBorder,
                  backgroundColor:
                    "rgba(16,185,129,0.08)",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={23}
                    color="#059669"
                  />

                  <Text
                    style={{
                      color: theme.colors.text,
                      fontWeight: "900",
                      fontSize: 17,
                    }}
                  >
                    Catalog Verified
                  </Text>
                </View>

                <Text
                  style={{
                    color: theme.colors.muted,
                    fontWeight: "800",
                    marginTop: 10,
                  }}
                >
                  From:{" "}
                  {catalogPreviewRows[0]
                    ?.source_organization_name ??
                    "—"}
                </Text>

                {!!catalogPreviewRows[0]
                  ?.source_store_name && (
                  <Text
                    style={{
                      color:
                        theme.colors.muted,
                      fontWeight: "800",
                      marginTop: 4,
                    }}
                  >
                    Store:{" "}
                    {
                      catalogPreviewRows[0]
                        .source_store_name
                    }
                  </Text>
                )}

                <Text
                  style={{
                    color: theme.colors.muted,
                    fontWeight: "800",
                    marginTop: 4,
                  }}
                >
                  Products:{" "}
                  {catalogPreviewRows.length}
                </Text>

                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                    marginTop: 12,
                  }}
                >
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                      borderRadius: 999,
                      backgroundColor:
                        catalogPreviewRows[0]
                          ?.share_cost_price
                          ? "rgba(16,185,129,0.12)"
                          : "#F1F5F9",
                    }}
                  >
                    <Text
                      style={{
                        color:
                          catalogPreviewRows[0]
                            ?.share_cost_price
                            ? "#047857"
                            : theme.colors.muted,
                        fontWeight: "900",
                        fontSize: 12,
                      }}
                    >
                      Cost:{" "}
                      {catalogPreviewRows[0]
                        ?.share_cost_price
                        ? "Shared"
                        : "Not Shared"}
                    </Text>
                  </View>

                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                      borderRadius: 999,
                      backgroundColor:
                        catalogPreviewRows[0]
                          ?.share_selling_price
                          ? "rgba(16,185,129,0.12)"
                          : "#F1F5F9",
                    }}
                  >
                    <Text
                      style={{
                        color:
                          catalogPreviewRows[0]
                            ?.share_selling_price
                            ? "#047857"
                            : theme.colors.muted,
                        fontWeight: "900",
                        fontSize: 12,
                      }}
                    >
                      Selling:{" "}
                      {catalogPreviewRows[0]
                        ?.share_selling_price
                        ? "Shared"
                        : "Not Shared"}
                    </Text>
                  </View>
                </View>

                {!!catalogPreviewRows[0]
                  ?.expires_at && (
                  <Text
                    style={{
                      color:
                        theme.colors.muted,
                      fontWeight: "800",
                      marginTop: 10,
                      fontSize: 12,
                    }}
                  >
                    Expires:{" "}
                    {formatDate(
                      catalogPreviewRows[0]
                        .expires_at
                    )}
                  </Text>
                )}
              </View>

              {/* SELECTION CONTROL */}

              <View
                style={{
                  padding: 14,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor:
                    "rgba(148,163,184,0.22)",
                  backgroundColor: "#FFFFFF",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent:
                    "space-between",
                  gap: 10,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontWeight: "900",
                    }}
                  >
                    {selectedImportIds.length} selected
                  </Text>

                  <Text
                    style={{
                      color: theme.colors.muted,
                      fontWeight: "800",
                      marginTop: 2,
                      fontSize: 12,
                    }}
                  >
                    Choose products to import
                  </Text>
                </View>

                <Pressable
                  onPress={toggleAllImportProducts}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    paddingHorizontal: 14,
                    borderRadius: 13,
                    borderWidth: 1,
                    borderColor:
                      theme.colors.border,
                    backgroundColor: pressed
                      ? "#F1F5F9"
                      : "#FFFFFF",
                    alignItems: "center",
                    justifyContent: "center",
                  })}
                >
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontWeight: "900",
                      fontSize: 12,
                    }}
                  >
                    {allPreviewSelected
                      ? "Unselect All"
                      : "Select All"}
                  </Text>
                </Pressable>
              </View>
              {/* QUICK IMPORT BUTTON
                  Keeps import action reachable before the long product list.
                  User can import all selected products immediately,
                  or change selection below and use the second button.
              */}

              <Pressable
                onPress={importCatalogShare}
                disabled={
                  catalogImportLoading ||
                  selectedImportIds.length === 0
                }
                style={({ pressed }) => ({
                  minHeight: 60,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 8,
                  backgroundColor:
                    catalogImportLoading ||
                    selectedImportIds.length === 0
                      ? "rgba(16,185,129,0.42)"
                      : "#059669",
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Ionicons
                  name="download-outline"
                  size={20}
                  color="#FFFFFF"
                />

                <Text
                  style={{
                    color: "#FFFFFF",
                    fontWeight: "900",
                    fontSize: 16,
                  }}
                >
                  {catalogImportLoading
                    ? "Importing..."
                    : `Import ${selectedImportIds.length} Product${
                        selectedImportIds.length === 1
                          ? ""
                          : "s"
                      }`}
                </Text>
              </Pressable>


              {/* IMPORT PRODUCTS */}

              {catalogPreviewRows.map((product) => {
                const selected =
                  selectedImportIds.includes(
                    product.product_id
                  );

                return (
                  <Pressable
                    key={product.product_id}
                    onPress={() =>
                      toggleImportProduct(
                        product.product_id
                      )
                    }
                    style={({ pressed }) => ({
                      padding: 15,
                      borderRadius: 20,
                      borderWidth: selected
                        ? 1.5
                        : 1,
                      borderColor: selected
                        ? "#059669"
                        : "rgba(148,163,184,0.22)",
                      backgroundColor: selected
                        ? "rgba(16,185,129,0.07)"
                        : pressed
                        ? "#F8FAFC"
                        : "#FFFFFF",
                    })}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 12,
                        alignItems: "flex-start",
                      }}
                    >
                      <View
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 8,
                          borderWidth: 2,
                          borderColor: selected
                            ? "#059669"
                            : "#CBD5E1",
                          backgroundColor: selected
                            ? "#059669"
                            : "#FFFFFF",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {selected && (
                          <Ionicons
                            name="checkmark"
                            size={17}
                            color="#FFFFFF"
                          />
                        )}
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            color:
                              theme.colors.text,
                            fontWeight: "900",
                            fontSize: 15,
                          }}
                        >
                          {product.product_name}
                        </Text>

                        <Text
                          style={{
                            color:
                              theme.colors.muted,
                            fontWeight: "800",
                            marginTop: 6,
                          }}
                        >
                          Category:{" "}
                          {product.category ?? "—"}
                        </Text>

                        <Text
                          style={{
                            color:
                              theme.colors.muted,
                            fontWeight: "800",
                            marginTop: 3,
                          }}
                        >
                          Unit: {product.unit ?? "—"}
                        </Text>

                        {catalogPreviewRows[0]
                          ?.share_cost_price && (
                          <Text
                            style={{
                              color:
                                theme.colors.muted,
                              fontWeight: "800",
                              marginTop: 3,
                            }}
                          >
                            Cost:{" "}
                            {product.cost_price != null
                              ? money.fmt(
                                  Number(
                                    product.cost_price
                                  )
                                )
                              : "—"}
                          </Text>
                        )}

                        {catalogPreviewRows[0]
                          ?.share_selling_price && (
                          <Text
                            style={{
                              color:
                                theme.colors.muted,
                              fontWeight: "800",
                              marginTop: 3,
                            }}
                          >
                            Selling:{" "}
                            {product.selling_price != null
                              ? money.fmt(
                                  Number(
                                    product.selling_price
                                  )
                                )
                              : "—"}
                          </Text>
                        )}
                      </View>
                    </View>
                  </Pressable>
                );
              })}

              {/* IMPORT BUTTON */}

              <Pressable
                onPress={importCatalogShare}
                disabled={
                  catalogImportLoading ||
                  selectedImportIds.length === 0
                }
                style={({ pressed }) => ({
                  minHeight: 60,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 8,
                  backgroundColor:
                    catalogImportLoading ||
                    selectedImportIds.length === 0
                      ? "rgba(16,185,129,0.42)"
                      : "#059669",
                  opacity: pressed ? 0.9 : 1,
                  marginBottom: 12,
                })}
              >
                <Ionicons
                  name="download-outline"
                  size={20}
                  color="#FFFFFF"
                />

                <Text
                  style={{
                    color: "#FFFFFF",
                    fontWeight: "900",
                    fontSize: 16,
                  }}
                >
                  {catalogImportLoading
                    ? "Importing..."
                    : `Import ${selectedImportIds.length} Product${
                        selectedImportIds.length === 1
                          ? ""
                          : "s"
                      }`}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      <View style={{ height: 30 }} />
    </Screen>
  );
}