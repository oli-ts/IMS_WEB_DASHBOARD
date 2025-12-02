import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

function json(status, payload) {
  return new NextResponse(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function normalizeBase(str) {
  return (str || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase() || "KIT";
}

async function ensureUid(sb, base) {
  const candidates = [base, `${base}-${Math.floor(Math.random() * 900 + 100)}`];
  for (const uid of candidates) {
    try {
      const { data, error } = await sb.from("inventory_union").select("uid").eq("uid", uid).limit(1);
      if (error) throw error;
      if (!data?.length) return uid;
    } catch (err) {
      console.warn("[kits/materialize] uid collision check failed, using base", err?.message || err);
      return uid;
    }
  }
  return `${base}-${Date.now().toString().slice(-4)}`;
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const kitId = body?.kitId;
    const qty = Math.max(1, Number(body?.quantity) || 1);
    if (!kitId) return json(400, { error: "kitId is required" });

    const sb = supabaseAdmin();
    const { data: kit, error: kitErr } = await sb
      .from("kit_details")
      .select("id,name,description")
      .eq("id", kitId)
      .maybeSingle();
    if (kitErr) throw kitErr;
    if (!kit) return json(404, { error: "Kit not found" });

    const baseUid = `KIT-${normalizeBase(kit.id || kitId)}`;
    const uid = await ensureUid(sb, baseUid);

    const kitIdNumber = Number(kit.id ?? kitId);
    const payload = {
      uid,
      kit_id: Number.isFinite(kitIdNumber) ? kitIdNumber : null,
      name: kit.name || `Kit ${kitId}`,
      description: kit.description || null,
      classification: "KIT",
      quantity_total: qty,
      unit: "kit",
    };

    const { data: inserted, error: insErr } = await sb
      .from("inventory_kits")
      .insert(payload)
      .select("uid")
      .maybeSingle();
    if (insErr) throw insErr;

    return json(200, { ok: true, uid: inserted?.uid || uid });
  } catch (err) {
    console.error("[kits/materialize] failed", err);
    return json(500, { error: err?.message || "Failed to create kit inventory item" });
  }
}
