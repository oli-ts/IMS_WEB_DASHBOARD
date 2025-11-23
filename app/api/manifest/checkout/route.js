export async function POST(req) {
  const t0 = Date.now();
  try {
    // Parse
    const raw = await req.text();
    if (!raw) return j(400, { error: "Empty body" });
    let body; try { body = JSON.parse(raw); } catch { return j(400, { error: "Invalid JSON" }); }

    const { manifestId, lines, to } = body;

    // Validate
    const reasons = [];
    if (!manifestId) reasons.push("manifestId missing");
    if (!Array.isArray(lines)) reasons.push("lines not an array");
    const validLines = Array.isArray(lines) ? lines.filter(l => l?.item_uid && Number(l?.qty) > 0) : [];
    if (!validLines.length) reasons.push("no lines with qty > 0");
    if (!to || !["staging","van","job"].includes(to.type)) reasons.push("invalid 'to.type'");
    if (reasons.length) return j(400, { error: "Invalid payload", reasons });

    // Dedupe by UID
    const map = new Map();
    for (const { item_uid, qty } of validLines) {
      map.set(item_uid, (map.get(item_uid) || 0) + Number(qty));
    }
    const deduped = [...map.entries()].map(([item_uid, qty]) => ({ item_uid, qty }));

    // Admin client
    const { supabaseAdmin } = await import("../../../../lib/supabase-admin");
    const sb = supabaseAdmin();

    // Pull current totals for these UIDs
    const uids = deduped.map(d => d.item_uid);
    
    // Availability check for multi-qty items: allow allocations up to total quantity across manifests
    const { data: qtyRows, error: qtyErr } = await sb
      .from("inventory_union")
      .select("uid, quantity_total")
      .in("uid", uids);
    if (qtyErr) return j(500, { error: "Fetch item quantities failed", message: qtyErr.message });

    const totalByUid = Object.fromEntries((qtyRows || []).map((r) => [r.uid, Number(r.quantity_total || 0)]));

    const multiUids = (qtyRows || []).filter((r) => Number(r.quantity_total) > 1).map((r) => r.uid);
    if (multiUids.length) {
      const { data: allocations, error: cfErr } = await sb
        .from("item_active_allocations")
        .select("item_uid, manifest_id, van_id, job_id, qty_on_van")
        .in("item_uid", multiUids)
        .neq("manifest_id", manifestId);
      if (cfErr) return j(500, { error: "Active allocation check failed", message: cfErr.message });

      const allocatedByUid = {};
      for (const row of allocations || []) {
        const q = Number(row.qty_on_van ?? 1) || 1;
        allocatedByUid[row.item_uid] = (allocatedByUid[row.item_uid] || 0) + q;
      }

      const insufficient = [];
      for (const { item_uid, qty } of deduped) {
        if (!multiUids.includes(item_uid)) continue;
        const total = Number(totalByUid[item_uid] || 0);
        const allocatedElsewhere = Number(allocatedByUid[item_uid] || 0);
        const requested = Number(qty || 0);
        if (requested + allocatedElsewhere > total) {
          insufficient.push({
            item_uid,
            total,
            allocatedElsewhere,
            requested,
            available: Math.max(total - allocatedElsewhere, 0),
          });
        }
      }
      if (insufficient.length) {
        return j(409, {
          error: "Insufficient available quantity (already allocated on other active manifests)",
          insufficient,
        });
      }
    }
    const { data: totals, error: totErr } = await sb
      .from("manifest_item_totals")
      .select("item_uid, qty_required, qty_checked_out")
      .eq("manifest_id", manifestId)
      .in("item_uid", uids);
    if (totErr) return j(500, { error: "Fetch totals failed", message: totErr.message });

    const byUid = Object.fromEntries((totals || []).map(t => [t.item_uid, t]));

    const to_ref =
      to.type === "van" ? `van:${to.id || ""}` :
      to.type === "job" ? `job:${to.id || ""}` :
      `warehouse:${to.label || "STAGING-A"}`;

    let processed = 0;
    const inserts = [];

    for (const { item_uid, qty } of deduped) {
      const t = byUid[item_uid];
      if (!t) continue; // not on this manifest

      const remaining = Math.max(0, Number(t.qty_required) - Number(t.qty_checked_out));
      const add = Math.min(remaining, Number(qty));
      if (add <= 0) continue;

      inserts.push({
        action: "checkout",
        manifest_id: manifestId,
        item_uid,
        qty: add,
        from_ref: "warehouse:STAGING",
        to_ref
      });
      processed += 1;
    }

    if (inserts.length) {
      const { error: insErr } = await sb.from("tx_item_moves").insert(inserts);
      if (insErr) return j(500, { error: "Insert moves failed", message: insErr.message });
      // Optional: mark manifest staged after first successful checkout
      await sb.from("active_manifests").update({ status: "staged" }).eq("id", manifestId);

      // Update per-item DB status/assigned_to to mirror live status after checkout
      try {
        // Determine target status based on destination
        const statusVal = to.type === "job"
          ? "on_job"
          : (to.type === "van" ? "on_van" : "in_staging");
        const updatedUids = [...new Set(inserts.map(i => i.item_uid))];

        // Fetch concrete table + id for each uid
        const { data: invRows, error: invErr } = await sb
          .from("inventory_union")
          .select("uid, source_table, id")
          .in("uid", updatedUids);
        if (invErr) throw invErr;

        // Group by source_table for bulk updates
        const byTable = new Map();
        for (const r of (invRows || [])) {
          if (!byTable.has(r.source_table)) byTable.set(r.source_table, []);
          byTable.get(r.source_table).push(r.id);
        }

        const assigned_to = to_ref; // store explicit ref e.g. van:uuid, job:uuid, warehouse:LABEL
        for (const [table, ids] of byTable.entries()) {
          // Some tables might not have these columns; ignore errors to avoid failing checkout
          await sb.from(table).update({ status: statusVal, assigned_to }).in("id", ids);
        }
      } catch (e) {
        console.warn("[checkout] status sync skipped:", e?.message || e);
      }
    }
    await sb.rpc('sync_manifest_item_status', { p_manifest: manifestId });
    await sb.rpc('write_item_assignment_quant_for_manifest', { p_manifest: manifestId });

    return j(200, { ok: true, processed, elapsedMs: Date.now() - t0 });
  } catch (e) {
    console.error("[checkout] unhandled", e);
    return j(500, { error: e.message || "Checkout failed" });
  }
}

function j(status, data){ return new Response(JSON.stringify(data), { status, headers:{ "content-type": "application/json" } }); }
