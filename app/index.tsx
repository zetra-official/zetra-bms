import { supabase } from "@/src/supabase/supabaseClient";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";

type OrgRow = { id?: string; organization_id?: string };

export default function GateScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    const routes = {
      login: Platform.OS === "web" ? "/login" : "/(auth)/login",
      onboarding: "/(onboarding)/business",
      home: "/(tabs)",
    };

    async function runGate() {
      try {
        if (!alive) return;
        setLoading(true);

        const {
          data: { session },
          error: sessionErr,
        } = await supabase.auth.getSession();

        if (sessionErr) throw sessionErr;

        // 1) No session => login
        if (!session) {
          router.replace(routes.login as any);
          return;
        }

        // 2) Session exists => DB truth check
        const { data: orgs, error: orgErr } = await supabase.rpc("get_my_orgs");

        if (orgErr) {
          router.replace(routes.home as any);
          return;
        }

        const list = Array.isArray(orgs) ? ((orgs ?? []) as OrgRow[]) : [];

        // 3) No org => onboarding
        if (list.length === 0) {
          router.replace(routes.onboarding as any);
          return;
        }

        // 4) Has org => app
        router.replace(routes.home as any);
      } catch {
        router.replace(routes.login as any);
      } finally {
        if (alive) setLoading(false);
      }
    }

    void runGate();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void runGate();
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      {loading ? <ActivityIndicator /> : null}
    </View>
  );
}