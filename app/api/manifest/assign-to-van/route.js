// app/api/manifest/assign-to-van/route.js
export async function POST(req) {
  try {
    const { supabaseAdmin } = await import("../../../../lib/supabase-admin");
    const sb = supabaseAdmin();

    const body = await req.json().catch(() => ({}));
    const { manifestId } = body || {};
    if (!manifestId) return j(400, { error: "manifestId required" });

    // 1) Load manifest header
    const { data: mh, error: mhErr } = await sb
      .from("active_manifests")
      .select("id, job_id, van_id, status")
      .eq("id", manifestId)
      .single();
    if (mhErr || !mh) return j(404, { error: "Manifest not found" });
    if (!mh.van_id)   return j(400, { error: "Manifest has no van linked" });

    // 2) Pull items on this manifest (we only need UIDs to inspect classes)
    const { data: mis, error: miErr } = await sb
      .from("manifest_items")
      .select("item_uid")
      .eq("manifest_id", manifestId);
    if (miErr) return j(500, { error: "Read manifest_items failed", message: miErr.message });

    const uids = [...new Set((mis || []).map(r => r.item_uid))];
    if (!uids.length) {
      // still allow activation; nothing to conflict
      return await activate(sb, mh);
    }

    // 3) Join to inventory_union to learn source_table per UID
    const { data: inv, error: invErr } = await sb
      .from("inventory_union")
      .select("uid, source_table")
      .in("uid", uids);
    if (invErr) return j(500, { error: "Read inventory failed", message: invErr.message });

    const singletonTables = new Set([
      "light_tooling","heavy_tooling","devices","workshop_tools","vehicles"
    ]);

    const singletonUids = (inv || [])
      .filter(i => singletonTables.has(i.source_table))
      .map(i => i.uid);

    if (singletonUids.length) {
      // 4) For singleton UIDs, check if they’re already allocated on another ACTIVE manifest
      const { data: conflicts, error: cfErr } = await sb
        .from("item_active_allocations")
        .select("item_uid, manifest_id, van_id, job_id, qty_on_van")
        .in("item_uid", singletonUids)
        .neq("manifest_id", manifestId); // conflict = allocated elsewhere

      if (cfErr) return j(500, { error: "Conflict check failed", message: cfErr.message });

      if ((conflicts || []).length) {
        // Block activation and report conflicts
        return j(409, {
          error: "Singleton item(s) already active on another manifest",
          conflicts
        });
      }
    }

    // 5) No conflicts → activate and set van.current_job_id
    return await activate(sb, mh);
  } catch (e) {
    console.error("[assign-to-van] unhandled", e);
    return j(500, { error: e.message || "Assign failed" });
  }
}

async function activate(sb, mh) {
  const [{ error: mErr }, { error: vErr }] = await Promise.all([
    sb.from("active_manifests").update({ status: "active" }).eq("id", mh.id),
    sb.from("vans").update({ current_job_id: mh.job_id }).eq("id", mh.van_id),
  ]);
  if (mErr) return j(500, { error: "Activate manifest failed", message: mErr.message });
  if (vErr) return j(500, { error: "Update van failed", message: vErr.message });
  await sb.rpc('sync_manifest_item_status', { p_manifest: mh.id });
  await sb.rpc('write_item_assignment_quant_for_manifest', { p_manifest: mh.id });
  return j(200, { ok: true });
}

function j(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
