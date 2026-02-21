// app/(tabs)/club/create.tsx
import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Button } from "@/src/ui/Button";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

/* ---------------- utils ---------------- */

function clean(s: any) {
  return String(s ?? "").trim();
}
function upper(s: any) {
  return clean(s).toUpperCase();
}

function fmtMoneyTZS(n: number, currency = "TZS") {
  const v = Number(n);
  const safe = Number.isFinite(v) ? v : 0;
  try {
    return new Intl.NumberFormat("en-TZ", {
      style: "currency",
      currency: currency || "TZS",
      maximumFractionDigits: 0,
    }).format(safe);
  } catch {
    return `${currency || "TZS"} ${Math.round(safe)}`;
  }
}

function base64ToUint8Array(base64: string) {
  // @ts-ignore
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getFileSizeBytes(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    const size = Number((info as any)?.size ?? 0);
    return Number.isFinite(size) ? size : 0;
  } catch {
    return 0;
  }
}

/**
 * FEED IMG:
 * - Resize long edge to 1080px
 * - JPEG compress to target <= ~0.45MB
 */
async function prepareFeedImage(localUri: string) {
  const LONG_EDGE = 1080;
  let out = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: LONG_EDGE } }],
    { compress: 0.78, format: ImageManipulator.SaveFormat.JPEG }
  );

  const HARD_MAX_BYTES = 450 * 1024; // 0.45MB
  let bytes = await getFileSizeBytes(out.uri);

  if (bytes && bytes <= HARD_MAX_BYTES) return { uri: out.uri, bytes };

  const tries = [0.72, 0.66, 0.60];
  for (const q of tries) {
    out = await ImageManipulator.manipulateAsync(out.uri, [], {
      compress: q,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    bytes = await getFileSizeBytes(out.uri);
    if (bytes && bytes <= HARD_MAX_BYTES) return { uri: out.uri, bytes };
  }

  return { uri: out.uri, bytes };
}

/**
 * HQ IMG:
 * - Resize long edge to 1600px
 * - JPEG compress start 0.90
 * - Ensure <= 2MB
 */
async function prepareHqImage(localUri: string) {
  const LONG_EDGE = 1600;

  let out = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: LONG_EDGE } }],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
  );

  const HARD_MAX_BYTES = 2 * 1024 * 1024; // 2MB
  let bytes = await getFileSizeBytes(out.uri);

  if (bytes && bytes <= HARD_MAX_BYTES) return { uri: out.uri, bytes };

  const tries = [0.82, 0.75];
  for (const q of tries) {
    out = await ImageManipulator.manipulateAsync(out.uri, [], {
      compress: q,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    bytes = await getFileSizeBytes(out.uri);
    if (bytes && bytes <= HARD_MAX_BYTES) return { uri: out.uri, bytes };
  }

  return { uri: out.uri, bytes };
}

type CatalogProduct = {
  product_id: string;
  name: string;
  sku: string | null;
  selling_price: number | null;
};

async function uploadJpegToClubMedia(uid: string, localUri: string, tag: "feed" | "hq") {
  const path = `${uid}/${Date.now()}_${tag}_${Math.random().toString(36).slice(2)}.jpg`;

  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: "base64" });
  const bytes = base64ToUint8Array(base64);

  const { error: upErr } = await supabase.storage.from("club-media").upload(path, bytes, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (upErr) throw upErr;

  const { data } = supabase.storage.from("club-media").getPublicUrl(path);
  return clean(data?.publicUrl ?? "");
}

export default function ClubCreatePostScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeStoreId, activeStoreName } = useOrg();

  const [caption, setCaption] = useState("");

  const [localUri, setLocalUri] = useState<string>("");
  const [previewUri, setPreviewUri] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Product picker
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [prodLoading, setProdLoading] = useState(false);
  const [prodErr, setProdErr] = useState<string | null>(null);
  const [productOpen, setProductOpen] = useState(false);
  const [q, setQ] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedName, setSelectedName] = useState<string>("");
  const [selectedSku, setSelectedSku] = useState<string>("");
  const [selectedPrice, setSelectedPrice] = useState<number>(0);
  const [currency, setCurrency] = useState<"TZS">("TZS");

  const canSubmit = useMemo(() => {
    return clean(caption).length > 0 && !!activeStoreId && !!clean(selectedProductId) && !saving && !uploading;
  }, [caption, activeStoreId, saving, uploading, selectedProductId]);

  const pickImage = useCallback(async () => {
    setErr(null);

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission", "Ruhusa ya kuchagua picha inahitajika.");
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });

    if (res.canceled) return;

    const asset = res.assets?.[0];
    const uri = asset?.uri;
    if (!uri) return;

    setLocalUri(uri);
    setPreviewUri("");
  }, []);

  const removeImage = useCallback(() => {
    setLocalUri("");
    setPreviewUri("");
  }, []);

  const uploadTwoSizes = useCallback(async (): Promise<{ feedUrl: string | null; hqUrl: string | null }> => {
    if (!localUri) return { feedUrl: null, hqUrl: null };

    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) throw new Error("Not authenticated");

      // Prepare images
      const feedPrepared = await prepareFeedImage(localUri);
      const hqPrepared = await prepareHqImage(localUri);

      // show preview as HQ (looks better)
      setPreviewUri(hqPrepared.uri);

      // Upload (feed first, then hq)
      const feedUrl = await uploadJpegToClubMedia(uid, feedPrepared.uri, "feed");
      const hqUrl = await uploadJpegToClubMedia(uid, hqPrepared.uri, "hq");

      return {
        feedUrl: feedUrl || null,
        hqUrl: hqUrl || null,
      };
    } finally {
      setUploading(false);
    }
  }, [localUri]);

  const loadProducts = useCallback(async () => {
    const storeId = clean(activeStoreId);
    if (!storeId) {
      setProducts([]);
      return;
    }

    setProdErr(null);
    setProdLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_store_catalog_products", { p_store_id: storeId });
      if (error) throw error;

      const list = (data ?? []) as CatalogProduct[];
      setProducts(list);

      if (clean(selectedProductId)) {
        const found = list.find((x) => String(x.product_id) === selectedProductId);
        if (!found) {
          setSelectedProductId("");
          setSelectedName("");
          setSelectedSku("");
          setSelectedPrice(0);
        }
      }
    } catch (e: any) {
      setProdErr(e?.message ?? "Failed to load products");
      setProducts([]);
    } finally {
      setProdLoading(false);
    }
  }, [activeStoreId, selectedProductId]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const filteredProducts = useMemo(() => {
    const term = upper(q);
    if (!term) return products;
    return (products ?? []).filter((p) => upper(p.name).includes(term) || upper(p.sku).includes(term));
  }, [products, q]);

  const openPicker = useCallback(() => {
    if (!activeStoreId) {
      Alert.alert("Store Required", "Tafadhali activate store kwanza.");
      return;
    }
    setQ("");
    setProductOpen(true);
  }, [activeStoreId]);

  const selectProduct = useCallback((p: CatalogProduct) => {
    setSelectedProductId(clean(p.product_id));
    setSelectedName(clean(p.name));
    setSelectedSku(clean(p.sku));
    setSelectedPrice(Number(p.selling_price) || 0);
    setCurrency("TZS");
    setProductOpen(false);
  }, []);

  const submit = useCallback(async () => {
    const storeId = clean(activeStoreId);
    const productId = clean(selectedProductId);

    if (!storeId) {
      Alert.alert("Store Required", "Tafadhali chagua/activate store kwanza kabla ya kupost.");
      return;
    }
    if (!productId) {
      Alert.alert("Product Required", "Chagua bidhaa kwanza (inahitajika).");
      return;
    }
    if (!clean(caption)) {
      Alert.alert("Caption Required", "Andika ujumbe/caption kwanza.");
      return;
    }
    if (!canSubmit) return;

    setErr(null);
    setSaving(true);

    try {
      let feedUrl: string | null = null;
      let hqUrl: string | null = null;

      if (localUri) {
        const up = await uploadTwoSizes();
        feedUrl = clean(up.feedUrl ?? "") || null;
        hqUrl = clean(up.hqUrl ?? "") || null;
      }

      // payload base (old)
      const basePayload: any = {
        p_store_id: storeId,
        p_product_id: productId,
        p_caption: clean(caption),
        p_price: Number.isFinite(Number(selectedPrice)) ? Number(selectedPrice) : 0,
        p_currency: currency,
        p_image_url: feedUrl, // ✅ FEED url
      };

      // try V2 payload (additive)
      const payloadV2: any = { ...basePayload, p_image_hq_url: hqUrl };

      console.log("[club.create] payloadV2:", payloadV2);

      let data: any = null;

      // ✅ SAFE: attempt to call RPC with HQ param; if DB rejects param, fallback to old payload
      const res1 = await supabase.rpc("create_club_post_with_product", payloadV2 as any);
      if (res1.error) {
        const msg = String(res1.error.message ?? "").toLowerCase();

        // fallback only if looks like "unknown parameter/record" mismatch
        const looksLikeParamMismatch =
          msg.includes("invalid input syntax") === false &&
          (msg.includes("parameter") || msg.includes("record") || msg.includes("field") || msg.includes("unknown"));

        if (looksLikeParamMismatch) {
          console.log("[club.create] fallback to basePayload (no hq param).");
          const res2 = await supabase.rpc("create_club_post_with_product", basePayload as any);
          if (res2.error) throw res2.error;
          data = res2.data;
        } else {
          throw res1.error;
        }
      } else {
        data = res1.data;
      }

      const postId =
        (Array.isArray(data) ? (data as any)?.[0]?.post_id : (data as any)?.post_id) ?? null;

      Alert.alert("Success", "Post imewekwa kwenye ZETRA Business Club ✅");

      router.replace({
        pathname: "/(tabs)/club" as any,
        params: { r: String(Date.now()), createdPostId: String(postId ?? "") },
      } as any);
    } catch (e: any) {
      const msg = e?.message ?? "Post failed";
      console.log("[club.create] post error:", e);
      setErr(msg);
      Alert.alert("Post Failed", msg);
    } finally {
      setSaving(false);
    }
  }, [
    activeStoreId,
    canSubmit,
    caption,
    currency,
    localUri,
    router,
    selectedProductId,
    uploadTwoSizes,
    selectedPrice,
  ]);

  const topPad = Math.max(insets.top, 10) + 8;
  const shownPreviewUri = previewUri || localUri;

  const winH = Dimensions.get("window").height;
  const modalPadTop = Math.max(insets.top, 10) + 12;
  const modalPadBottom = Math.max(insets.bottom, 10) + 12;
  const MODAL_MAX_HEIGHT = Math.max(320, Math.min(560, winH - modalPadTop - modalPadBottom - 20));

  return (
    <>
      {/* ✅ HARD FIX: force dark status bar background on this screen too */}
      <StatusBar style="light" backgroundColor={theme.colors.background} />

      {/* ✅ ensure root stays dark */}
      <Screen scroll contentStyle={{ paddingTop: topPad }}>
        <View style={{ gap: 12 }}>
          {!!err && (
            <Card style={{ backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.dangerBorder }}>
              <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>{err}</Text>
            </Card>
          )}

          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: theme.colors.emeraldBorder,
                  backgroundColor: theme.colors.emeraldSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="storefront-outline" size={18} color={theme.colors.emerald} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Active Store</Text>
                <Text style={{ color: theme.colors.muted, fontWeight: "900", marginTop: 2 }}>
                  {activeStoreName ?? "—"}
                </Text>
              </View>

              <Pressable onPress={() => void loadProducts()} hitSlop={10} style={{ padding: 8 }}>
                <Ionicons name="refresh" size={18} color={theme.colors.faint} />
              </Pressable>
            </View>

            {!activeStoreId ? (
              <Text style={{ color: theme.colors.dangerText, fontWeight: "900", marginTop: 10 }}>
                Hakuna store iliyochaguliwa. Rudi uchague/activate store kwanza.
              </Text>
            ) : null}
          </Card>

          {/* Product block */}
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Bidhaa (Product)</Text>

              {!!selectedProductId && (
                <Pressable
                  onPress={() => {
                    setSelectedProductId("");
                    setSelectedName("");
                    setSelectedSku("");
                    setSelectedPrice(0);
                  }}
                  hitSlop={10}
                >
                  <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Clear</Text>
                </Pressable>
              )}
            </View>

            {!!prodErr ? (
              <Text style={{ marginTop: 8, color: theme.colors.dangerText, fontWeight: "900" }}>{prodErr}</Text>
            ) : null}

            <Pressable
              onPress={openPicker}
              disabled={!activeStoreId || prodLoading}
              style={{
                marginTop: 10,
                height: 46,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: theme.colors.emeraldBorder,
                backgroundColor: theme.colors.emeraldSoft,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 10,
                opacity: !activeStoreId || prodLoading ? 0.6 : 1,
              }}
            >
              <Ionicons name="pricetag-outline" size={18} color={theme.colors.emerald} />
              <Text style={{ fontWeight: "900", color: theme.colors.text }}>
                {prodLoading ? "Loading products..." : selectedName ? "Change Product" : "Chagua Bidhaa"}
              </Text>
            </Pressable>

            {!!selectedName && (
              <View style={{ marginTop: 10, gap: 4 }}>
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>{selectedName}</Text>
                {!!selectedSku && <Text style={{ color: theme.colors.faint, fontWeight: "900" }}>SKU: {selectedSku}</Text>}
                <Text style={{ color: theme.colors.emerald, fontWeight: "900", fontSize: 16 }}>
                  {fmtMoneyTZS(selectedPrice, currency)}
                </Text>
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Bei hii inatoka DB (products.selling_price) na inasnap-shot kwenye post.
                </Text>
              </View>
            )}

            {!selectedName ? (
              <Text style={{ marginTop: 10, color: theme.colors.faint, fontWeight: "900" }}>
                ⚠️ Product ni required kwa post.
              </Text>
            ) : null}
          </Card>

          <Card>
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Ujumbe (Caption)</Text>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="Andika tangazo la biashara yako..."
              placeholderTextColor={theme.colors.faint}
              multiline
              style={{
                minHeight: 120,
                marginTop: 8,
                borderRadius: theme.radius.xl,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                padding: 12,
                color: theme.colors.text,
              }}
            />
          </Card>

          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Picha (Feed + HQ) — hiari</Text>

              {!!localUri && (
                <Pressable onPress={removeImage} hitSlop={10}>
                  <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Remove</Text>
                </Pressable>
              )}
            </View>

            {!localUri ? (
              <Pressable
                onPress={pickImage}
                style={{
                  marginTop: 10,
                  height: 46,
                  borderRadius: theme.radius.pill,
                  borderWidth: 1,
                  borderColor: theme.colors.emeraldBorder,
                  backgroundColor: theme.colors.emeraldSoft,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 8,
                }}
              >
                <Ionicons name="image-outline" size={18} color={theme.colors.emerald} />
                <Text style={{ fontWeight: "900", color: theme.colors.text }}>Chagua Picha</Text>
              </Pressable>
            ) : (
              <View style={{ marginTop: 10, gap: 8 }}>
                <View
                  style={{
                    width: "100%",
                    aspectRatio: 16 / 9,
                    borderRadius: theme.radius.xl,
                    overflow: "hidden",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                  }}
                >
                  <Image source={{ uri: shownPreviewUri }} style={{ width: "100%", height: "100%" }} />
                </View>

                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  {uploading
                    ? "Kuandaa sizes + Uploading picha..."
                    : "Perf Standard: FEED (1080px, ~<=0.45MB) + HQ (1600px, <=2MB). Feed itakuwa smooth hata uki-scroll chini sana."}
                </Text>
              </View>
            )}
          </Card>

          <Button
            title={uploading ? "Uploading..." : saving ? "Posting..." : "Post Now"}
            onPress={submit}
            disabled={!canSubmit}
          />
        </View>

        {/* Product Picker Modal */}
        <Modal
          visible={productOpen}
          transparent
          animationType="fade"
          // ✅ HARD FIX: statusBarTranslucent can reveal white window behind on Android
          statusBarTranslucent={false}
          // ✅ reduces flashes on some Android devices
          hardwareAccelerated
          // @ts-ignore (RN supports on iOS)
          presentationStyle="overFullScreen"
          onRequestClose={() => setProductOpen(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{
              flex: 1,
              // ✅ ensure even the modal root is dark (no white behind)
              backgroundColor: theme.colors.background,
            }}
          >
            <Pressable
              onPress={() => setProductOpen(false)}
              style={{
                flex: 1,
                backgroundColor: "rgba(0,0,0,0.75)",
                paddingTop: modalPadTop,
                paddingBottom: modalPadBottom,
                paddingHorizontal: 14,
                justifyContent: "center",
              }}
            >
              <Pressable
                onPress={() => {}}
                style={{
                  borderRadius: theme.radius.xl,
                  borderWidth: 1,
                  borderColor: theme.colors.borderSoft,
                  backgroundColor: theme.colors.card,
                  overflow: "hidden",
                  maxHeight: MODAL_MAX_HEIGHT,
                }}
              >
                <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.borderSoft }}>
                  <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>Chagua Bidhaa</Text>

                  <View
                    style={{
                      marginTop: 10,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.12)",
                      borderRadius: theme.radius.xl,
                      paddingHorizontal: 12,
                      height: 46,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Ionicons name="search" size={16} color={theme.colors.faint} />
                    <TextInput
                      value={q}
                      onChangeText={setQ}
                      placeholder="Search name or SKU..."
                      placeholderTextColor={theme.colors.faint}
                      style={{ flex: 1, color: theme.colors.text, fontWeight: "800" }}
                    />
                    {!!q && (
                      <Pressable onPress={() => setQ("")} hitSlop={10} style={{ padding: 6 }}>
                        <Ionicons name="close" size={16} color={theme.colors.faint} />
                      </Pressable>
                    )}
                  </View>
                </View>

                <FlatList
                  data={filteredProducts}
                  keyExtractor={(x) => String(x.product_id)}
                  style={{ flexGrow: 0 }}
                  contentContainerStyle={{ paddingVertical: 6 }}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => {
                    const price = Number(item.selling_price) || 0;
                    const isActive = String(item.product_id) === selectedProductId;

                    return (
                      <Pressable
                        onPress={() => selectProduct(item)}
                        style={({ pressed }) => [
                          {
                            paddingHorizontal: 12,
                            paddingVertical: 12,
                            opacity: pressed ? 0.92 : 1,
                            backgroundColor: isActive ? theme.colors.emeraldSoft : "transparent",
                            borderTopWidth: 1,
                            borderTopColor: "rgba(255,255,255,0.06)",
                          },
                        ]}
                      >
                        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 14 }}>{item.name}</Text>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                          <Text style={{ color: theme.colors.faint, fontWeight: "900" }}>
                            {clean(item.sku) ? `SKU: ${item.sku}` : "—"}
                          </Text>
                          <Text style={{ color: theme.colors.emerald, fontWeight: "900" }}>
                            {fmtMoneyTZS(price, "TZS")}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  }}
                  ListEmptyComponent={
                    <View style={{ padding: 14 }}>
                      <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
                        {prodLoading ? "Loading..." : "No products found."}
                      </Text>
                    </View>
                  }
                />

                <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: theme.colors.borderSoft }}>
                  <Button title="Close" variant="secondary" onPress={() => setProductOpen(false)} />
                </View>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>
      </Screen>
    </>
  );
}