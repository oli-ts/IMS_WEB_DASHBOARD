"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function AuditPage() {
  const sb = supabaseBrowser();
  const [zones, setZones] = useState([]);
  const [bays, setBays] = useState([]);
  const [shelfs, setShelfs] = useState([]);
  const [zone, setZone] = useState(null);
  const [bay, setBay] = useState(null);
  const [itemsByShelf, setItemsByShelf] = useState({});
  const [loading, setLoading] = useState(false);
  const [openShelfs, setOpenShelfs] = useState({});

  useEffect(() => {
    (async () => {
      const { data } = await sb.from("zones").select("id,name").order("name");
      setZones((data || []).map((z) => ({ value: z.id, label: z.name })));
    })();
  }, [sb]);

  useEffect(() => {
    if (!zone?.value) {
      setBays([]);
      setBay(null);
      setShelfs([]);
      setItemsByShelf({});
      return;
    }
    (async () => {
      const { data } = await sb.from("bays").select("id,label").eq("zone_id", zone.value).order("label");
      const opts = (data || []).map((b) => ({ value: b.id, label: b.label }));
      setBays(opts);
      if (opts.length) setBay(opts[0]);
    })();
  }, [zone, sb]);

  useEffect(() => {
    if (!zone?.value || !bay?.value) {
      setShelfs([]);
      setItemsByShelf({});
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const [{ data: shelfRows }, { data: inv }, { data: metals }] = await Promise.all([
          sb.from("shelfs").select("id,label").eq("bay_id", bay.value).order("label"),
          sb
            .from("inventory_union")
            .select("id,source_table,uid,name,photo_url,quantity_total,unit,shelf_id,classification")
            .eq("zone_id", zone.value)
            .eq("bay_id", bay.value)
            .limit(500),
          sb
            .from("metal_diamonds")
            .select("id,uid,name,photo_url,quantity_total,unit,shelf_id,classification")
            .eq("zone_id", zone.value)
            .eq("bay_id", bay.value)
            .limit(200),
        ]);
        const shelfOpts = (shelfRows || []).map((s) => ({ value: s.id, label: s.label }));
        setShelfs(shelfOpts);
        const merged = [...(inv || [])];
        for (const m of metals || []) {
          if (!m?.uid) continue;
          const idx = merged.findIndex((r) => r.uid === m.uid);
          if (idx >= 0) merged[idx] = { ...merged[idx], ...m };
          else merged.push({ ...m, classification: m.classification || "METAL_DIAMOND" });
        }
        const grouped = {};
        for (const itm of merged) {
          const key = itm.shelf_id || "none";
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(itm);
        }
        setItemsByShelf(grouped);
      } finally {
        setLoading(false);
      }
    })();
  }, [zone?.value, bay?.value, sb]);

  const shelfList = useMemo(() => {
    const base = shelfs.length ? shelfs : [];
    const hasUnassigned = (itemsByShelf["none"] || []).length > 0;
    return hasUnassigned ? [...base, { value: "none", label: "No Shelf" }] : base;
  }, [shelfs, itemsByShelf]);

  function updateLocalItem(uid, updater) {
    setItemsByShelf((prev) => {
      const next = {};
      for (const [key, arr] of Object.entries(prev)) {
        next[key] = arr.map((itm) => (itm.uid === uid ? updater(itm) : itm)).filter(Boolean);
      }
      return next;
    });
  }

  async function changeQty(itm, delta) {
    const current = Number(itm.quantity_total || 0);
    const nextQty = Math.max(0, current + delta);
    const clsKey = (itm.classification || "").toUpperCase();
    const table =
      (itm.source_table || "") ||
      ({
        ACCESSORY: "accessories",
        METAL_DIAMOND: "metal_diamonds",
        LIGHT_TOOL: "light_tooling",
        HEAVY_TOOL: "heavy_tooling",
        DEVICE: "devices",
        PPE: "ppe",
        CONSUMABLE_MATERIAL: "consumables_material",
        CONSUMABLE_EQUIPMENT: "consumable_equipment",
        SUNDRY: "sundries",
        WORKSHOP_TOOL: "workshop_tools",
        VEHICLE: "vehicles",
      }[clsKey] ||
        "");
    if (!table) {
      toast.error("Cannot update quantity for this item");
      return;
    }
    const match = itm.id ? { id: itm.id } : itm.uid ? { uid: itm.uid } : null;
    if (!match) {
      toast.error("Cannot update quantity for this item");
      return;
    }
    const tableName = table;
    try {
      const query = sb.from(tableName).update({ quantity_total: nextQty });
      if ("id" in match) query.eq("id", match.id);
      else if ("uid" in match) query.eq("uid", match.uid);
      const { error } = await query;
      if (error) throw error;
      updateLocalItem(itm.uid, (row) => ({ ...row, quantity_total: nextQty }));
    } catch (err) {
      console.error("[audit] qty update failed", err);
      toast.error("Failed to update quantity");
    }
  }

  async function deleteItem(itm) {
    const ok = typeof window === "undefined" ? true : window.confirm(`Delete ${itm.name || itm.uid}?`);
    if (!ok) return;
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(itm.uid)}`, { method: "DELETE" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Delete failed");
      updateLocalItem(itm.uid, () => null);
      toast.success("Item deleted");
    } catch (err) {
      console.error("[audit] delete failed", err);
      toast.error(err?.message || "Delete failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-neutral-500">Audit</div>
          <h1 className="text-2xl font-semibold">Zone / Bay Shelf Check</h1>
        </div>
      </div>

      <Card>
        <CardHeader>Select zone & bay</CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <Select
              items={zones}
              triggerLabel={zone?.label || "Select zone"}
              onSelect={(opt) => {
                setZone(opt);
                setBay(null);
              }}
            />
            <Select
              items={bays}
              triggerLabel={bay?.label || "Select bay"}
              onSelect={setBay}
            />
          </div>
          {loading && <div className="text-sm text-neutral-500">Loading shelf items…</div>}
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {shelfList.length === 0 ? (
          <div className="text-sm text-neutral-500">Pick a zone and bay to see shelves.</div>
        ) : (
          shelfList.map((shelf) => {
            const open = openShelfs[shelf.value] ?? true;
            const items = itemsByShelf[shelf.value] || [];
            return (
              <Card key={shelf.value} className="w-full max-w-screen-xxl overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div className="font-semibold">Shelf: {shelf.label}</div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setOpenShelfs((prev) => ({ ...prev, [shelf.value]: !open }))
                    }
                  >
                    {open ? "Hide" : "Show"}
                  </Button>
                </CardHeader>
                {open && (
                  <CardContent className="overflow-hidden">
                    {items.length === 0 ? (
                      <div className="text-sm text-neutral-500">No items on this shelf.</div>
                    ) : (
                      <div className="overflow-x-auto pb-2 scrollbar-ghost">
                        <div className="flex gap-3 min-h-[12rem]">
                          {items.map((itm) => (
                            <div
                              key={itm.uid}
                              className="w-48 min-w-[12rem] p-3 rounded-xl border bg-white dark:bg-neutral-900 dark:border-neutral-800 shrink-0"
                            >
                              <div className="h-24 rounded-lg overflow-hidden bg-neutral-100 border">
                                {itm.photo_url ? (
                                  <img src={itm.photo_url} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <div className="h-full w-full grid place-items-center text-[10px] text-neutral-400">
                                    No image
                                  </div>
                                )}
                              </div>
                              <div className="mt-2 font-medium text-sm truncate">{itm.name}</div>
                              <div className="text-xs text-neutral-500 truncate">{itm.uid}</div>
                              <div className="text-xs text-neutral-500 mt-1">
                                Qty: {typeof itm.quantity_total === "number" ? itm.quantity_total : "—"} {itm.unit || ""}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2 items-center">
                                <Button size="sm" variant="outline" onClick={() => changeQty(itm, -1)}>-1</Button>
                                <Button size="sm" variant="outline" onClick={() => changeQty(itm, 1)}>+1</Button>
                                <Link href={`/inventory/${encodeURIComponent(itm.uid)}?edit=1`} target="_blank">
                                  <Button size="sm" variant="secondary">Edit</Button>
                                </Link>
                                <Button size="sm" variant="destructive" onClick={() => deleteItem(itm)}>
                                  Delete
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
