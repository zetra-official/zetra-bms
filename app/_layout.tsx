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

function cleanBarcode(raw: any) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.replace(/\s+/g, "");
}

function isTypingIntoField(target: any) {
  if (!target) return false;
  const tag = String(target.tagName ?? "").toLowerCase();
  const editable = !!target.isContentEditable;
  return editable || tag === "input" || tag === "textarea" || tag === "select";
}

function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const segmentsRef = useRef<string[]>([]);
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  const webScanBufferRef = useRef("");
  const webScanLastAtRef = useRef(0);
  const webScanStartedAtRef = useRef(0);
  const webScanTimerRef = useRef<any>(null);

  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  // ✅ Read org context here instead of doing duplicate RPC in AuthGate
  const { loading: orgLoading, orgs } = useOrg();

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const resetWebScanBuffer = () => {
      webScanBufferRef.current = "";
      webScanLastAtRef.current = 0;
      webScanStartedAtRef.current = 0;

      if (webScanTimerRef.current) {
        clearTimeout(webScanTimerRef.current);
        webScanTimerRef.current = null;
      }
    };

    const flushWebScanBuffer = () => {
      const code = cleanBarcode(webScanBufferRef.current);
      const startedAt = webScanStartedAtRef.current;
      const endedAt = webScanLastAtRef.current;

      resetWebScanBuffer();

      if (!code || code.length < 4) return;

      const duration = startedAt > 0 && endedAt >= startedAt ? endedAt - startedAt : 0;

      // Fast scanner input only; avoid normal human typing
      if (duration > 900 && code.length < 8) return;

      const segs = segmentsRef.current ?? [];
      const a = segs?.[0];
      const b = segs?.[1];
      const c = segs?.[2];

      const isInAuth =
        a === "(auth)" ||
        a === "login" ||
        a === "register" ||
        a === "reset-password" ||
        (a === "(auth)" &&
          (b === "login" || b === "register" || b === "reset-password"));

      const isInOnboarding =
        a === "(onboarding)" ||
        a === "business" ||
        a === "store" ||
        (a === "(onboarding)" && (b === "business" || b === "store"));

      // IMPORTANT:
      // Products and Inventory own their scan behavior locally.
      // Root layout must NOT hijack scanner there.
      const isSalesRoute =
        a === "(tabs)" && b === "sales";

      const isProductsRoute =
        a === "(tabs)" && b === "products";

      const isInventoryRoute =
        (a === "(tabs)" && b === "stores" && c === "inventory") ||
        (a === "(tabs)" && b === "stores" && String(c ?? "").startsWith("inventory"));

      if (!ready) return;
      if (hasSession !== true) return;
      if (orgLoading) return;
      if (isInAuth || isInOnboarding) return;

      // Products + Inventory ziendelee kujisimamia zenyewe
      if (isProductsRoute || isInventoryRoute) return;

      // Ukiwa tayari ndani ya Sales, root layout isichukue scan.
      // Sales page yenyewe ndiyo ishughulikie local scan.
      if (isSalesRoute) return;

      router.replace({
        pathname: "/(tabs)/sales",
        params: {
          barcode: code,
          _ts: String(Date.now()),
        },
      } as any);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as any;
      if (isTypingIntoField(target)) return;

      const key = String(e.key ?? "");
      const now = Date.now();

      if (!key) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      if (
        key === "Shift" ||
        key === "Control" ||
        key === "Alt" ||
        key === "Meta" ||
        key === "Tab"
      ) {
        return;
      }

      // scanners nyingi hutuma Enter mwisho
      if (key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        flushWebScanBuffer();
        return;
      }

      if (key.length !== 1) return;

      e.stopPropagation();

      if (now - webScanLastAtRef.current > 120) {
        webScanBufferRef.current = "";
        webScanStartedAtRef.current = now;
      }

      if (!webScanStartedAtRef.current) {
        webScanStartedAtRef.current = now;
      }

      webScanBufferRef.current += key;
      webScanLastAtRef.current = now;

      if (webScanTimerRef.current) {
        clearTimeout(webScanTimerRef.current);
      }

      // fallback kwa scanner ambazo hazitumi Enter suffix
      webScanTimerRef.current = setTimeout(() => {
        flushWebScanBuffer();
      }, 180);
    };

    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      resetWebScanBuffer();
    };
  }, [router, ready, hasSession, orgLoading]);

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

  useEffect(() => {
    return () => {
      if (webScanTimerRef.current) {
        clearTimeout(webScanTimerRef.current);
        webScanTimerRef.current = null;
      }
    };
  }, []);

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