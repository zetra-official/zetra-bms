import { OrgProvider } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { theme } from "@/src/ui/theme";
import { Stack, useRouter, useSegments } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { StatusBar } from "expo-status-bar";

function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const segmentsRef = useRef<string[]>([]);
  const [ready, setReady] = useState(false);

  // keep latest segments available to auth callback (avoid stale closure)
  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    let alive = true;

    const isInAuth = (segs: string[]) => segs?.[0] === "(auth)";

    const boot = async () => {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (!alive) return;

      if (error) {
        setReady(true);
        return;
      }

      const inAuth = isInAuth(segmentsRef.current);

      // ✅ No session: only force-login if user is NOT already in auth group
      if (!session) {
        if (!inAuth) router.replace("/(auth)/login");
        setReady(true);
        return;
      }

      // ✅ Has session: if user is on auth screens, kick to tabs
      if (session && inAuth) {
        router.replace("/(tabs)");
      }

      setReady(true);
    };

    void boot();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const inAuth = isInAuth(segmentsRef.current);

      if (!session) {
        // ✅ DO NOT override auth routes (register/login) when session is null
        if (!inAuth) router.replace("/(auth)/login");
        return;
      }

      // session exists
      if (inAuth) router.replace("/(tabs)");
    });

    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [router]);

  if (!ready) return null;

  return (
    <>
      {/* ✅ Prevent white flash: force dark status bar + dark background */}
      <StatusBar style="light" backgroundColor={theme.colors.background} />

      <Stack
        screenOptions={{
          headerShown: false,

          // ✅ KEY FIX: stack scenes background is DARK (no more white flash)
          contentStyle: { backgroundColor: theme.colors.background },

          // ✅ Optional: smoother transition (reduces "flash feel")
          animation: Platform.OS === "android" ? "fade" : "default",
        }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <OrgProvider>
      <AuthGate />
    </OrgProvider>
  );
}