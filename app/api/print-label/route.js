// app/api/print-label/route.js
import { NextResponse } from "next/server";

// IMPORTANT: server-side only (not exposed to client)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL; // fine to reuse
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // DO NOT expose on client!

export async function POST(req) {
  try {
    const { uid, zpl, dpmm = "12dpmm", size = "2x1.25" } = await req.json();

    if (!uid && !zpl) {
      return NextResponse.json({ error: "Provide uid or zpl" }, { status: 400 });
    }

    // Build ZPL if needed (uses your existing helper)
    let finalZpl = zpl;
    if (!finalZpl && uid) {
      // Lazy import to keep route cold-start small
      const { buildZplForItem } = await import("../../../lib/zpl.js");
      // Pull item from inventory to feed the template
      const { createClient } = await import("@supabase/supabase-js");
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

      const { data: itemRows, error: itemErr } = await admin
        .from("inventory_union")
        .select("*")
        .eq("uid", uid)
        .limit(1);

      if (itemErr) throw itemErr;
      const item = itemRows?.[0];
      if (!item) return NextResponse.json({ error: "Item not found for uid" }, { status: 404 });

      finalZpl = buildZplForItem({ ...item, uid });
      if (!finalZpl) return NextResponse.json({ error: "Failed to build ZPL" }, { status: 500 });
    }

    // Invoke the Edge Function that actually prints
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/print_label`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Auth with service role so the function can trust this call (and avoid anon limits)
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ uid, zpl: finalZpl, dpmm, size }),
    });

    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}));
      return NextResponse.json({ error: j.error || "Printer function failed" }, { status: 502 });
    }

    const j = await resp.json().catch(() => ({}));
    return NextResponse.json({ ok: true, job: j.job || null });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Print failed" }, { status: 500 });
  }
}
