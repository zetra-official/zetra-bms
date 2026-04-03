import { OrgProvider, useOrg } from "@/src/context/OrgContext";
import {
  applySupabaseSessionFromInitialUrl,
  applySupabaseSessionFromUrl,
  supabase,
} from "@/src/supabase/supabaseClient";
import { theme } from "@/src/ui/theme";
import { Stack, useRouter, useSegments } from "expo-router";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { StatusBar } from "expo-status-bar";

function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const segmentsRef = useRef<string[]>([]);
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  // ✅ Read org context here instead of doing duplicate RPC in AuthGate
  const { loading: orgLoading, orgs } = useOrg();

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    let alive = true;

    const isInAuth = (segs: string[]) => {
      const a = segs?.[0];
      const b = segs?.[1];
      return (
        a === "(auth)" ||
        a === "login" ||
        a === "register" ||
        a === "reset-password" ||
        (a === "(auth)" &&
          (b === "login" || b === "register" || b === "reset-password"))
      );
    };

    const isResetPasswordRoute = (segs: string[]) => {
      const a = segs?.[0];
      const b = segs?.[1];
      return a === "reset-password" || (a === "(auth)" && b === "reset-password");
    };

    const isOnboardingRoute = (segs: string[]) => {
      const a = segs?.[0];
      const b = segs?.[1];
      return (
        a === "(onboarding)" ||
        a === "business" ||
        a === "store" ||
        (a === "(onboarding)" && (b === "business" || b === "store"))
      );
    };

    const isEmailVerified = (user: any) =>
      !!(user?.email_confirmed_at ?? user?.confirmed_at);

    const routes = {
      login: Platform.OS === "web" ? "/login" : "/(auth)/login",
      resetPassword:
        Platform.OS === "web" ? "/reset-password" : "/(auth)/reset-password",
      onboarding: "/(onboarding)/business",
      home: "/(tabs)",
    };

    const boot = async () => {
      const initialResult = await applySupabaseSessionFromInitialUrl();

      if (!alive) return;

      const currentSegs = segmentsRef.current;
      const inAuth = isInAuth(currentSegs);
      const inResetPassword = isResetPasswordRoute(currentSegs);

      if (
        initialResult.handled &&
        String(initialResult.type ?? "").toLowerCase() === "recovery"
      ) {
        router.replace(routes.resetPassword as any);
        setReady(true);
        return;
      }

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (!alive) return;

      if (error) {
        setReady(true);
        return;
      }

      if (!session) {
        setHasSession(false);

        if (!inAuth) {
          router.replace(routes.login as any);
        }
        setReady(true);
        return;
      }

      // stay on reset-password screen when recovery session exists
      if (inResetPassword) {
        setReady(true);
        return;
      }

      const verified = isEmailVerified(session.user);

      if (!verified) {
        setHasSession(false);

        if (!inAuth) {
          router.replace(routes.login as any);
        }
        setReady(true);
        return;
      }

      setHasSession(true);

      // ✅ Do NOT call get_my_orgs here.
      // OrgContext is the single source of truth for org/store routing state.
      setReady(true);
    };

    void boot();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const currentSegs = segmentsRef.current;
        const inAuth = isInAuth(currentSegs);
        const inResetPassword = isResetPasswordRoute(currentSegs);

        if (event === "PASSWORD_RECOVERY") {
          router.replace(routes.resetPassword as any);
          return;
        }

        if (!session) {
          setHasSession(false);

          if (!inAuth) {
            router.replace(routes.login as any);
          }
          return;
        }

        if (inResetPassword) return;

        const verified = isEmailVerified(session.user);

        if (!verified) {
          setHasSession(false);

          if (!inAuth) {
            router.replace(routes.login as any);
          }
          return;
        }

        setHasSession(true);

        // ✅ No duplicate goAfterLogin RPC here.
        if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "USER_UPDATED") {
          const a = segmentsRef.current?.[0];
          if (a === "login" || a === "register" || a === "(auth)") {
            router.replace(routes.home as any);
          }
        }
      }
    );

    const urlSub = Linking.addEventListener("url", async ({ url }) => {
      const result = await applySupabaseSessionFromUrl(url);
      const authType = String(result.type ?? "").toLowerCase();

      if (authType === "recovery") {
        router.replace(routes.resetPassword as any);
      }

      if (!result.handled) return;
      if (!result.ok) return;
      if (authType === "recovery") return;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setHasSession(false);
        return;
      }

      const currentSegs = segmentsRef.current;
      const inResetPassword = isResetPasswordRoute(currentSegs);

      if (inResetPassword) return;

      const verified = isEmailVerified(session.user);

      if (!verified) {
        setHasSession(false);
        router.replace(routes.login as any);
        return;
      }

      setHasSession(true);
      router.replace(routes.home as any);
    });

    return () => {
      alive = false;
      authListener.subscription.unsubscribe();
      urlSub.remove();
    };
  }, [router]);

  // ✅ After auth is ready, routing between home/onboarding comes from OrgContext state
  useEffect(() => {
    if (!ready) return;
    if (hasSession !== true) return;

    const currentSegs = segmentsRef.current;

    const isInAuth = (segs: string[]) => {
      const a = segs?.[0];
      const b = segs?.[1];
      return (
        a === "(auth)" ||
        a === "login" ||
        a === "register" ||
        a === "reset-password" ||
        (a === "(auth)" &&
          (b === "login" || b === "register" || b === "reset-password"))
      );
    };

    const isResetPasswordRoute = (segs: string[]) => {
      const a = segs?.[0];
      const b = segs?.[1];
      return a === "reset-password" || (a === "(auth)" && b === "reset-password");
    };

    const isOnboardingRoute = (segs: string[]) => {
      const a = segs?.[0];
      const b = segs?.[1];
      return (
        a === "(onboarding)" ||
        a === "business" ||
        a === "store" ||
        (a === "(onboarding)" && (b === "business" || b === "store"))
      );
    };

    if (isResetPasswordRoute(currentSegs)) return;
    if (orgLoading) return;

    const inAuth = isInAuth(currentSegs);
    const inOnboarding = isOnboardingRoute(currentSegs);
    const hasOrg = Array.isArray(orgs) && orgs.length > 0;

    if (!hasOrg) {
      if (!inOnboarding) {
        router.replace("/(onboarding)/business" as any);
      }
      return;
    }

    if (inAuth || inOnboarding) {
      router.replace("/(tabs)" as any);
    }
  }, [ready, hasSession, orgLoading, orgs, router]);

  if (!ready || orgLoading || !fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <StatusBar style="light" backgroundColor={theme.colors.background} />
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" backgroundColor={theme.colors.background} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
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