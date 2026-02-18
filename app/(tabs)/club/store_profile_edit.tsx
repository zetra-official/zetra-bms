// app/(tabs)/club/store_profile_edit.tsx
import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Button } from "@/src/ui/Button";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function clean(s: any) {
  return String(s ?? "").trim();
}

type StoreProfile = {
  store_id: string;
  display_name: string | null;
  bio: string | null;
  category: string | null;
  location: string | null;
  whatsapp: string | null;
  phone: string | null;
  avatar_url: string | null;
};

export default function StoreProfileEditScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeStoreId, activeStoreName, activeRole } = useOrg();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  const topPad = Math.max(insets.top, 10) + 8;

  const canEdit = useMemo(() => {
    // ✅ match DB rule: only owner/admin can edit business identity
    return activeRole === "owner" || activeRole === "admin";
  }, [activeRole]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);

    try {
      if (!activeStoreId) throw new Error("No active store");

      const { data, error } = await supabase.rpc("get_store_profile", {
        p_store_id: activeStoreId,
      });

      if (error) throw error;

      const row = (Array.isArray(data) ? data[0] : data) as StoreProfile | null;

      setDisplayName(clean(row?.display_name ?? activeStoreName ?? ""));
      setBio(clean(row?.bio ?? ""));
      setCategory(clean(row?.category ?? ""));
      setLocation(clean(row?.location ?? ""));
      setWhatsapp(clean(row?.whatsapp ?? ""));
      setPhone(clean(row?.phone ?? ""));
      setAvatarUrl(clean(row?.avatar_url ?? ""));
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load store profile");
    } finally {
      setLoading(false);
    }
  }, [activeStoreId, activeStoreName]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    if (!activeStoreId) {
      Alert.alert("Store Required", "Activate store kwanza.");
      return;
    }
    if (!canEdit) {
      Alert.alert("Not allowed", "Owner/Admin tu ndio wanaweza ku-edit business identity.");
      return;
    }

    const name = clean(displayName);
    if (!name.length) {
      Alert.alert("Display Name", "Tafadhali weka jina la biashara/store.");
      return;
    }

    setErr(null);
    setSaving(true);

    try {
      const { error } = await supabase.rpc("upsert_store_profile", {
        p_store_id: activeStoreId,
        p_display_name: name,
        p_bio: clean(bio) || null,
        p_category: clean(category) || null,
        p_location: clean(location) || null,
        p_whatsapp: clean(whatsapp) || null,
        p_phone: clean(phone) || null,
        p_avatar_url: clean(avatarUrl) || null,
      });

      if (error) throw error;

      Alert.alert("Saved", "Business profile imehifadhiwa ✅");
      router.back();
    } catch (e: any) {
      setErr(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }, [
    activeStoreId,
    avatarUrl,
    bio,
    canEdit,
    category,
    displayName,
    location,
    phone,
    router,
    whatsapp,
  ]);

  return (
    <Screen scroll contentStyle={{ paddingTop: topPad }}>
      <View style={{ gap: 12 }}>
        <Card>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
              Edit Business Identity
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
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                Back
              </Text>
            </Pressable>
          </View>

          <Text style={{ color: theme.colors.faint, fontWeight: "800", marginTop: 8 }}>
            Active store:{" "}
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
              {activeStoreName ?? "—"}
            </Text>
          </Text>
        </Card>

        {!!err && (
          <Card
            style={{
              backgroundColor: theme.colors.dangerSoft,
              borderColor: theme.colors.dangerBorder,
            }}
          >
            <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>
              {err}
            </Text>
          </Card>
        )}

        <Card style={{ gap: 10 }}>
          {loading ? (
            <View style={{ paddingVertical: 10, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
                Loading...
              </Text>
            </View>
          ) : (
            <>
              <Field
                label="Display Name"
                value={displayName}
                onChange={setDisplayName}
                placeholder="Mfano: MWANJELWA DUKA JIPYA"
              />
              <Field
                label="Bio"
                value={bio}
                onChange={setBio}
                placeholder="Maelezo mafupi ya biashara..."
                multiline
              />
              <Field
                label="Category"
                value={category}
                onChange={setCategory}
                placeholder="Mfano: Clothes, Perfume, Shoes"
              />
              <Field
                label="Location"
                value={location}
                onChange={setLocation}
                placeholder="Mfano: Mwanjelwa, Mbeya"
              />
              <Field
                label="WhatsApp"
                value={whatsapp}
                onChange={setWhatsapp}
                placeholder="2557XXXXXXXX"
              />
              <Field
                label="Phone"
                value={phone}
                onChange={setPhone}
                placeholder="2557XXXXXXXX"
              />
              <Field
                label="Avatar URL (optional)"
                value={avatarUrl}
                onChange={setAvatarUrl}
                placeholder="https://..."
              />

              <Button title={saving ? "Saving..." : "Save"} onPress={save} disabled={saving} />

              <Text
                style={{
                  color: theme.colors.faint,
                  fontWeight: "800",
                  fontSize: 12,
                  lineHeight: 16,
                }}
              >
                NOTE: Avatar upload ya picha ipo kwenye Profile screen (club/profile.tsx). Hapa ni
                ku-edit text fields tu.
              </Text>
            </>
          )}
        </Card>
      </View>
    </Screen>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const { label, value, onChange, placeholder, multiline } = props;

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.faint}
        multiline={!!multiline}
        style={{
          minHeight: multiline ? 96 : 46,
          borderRadius: theme.radius.xl,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
          paddingHorizontal: 12,
          paddingVertical: multiline ? 10 : 12,
          color: theme.colors.text,
        }}
      />
    </View>
  );
}