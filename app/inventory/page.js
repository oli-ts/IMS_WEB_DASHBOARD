"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase-browser";
import { Input } from "../../components/ui/input";
import { Card, CardContent } from "../../components/ui/card";
import { Select } from "../../components/ui/select";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useLiveStatuses } from "@/lib/hooks/useLiveStatuses";
import { LiveStatusBadge } from "@/components/live-status-badge";
import { QtyBadge } from "@/components/qty-badge";

export default function InventoryPage() {
  const sb = supabaseBrowser();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [warehouse, setWarehouse] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [view, setView] = useState("grid");
  const [brand, setBrand] = useState(null);
  const [brands, setBrands] = useState([]);
  const [classification, setClassification] = useState(null);
  const [classifications, setClassifications] = useState([]);
  const [status, setStatus] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [zoneMap, setZoneMap] = useState({});
  const [bayMap, setBayMap] = useState({});
  const [shelfMap, setShelfMap] = useState({});
  const CACHE_KEYS = {
    items: "inventory_items_v1",
    warehouses: "inventory_warehouses_v1",
    locations: "inventory_locations_v1",
  };

  function readCache(key) {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeCache(key, value) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  // Hydrate from cache immediately for snappier loads
  useEffect(() => {
    const cachedItems = readCache(CACHE_KEYS.items);
    if (cachedItems?.data) setItems(cachedItems.data);

    const cachedWarehouses = readCache(CACHE_KEYS.warehouses);
    if (cachedWarehouses?.data) setWarehouses(cachedWarehouses.data);

    const cachedLocations = readCache(CACHE_KEYS.locations);
    if (cachedLocations?.zones) setZoneMap(cachedLocations.zones);
    if (cachedLocations?.bays) setBayMap(cachedLocations.bays);
    if (cachedLocations?.shelfs) setShelfMap(cachedLocations.shelfs);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: wh } = await sb
        .from("warehouse")
        .select("id, wh_number, name");
      const mapped = (wh || []).map((w) => ({
        value: w.id,
        label: `${w.wh_number || "WH"} — ${w.name}`,
      }));
      setWarehouses(mapped);
      writeCache(CACHE_KEYS.warehouses, { data: mapped, ts: Date.now() });
    })();
  }, []);

  useEffect(() => {
    (async () => {
      let query = sb.from("inventory_union").select("*").limit(500);
      if (warehouse?.value) query = query.eq("warehouse_id", warehouse.value);
      const { data } = await query;
      setItems(data || []);
      writeCache(CACHE_KEYS.items, { data: data || [], ts: Date.now(), warehouse: warehouse?.value || null });
    })();
  }, [warehouse]);

  // Load zones/bays/shelfs maps for display labels
  useEffect(() => {
    (async () => {
      const [z, b, s] = await Promise.all([
        sb.from("zones").select("id,name"),
        sb.from("bays").select("id,label"),
        sb.from("shelfs").select("id,label"),
      ]);
      const zMap = Object.fromEntries(((z.data || [])).map((r) => [r.id, r.name]));
      const bMap = Object.fromEntries(((b.data || [])).map((r) => [r.id, r.label]));
      const sMap = Object.fromEntries(((s.data || [])).map((r) => [r.id, r.label]));
      setZoneMap(zMap);
      setBayMap(bMap);
      setShelfMap(sMap);
      writeCache(CACHE_KEYS.locations, { zones: zMap, bays: bMap, shelfs: sMap, ts: Date.now() });
    })();
  }, []);

  // Build dropdown options from loaded items
  useEffect(() => {
    const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));
    const brandVals = uniq((items || []).map((i) => (i.brand || "").trim()).filter(Boolean)).sort((a, b) => a.localeCompare(b));
    const classVals = uniq((items || []).map((i) => (i.classification || "").trim()).filter(Boolean)).sort((a, b) => a.localeCompare(b));
    // Ensure Accessories shows even if no rows in first fetch
    if (!classVals.includes("ACCESSORY")) classVals.push("ACCESSORY");
    const statusVals = uniq((items || []).map((i) => (i.status || "").trim()).filter(Boolean)).sort((a, b) => a.localeCompare(b));

    setBrands([{ value: "", label: "None" }, ...brandVals.map((v) => ({ value: v, label: v }))]);
    const labelMap = { ACCESSORY: "Accessories (ACC)" };
    setClassifications([{ value: "", label: "None" }, ...classVals.map((v) => ({ value: v, label: labelMap[v] || v }))]);
    setStatuses([{ value: "", label: "None" }, ...statusVals.map((v) => ({ value: v, label: v }))]);
  }, [items]);

  const filtered = useMemo(
    () =>
      items.filter((i) => {
        const hay = (
          i.uid +
          " " +
          i.name +
          " " +
          (i.brand || "") +
          " " +
          (i.model || "")
        ).toLowerCase();
        if (q && !hay.includes(q.toLowerCase())) return false;
        if (brand?.value && (i.brand || "") !== brand.value) return false;
        if (classification?.value && (i.classification || "") !== classification.value) return false;
        if (status?.value && (i.status || "") !== status.value) return false;
        return true;
      }),
    [items, q, brand, classification, status]
  );

  // Live statuses for filtered items
  const uids = useMemo(() => filtered.map((i) => i.uid), [filtered]);
  const { liveMap } = useLiveStatuses(uids);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
        <Button
          variant={view === "grid" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("grid")}
        >
          Grid
        </Button>
        <Button
          variant={view === "list" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("list")}
        >
          List
        </Button>
        </div>
        <div className="flex items-center gap-2 w-full justify-end">
        <div className="flex gap-2 items-flex w-full max-w-6xl justify-end">
          <Input
            placeholder="Search UID, name, brand, model…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Select
            items={warehouses}
            triggerLabel={warehouse?.label || "All Warehouses"}
            onSelect={setWarehouse}
          />
          <Select
            items={brands}
            triggerLabel={brand?.label || "All Brands"}
            onSelect={setBrand}
          />
          <Select
            items={classifications}
            triggerLabel={classification?.label || "All Classifications"}
            onSelect={setClassification}
          />
          <Select
            items={statuses}
            triggerLabel={status?.label || "All Statuses"}
            onSelect={setStatus}
          />
        </div>
        <Link href="/inventory/new">
          <Button>New Item</Button>
        </Link>
        </div>
      </div>
      

      <Card>
        <CardContent>
          {view === "grid" && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((i) => (
              <div
                key={`${i.source_table}:${i.id}`}
                className="p-3 rounded-xl border hover:shadow-sm bg-white dark:bg-neutral-900 dark:border-neutral-800 grid grid-cols-2 gap-3 "
              >
                {/* image row */}
                <div className="grid grid-cols-1 gap-2 mb-3">
                  <div className="aspect-square rounded-xl overflow-hidden bg-neutral-100 border">
                    {i.photo_url ? (
                      <img
                        src={i.photo_url}
                        alt={`${i.name} photo`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-full w-full grid place-items-center text-xs text-neutral-400">
                        No image
                      </div>
                    )}
                  </div>
                </div>

                {/* text */}
                <div className=" grid-cols-2">
                <div className="text-sm text-neutral-500">
                  {i.classification}
                </div>
                <div className="font-semibold">{i.name}</div>
                <div className="text-sm">UID: {i.uid}</div>
                <div className="text-sm">
                  Loc: {i.location_last_seen || "—"}
                </div>
                <div className="text-sm">
                  {(() => {
                    const parts = [];
                    const z = zoneMap[i.zone_id];
                    const b = bayMap[i.bay_id];
                    const s = shelfMap[i.shelf_id];
                    if (z) parts.push(`Zone: ${z}`);
                    if (b) parts.push(`Bay: ${b}`);
                    if (s) parts.push(`Shelf: ${s}`);
                    return parts.length ? parts.join(" · ") : (i.location_last_seen || "-");
                  })()}
                </div>
                {(() => {
                  const cls = i.classification;
                  const allowed = ["sundries","ppe","consumables_material","consumable_equipment"]; 
                  const job = Number(liveMap[i.uid]?.total_on_jobs || 0);
                  const total = typeof i.quantity_total === "number" ? i.quantity_total : null;
                  const available = typeof total === "number" ? Math.max(total - job, 0) : null;
                  if (allowed.includes(cls)) {
                    return (
                      <div className="text-sm">
                        Qty available: <QtyBadge label="Available" value={available} unit={i.unit} tone="green" />
                      </div>
                    );
                  }
                  return (
                    <div className="text-sm">Status: <LiveStatusBadge status={liveMap[i.uid]?.status || i.status} /></div>
                  );
                })()}
                {(() => {
                  const job = Number(liveMap[i.uid]?.total_on_jobs || 0);
                  const total = typeof i.quantity_total === "number" ? i.quantity_total : null;
                  const inWh = typeof total === "number" ? Math.max(total - job, 0) : null;
                  return (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <QtyBadge label="On job" value={job} unit={i.unit} tone="amber" />
                      <QtyBadge label="In warehouse" value={inWh} unit={i.unit} tone="green" />
                    </div>
                  );
                })()}
                <div className="mt-2">
                  <Link href={`/inventory/${encodeURIComponent(i.uid)}`}>
                    <Button size="sm" variant="outline">
                      View
                    </Button>
                  </Link>
                </div>
              </div>
              </div>
            ))}
          </div>
          )}
          {view === "list" && (
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
                <thead className="text-left text-neutral-500">
                  <tr className="border-b dark:border-neutral-800">
                    <th className="py-2 pr-3">Image</th>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Classification</th>
                    <th className="py-2 pr-3">Brand</th>
                    <th className="py-2 pr-3">Quantity</th>
                    <th className="py-2 pr-3">Location</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((i) => (
                    <tr key={`${i.source_table}:${i.id}`} className="border-b last:border-0 dark:border-neutral-800">
                      <td className="py-2 pr-3">
                        <div className="h-12 w-12 rounded-lg overflow-hidden bg-neutral-100 border">
                          {i.photo_url ? (
                            <img src={i.photo_url} alt={`${i.name} photo`} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full grid place-items-center text-[10px] text-neutral-400">No image</div>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-3 font-medium">{i.name}</td>
                      <td className="py-2 pr-3">{i.classification}</td>
                      <td className="py-2 pr-3">{i.brand}</td>
                      <td className="py-2 pr-3">{i.quantity_total}</td>
                      <td className="py-2 pr-3">{(() => { const parts = []; const z = zoneMap[i.zone_id]; const b = bayMap[i.bay_id]; const s = shelfMap[i.shelf_id]; if (z) parts.push(`Zone: ${z}`); if (b) parts.push(`Bay: ${b}`); if (s) parts.push(`Shelf: ${s}`); return parts.length ? parts.join(" · ") : (i.location_last_seen || "-"); })()}</td>
                      <td className="py-2 pr-3">
                        {(() => {
                          const cls = i.classification;
                          const allowed = ["sundries","ppe","consumables_material","consumable_equipment"]; 
                          const job = Number(liveMap[i.uid]?.total_on_jobs || 0);
                          const total = typeof i.quantity_total === "number" ? i.quantity_total : null;
                          const available = typeof total === "number" ? Math.max(total - job, 0) : null;
                          const top = allowed.includes(cls)
                            ? (
                                <div className="flex flex-wrap gap-1.5">
                                  <QtyBadge label="Available" value={available} unit={i.unit} tone="green" />
                                </div>
                              )
                            : (
                                <LiveStatusBadge status={liveMap[i.uid]?.status || i.status} />
                              );
                          const inWh = typeof total === "number" ? Math.max(total - job, 0) : null;
                          return (
                            <div className="flex flex-col gap-1">
                              {top}
                              <div className="flex flex-wrap gap-1.5">
                                <QtyBadge label="On job" value={job} unit={i.unit} tone="amber" />
                                <QtyBadge label="In warehouse" value={inWh} unit={i.unit} tone="green" />
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-2 pr-3">
                        <Link href={`/inventory/${encodeURIComponent(i.uid)}`}>
                          <Button size="sm" variant="outline">View</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
