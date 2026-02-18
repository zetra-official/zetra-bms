// app/(onboarding)/store.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { useOrg } from "../../src/context/OrgContext";
import { supabase } from "../../src/supabase/supabaseClient";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureSession() {
  for (let i = 0; i < 4; i++) {
    const { data, error } = await supabase.auth.getSession();
    if (error) return { session: null as any, error };
    if (data.session) return { session: data.session, error: null };
    await sleep(250);
  }
  return { session: null as any, error: null as any };
}

export default function FirstStoreOnboardingScreen() {
  const router = useRouter();
  const { refresh } = useOrg();

  const params = useLocalSearchParams<{ businessName?: string }>();
  const businessName = useMemo(
    () => (params.businessName ?? "").toString(),
    [params.businessName]
  );

  const [storeName, setStoreName] = useState("");
  const [loading, setLoading] = useState(false);

  const create = async () => {
    const orgName = businessName.trim();
    const firstStore = storeName.trim();

    if (!orgName) return Alert.alert("Missing", "Business name is missing.");
    if (!firstStore) return Alert.alert("Missing", "Store name is required.");

    // ✅ Must be authenticated (RLS + created_by)
    const { session, error: sessErr } = await ensureSession();
    if (sessErr) return Alert.alert("Imeshindikana", sessErr.message);
    if (!session) return Alert.alert("Imeshindikana", "Not authenticated");

    setLoading(true);

    const { error } = await supabase.rpc("create_org_with_store", {
      p_org_name: orgName,
      p_first_store_name: firstStore,
    });

    setLoading(false);

    if (error) {
      console.log("create_org_with_store error:", error);
      return Alert.alert("Imeshindikana", error.message);
    }

    await refresh();

    // ✅ go dashboard
    router.replace("/(tabs)");
  };

  return (
    <View style={{ flex: 1, padding: 20, justifyContent: "center" }}>
      <Text style={{ fontSize: 28, fontWeight: "900", marginBottom: 8 }}>
        First Store Setup
      </Text>

      <Text style={{ opacity: 0.7, marginBottom: 18 }}>
        Business: <Text style={{ fontWeight: "900" }}>{businessName}</Text>
      </Text>

      <Text style={{ fontWeight: "800", marginBottom: 8 }}>Store Name</Text>
      <TextInput
        value={storeName}
        onChangeText={setStoreName}
        placeholder="e.g. SMART MEN"
        autoCapitalize="words"
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          borderRadius: 12,
          padding: 12,
          marginBottom: 16,
        }}
      />

      <Pressable
        onPress={create}
        disabled={loading}
        style={{
          backgroundColor: "black",
          padding: 16,
          borderRadius: 16,
          alignItems: "center",
          opacity: loading ? 0.7 : 1,
        }}
      >
        <Text style={{ color: "white", fontWeight: "900" }}>
          {loading ? "Creating..." : "Create Business & Store"}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.back()}
        style={{ marginTop: 16, alignItems: "center" }}
      >
        <Text style={{ textDecorationLine: "underline" }}>Back</Text>
      </Pressable>
    </View>
  );
}