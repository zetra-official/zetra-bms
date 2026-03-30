// deno-lint-ignore-file no-import-prefix
// supabase/functions/delete-account/index.ts

import { createClient } from "jsr:@supabase/supabase-js@2";

type DeleteAccountBody = {
  current_password?: string;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS,
  });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: CORS_HEADERS,
    });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return json({ error: "Server environment is not configured correctly" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    let body: DeleteAccountBody = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const currentPassword = clean(body?.current_password);
    if (!currentPassword) {
      return json({ error: "current_password is required" }, 400);
    }

    // User-scoped client to identify the caller from bearer token
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: getUserError,
    } = await userClient.auth.getUser();

    if (getUserError || !user) {
      return json({ error: "Not authenticated" }, 401);
    }

    const userEmail = clean(user.email);
    if (!userEmail) {
      return json({ error: "This account has no email; delete flow is not supported" }, 400);
    }

    // Re-authenticate with email + current password
    const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { error: verifyError } = await verifyClient.auth.signInWithPassword({
      email: userEmail,
      password: currentPassword,
    });

    if (verifyError) {
      return json({ error: "Incorrect password" }, 401);
    }

    // Admin client for final delete
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Optional cleanup: profile row (best-effort)
    // Keep additive and non-blocking
    try {
      await adminClient.from("profiles").delete().eq("id", user.id);
    } catch {
      // ignore profile cleanup failure
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error("deleteUser failed:", deleteError);

      return json(
        {
          error:
            deleteError.message ||
            "Failed to delete account. Database cleanup rules may still be required.",
        },
        500
      );
    }

    return json({
      ok: true,
      message: "Account deleted successfully",
    });
  } catch (err) {
    console.error("delete-account fatal error:", err);
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return json({ error: message }, 500);
  }
});