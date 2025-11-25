import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";

function json(status, payload) {
  return new NextResponse(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req, { params }) {
  try {
    const manifestId = params?.id ? decodeURIComponent(params.id) : null;
    if (!manifestId) return json(400, { error: "manifestId required" });

    const sb = supabaseAdmin();

    const { data: mh, error: mhErr } = await sb
      .from("active_manifests")
      .select("id,status")
      .eq("id", manifestId)
      .maybeSingle();
    if (mhErr) return json(500, { error: mhErr.message || "Lookup failed" });
    if (!mh) return json(404, { error: "Manifest not found" });

    const status = (mh.status || "").toLowerCase();
    if (status === "active") {
      return json(400, { error: "Cannot close an active manifest" });
    }

    const { error: updErr } = await sb
      .from("active_manifests")
      .update({ status: "closed" })
      .eq("id", manifestId);
    if (updErr) return json(500, { error: updErr.message || "Failed to close manifest" });

    try {
      await sb.rpc("sync_manifest_item_status", { p_manifest: manifestId });
      await sb.rpc("write_item_assignment_quant_for_manifest", { p_manifest: manifestId });
    } catch (err) {
      // best-effort; don't block close
      console.warn("[manifest close] sync rpc skipped", err?.message || err);
    }

    return json(200, { ok: true });
  } catch (err) {
    console.error("[manifest close] unhandled", err);
    return json(500, { error: err?.message || "Server error" });
  }
}
