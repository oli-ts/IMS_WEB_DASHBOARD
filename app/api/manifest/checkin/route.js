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
    if (!to || to.type !== "staging") reasons.push("invalid 'to.type' (must be 'staging' for check-in)");
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

    // Pull current on-van totals for these UIDs
    const uids = deduped.map(d => d.item_uid);
    const { data: onvanRows, error: ovErr } = await sb
      .from("manifest_item_onvan")
      .select("item_uid, qty_on_van")
      .eq("manifest_id", manifestId)
      .in("item_uid", uids);
    if (ovErr) return j(500, { error: "Fetch on-van failed", message: ovErr.message });

    const byUid = Object.fromEntries((onvanRows || []).map(t => [t.item_uid, t]));

    const to_ref = `warehouse:${to.label || "STAGING-A"}`;

    let processed = 0;
    const inserts = [];

    for (const { item_uid, qty } of deduped) {
      const t = byUid[item_uid];
      if (!t) continue;

      const onvan = Math.max(0, Number(t.qty_on_van || 0));
      const add = Math.min(onvan, Number(qty));
      if (add <= 0) continue;

      inserts.push({
        action: "checkin",
        manifest_id: manifestId,
        item_uid,
        qty: add,
        from_ref: "van_or_job",
        to_ref
      });
      processed += 1;
    }

    if (inserts.length) {
      const { error: insErr } = await sb.from("tx_item_moves").insert(inserts);
      if (insErr) return j(500, { error: "Insert moves failed", message: insErr.message });
      // Mirror live status: items checked in to staging remain in staging until explicitly put away
      try {
        const updatedUids = [...new Set(inserts.map(i => i.item_uid))];
        const { data: invRows, error: invErr } = await sb
          .from("inventory_union")
          .select("uid, source_table, id")
          .in("uid", updatedUids);
        if (invErr) throw invErr;
        const byTable = new Map();
        for (const r of (invRows || [])) {
          if (!byTable.has(r.source_table)) byTable.set(r.source_table, []);
          byTable.get(r.source_table).push(r.id);
        }
        const assigned_to = to_ref; // warehouse:STAGING-*
        for (const [table, ids] of byTable.entries()) {
          await sb.from(table).update({ status: "in_staging", assigned_to }).in("id", ids);
        }
      } catch (e) {
        console.warn("[checkin] status sync skipped:", e?.message || e);
      }
    }
    await sb.rpc('sync_manifest_item_status', { p_manifest: manifestId });
    await sb.rpc('write_item_assignment_quant_for_manifest', { p_manifest: manifestId });

    return j(200, { ok: true, processed, elapsedMs: Date.now() - t0 });
  } catch (e) {
    console.error("[checkin] unhandled", e);
    return j(500, { error: e.message || "Check-in failed" });
  }
}

function j(status, data){ return new Response(JSON.stringify(data), { status, headers:{ "content-type": "application/json" } }); }
