// app/(tabs)/club/[postId]/edit.tsx
import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Button } from "@/src/ui/Button";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, Image, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/* ---------------- utils ---------------- */

function clean(s: string) {
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

function isMissingRpc(err: any) {
  const msg = String(err?.message ?? "").toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("function") ||
    msg.includes("rpc")
  );
}

/* ---------------- screen ---------------- */

export default function ClubEditPostScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeStoreId } = useOrg();

  const params = useLocalSearchParams<{
    postId?: string;
    caption?: string;
    imageUrl?: string;
  }>();

  const postId = String(params.postId ?? "").trim();

  const [caption, setCaption] = useState<string>(String(params.caption ?? ""));
  const [remoteUrl, setRemoteUrl] = useState<string>(String(params.imageUrl ?? ""));
  const [localUri, setLocalUri] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!postId) return false;
    return clean(caption).length > 0 && !saving && !uploading;
  }, [caption, postId, saving, uploading]);

  /* ---------- image picker ---------- */

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
      quality: 0.85,
    });

    if (res.canceled) return;

    const uri = res.assets?.[0]?.uri;
    if (!uri) return;

    // local image overrides remote image
    setLocalUri(uri);
  }, []);

  const removeImage = useCallback(() => {
    // remove both local + remote
    setLocalUri("");
    setRemoteUrl("");
  }, []);

  /* ---------- upload ---------- */

  const uploadImage = useCallback(async (): Promise<string | null> => {
    if (!localUri) return null;

    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) throw new Error("Not authenticated");

      const ext = extFromUri(localUri);
      const path = `${uid}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      const base64 = await FileSystem.readAsStringAsync(localUri, {
        encoding: "base64",
      });

      const bytes = base64ToUint8Array(base64);

      const { error: upErr } = await supabase.storage
        .from("club-media")
        .upload(path, bytes, {
          contentType: contentType(ext),
          upsert: false,
        });

      if (upErr) throw upErr;

      const { data } = supabase.storage.from("club-media").getPublicUrl(path);
      return data.publicUrl;
    } finally {
      setUploading(false);
    }
  }, [localUri]);

  /* ---------- update post ---------- */

  const updatePost = useCallback(
    async (finalCaption: string, finalImageUrl: string | null) => {
      // 1) Preferred: RPC update_club_post
      try {
        const { error } = await supabase.rpc("update_club_post", {
          p_post_id: postId,
          p_caption: finalCaption,
          p_image_url: finalImageUrl,
          // optional: if your RPC expects store id, it will ignore extra params safely? (No.)
        });
        if (!error) return;
        if (!isMissingRpc(error)) throw error;
      } catch (e: any) {
        // if it's not missing rpc, throw
        if (!isMissingRpc(e)) throw e;
      }

      // 2) Fallback: direct update (ONLY if your RLS allows store managers)
      // We try both common key names: id and post_id (safe approach).
      const payload: any = {
        caption: finalCaption,
        image_url: finalImageUrl,
      };

      // attempt by id
      const r1 = await supabase
        .from("club_posts")
        .update(payload)
        .eq("id", postId)
        .select("id");

      if (!r1.error && (r1.data?.length ?? 0) > 0) return;

      // attempt by post_id
      const r2 = await supabase
        .from("club_posts")
        .update(payload)
        .eq("post_id", postId)
        .select("post_id");

      if (r2.error) throw r2.error;
      if ((r2.data?.length ?? 0) === 0) {
        throw new Error(
          "Update failed: RPC update_club_post haipo na table update haijaruhusiwa. (Need DB RPC update_club_post)."
        );
      }
    },
    [postId]
  );

  const submit = useCallback(async () => {
    if (!postId) {
      Alert.alert("Missing Post", "Post ID haipo. Rudi nyuma uingie tena.");
      return;
    }
    if (!activeStoreId) {
      Alert.alert("Store Required", "Activate store kwanza kabla ya kuendelea.");
      return;
    }
    if (!canSubmit) return;

    setErr(null);
    setSaving(true);

    try {
      let finalUrl = clean(remoteUrl);

      if (localUri) {
        const uploaded = await uploadImage();
        finalUrl = clean(uploaded ?? "");
      }

      const finalImage = finalUrl.length ? finalUrl : null;

      await updatePost(clean(caption), finalImage);

      Alert.alert("Success", "Post imebadilishwa ✅");

      router.replace({
        pathname: "/(tabs)/club" as any,
        params: { r: String(Date.now()) },
      } as any);
    } catch (e: any) {
      setErr(e?.message ?? "Update failed");
    } finally {
      setSaving(false);
    }
  }, [
    activeStoreId,
    canSubmit,
    caption,
    localUri,
    postId,
    remoteUrl,
    router,
    updatePost,
    uploadImage,
  ]);

  const topPad = Math.max(insets.top, 10) + 8;

  const showPreviewUri = useMemo(() => {
    if (localUri) return localUri;
    if (clean(remoteUrl).length) return remoteUrl;
    return "";
  }, [localUri, remoteUrl]);

  return (
    <Screen scroll contentStyle={{ paddingTop: topPad }}>
      <View style={{ gap: 12 }}>
        {!!err && (
          <Card style={{ backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.dangerBorder }}>
            <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>{err}</Text>
          </Card>
        )}

        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
              Edit Post
            </Text>

            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={({ pressed }) => [
                {
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
            >
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Back</Text>
            </Pressable>
          </View>

          <Text style={{ color: theme.colors.faint, fontWeight: "800", marginTop: 8 }}>
            Unaweza kubadilisha caption na/au picha.
          </Text>
        </Card>

        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Caption</Text>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Badilisha ujumbe..."
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
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Picha</Text>

            {(!!localUri || !!clean(remoteUrl)) && (
              <Pressable onPress={removeImage} hitSlop={10}>
                <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Remove</Text>
              </Pressable>
            )}
          </View>

          {!showPreviewUri ? (
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
              <View style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: theme.radius.xl, overflow: "hidden" }}>
                <Image source={{ uri: showPreviewUri }} style={{ width: "100%", height: "100%" }} />
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={pickImage}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: theme.radius.pill,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "row",
                    gap: 8,
                  }}
                >
                  <Ionicons name="swap-horizontal-outline" size={18} color={theme.colors.text} />
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Change</Text>
                </Pressable>

                <Pressable
                  onPress={removeImage}
                  style={{
                    height: 44,
                    paddingHorizontal: 14,
                    borderRadius: theme.radius.pill,
                    borderWidth: 1,
                    borderColor: theme.colors.dangerBorder,
                    backgroundColor: theme.colors.dangerSoft,
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "row",
                    gap: 8,
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color={theme.colors.dangerText} />
                  <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>Remove</Text>
                </Pressable>
              </View>

              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                {uploading ? "Uploading picha..." : localUri ? "Picha mpya itaupload ukisave." : "Picha ya sasa iko tayari."}
              </Text>
            </View>
          )}
        </Card>

        <Button
          title={uploading ? "Uploading..." : saving ? "Saving..." : "Save Changes"}
          onPress={submit}
          disabled={!canSubmit}
        />
      </View>
    </Screen>
  );
}