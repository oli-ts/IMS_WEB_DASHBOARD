"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "../../../lib/supabase-browser";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";

export default function ManifestDetailClient({ manifestId }) {
  const sb = supabaseBrowser();
  const [items, setItems] = useState([]);

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
        .select("uid,name,photo_url,zone_id,bay_id,shelf_id")
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
      return {
        ...i,
        item_name: meta.name || null,
        photo_url: meta.photo_url || null,
        zone_label: zid ? zoneMap[zid] : undefined,
        bay_label: bid ? bayMap[bid] : undefined,
        shelf_label: sid ? shelfMap[sid] : undefined,
      };
    }));
  }

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifestId]);

  // Search inventory to add
  const [q, setQ] = useState("");
  const [inv, setInv] = useState([]);
  useEffect(() => {
    const run = async () => {
      if (!q?.trim()) { setInv([]); return; }
      let query = sb.from("inventory_union")
        .select("uid,name,classification,brand,model,photo_url,status")
        .ilike("name", `%${q}%`)
        .limit(25);
      if (/^[A-Z]{2,5}-/.test(q.trim().toUpperCase())) {
        query = sb.from("inventory_union")
          .select("uid,name,classification,brand,model,photo_url,status")
          .or(`uid.ilike.%${q}%,name.ilike.%${q}%`)
          .limit(25);
      }
      const { data } = await query;
      setInv(data || []);
    };
    const t = setTimeout(run, 250);
    return () => clearTimeout(t);
  }, [q, sb]);

  async function addItemToManifest(uid, qty = 1) {
    const n = Math.max(1, Number(qty) || 1);
    await sb.from("manifest_items").insert({ manifest_id: manifestId, item_uid: uid, qty_required: n, status: "pending" });
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
      <div className="text-xl font-semibold">Manifest</div>
      <div className="flex gap-3">
        <Stat label="Required" value={totals.req} />
        <Stat label="Checked Out" value={totals.out} />
        <Stat label="Checked In" value={totals.in} />
      </div>
      <div className="grid gap-2">
        {items.map((mi) => (
          <div
            key={mi.id}
            className="p-3 rounded-xl border bg-white dark:bg-neutral-900 dark:border-neutral-800 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg overflow-hidden bg-neutral-100 border">
                {mi.photo_url ? (
                  <img src={mi.photo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full grid place-items-center text-[10px] text-neutral-400">No image</div>
                )}
              </div>
              <div>
                <div className="font-medium">{mi.item_name || mi.item_uid}</div>
                <div className="text-sm text-neutral-500">Zone: {mi.zone_label || "-"} · Bay: {mi.bay_label || "-"} · Shelf: {mi.shelf_label || "-"}</div>
              </div>
            </div>
            <div className="text-sm flex items-center gap-2">
              <QtyEditor value={mi.qty_required} onChange={(v) => updateQty(mi.id, v)} />
              <Button size="sm" variant="outline" onClick={() => removeLine(mi.id)}>Remove</Button>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="font-semibold">Add Items</div>
        <Input className="h-9 max-w-md" placeholder="Search inventory by name or UID" value={q} onChange={e=>setQ(e.target.value)} />
        <div className="grid gap-2 max-h-[420px] overflow-auto">
          {inv.map(i => (
            <div key={i.uid} className="p-3 rounded-xl border bg-white dark:bg-neutral-900 dark:border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg overflow-hidden bg-neutral-100 border dark:bg-neutral-800 dark:border-neutral-700">
                  {i.photo_url ? (
                    <img src={i.photo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-[10px] text-neutral-400">No image</div>
                  )}
                </div>
                <div>
                  <div className="font-medium">{i.name}</div>
                  <div className="text-xs text-neutral-500">{i.uid} · {i.classification}</div>
                </div>
              </div>
              <AddInline uid={i.uid} onAdd={addItemToManifest} />
            </div>
          ))}
          {q && inv.length === 0 && <div className="text-sm text-neutral-500">No matches.</div>}
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

