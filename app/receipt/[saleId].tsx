import React, { useEffect } from "react";
import { ActivityIndicator, Linking, Platform, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default function PublicReceiptPage() {
  const params = useLocalSearchParams<{ saleId?: string | string[] }>();
  const saleId = String(one(params.saleId) ?? "").trim();

  const edgeUrl = saleId
    ? `https://dcmhqdckzhbuakvcyjit.supabase.co/functions/v1/public-receipt?sale_id=${encodeURIComponent(
        saleId
      )}`
    : "";

  useEffect(() => {
    if (!saleId || !edgeUrl) return;

    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.href = edgeUrl;
      return;
    }

    void Linking.openURL(edgeUrl);
  }, [saleId, edgeUrl]);

  if (!saleId) {
    return (
      <View style={{ flex: 1, padding: 24, justifyContent: "center" }}>
        <Text style={{ fontSize: 22, fontWeight: "900", color: "#111827" }}>
          Receipt Error
        </Text>
        <Text style={{ marginTop: 10, color: "#64748b", fontWeight: "700" }}>
          Missing receipt ID
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <ActivityIndicator />
      <Text style={{ marginTop: 10, fontWeight: "800" }}>Opening receipt...</Text>
    </View>
  );
}