import {useCommonText} from "@/src/i18n/useCommonText";
﻿import { useLocalSearchParams, useRouter } from "expo-router";

import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { supabase } from "../src/supabase/supabaseClient";
import { Button } from "../src/ui/Button";
import { Card } from "../src/ui/Card";
import { Screen } from "../src/ui/Screen";
import { UI } from "../src/ui/theme";

const LOGO_BUCKET = "organization-logos";

function clean(x: any) {
  return String(x ?? "").trim();
}

function fileExt(uri: string) {
  const cleanUri = uri.split("?")[0] ?? "";
  const ext = cleanUri.split(".").pop()?.toLowerCase() || "jpg";
  return ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
}

function mimeFromExt(ext: string) {
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const cleanBase64 = base64.replace(/[^A-Za-z0-9+/=]/g, "");
  const bytes: number[] = [];

  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < cleanBase64.length; i++) {
    const c = cleanBase64[i];
    if (c === "=") break;

    const value = chars.indexOf(c);
    if (value < 0) continue;

    buffer = (buffer << 6) | value;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return new Uint8Array(bytes).buffer;
}
export default function OrganizationProfileScreen() {
 const uiText = useCommonText();
  const router = useRouter();
  const { orgId } = useLocalSearchParams<{ orgId?: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [businessName, setBusinessName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [tin, setTin] = useState("");
  const [vrn, setVrn] = useState("");
  const [registrationNo, setRegistrationNo] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [tagline, setTagline] = useState("");
  const [receiptFooter, setReceiptFooter] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      const id = clean(orgId);
      if (!id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("organization_profiles")
          .select("*")
          .eq("organization_id", id)
          .maybeSingle();

        if (error) throw error;
        if (!alive) return;

        setBusinessName(clean(data?.business_name));
        setLogoUrl(clean(data?.logo_url));
        setTin(clean(data?.tin));
        setVrn(clean(data?.vrn));
        setRegistrationNo(clean(data?.registration_no));
        setEmail(clean(data?.email));
        setWebsite(clean(data?.website));
        setTagline(clean(data?.tagline));
        setReceiptFooter(clean(data?.receipt_footer));
      } catch (e: any) {
        Alert.alert(uiText("Failed"), clean(e?.message) || uiText("Failed to load profile"));
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [orgId]);

  const pickAndUploadLogo = async () => {
    const id = clean(orgId);
    if (!id) {
      Alert.alert(uiText("Missing organization"), uiText("Organization haijapatikana."));
      return;
    }

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(uiText("Permission required"), uiText("Ruhusu app kuchagua picha kutoka kwenye simu."));
        return;
      }

     const picked = await ImagePicker.launchImageLibraryAsync({
  mediaTypes: ImagePicker.MediaTypeOptions.Images,
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.9,
  base64: true,
});

      if (picked.canceled) return;

      const asset = picked.assets?.[0];
      if (!asset?.uri) return;

      setUploadingLogo(true);

      const ext = fileExt(asset.uri);
      const path = `${id}/logo-${Date.now()}.${ext}`;

      if (!asset.base64) {
  throw new Error("Picha haijasomwa vizuri. Tafadhali jaribu kuchagua picha nyingine.");
}

const arrayBuffer = base64ToArrayBuffer(asset.base64);

const { error: uploadError } = await supabase.storage
  .from(LOGO_BUCKET)
  .upload(path, arrayBuffer, {
    contentType: mimeFromExt(ext),
    upsert: true,
  });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
      const publicUrl = clean(data?.publicUrl);

      if (!publicUrl) throw new Error("Logo URL haijapatikana.");

      setLogoUrl(publicUrl);
      Alert.alert(uiText("Logo uploaded ✅"), uiText("Logo imewekwa. Bonyeza Save Profile kuhifadhi."));
    } catch (e: any) {
      Alert.alert(
        uiText("Logo upload failed"),
        clean(e?.message) ||
          uiText("Imeshindikana ku-upload logo. Hakikisha bucket \"{p0}\" ipo Supabase Storage.", {p0: (LOGO_BUCKET)})
      );
    } finally {
      setUploadingLogo(false);
    }
  };

  const onSave = async () => {
    const id = clean(orgId);
    if (!id) {
      Alert.alert(uiText("Missing organization"), uiText("Organization haijapatikana."));
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("organization_profiles").upsert({
        organization_id: id,
        business_name: clean(businessName),
        logo_url: clean(logoUrl),
        tin: clean(tin),
        vrn: clean(vrn),
        registration_no: clean(registrationNo),
        email: clean(email),
        website: clean(website),
        tagline: clean(tagline),
        receipt_footer: clean(receiptFooter),
        updated_at: new Date().toISOString(),
      });

     if (error) throw error;

Alert.alert(uiText("Saved ✅"), uiText("Business profile imehifadhiwa."), [
  {
    text: uiText("OK"),
    onPress: () => router.back(),
  },
]);
    } catch (e: any) {
      Alert.alert(uiText("Failed"), clean(e?.message) || uiText("Failed to save profile"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 26 }}>
                {uiText("Business Profile")}</Text>
              <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 6 }}>
                {uiText("Taarifa za kampuni zitakazoonekana kwenye invoice na receipt.")}</Text>
            </View>

            <Pressable
              onPress={() => router.back()}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 9,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: UI.border,
              }}
            >
              <Text style={{ color: UI.muted, fontWeight: "900" }}>✕</Text>
            </Pressable>
          </View>

          {loading ? (
            <Card>
              <ActivityIndicator />
            </Card>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 180 }}
            >
              <Card style={{ gap: 14 }}>
                <SectionTitle
                  title={uiText("Organization Details")}
                  subtitle={uiText("Jaza taarifa za msingi za kampuni/biashara nzima.")}
                />

                <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                                    <Pressable
                    onPress={pickAndUploadLogo}
                    disabled={uploadingLogo}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={uiText("Change or upload business logo")}
                    style={({ pressed }) => ({
                      width: 88,
                      height: 88,
                      borderRadius: 22,
                      borderWidth: 1,
                      borderColor: UI.border,
                      backgroundColor: "rgba(148,163,184,0.10)",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      opacity: uploadingLogo
                        ? 0.55
                        : pressed
                          ? 0.84
                          : 1,
                      transform: [
                        {
                          scale:
                            !uploadingLogo && pressed
                              ? 0.97
                              : 1,
                        },
                      ],
                    })}
                  >
                    {logoUrl ? (
                      <>
                        <Image
                          source={{ uri: logoUrl }}
                          style={{
                            width: "100%",
                            height: "100%",
                          }}
                          resizeMode="cover"
                        />

                        <View
                          pointerEvents="none"
                          style={{
                            position: "absolute",
                            left: 7,
                            right: 7,
                            bottom: 7,
                            paddingVertical: 3,
                            borderRadius: 999,
                            backgroundColor: "rgba(15,23,42,0.72)",
                            alignItems: "center",
                          }}
                        >
                          <Text
                            style={{
                              color: "#FFFFFF",
                              fontWeight: "900",
                              fontSize: 8,
                            }}
                          >
                            {uiText("Change")}</Text>
                        </View>
                      </>
                    ) : (
                      <View
                        pointerEvents="none"
                        style={{
                          alignItems: "center",
                          justifyContent: "center",
                          paddingHorizontal: 8,
                        }}
                      >
                        <Text
                          style={{
                            color: UI.text,
                            fontWeight: "900",
                            fontSize: 10,
                            textAlign: "center",
                          }}
                        >
                          {uiText("Upload Logo")}</Text>

                        <Text
                          style={{
                            color: UI.faint,
                            fontWeight: "700",
                            fontSize: 8,
                            marginTop: 3,
                            textAlign: "center",
                          }}
                        >
                          {uiText("Tap to select")}</Text>
                      </View>
                    )}
                  </Pressable>

                  <View style={{ flex: 1, gap: 8 }}>
                    <Text style={{ color: UI.text, fontWeight: "900" }}>{uiText("Logo ya kampuni")}</Text>
                    <Text style={{ color: UI.faint, fontWeight: "700", fontSize: 12, lineHeight: 17 }}>
                      {logoUrl
                        ? uiText("Gusa picha ya logo au Change Logo kubadilisha picha.")
                        : uiText("Upload picha ya logo. Itatumika kwenye invoice/receipt.")}
                    </Text>

                    <Pressable
                      onPress={pickAndUploadLogo}
                      disabled={uploadingLogo}
                      style={{
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: UI.border,
                        paddingVertical: 11,
                        paddingHorizontal: 12,
                        backgroundColor: "rgba(52,211,153,0.10)",
                        opacity: uploadingLogo ? 0.6 : 1,
                      }}
                    >
                      <Text style={{ color: UI.text, fontWeight: "900" }}>
                        {uploadingLogo
                          ? uiText("Ina-upload...")
                          : logoUrl
                            ? uiText("Change Logo")
                            : uiText("Upload Logo")}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <Input
                  label={uiText("Jina la biashara kwenye receipt")}
                  helper="Mfano: JOFU QUALITY CENTER au ZETRA TECHNOLOGY LIMITED."
                  value={businessName}
                  onChangeText={setBusinessName}
                />

                <Input
                  label={uiText("Logo URL")}
                  helper="Hii hujazwa automatically baada ya ku-upload logo. Unaweza pia kuweka link ya logo kama tayari unayo."
                  value={logoUrl}
                  onChangeText={setLogoUrl}
                  autoCapitalize="none"
                />

                <Input
                  label="TIN"
                  helper="Weka TIN ya biashara kama ipo. Si lazima kwa biashara ambazo hazijasajiliwa TRA."
                  value={tin}
                  onChangeText={setTin}
                  autoCapitalize="characters"
                />

                <Input
                  label="VRN"
                  helper="Weka VRN kama biashara imesajiliwa VAT. Kama huna, acha wazi."
                  value={vrn}
                  onChangeText={setVrn}
                  autoCapitalize="characters"
                />

                <Input
                  label={uiText("Namba ya usajili")}
                  helper="Mfano: BRELA registration number au business license number kama ipo."
                  value={registrationNo}
                  onChangeText={setRegistrationNo}
                />

                <Input
                  label={uiText("Email ya kampuni")}
                  helper="Email kuu ya biashara. Mfano: info@company.co.tz."
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <Input
                  label={uiText("Website")}
                  helper="Mfano: https://zetra.co.tz. Kama huna website, acha wazi."
                  value={website}
                  onChangeText={setWebsite}
                  autoCapitalize="none"
                />

                <Input
                  label={uiText("Slogan / Tagline")}
                  helper="Mfano: Quality first, trusted always. Hii inaweza kuonekana chini ya jina la biashara."
                  value={tagline}
                  onChangeText={setTagline}
                />

                <Input
                  label={uiText("Ujumbe wa chini ya receipt")}
                  helper="Mfano: Asante kwa kununua kwetu. Karibu tena."
                  value={receiptFooter}
                  onChangeText={setReceiptFooter}
                  multiline
                />

                <Button
                  title={saving ? uiText("Inahifadhi...") : uiText("Hifadhi Business Profile")}
                  onPress={onSave}
                  disabled={saving || uploadingLogo}
                  variant="primary"
                />
              </Card>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={{ marginTop: 4 }}>
      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}>{title}</Text>
      <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 4, lineHeight: 19 }}>
        {subtitle}
      </Text>
    </View>
  );
}

function Input({
  label,
  helper,
  value,
  onChangeText,
  keyboardType,
  autoCapitalize,
  multiline,
}: {
  label: string;
  helper: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: any;
  autoCapitalize?: any;
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: UI.muted, fontWeight: "900" }}>{label}</Text>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor={UI.faint}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? "sentences"}
        multiline={!!multiline}
        style={{
          borderWidth: 1,
          borderColor: UI.border,
          borderRadius: 14,
          padding: 14,
          minHeight: multiline ? 86 : 52,
          color: UI.text,
          fontWeight: "800",
          textAlignVertical: multiline ? "top" : "center",
        }}
      />

      <Text style={{ color: UI.faint, fontWeight: "700", fontSize: 12, lineHeight: 17 }}>
        {helper}
      </Text>
    </View>
  );
}