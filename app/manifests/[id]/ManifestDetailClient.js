"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "../../../lib/supabase-browser";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { toast } from "sonner";

export default function ManifestDetailClient({ manifestId }) {
  const sb = supabaseBrowser();
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);

  async function addParentAndAccessoriesToManifest(sb, manifestId, parentUid, parentQty = 1) {
    const n = Math.max(1, Number(parentQty) || 1);
    await sb.from("manifest_items").insert({ manifest_id: manifestId, item_uid: parentUid, qty_required: n, status: "pending" });
    const { data: accs } = await sb
      .from("accessories")
      .select("uid,quantity_total")
      .eq("nested_parent_uid", parentUid);
    if (accs?.length) {
      const { data: existing } = await sb
        .from("manifest_items")
        .select("item_uid")
        .eq("manifest_id", manifestId);
      const existingSet = new Set((existing || []).map((r) => r.item_uid));
      const lines = accs
        .filter((a) => !existingSet.has(a.uid))
        .map((a) => ({ manifest_id: manifestId, item_uid: a.uid, qty_required: Math.max(1, Number(a.quantity_total || 0)), status: "pending" }));
      if (lines.length) await sb.from("manifest_items").insert(lines);
    }
  }

  async function loadItems() {
    const { data } = await sb
      .from("manifest_items")
      .select(
        "id,item_uid,qty_required,qty_checked_out,qty_checked_in,zone_id,bay_id,shelf_id,status"
      )
      .eq("manifest_id", manifestId)
      .order("zone_id", { ascending: true })
      .order("bay_id", { ascending: true })
      .order("shelf_id", { ascending: true });
    const itemsData = data || [];

    const uids = Array.from(new Set(itemsData.map(i => i.item_uid).filter(Boolean)));

    let metaMap = {};
    if (uids.length) {
      const { data: inv } = await sb
        .from("inventory_union")
        .select("uid,name,photo_url,zone_id,bay_id,shelf_id,quantity_total,quantity_available,unit,classification")
        .in("uid", uids);
      metaMap = Object.fromEntries((inv || []).map(r => [r.uid, r]));
    }

    const [z, b, s] = await Promise.all([
      sb.from("zones").select("id,name"),
      sb.from("bays").select("id,label"),
      sb.from("shelfs").select("id,label"),
    ]);
    const zoneMap = Object.fromEntries(((z.data || [])).map(r => [r.id, r.name]));
    const bayMap = Object.fromEntries(((b.data || [])).map(r => [r.id, r.label]));
    const shelfMap = Object.fromEntries(((s.data || [])).map(r => [r.id, r.label]));

    setItems(itemsData.map(i => {
      const meta = metaMap[i.item_uid] || {};
      const zid = i.zone_id || meta.zone_id;
      const bid = i.bay_id || meta.bay_id;
      const sid = i.shelf_id || meta.shelf_id;
      const qtyAvailRaw = typeof meta.quantity_available === "number" ? meta.quantity_available : null;
      const qtyTotalRaw = typeof meta.quantity_total === "number" ? meta.quantity_total : null;
      const available = qtyAvailRaw ?? qtyTotalRaw ?? null;
      const insufficient = available !== null && Number(i.qty_required || 0) > Number(available || 0);
      return {
        ...i,
        item_name: meta.name || null,
        photo_url: meta.photo_url || null,
        zone_label: zid ? zoneMap[zid] : undefined,
        bay_label: bid ? bayMap[bid] : undefined,
        shelf_label: sid ? shelfMap[sid] : undefined,
        available_qty: available,
        total_qty: qtyTotalRaw,
        unit: meta.unit || null,
        classification: meta.classification || null,
        insufficient,
      };
    }));
  }

  useEffect(() => {
    (async () => {
      // Load manifest header for title
      const { data: mh } = await sb
        .from("active_manifests")
        .select("id, jobs(name)")
        .eq("id", manifestId)
        .single();
      setMeta(mh || null);
    })();
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifestId]);

  // Search inventory to add
  const [q, setQ] = useState("");
  const [inv, setInv] = useState([]);
  const [kitResults, setKitResults] = useState([]);
  const [dupMap, setDupMap] = useState({});
  const [groupRows, setGroupRows] = useState([]);
  const [groupSearchResults, setGroupSearchResults] = useState([]);
  const groupMetaCache = useRef(new Map());
  useEffect(() => {
    const run = async () => {
      if (!q?.trim()) { setInv([]); setKitResults([]); setGroupSearchResults([]); return; }
      let itemQuery = sb.from("inventory_union")
        .select("uid,name,classification,brand,model,photo_url,status,quantity_total,quantity_available,unit")
        .ilike("name", `%${q}%`)
        .limit(25);
      let metalQuery = sb.from("metal_diamonds")
        .select("uid,name,classification,brand,model,photo_url,status,quantity_total,quantity_available,unit")
        .ilike("name", `%${q}%`)
        .limit(25);
      if (/^[A-Z]{2,5}-/.test(q.trim().toUpperCase())) {
        itemQuery = sb.from("inventory_union")
          .select("uid,name,classification,brand,model,photo_url,status,quantity_total,quantity_available,unit")
          .or(`uid.ilike.%${q}%,name.ilike.%${q}%`)
          .limit(25);
        metalQuery = sb.from("metal_diamonds")
          .select("uid,name,classification,brand,model,photo_url,status,quantity_total,quantity_available,unit")
          .or(`uid.ilike.%${q}%,name.ilike.%${q}%`)
          .limit(25);
      }
      const groupQuery = sb
        .from("item_groups")
        .select("id,name")
        .ilike("name", `%${q}%`)
        .limit(10);
      const [itemRes, metalRes, groupRes, kitsRes] = await Promise.all([
        itemQuery,
        metalQuery,
        groupQuery,
        fetch(`/api/kits/search?q=${encodeURIComponent(q)}`)
      ]);
      if (itemRes?.error) {
        console.error("Inventory search failed", itemRes.error);
      }
      if (metalRes?.error) {
        console.error("Metal search failed", metalRes.error);
      }
      const merged = [...(itemRes?.data || [])];
      for (const row of metalRes?.data || []) {
        if (!row?.uid) continue;
        const normalized = {
          ...row,
          classification: row.classification || "METAL_DIAMOND",
        };
        const existingIndex = merged.findIndex((r) => r.uid === normalized.uid);
        if (existingIndex >= 0) {
          merged[existingIndex] = { ...merged[existingIndex], ...normalized };
        } else {
          merged.push(normalized);
        }
      }
      setInv(merged);
      if (groupRes?.error) {
        console.error("Group search failed", groupRes.error);
      }
      setGroupSearchResults(groupRes?.data || []);
      if (kitsRes.ok) {
        const payload = await kitsRes.json().catch(() => ({}));
        setKitResults(payload?.data || []);
      } else {
        setKitResults([]);
      }
    };
    const t = setTimeout(run, 250);
    return () => clearTimeout(t);
  }, [q, sb]);

  // Detect duplicates for LT/HT items that are already part of other active manifests
  useEffect(() => {
    let isCancelled = false;
    (async () => {
      const watch = Array.from(
        new Set(
          (inv || [])
            .filter((i) => ["LIGHT_TOOL", "HEAVY_TOOL"].includes((i.classification || "").toUpperCase()))
            .map((i) => i.uid)
        )
      );
      if (!watch.length) {
        if (!isCancelled) setDupMap({});
        return;
      }
      try {
        const { data: dupeRows, error } = await sb
          .from("item_active_allocations")
          .select("item_uid, manifest_id, job_id, van_id, qty_on_van")
          .in("item_uid", watch)
          .neq("manifest_id", manifestId);
        if (error) throw error;
        const jobIds = Array.from(new Set((dupeRows || []).map((r) => r.job_id).filter(Boolean)));
        const vanIds = Array.from(new Set((dupeRows || []).map((r) => r.van_id).filter(Boolean)));
        const [jobRes, vanRes] = await Promise.all([
          jobIds.length ? sb.from("jobs").select("id,name").in("id", jobIds) : Promise.resolve({ data: [] }),
          vanIds.length ? sb.from("vans").select("id,reg_number").in("id", vanIds) : Promise.resolve({ data: [] }),
        ]);
        if (jobRes.error) throw jobRes.error;
        if (vanRes.error) throw vanRes.error;
        const jobMap = Object.fromEntries(((jobRes.data || [])).map((j) => [j.id, j.name]));
        const vanMap = Object.fromEntries(((vanRes.data || [])).map((v) => [v.id, v.reg_number]));
        const grouped = {};
        for (const row of dupeRows || []) {
          if (!grouped[row.item_uid]) grouped[row.item_uid] = [];
          grouped[row.item_uid].push({
            manifestId: row.manifest_id,
            jobName: row.job_id ? jobMap[row.job_id] : null,
            vanReg: row.van_id ? vanMap[row.van_id] : null,
            qty: row.qty_on_van ?? null,
          });
        }
        if (!isCancelled) setDupMap(grouped);
      } catch (err) {
        console.warn("[manifest detail] duplicate lookup failed", err?.message || err);
        if (!isCancelled) setDupMap({});
      }
    })();
    return () => {
      isCancelled = true;
    };
  }, [inv, sb, manifestId]);

  useEffect(() => {
    let active = true;
    if (!q?.trim()) {
      setGroupRows([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const { data, error } = await sb.rpc("find_group_items", { search_text: q });
        if (error) throw error;
        if (!active) return;
        setGroupRows(data || []);
      } catch (err) {
        console.error("[manifest] group lookup failed", err?.message || err);
        if (active) setGroupRows([]);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [q, sb]);

  useEffect(() => {
    for (const row of groupRows || []) {
      if (row?.item_uid && row.group_id) {
        groupMetaCache.current.set(row.item_uid, {
          group_id: row.group_id,
          group_name: row.group_name || null,
        });
      }
    }
  }, [groupRows]);

  const groupMetaByUid = useMemo(() => {
    const map = {};
    for (const row of groupRows || []) {
      if (!row?.item_uid) continue;
      map[row.item_uid] = {
        group_id: row.group_id,
        group_name: row.group_name || null,
      };
    }
    return map;
  }, [groupRows]);

  const existingUidSet = useMemo(() => new Set(items.map((i) => i.item_uid)), [items]);

  async function getGroupMeta(uid) {
    if (!uid) return null;
    if (groupMetaCache.current.has(uid)) return groupMetaCache.current.get(uid);
    try {
      const { data, error } = await sb
        .from("item_group_members")
        .select("group_id, item_groups(name)")
        .eq("item_uid", uid)
        .limit(1)
        .maybeSingle();
      if (error || !data?.group_id) return null;
      const meta = {
        group_id: data.group_id,
        group_name: data?.item_groups?.name || null,
      };
      groupMetaCache.current.set(uid, meta);
      return meta;
    } catch (err) {
      console.error("[manifest] group meta fetch failed", err?.message || err);
      return null;
    }
  }

  async function fetchStatuses(uids) {
    if (!uids?.length) return {};
    try {
      const map = {};
      const { data: inv } = await sb
        .from("inventory_union")
        .select("uid,status")
        .in("uid", uids);
      for (const row of inv || []) {
        map[row.uid] = row.status || null;
      }
      const missing = uids.filter((uid) => !map[uid]);
      if (missing.length) {
        const { data: metal } = await sb
          .from("metal_diamonds")
          .select("uid,status")
          .in("uid", missing);
        for (const row of metal || []) {
          map[row.uid] = row.status || null;
        }
      }
      return map;
    } catch (err) {
      console.error("[manifest] status lookup failed", err?.message || err);
      return {};
    }
  }

  async function getAvailableGroupUids(groupId) {
    if (!groupId) return [];
    try {
      const { data, error } = await sb.rpc("available_group_members", { group_id: groupId });
      if (error) throw error;
      const list = (data || []).map((row) => row?.item_uid).filter(Boolean);
      if (list.length) return list;
    } catch (err) {
      console.warn("[manifest] available_group_members rpc failed", err?.message || err);
    }
    try {
      const { data: members, error: memberErr } = await sb
        .from("item_group_members")
        .select("item_uid")
        .eq("group_id", groupId);
      if (memberErr) throw memberErr;
      const uids = (members || []).map((m) => m.item_uid).filter(Boolean);
      if (!uids.length) return [];
      const { data: allocations, error: allocErr } = await sb
        .from("item_active_allocations")
        .select("item_uid")
        .in("item_uid", uids);
      if (allocErr) throw allocErr;
      const unavailable = new Set((allocations || []).map((a) => a.item_uid));
      return uids.filter((uid) => !unavailable.has(uid));
    } catch (err) {
      console.warn("[manifest] group fallback failed", err?.message || err);
      return [];
    }
  }

  async function maybeAddGroupItems(baseUid) {
    const meta = await getGroupMeta(baseUid);
    if (!meta?.group_id) return;
    try {
      const existingSet = new Set(items.map((i) => i.item_uid));
      existingSet.add(baseUid);
      const candidates = await getAvailableGroupUids(meta.group_id);
      const extras = candidates.filter((uid) => uid && !existingSet.has(uid));
      if (!extras.length) return;
      const statusMap = await fetchStatuses(extras);
      const allowed = extras.filter((uid) => (statusMap[uid] || "").toLowerCase() !== "broken");
      const skipped = extras.length - allowed.length;
      if (!allowed.length) {
        if (skipped) toast.info("Skipped broken group items");
        return;
      }
      const lines = allowed.map((uid) => ({
        manifest_id: manifestId,
        item_uid: uid,
        qty_required: 1,
        status: "pending",
      }));
      const { error: insErr } = await sb.from("manifest_items").insert(lines);
      if (insErr) throw insErr;
      toast.success(`Added ${lines.length} grouped item${lines.length > 1 ? "s" : ""}`);
      if (skipped) toast.info("Skipped broken group items");
    } catch (err) {
      console.error("[manifest] grouped add failed", err?.message || err);
    }
  }

  async function addGroupPlaceholder(groupId, groupName) {
    if (!groupId) return;
    try {
      const pool = await getAvailableGroupUids(groupId);
      if (!pool.length) return toast.error(`No available items in ${groupName}`);
      const statusMap = await fetchStatuses(pool);
      const filtered = pool.filter(
        (uid) =>
          !existingUidSet.has(uid) &&
          (statusMap[uid] || "").toLowerCase() !== "broken"
      );
      if (!filtered.length) {
        toast.error(`No usable items in ${groupName}`);
        return;
      }
      const choice = filtered[Math.floor(Math.random() * filtered.length)];
      await addItemToManifest(choice, 1, { skipGroupCascade: true });
    } catch (err) {
      console.error("[manifest] add group placeholder failed", err?.message || err);
      toast.error(err?.message || "Failed to add group");
    }
  }

  async function addItemToManifest(uid, qty = 1, opts = {}) {
    const skipGroupCascade = Boolean(opts?.skipGroupCascade);
    const n = Math.max(1, Number(qty) || 1);
    if (existingUidSet.has(uid)) {
      const proceed = typeof window !== "undefined"
        ? window.confirm("This item is already on this manifest. Add another line?")
        : true;
      if (!proceed) {
        toast.info("Duplicate add canceled");
        return;
      }
    }
    // Determine if this is a parent class
    const { data: info } = await sb
      .from("inventory_union")
      .select("uid,classification")
      .eq("uid", uid)
      .limit(1);
    const cls = (info?.[0]?.classification || "").toUpperCase();
    const isParent = ["LIGHT_TOOL", "HEAVY_TOOL", "VEHICLE"].includes(cls);
    if (isParent) {
      await addParentAndAccessoriesToManifest(sb, manifestId, uid, n);
    } else {
      await sb.from("manifest_items").insert({ manifest_id: manifestId, item_uid: uid, qty_required: n, status: "pending" });
    }
    if (!skipGroupCascade) {
      await maybeAddGroupItems(uid);
    }
    await loadItems();
  }

  async function updateQty(lineId, qty) {
    const n = Math.max(0, Number(qty) || 0);
    await sb.from("manifest_items").update({ qty_required: n }).eq("id", lineId);
    await loadItems();
  }

  async function removeLine(lineId) {
    await sb.from("manifest_items").delete().eq("id", lineId);
    await loadItems();
  }

  async function addKitToManifest(kitId) {
    try {
      const { data, error } = await sb
        .from("kit_items")
        .select("item_uid,quantity")
        .eq("kit_id", kitId);
      if (error) throw error;
      for (const row of data || []) {
        await addItemToManifest(row.item_uid, row.quantity || 1, { skipGroupCascade: true });
      }
      toast.success("Kit added");
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to add kit");
    }
  }

  const totals = useMemo(
    () =>
      items.reduce(
        (acc, i) => {
          acc.req += Number(i.qty_required || 0);
          acc.out += Number(i.qty_checked_out || 0);
          acc.in += Number(i.qty_checked_in || 0);
          return acc;
        },
        { req: 0, out: 0, in: 0 }
      ),
    [items]
  );

  return (
    <div className="space-y-4">
      <div className="text-xl font-semibold">Manifest for: {meta?.jobs?.name || "-"}</div>
      <div className="flex gap-3">
        <Stat label="Required" value={totals.req} />
        <Stat label="Checked Out" value={totals.out} />
        <Stat label="Checked In" value={totals.in} />
      </div>
      <div className="grid gap-2">
        {items.map((mi) => {
          const available = typeof mi.available_qty === "number" ? mi.available_qty : null;
          const total = typeof mi.total_qty === "number" ? mi.total_qty : null;
          const unit = mi.unit || (available !== null || total !== null ? "pcs" : "");
          const unitLabel = unit ? ` ${unit}` : "";
          return (
            <div
              key={mi.id}
              className={`p-3 rounded-xl border flex items-center justify-between ${mi.insufficient ? "border-red-300 bg-red-50 dark:border-red-400 dark:bg-red-500/10" : "bg-white dark:bg-neutral-900 dark:border-neutral-800"}`}
            >
              <div className="flex items-center gap-3">
                <div className={`h-12 w-12 rounded-lg overflow-hidden border ${mi.insufficient ? "border-red-300 bg-red-100/70" : "bg-neutral-100"}`}>
                  {mi.photo_url ? (
                    <img src={mi.photo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-[10px] text-neutral-400">No image</div>
                  )}
                </div>
                <div>
                  <div className="font-medium">{mi.item_name || mi.item_uid}</div>
                  <div className="text-sm text-neutral-500">Zone: {mi.zone_label || "-"} · Bay: {mi.bay_label || "-"} · Shelf: {mi.shelf_label || "-"}</div>
                  {(available !== null || total !== null) && (
                    <div className={`text-xs mt-1 ${mi.insufficient ? "text-red-600" : "text-neutral-500"}`}>
                      Available: {available !== null ? available : "—"}{unitLabel}{total !== null ? ` / ${total}${unitLabel}` : ""}
                    </div>
                  )}
                  {mi.insufficient && (
                    <div className="text-xs text-red-600 mt-1">Required {mi.qty_required} exceeds available quantity.</div>
                  )}
                </div>
              </div>
              <div className="text-sm flex items-center gap-2">
                <QtyEditor value={mi.qty_required} onChange={(v) => updateQty(mi.id, v)} />
                <Button size="sm" variant="outline" onClick={() => removeLine(mi.id)}>Remove</Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        <div className="font-semibold">Add Items</div>
        <Input className="h-9 max-w-md" placeholder="Search inventory by name or UID" value={q} onChange={e=>setQ(e.target.value)} />
        <div className="grid gap-2 max-h-[420px] overflow-auto">
          {kitResults.map(k => (
            <div key={k.id} className="p-3 rounded-xl border bg-white dark:bg-neutral-900 dark:border-neutral-800 flex items-center justify-between">
              <div>
                <div className="font-medium">{k.name}</div>
                <div className="text-xs text-neutral-500">
                  Kit · {k.item_count || 0} items
                </div>
                {k.description ? (
                  <div className="text-xs text-neutral-500 mt-1">{k.description}</div>
                ) : null}
              </div>
              <Button size="sm" variant="outline" onClick={() => addKitToManifest(k.id)}>Add Kit</Button>
            </div>
          ))}
          {groupSearchResults.map((g) => (
            <div key={g.id} className="p-3 rounded-xl border bg-white dark:bg-neutral-900 dark:border-neutral-800 flex items-center justify-between">
              <div>
                <div className="font-medium">Any {g.name}</div>
                <div className="text-xs text-neutral-500">Pick a random available member of this group.</div>
              </div>
              <Button size="sm" onClick={() => addGroupPlaceholder(g.id, g.name)}>Add Any</Button>
            </div>
          ))}
          {inv.map(i => {
            const available = typeof i.quantity_available === "number" ? i.quantity_available : null;
            const total = typeof i.quantity_total === "number" ? i.quantity_total : null;
            const unit = i.unit || (available !== null || total !== null ? "pcs" : "");
            const unitLabel = unit ? ` ${unit}` : "";
            const insufficient = available !== null && available <= 0;
            const duplicates = dupMap[i.uid] || [];
            return (
              <div key={i.uid} className={`p-3 rounded-xl border flex items-center justify-between ${insufficient ? "border-red-300 bg-red-50 dark:border-red-400 dark:bg-red-500/10" : "bg-white dark:bg-neutral-900 dark:border-neutral-800"}`}>
                <div className="flex items-center gap-3">
                  <div className={`h-12 w-12 rounded-lg overflow-hidden border ${insufficient ? "border-red-300 bg-red-100/70 dark:border-red-400 dark:bg-red-400/20" : "bg-neutral-100 dark:bg-neutral-800 dark:border-neutral-700"}`}>
                    {i.photo_url ? (
                      <img src={i.photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full grid place-items-center text-[10px] text-neutral-400">No image</div>
                    )}
                  </div>
                <div>
                  <div className="font-medium">{i.name}</div>
                  <div className="text-xs text-neutral-500">{i.uid} · {i.classification}</div>
                  {groupMetaByUid[i.uid]?.group_name ? (
                    <div className="text-xs text-blue-600 mt-1">Group: {groupMetaByUid[i.uid].group_name}</div>
                  ) : null}
                  {(available !== null || total !== null) && (
                    <div className={`text-xs mt-1 ${insufficient ? "text-red-600" : "text-neutral-500"}`}>
                      Available: {available !== null ? available : "—"}{unitLabel}{total !== null ? ` / ${total}${unitLabel}` : ""}
                      </div>
                    )}
                    {duplicates.length > 0 && (
                      <div className="text-xs text-red-600 mt-1">
                        Also on manifest{duplicates.length > 1 ? "s" : ""}:{" "}
                        {duplicates.map((d, idx) => {
                          const metaBits = [];
                          if (d.jobName) metaBits.push(d.jobName);
                          if (d.vanReg) metaBits.push(d.vanReg);
                          return (
                            <span key={`${d.manifestId}-${idx}`}>
                              #{d.manifestId}{metaBits.length ? ` (${metaBits.join(" · ")})` : ""}
                              {idx < duplicates.length - 1 ? ", " : ""}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <AddInline uid={i.uid} onAdd={addItemToManifest} />
              </div>
            );
          })}
          {q && inv.length === 0 && kitResults.length === 0 && <div className="text-sm text-neutral-500">No matches.</div>}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl border dark:border-neutral-800 p-3">
      <div className="text-sm text-neutral-500">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function AddInline({ uid, onAdd }) {
  const [qty, setQty] = useState("1");
  return (
    <div className="flex items-center gap-2">
      <Input type="number" min="0" className="w-20 h-9" value={qty} onChange={e=>setQty(e.target.value)} />
      <Button size="sm" onClick={()=>onAdd(uid, qty)}>Add</Button>
    </div>
  );
}

function QtyEditor({ value, onChange }) {
  const [v, setV] = useState(String(value ?? 0));
  useEffect(()=>{ setV(String(value ?? 0)); }, [value]);
  return (
    <div className="flex items-center gap-2">
      <Input type="number" min="0" className="w-24 h-9" value={v} onChange={e=>setV(e.target.value)} onBlur={()=>onChange(v)} />
    </div>
  );
}
