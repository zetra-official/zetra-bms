// app/_layout.tsx
import { OrgProvider } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Stack, useRouter, useSegments } from "expo-router";
import React, { useEffect, useRef, useState } from "react";

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
        // if session check fails, we still allow auth screens to show
        // and avoid infinite redirects
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

    boot();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const inAuth = isInAuth(segmentsRef.current);

      if (!session) {
        // ✅ Critical fix: DO NOT override auth routes (register/login) when session is null
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
  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <OrgProvider>
      <AuthGate />
    </OrgProvider>
  );
}