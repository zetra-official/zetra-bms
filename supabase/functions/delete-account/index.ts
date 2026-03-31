// deno-lint-ignore-file no-import-prefix
// supabase/functions/delete-account/index.ts

import { createClient } from "jsr:@supabase/supabase-js@2";

type DeleteAccountBody = {
  current_password?: string;
};

type MembershipRow = {
  id: string;
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

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

async function readJsonSafe(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
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
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing or invalid Authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return json({ error: "Empty bearer token" }, 401);
    }

    console.log("AUTH HEADER RECEIVED");
    console.log("TOKEN LENGTH:", token.length);

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

    // 1) Read current authenticated user via REST
    const meRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
    });

    const mePayload = await readJsonSafe(meRes);

    if (!meRes.ok || !mePayload?.id) {
      console.error("auth user lookup failed:", mePayload);
      return json(
        {
          error: mePayload?.message || mePayload?.error_description || mePayload?.error || "Not authenticated",
        },
        401
      );
    }

    const user = mePayload as { id: string; email?: string | null };
    const userEmail = clean(user.email);

    if (!userEmail) {
      return json(
        { error: "This account has no email; delete flow is not supported" },
        400
      );
    }

    // 2) Verify password via REST password grant
    const verifyRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: userEmail,
        password: currentPassword,
      }),
    });

    const verifyPayload = await readJsonSafe(verifyRes);

    if (!verifyRes.ok) {
      console.error("password verify failed:", verifyPayload);
      return json(
        {
          error:
            verifyPayload?.msg ||
            verifyPayload?.message ||
            verifyPayload?.error_description ||
            "Incorrect password",
        },
        401
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // STEP 1: read org memberships first
    let membershipIds: string[] = [];

    try {
      const { data: memberships, error: readMembershipErr } = await adminClient
        .from("org_memberships")
        .select("id")
        .eq("user_id", user.id);

      if (readMembershipErr) {
        console.error("cleanup read memberships failed:", readMembershipErr);
      } else {
        const rows = (memberships ?? []) as MembershipRow[];
        membershipIds = uniqueStrings(rows.map((x) => String(x.id)));
      }
    } catch (err) {
      console.error("cleanup memberships lookup crashed:", err);
    }

    // STEP 2: FORCE DELETE membership-store links FIRST (CRITICAL)
if (membershipIds.length > 0) {
  try {
    const { error } = await adminClient
      .from("org_membership_stores")
      .delete()
      .in("membership_id", membershipIds);

    if (error) {
      console.error("❌ BLOCKER: org_membership_stores delete failed:", error);
      return json(
        {
          error: "Failed to remove store links. Delete blocked by FK constraint.",
        },
        500
      );
    } else {
      console.log("✅ org_membership_stores cleaned");
    }
  } catch (err) {
    console.error("❌ CRASH: org_membership_stores:", err);
    return json({ error: "Failed cleaning store links" }, 500);
  }
}

// VERIFY memberships removed
const { data: checkMemberships } = await adminClient
  .from("org_memberships")
  .select("id")
  .eq("user_id", user.id);

if (checkMemberships && checkMemberships.length > 0) {
  return json({
    error: "Memberships still exist after delete. FK dependency remains.",
  }, 500);
}

    if (membershipIds.length > 0) {
      try {
        const { error } = await adminClient
          .from("org_membership_stores")
          .delete()
          .in("membership_id", membershipIds);

        if (error) {
          console.error("cleanup org_membership_stores failed:", error);
        }
      } catch (err) {
        console.error("cleanup org_membership_stores crashed:", err);
      }
    }

    // STEP 3: delete org memberships
    try {
      const { error } = await adminClient
        .from("org_memberships")
        .delete()
        .eq("user_id", user.id);

      if (error) {
        console.error("cleanup org_memberships failed:", error);
      }
    } catch (err) {
      console.error("cleanup org_memberships crashed:", err);
    }

    // STEP 4: best-effort cleanup for user-created stores
    try {
      const { error } = await adminClient
        .from("stores")
        .delete()
        .eq("created_by", user.id);

      if (error) {
        console.error("cleanup stores failed:", error);
      }
    } catch (err) {
      console.error("cleanup stores crashed:", err);
    }

    // STEP 5: best-effort cleanup for user-created organizations
    try {
      const { error } = await adminClient
        .from("organizations")
        .delete()
        .eq("created_by", user.id);

      if (error) {
        console.error("cleanup organizations failed:", error);
      }
    } catch (err) {
      console.error("cleanup organizations crashed:", err);
    }

    // STEP 6: delete profile row
    try {
      const { error } = await adminClient
        .from("profiles")
        .delete()
        .eq("id", user.id);

      if (error) {
        console.error("cleanup profiles failed:", error);
      }
    } catch (err) {
      console.error("cleanup profiles crashed:", err);
    }

    // STEP 7: final auth delete via REST admin endpoint
    const deleteRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
      method: "DELETE",
      headers: {
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
    });

    const deletePayload = await readJsonSafe(deleteRes);

    if (!deleteRes.ok) {
      console.error("deleteUser failed:", deletePayload);
      return json(
        {
          error:
            deletePayload?.msg ||
            deletePayload?.message ||
            deletePayload?.error_description ||
            deletePayload?.error ||
            "Failed to delete account. Some linked database records may still block deletion.",
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