import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type EmailOtpType } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import "react-native-url-polyfill/auto";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const SUPABASE_ENV_READY = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!SUPABASE_ENV_READY) {
  console.warn(
    "[SUPABASE] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. " +
      "App will boot, but Supabase requests will fail until env vars are available in the build."
  );
}

export const AUTH_STORAGE_KEY = "zetra-bms-auth";

const FALLBACK_SUPABASE_URL = "https://placeholder.invalid";
const FALLBACK_SUPABASE_ANON_KEY = "placeholder-anon-key";

type SupabaseStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const webStorage: SupabaseStorageLike = {
  async getItem(key: string) {
    try {
      if (typeof window === "undefined" || !window.localStorage) return null;
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string) {
    try {
      if (typeof window === "undefined" || !window.localStorage) return;
      window.localStorage.setItem(key, value);
    } catch {}
  },
  async removeItem(key: string) {
    try {
      if (typeof window === "undefined" || !window.localStorage) return;
      window.localStorage.removeItem(key);
    } catch {}
  },
};

const authStorage: SupabaseStorageLike =
  Platform.OS === "web" ? webStorage : AsyncStorage;

export const supabase = createClient(
  SUPABASE_URL || FALLBACK_SUPABASE_URL,
  SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: authStorage,
      storageKey: AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  }
);

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseParamsFromChunk(chunk: string): Record<string, string> {
  const out: Record<string, string> = {};
  const src = clean(chunk).replace(/^[?#]/, "");

  if (!src) return out;

  for (const pair of src.split("&")) {
    const [rawKey, ...rest] = pair.split("=");
    const key = decodeSafe(clean(rawKey));
    const value = decodeSafe(rest.join("="));

    if (!key) continue;
    out[key] = value;
  }

  return out;
}

export async function clearCorruptSupabaseSession(): Promise<void> {
  try {
    await authStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {}
}

export async function hardSignOutSupabase(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {}

  await clearCorruptSupabaseSession();
}

export type ExtractedSupabaseAuthParams = {
  access_token: string;
  refresh_token: string;
  type: string;
  token_hash: string;
  code: string;
  error_code: string;
  error_description: string;
  expires_in?: number;
  raw: Record<string, string>;
};

export function extractSupabaseAuthParamsFromUrl(
  url: string | null | undefined
): ExtractedSupabaseAuthParams | null {
  const rawUrl = clean(url);
  if (!rawUrl) return null;

  const hashIndex = rawUrl.indexOf("#");
  const queryIndex = rawUrl.indexOf("?");

  const queryChunk =
    queryIndex >= 0
      ? rawUrl.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined)
      : "";

  const hashChunk = hashIndex >= 0 ? rawUrl.slice(hashIndex + 1) : "";

  const queryParams = parseParamsFromChunk(queryChunk);
  const hashParams = parseParamsFromChunk(hashChunk);

  const merged = {
    ...queryParams,
    ...hashParams,
  };

  const access_token = clean(merged.access_token);
  const refresh_token = clean(merged.refresh_token);
  const type = clean(merged.type);
  const token_hash = clean(merged.token_hash);
  const code = clean(merged.code);
  const error_code = clean(merged.error_code);
  const error_description = clean(merged.error_description);

  const expiresInRaw = clean(merged.expires_in);
  const expiresInNum = Number(expiresInRaw);

  return {
    access_token,
    refresh_token,
    type,
    token_hash,
    code,
    error_code,
    error_description,
    expires_in: Number.isFinite(expiresInNum) ? expiresInNum : undefined,
    raw: merged,
  };
}

export type ApplySupabaseSessionResult = {
  ok: boolean;
  handled: boolean;
  reason: string;
  type?: string | null;
};

function normalizeEmailOtpType(value: string): EmailOtpType | null {
  const v = clean(value).toLowerCase();

  if (
    v === "signup" ||
    v === "magiclink" ||
    v === "invite" ||
    v === "recovery" ||
    v === "email_change" ||
    v === "email"
  ) {
    return v as EmailOtpType;
  }

  return null;
}

export async function applySupabaseSessionFromUrl(
  url: string | null | undefined
): Promise<ApplySupabaseSessionResult> {
  const parsed = extractSupabaseAuthParamsFromUrl(url);

  if (!parsed) {
    return {
      ok: false,
      handled: false,
      reason: "NO_URL",
    };
  }

  const authType = clean(parsed.type).toLowerCase();
  const accessToken = clean(parsed.access_token);
  const refreshToken = clean(parsed.refresh_token);
  const tokenHash = clean(parsed.token_hash);
  const code = clean(parsed.code);
  const errorCode = clean(parsed.error_code);
  const errorDescription = clean(parsed.error_description);

  if (errorCode || errorDescription) {
    return {
      ok: false,
      handled: true,
      reason: errorDescription || errorCode || "AUTH_LINK_ERROR",
      type: authType || null,
    };
  }

  if (code) {
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        return {
          ok: false,
          handled: true,
          reason: clean(error.message) || "EXCHANGE_CODE_FAILED",
          type: authType || null,
        };
      }

      return {
        ok: true,
        handled: true,
        reason: "CODE_EXCHANGED",
        type: authType || null,
      };
    } catch (e: any) {
      return {
        ok: false,
        handled: true,
        reason: clean(e?.message) || "EXCHANGE_CODE_FAILED",
        type: authType || null,
      };
    }
  }

  if (tokenHash) {
    const otpType = normalizeEmailOtpType(authType);

    if (!otpType) {
      return {
        ok: false,
        handled: true,
        reason: "INVALID_TOKEN_HASH_TYPE",
        type: authType || null,
      };
    }

    try {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType,
      });

      if (error) {
        return {
          ok: false,
          handled: true,
          reason: clean(error.message) || "VERIFY_OTP_FAILED",
          type: authType || null,
        };
      }

      return {
        ok: true,
        handled: true,
        reason: "OTP_VERIFIED",
        type: authType || null,
      };
    } catch (e: any) {
      return {
        ok: false,
        handled: true,
        reason: clean(e?.message) || "VERIFY_OTP_FAILED",
        type: authType || null,
      };
    }
  }

  if (accessToken && refreshToken) {
    try {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        return {
          ok: false,
          handled: true,
          reason: clean(error.message) || "SET_SESSION_FAILED",
          type: authType || null,
        };
      }

      return {
        ok: true,
        handled: true,
        reason: "SESSION_SET",
        type: authType || null,
      };
    } catch (e: any) {
      return {
        ok: false,
        handled: true,
        reason: clean(e?.message) || "SET_SESSION_FAILED",
        type: authType || null,
      };
    }
  }

  return {
    ok: false,
    handled: false,
    reason: "NO_SUPPORTED_AUTH_PARAMS",
    type: authType || null,
  };
}

export async function applySupabaseSessionFromInitialUrl(): Promise<ApplySupabaseSessionResult> {
  try {
    const initialUrl = await Linking.getInitialURL();
    return await applySupabaseSessionFromUrl(initialUrl);
  } catch (e: any) {
    return {
      ok: false,
      handled: false,
      reason: clean(e?.message) || "INITIAL_URL_FAILED",
    };
  }
}