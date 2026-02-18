// app/(tabs)/club/profile.tsx
import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Button } from "@/src/ui/Button";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ClubProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  profile_type: string | null;
  user_id: string | null;
};

type StoreProfileRow = {
  store_id: string;
  display_name: string | null;
  bio: string | null;
  category: string | null;
  location: string | null;
  whatsapp: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function safeStr(x: any, fallback = "") {
  const s = String(x ?? "").trim();
  return s.length ? s : fallback;
}

function clean(s: any) {
  return String(s ?? "").trim();
}

function extFromUri(uri: string) {
  const q = uri.split("?")[0];
  const p = q.split(".");
  const e = p[p.length - 1]?.toLowerCase();
  return e && e.length <= 5 ? e : "jpg";
}

function contentType(ext: string) {
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "jpeg" || ext === "jpg") return "image/jpeg";
  return "image/jpeg";
}

function base64ToUint8Array(base64: string) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export default function ClubProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { activeOrgName, activeRole, activeStoreName, activeStoreId } = useOrg();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [me, setMe] = useState<ClubProfileRow | null>(null);
  const [storeProfile, setStoreProfile] = useState<StoreProfileRow | null>(null);

  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);

  const [localAvatarUri, setLocalAvatarUri] = useState<string>("");
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string>("");

  const topPad = Math.max(insets.top, 10) + 8;

  const identityName = useMemo(() => {
    return safeStr(activeStoreName, safeStr(activeOrgName, "ZETRA Business"));
  }, [activeOrgName, activeStoreName]);

  const effectiveAvatarUrl = useMemo(() => {
    const a =
      clean(localAvatarUri) ||
      clean(avatarPreviewUrl) ||
      clean(storeProfile?.avatar_url) ||
      clean(me?.avatar_url);
    return a.length ? a : "";
  }, [avatarPreviewUrl, localAvatarUri, me?.avatar_url, storeProfile?.avatar_url]);

  const canSaveAvatar = useMemo(() => {
    return !!activeStoreId && !!clean(localAvatarUri) && !uploading && !savingAvatar && !loading;
  }, [activeStoreId, localAvatarUri, uploading, savingAvatar, loading]);

  const loadAll = useCallback(async () => {
    setErr(null);
    setLoading(true);

    try {
      const { data: ures } = await supabase.auth.getUser();
      const uid = ures?.user?.id;
      if (!uid) throw new Error("Not authenticated");

      const { data: meData, error: meErr } = await supabase
        .from("club_profiles")
        .select("id, display_name, avatar_url, profile_type, user_id")
        .eq("id", uid)
        .maybeSingle();

      if (meErr) throw meErr;
      setMe((meData as any) ?? null);

      if (activeStoreId) {
        const { data: sp, error: spErr } = await supabase.rpc("get_store_profile", {
          p_store_id: activeStoreId,
        });
        if (spErr) throw spErr;

        const row = Array.isArray(sp) ? (sp[0] as any) : (sp as any);
        setStoreProfile((row as any) ?? null);
        setAvatarPreviewUrl(clean((row as any)?.avatar_url ?? ""));
      } else {
        setStoreProfile(null);
        setAvatarPreviewUrl("");
      }
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load profile");
      setMe(null);
      setStoreProfile(null);
    } finally {
      setLoading(false);
    }
  }, [activeStoreId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const goBack = useCallback(() => {
    router.back();
  }, [router]);

  // ✅ FIX: Inbox button now navigates (not "Coming Soon")
  const goInbox = useCallback(() => {
    if (!activeStoreId) {
      Alert.alert("Store Required", "Activate store kwanza ndipo uingie Inbox.");
      return;
    }

    router.push({
      pathname: "/(tabs)/club/inbox/store/[storeId]" as any,
      params: { storeId: activeStoreId },
    } as any);
  }, [activeStoreId, router]);

  const goEditInfo = useCallback(() => {
    if (!activeStoreId) {
      Alert.alert("Store Required", "Activate store kwanza ndipo u-edit Business Identity.");
      return;
    }
    router.push("/(tabs)/club/store_profile_edit" as any);
  }, [activeStoreId, router]);

  const pickAvatar = useCallback(async () => {
    if (!activeStoreId) {
      Alert.alert("Store Required", "Activate store kwanza ndipo uweke avatar ya biashara.");
      return;
    }

    setErr(null);
    setPicking(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission", "Ruhusa ya kuchagua picha inahitajika.");
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.85,
      });

      if (res.canceled) return;

      const uri = res.assets?.[0]?.uri;
      if (!uri) return;

      setLocalAvatarUri(uri);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to pick image");
    } finally {
      setPicking(false);
    }
  }, [activeStoreId]);

  const cancelPickedAvatar = useCallback(() => {
    setLocalAvatarUri("");
  }, []);

  const uploadAvatarToStorage = useCallback(async (): Promise<string> => {
    if (!activeStoreId) throw new Error("Store Required");
    if (!localAvatarUri) throw new Error("No image selected");

    setUploading(true);
    try {
      const ext = extFromUri(localAvatarUri);
      const path = `stores/${activeStoreId}/avatar_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

      const base64 = await FileSystem.readAsStringAsync(localAvatarUri, {
        encoding: "base64",
      });

      const bytes = base64ToUint8Array(base64);

      const { error: upErr } = await supabase.storage.from("club-media").upload(path, bytes, {
        contentType: contentType(ext),
        upsert: true,
      });

      if (upErr) throw upErr;

      const { data } = supabase.storage.from("club-media").getPublicUrl(path);
      const url = clean(data?.publicUrl ?? "");
      if (!url) throw new Error("Failed to get public URL");
      return url;
    } finally {
      setUploading(false);
    }
  }, [activeStoreId, localAvatarUri]);

  const saveAvatar = useCallback(async () => {
    if (!activeStoreId) {
      Alert.alert("Store Required", "Activate store kwanza ndipo u-save avatar ya biashara.");
      return;
    }
    if (!clean(localAvatarUri)) return;

    setErr(null);
    setSavingAvatar(true);
    try {
      const remoteUrl = await uploadAvatarToStorage();
      const displayName = clean(storeProfile?.display_name) || identityName;

      const { error } = await supabase.rpc("upsert_store_profile", {
        p_store_id: activeStoreId,
        p_display_name: displayName,
        p_bio: storeProfile?.bio ?? null,
        p_category: storeProfile?.category ?? null,
        p_location: storeProfile?.location ?? null,
        p_whatsapp: storeProfile?.whatsapp ?? null,
        p_phone: storeProfile?.phone ?? null,
        p_avatar_url: remoteUrl,
      });

      if (error) throw error;

      setAvatarPreviewUrl(remoteUrl);
      setLocalAvatarUri("");
      await loadAll();

      Alert.alert("Success", "Avatar ya biashara imehifadhiwa ✅");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save avatar");
    } finally {
      setSavingAvatar(false);
    }
  }, [
    activeStoreId,
    identityName,
    loadAll,
    localAvatarUri,
    storeProfile?.bio,
    storeProfile?.category,
    storeProfile?.display_name,
    storeProfile?.location,
    storeProfile?.phone,
    storeProfile?.whatsapp,
    uploadAvatarToStorage,
  ]);

  const onAvatarPress = useCallback(() => {
    void pickAvatar();
  }, [pickAvatar]);

  return (
    <Screen scroll contentStyle={{ paddingTop: topPad }}>
      <View style={{ gap: 12 }}>
        <Card
          style={{
            padding: 14,
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.borderSoft,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 54,
                height: 54,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: theme.colors.emeraldBorder,
                backgroundColor: theme.colors.emeraldSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="person-circle-outline" size={26} color={theme.colors.emerald} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>Business Identity</Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12, marginTop: 4 }}>
                Hii profile ni ya “biashara/store” uliyoi-activate.
              </Text>
            </View>

            <Pressable
              onPress={goBack}
              hitSlop={10}
              style={({ pressed }) => [
                {
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
            >
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Back</Text>
            </Pressable>
          </View>
        </Card>

        {!!err && (
          <Card style={{ borderColor: theme.colors.dangerBorder, backgroundColor: theme.colors.dangerSoft, padding: 12 }}>
            <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>{err}</Text>
          </Card>
        )}

        <Card style={{ padding: 14, gap: 12 }}>
          {loading ? (
            <View style={{ paddingVertical: 10, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>Loading profile...</Text>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Pressable
                  onPress={onAvatarPress}
                  hitSlop={10}
                  style={({ pressed }) => [
                    {
                      width: 64,
                      height: 64,
                      borderRadius: 999,
                      overflow: "hidden",
                      borderWidth: 1,
                      borderColor: theme.colors.emeraldBorder,
                      backgroundColor: "rgba(255,255,255,0.06)",
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: pressed ? 0.92 : 1,
                    },
                  ]}
                >
                  {effectiveAvatarUrl ? (
                    <Image source={{ uri: effectiveAvatarUrl }} style={{ width: "100%", height: "100%" }} />
                  ) : (
                    <Ionicons name="business-outline" size={22} color={theme.colors.text} />
                  )}

                  {(picking || uploading || savingAvatar) && (
                    <View
                      style={{
                        position: "absolute",
                        inset: 0 as any,
                        backgroundColor: "rgba(0,0,0,0.45)",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <ActivityIndicator />
                    </View>
                  )}
                </Pressable>

                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>{identityName}</Text>

                  <Text style={{ color: theme.colors.faint, fontWeight: "900", fontSize: 12, marginTop: 4 }}>
                    Active Store ID: {activeStoreId ? String(activeStoreId).slice(0, 8) + "…" : "—"}
                  </Text>

                  {!!localAvatarUri && (
                    <Text style={{ color: theme.colors.emerald, fontWeight: "900", fontSize: 12, marginTop: 4 }}>
                      Avatar mpya imechaguliwa — bonyeza “Save Avatar”
                    </Text>
                  )}
                </View>

                <View
                  style={{
                    paddingHorizontal: 10,
                    height: 26,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>
                    {safeStr(activeRole, "—").toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Pressable
                    onPress={onAvatarPress}
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
                        gap: 8,
                        opacity: pressed ? 0.92 : 1,
                      },
                    ]}
                  >
                    <Ionicons name="camera-outline" size={18} color={theme.colors.text} />
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                      {effectiveAvatarUrl ? "Change Photo" : "Add Photo"}
                    </Text>
                  </Pressable>
                </View>

                {!!localAvatarUri && (
                  <Pressable
                    onPress={cancelPickedAvatar}
                    hitSlop={10}
                    style={({ pressed }) => [
                      {
                        height: 44,
                        paddingHorizontal: 14,
                        borderRadius: theme.radius.pill,
                        borderWidth: 1,
                        borderColor: theme.colors.dangerBorder,
                        backgroundColor: theme.colors.dangerSoft,
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: pressed ? 0.92 : 1,
                      },
                    ]}
                  >
                    <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>Cancel</Text>
                  </Pressable>
                )}
              </View>

              {!!localAvatarUri && (
                <Button
                  title={uploading ? "Uploading..." : savingAvatar ? "Saving..." : "Save Avatar"}
                  onPress={saveAvatar}
                  disabled={!canSaveAvatar}
                />
              )}

              <View
                style={{
                  padding: 12,
                  borderRadius: theme.radius.xl,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                }}
              >
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Organization:{" "}
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{safeStr(activeOrgName, "—")}</Text>
                </Text>

                <Text style={{ color: theme.colors.faint, fontWeight: "800", marginTop: 6 }}>
                  Store profile display_name (DB):{" "}
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                    {safeStr(storeProfile?.display_name, "—")}
                  </Text>
                </Text>

                <Text style={{ color: theme.colors.faint, fontWeight: "800", marginTop: 6 }}>
                  (Legacy) club_profiles display_name:{" "}
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{safeStr(me?.display_name, "—")}</Text>
                </Text>
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button title="Inbox" onPress={goInbox} />
                </View>

                <Pressable
                  onPress={goEditInfo}
                  hitSlop={10}
                  style={({ pressed }) => [
                    {
                      height: 44,
                      paddingHorizontal: 14,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      borderColor: theme.colors.emeraldBorder,
                      backgroundColor: theme.colors.emeraldSoft,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      opacity: pressed ? 0.92 : 1,
                    },
                  ]}
                >
                  <Ionicons name="create-outline" size={18} color={theme.colors.emerald} />
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Edit Info</Text>
                </Pressable>
              </View>

              <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 12, lineHeight: 16 }}>
                NOTE: Avatar inahifadhiwa kwenye club_store_profiles.avatar_url (A40) na inaupload kwenye storage bucket
                “club-media”.
              </Text>
            </>
          )}
        </Card>
      </View>
    </Screen>
  );
}