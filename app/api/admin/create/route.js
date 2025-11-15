import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const ADMIN_ROLES = new Set(["admin", "sysadmin"]);

function json(status, payload) {
  return new NextResponse(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req) {
  try {
    const { email, name } = await req.json().catch(() => ({}));
    const trimmedEmail = (email || "").trim().toLowerCase();
    const trimmedName = (name || "").trim();

    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      return json(400, { error: "Valid email is required" });
    }
    if (!trimmedName) {
      return json(400, { error: "Name is required" });
    }

    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr) {
      return json(500, { error: userErr.message || "Session lookup failed" });
    }
    if (!user?.id) {
      return json(401, { error: "Unauthorized" });
    }

    const { data: staffRow, error: staffErr } = await supabase
      .from("staff")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();
    if (staffErr) {
      return json(500, { error: staffErr.message || "Staff lookup failed" });
    }
    if (!staffRow || !ADMIN_ROLES.has((staffRow.role || "").toLowerCase())) {
      return json(403, { error: "Admins only" });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return json(500, { error: "Server misconfigured: missing Supabase env vars" });
    }

    const fnUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/create_staff_user`;
    const fnRes = await fetch(fnUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({ email: trimmedEmail, name: trimmedName, role: "admin" }),
      cache: "no-store",
    }).catch((err) => {
      throw new Error(err?.message || "Edge function call failed");
    });

    const raw = await fnRes.text();
    let payload = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }

    if (!fnRes.ok || payload?.error) {
      const msg = payload?.error || payload?.message || raw || "Edge function failed";
      return json(fnRes.status || 500, { error: msg });
    }

    const staffData = payload?.staff ?? payload?.data ?? payload ?? null;
    return json(200, { ok: true, staff: staffData });
  } catch (err) {
    return json(500, { error: err?.message || "Server error" });
  }
}
