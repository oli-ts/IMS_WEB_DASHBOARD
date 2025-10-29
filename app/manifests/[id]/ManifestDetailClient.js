"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "../../../lib/supabase-browser";

export default function ManifestDetailClient({ manifestId }) {
  const sb = supabaseBrowser();
  const [items, setItems] = useState([]);

  useEffect(() => {
    (async () => {
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

      const uids = Array.from(
        new Set(itemsData.map((i) => i.item_uid).filter(Boolean))
      );

      let nameMap = {};
      if (uids.length) {
        const { data: inv } = await sb
          .from("inventory_union")
          .select("uid,name")
          .in("uid", uids);
        nameMap = Object.fromEntries((inv || []).map((r) => [r.uid, r.name]));
      }

      setItems(
        itemsData.map((i) => ({ ...i, item_name: nameMap[i.item_uid] || null }))
      );
    })();
  }, [manifestId, sb]);

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
            <div>
              <div className="font-medium">{mi.item_name || mi.item_uid}</div>
              <div className="text-sm text-neutral-500">
                Zone:{mi.zone_id?.slice(0, 4) || "—"} · Bay:
                {mi.bay_id?.slice(0, 4) || "—"} · Shelf:
                {mi.shelf_id?.slice(0, 4) || "—"}
              </div>
            </div>
            <div className="text-sm">
              {mi.qty_checked_out}/{mi.qty_required} out
            </div>
          </div>
        ))}
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
