import { supabase } from "@/src/supabase/client";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

type OrgRow = { id: string };

export default function GateScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function runGate() {
      try {
        setLoading(true);

        const { data: sessionRes, error: sessionErr } =
          await supabase.auth.getSession();
        if (sessionErr) throw sessionErr;

        const session = sessionRes.session;

        // 1) No session => login
        if (!session) {
          router.replace("/(auth)/login");
          return;
        }

        // 2) Session exists => DB truth check
        const { data: orgs, error: orgErr } = await supabase.rpc("get_my_orgs");
        if (orgErr) throw orgErr;

        const list = (orgs ?? []) as OrgRow[];

        // 3) No org => onboarding
        if (list.length === 0) {
          router.replace("/(onboarding)");
          return;
        }

        // 4) Has org => app
        router.replace("/(tabs)");
      } catch (e) {
        router.replace("/(auth)/login");
      } finally {
        if (alive) setLoading(false);
      }
    }

    runGate();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      runGate();
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