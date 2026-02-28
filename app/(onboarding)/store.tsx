import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";

import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { kv } from "@/src/storage/kv";

import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { Button } from "@/src/ui/Button";
import { UI } from "@/src/ui/theme";

function clean(s: any) {
  return String(s ?? "").trim();
}
function upper(s: any) {
  return clean(s).toUpperCase();
}

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
  const org = useOrg();

  const params = useLocalSearchParams<{
    businessName?: string;
    businessType?: string;
    timezone?: string;
  }>();

  const businessName = useMemo(() => clean(params.businessName), [params.businessName]);
  const timezone = useMemo(
    () => clean(params.timezone) || "Africa/Dar_es_Salaam",
    [params.timezone]
  );

  const [storeName, setStoreName] = useState("");
  const [loading, setLoading] = useState(false);

  const create = async () => {
    const orgName = clean(businessName);
    const firstStore = clean(storeName);
    const tz = clean(timezone) || "Africa/Dar_es_Salaam";

    if (!orgName) return Alert.alert("Missing", "Business name is missing.");
    if (!firstStore) return Alert.alert("Missing", "Store name is required.");

    // ✅ Must be authenticated (RLS + created_by)
    const { session, error: sessErr } = await ensureSession();
    if (sessErr) return Alert.alert("Imeshindikana", sessErr.message);
    if (!session) return Alert.alert("Imeshindikana", "Not authenticated");

    setLoading(true);

    try {
      // 1) create org + first store
      const { error } = await supabase.rpc("create_org_with_store", {
        p_org_name: orgName,
        p_first_store_name: firstStore,
      });

      if (error) {
        console.log("create_org_with_store error:", error);
        return Alert.alert("Imeshindikana", error.message);
      }

      // 2) refresh OrgContext (loads orgs/stores)
      await org.refresh();

      // 3) find orgId by name (DB stores UPPERCASE per katiba trigger)
      const { data: orgs, error: orgErr } = await supabase.rpc("get_my_orgs");
      if (orgErr) console.log("get_my_orgs error:", orgErr);

      const targetName = upper(orgName);
      const match = Array.isArray(orgs)
        ? (orgs as any[]).find((o) => upper(o?.organization_name) === targetName)
        : null;

      const orgId = clean(match?.organization_id);

      // 4) Set timezone using RPC (ONBOARDING-ONLY) + KV cache
      if (orgId) {
        try {
          const { data: ok, error: tzErr } = await supabase.rpc("set_org_timezone_once", {
            p_org_id: orgId,
            p_timezone: tz,
          });

          if (tzErr) {
            console.log("set_org_timezone_once error:", tzErr);
          } else {
            // ok can be true/false (false => already set)
            try {
              // keep your existing helper (if exists)
              await (kv as any)?.setOrgTimezone?.(orgId, tz);
            } catch {
              try {
                // fallback generic
                await (kv as any)?.setString?.(`zetra_org_timezone_v1_${orgId}`, tz);
              } catch {}
            }
          }
        } catch (e: any) {
          console.log("timezone set error:", e?.message || e);
        }
      }

      // ✅ go dashboard
      router.replace("/(tabs)");
    } finally {
      setLoading(false);
    }
  };

  const canCreate = Boolean(clean(storeName) && !loading);

  return (
    <Screen scroll>
      {/* Header */}
      <View style={{ marginTop: 6 }}>
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 26 }}>
          First Store Setup
        </Text>
        <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6, lineHeight: 18 }}>
          Tengeneza store ya kwanza ya biashara yako.
        </Text>
      </View>

      {/* Summary Card */}
      <View style={{ marginTop: 14 }}>
        <Card>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            Summary
          </Text>

          <View style={{ marginTop: 12 }}>
            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>Business</Text>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14, marginTop: 4 }}>
              {businessName || "—"}
            </Text>
          </View>

          <View style={{ marginTop: 12 }}>
            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>Timezone</Text>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14, marginTop: 4 }}>
              {timezone || "Africa/Dar_es_Salaam"}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.60)", fontWeight: "800", fontSize: 12, marginTop: 6, lineHeight: 16 }}>
              Timezone itawekwa kwenye DB mara moja tu (onboarding-only). Baadaye itakuwa locked.
            </Text>
          </View>
        </Card>
      </View>

      {/* Store Card */}
      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            Store name
          </Text>

          <View
            style={{
              marginTop: 10,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.04)",
              borderRadius: 18,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <TextInput
              value={storeName}
              onChangeText={setStoreName}
              placeholder="e.g. SMART MEN"
              placeholderTextColor="rgba(255,255,255,0.40)"
              autoCapitalize="words"
              style={{
                color: UI.text,
                fontWeight: "900",
                fontSize: 14,
                paddingVertical: 0,
              }}
            />
          </View>

          <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "800", fontSize: 12, marginTop: 10, lineHeight: 16 }}>
            Tip: Tumia jina fupi na rahisi (mfano: SMART MEN, JOFU SIDO, SOWETO BRANCH).
          </Text>
        </Card>
      </View>

      {/* Actions */}
      <View style={{ marginTop: 14 }}>
        <Button
          title={loading ? "Creating..." : "Create Business & Store"}
          onPress={create}
          disabled={!canCreate}
        />
      </View>

      <View style={{ marginTop: 10 }}>
        <Button
          title="Back"
          onPress={() => router.back()}
          disabled={loading}
          variant="secondary"
        />
      </View>
    </Screen>
  );
}