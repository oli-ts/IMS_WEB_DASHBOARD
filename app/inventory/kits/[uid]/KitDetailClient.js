"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LiveStatusBadge } from "@/components/live-status-badge";
import { QtyBadge } from "@/components/qty-badge";

function Row({ label, value }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <div className="w-36 text-neutral-500">{label}</div>
      <div className="flex-1 text-neutral-900 dark:text-neutral-100">{value ?? "-"}</div>
    </div>
  );
}

export default function KitDetailClient({ uid }) {
  const sb = supabaseBrowser();
  const [kit, setKit] = useState(null);
  const [kitTemplate, setKitTemplate] = useState(null);
  const [kitTemplateKey, setKitTemplateKey] = useState(null); // id or uuid used to join kit_items
  const [live, setLive] = useState(null);
  const [loadingKit, setLoadingKit] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [kitItems, setKitItems] = useState([]);
  const [kitItemsMeta, setKitItemsMeta] = useState({});
  const [kitItemsLoading, setKitItemsLoading] = useState(false);
  const [kitItemLocationMap, setKitItemLocationMap] = useState({ zoneMap: {}, bayMap: {}, shelfMap: {} });
  const [locationMeta, setLocationMeta] = useState({
    warehouse: null,
    zone: null,
    bay: null,
    shelf: null,
  });

  // Load kit inventory item + template + live status
  useEffect(() => {
    let active = true;
    setLoadingKit(true);
    setLoadError("");
    setKit(null);
    setLive(null);
    setKitTemplate(null);
    setKitTemplateKey(null);
    (async () => {
      try {
        const { data: kitRow, error } = await sb
          .from("inventory_kits")
          .select(
            "id,uid,kit_id,name,description,photo_url,classification,notes,quantity_total,quantity_reserved,quantity_available,unit,warehouse_id,zone_id,bay_id,shelf_id,status,created_at,updated_at"
          )
          .eq("uid", uid)
          .maybeSingle();
        if (error) throw error;
        if (!active) return;
        if (!kitRow) {
          setLoadError("Kit not found.");
          return;
        }
        setKit(kitRow);

        // Resolve template row/key using numeric kit_id linkage
        let templateRow = null;
        const templateKey = kitRow?.kit_id || kitRow?.kit_uuid || null;
        try {
          if (templateKey !== null) {
            const { data } = await sb
              .from("kit_details")
              .select("id,name,description")
              .eq("id", templateKey)
              .maybeSingle();
            templateRow = data || null;
          }
        } catch (err) {
          console.warn("[kit detail] template resolve failed", err?.message || err);
        }

        const { data: liveRow } = await sb
          .from("item_live_status")
          .select("status,total_on_jobs,assignments")
          .eq("item_uid", kitRow.uid)
          .maybeSingle();
        if (!active) return;
        setKitTemplate(templateRow || null);
        setKitTemplateKey(templateKey || null);
        setLive(liveRow || null);
      } catch (err) {
        console.warn("[kit detail] load failed", err);
        if (active) {
          setLoadError(err?.message || "Failed to load kit.");
          setKit(null);
          setLive(null);
          setKitTemplate(null);
        }
      } finally {
        if (active) setLoadingKit(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [uid, sb]);

  // Load kit contents
  useEffect(() => {
    const kitKey = kitTemplateKey ?? kit?.kit_id ?? null;
    if (!kitKey) {
      setKitItems([]);
      setKitItemsMeta({});
      return;
    }
    let active = true;
    setKitItemsLoading(true);
    (async () => {
      try {
        const { data, error } = await sb
          .from("kit_items")
          .select("item_uid,quantity")
          .eq("kit_id", kitKey);
        if (error) throw error;
        if (!active) return;
        const rows = data || [];
        setKitItems(rows);
        const uids = Array.from(new Set(rows.map((r) => r.item_uid).filter(Boolean)));
        if (!uids.length) {
          setKitItemsMeta({});
          return;
        }
        const metaMap = {};
        const { data: inv } = await sb
          .from("inventory_union")
          .select("uid,name,photo_url,classification,unit,quantity_total,zone_id,bay_id,shelf_id,location_last_seen")
          .in("uid", uids);
        for (const r of inv || []) {
          metaMap[r.uid] = r;
        }
        const missing = uids.filter((u) => !metaMap[u]);
        if (missing.length) {
          const { data: metals } = await sb
            .from("metal_diamonds")
            .select("uid,name,photo_url,classification,unit,quantity_total,zone_id,bay_id,shelf_id,location_last_seen")
            .in("uid", missing);
          for (const m of metals || []) {
            metaMap[m.uid] = {
              ...m,
              classification: m.classification || "METAL_DIAMOND",
            };
          }
        }
        if (active) setKitItemsMeta(metaMap);
      } catch (err) {
        console.warn("[kit detail] kit items fetch failed", err?.message || err);
        if (active) {
          setKitItems([]);
          setKitItemsMeta({});
          toast.error(err?.message || "Failed to load kit items.");
        }
      } finally {
        if (active) setKitItemsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [kit?.kit_id, kit?.kit_uuid, kit?.id, kitTemplateKey, sb]);

  // Build readable location map for kit items
  useEffect(() => {
    let active = true;
    const zones = new Set();
    const bays = new Set();
    const shelfs = new Set();
    Object.values(kitItemsMeta || {}).forEach((m) => {
      if (m.zone_id) zones.add(m.zone_id);
      if (m.bay_id) bays.add(m.bay_id);
      if (m.shelf_id) shelfs.add(m.shelf_id);
    });
    if (!zones.size && !bays.size && !shelfs.size) {
      setKitItemLocationMap({ zoneMap: {}, bayMap: {}, shelfMap: {} });
      return undefined;
    }
    (async () => {
      try {
        const [zoneRows, bayRows, shelfRows] = await Promise.all([
          zones.size
            ? sb.from("zones").select("id,name").in("id", Array.from(zones))
            : Promise.resolve({ data: [] }),
          bays.size
            ? sb.from("bays").select("id,label").in("id", Array.from(bays))
            : Promise.resolve({ data: [] }),
          shelfs.size
            ? sb.from("shelfs").select("id,label").in("id", Array.from(shelfs))
            : Promise.resolve({ data: [] }),
        ]);
        if (!active) return;
        const zoneMap = Object.fromEntries((zoneRows.data || []).map((z) => [z.id, z.name]));
        const bayMap = Object.fromEntries((bayRows.data || []).map((b) => [b.id, b.label]));
        const shelfMap = Object.fromEntries((shelfRows.data || []).map((s) => [s.id, s.label]));
        setKitItemLocationMap({ zoneMap, bayMap, shelfMap });
      } catch (err) {
        console.warn("[kit detail] location map failed", err?.message || err);
        if (active) setKitItemLocationMap({ zoneMap: {}, bayMap: {}, shelfMap: {} });
      }
    })();
    return () => {
      active = false;
    };
  }, [kitItemsMeta, sb]);

  // Human readable location metadata
  useEffect(() => {
    let active = true;
    (async () => {
      if (!kit) {
        if (active) {
          setLocationMeta({ warehouse: null, zone: null, bay: null, shelf: null });
        }
        return;
      }
      const next = { warehouse: null, zone: null, bay: null, shelf: null };
      try {
        if (kit.warehouse_id) {
          const { data } = await sb
            .from("warehouse")
            .select("wh_number,name")
            .eq("id", kit.warehouse_id)
            .maybeSingle();
          if (data) next.warehouse = [data.wh_number || "WH", data.name].filter(Boolean).join(" - ");
        }
        if (kit.zone_id) {
          const { data } = await sb.from("zones").select("name").eq("id", kit.zone_id).maybeSingle();
          if (data?.name) next.zone = data.name;
        }
        if (kit.bay_id) {
          const { data } = await sb.from("bays").select("label").eq("id", kit.bay_id).maybeSingle();
          if (data?.label) next.bay = data.label;
        }
        if (kit.shelf_id) {
          const { data } = await sb.from("shelfs").select("label").eq("id", kit.shelf_id).maybeSingle();
          if (data?.label) next.shelf = data.label;
        }
      } catch (err) {
        console.warn("[kit detail] location lookup failed", err?.message || err);
      } finally {
        if (active) setLocationMeta(next);
      }
    })();
    return () => {
      active = false;
    };
  }, [kit, sb]);

  const locationDisplay = useMemo(() => {
    const parts = [locationMeta.warehouse, locationMeta.zone, locationMeta.bay, locationMeta.shelf].filter(Boolean);
    return parts.length ? parts.join(" / ") : "Not set";
  }, [locationMeta]);

  const onJobQty = useMemo(() => Number(live?.total_on_jobs || 0), [live?.total_on_jobs]);
  const totalQty = typeof kit?.quantity_total === "number" ? kit.quantity_total : null;
  const inWarehouseQty = useMemo(() => {
    if (typeof totalQty !== "number") return null;
    return Math.max(totalQty - onJobQty, 0);
  }, [totalQty, onJobQty]);

  if (loadingKit) {
    return (
      <div className="p-6">
        <Card>
          <CardContent>
            <div className="text-sm text-neutral-500">Loading kit...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadError || !kit) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold mb-1">Unable to load kit</div>
              <div className="text-sm text-neutral-600">{loadError || "Kit not found."}</div>
            </div>
            <Link href="/inventory">
              <Button variant="outline">Back to inventory</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm text-neutral-500">Kit UID</div>
              <div className="text-2xl font-semibold">{kit.name || kitTemplate?.name || kit.uid}</div>
              <div className="text-sm text-neutral-600">UID: {kit.uid}</div>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/inventory">
                <Button variant="outline" size="sm">Back</Button>
              </Link>
              <Link href={`/inventory/${encodeURIComponent(uid)}`}>
                <Button size="sm" variant="ghost">Open legacy view</Button>
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <LiveStatusBadge status={live?.status || kit.status || "in_warehouse"} />
                <QtyBadge label="On job" value={onJobQty} unit={kit.unit || "kit"} tone="amber" />
                <QtyBadge label="In warehouse" value={inWarehouseQty} unit={kit.unit || "kit"} tone="green" />
              </div>
              <div className="text-sm text-neutral-700">
                {kit.description || kitTemplate?.description || kit.notes || "No description provided."}
              </div>
              <div className="space-y-2">
                <Row label="Quantity" value={totalQty !== null ? `${totalQty} ${kit.unit || "kit"}` : "-"} />
                <Row label="Status" value={kit.status || live?.status || "Unknown"} />
                <Row label="Warehouse / Zone / Bay / Shelf" value={locationDisplay} />
                <Row label="Kit template" value={kitTemplate?.name || (kit.kit_id ? `Kit ${kit.kit_id}` : "-")} />
                <Row label="Created" value={kit.created_at ? new Date(kit.created_at).toLocaleString() : "-"} />
                <Row label="Updated" value={kit.updated_at ? new Date(kit.updated_at).toLocaleString() : "-"} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="aspect-square rounded-2xl overflow-hidden bg-neutral-100 border">
                {kit.photo_url ? (
                  <img src={kit.photo_url} alt={`${kit.name || kit.uid} photo`} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full grid place-items-center text-sm text-neutral-400">No image</div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>Kit Contents</CardHeader>
        <CardContent>
          {kitItemsLoading ? (
            <div className="text-sm text-neutral-500">Loading kit items...</div>
          ) : kitItems.length === 0 ? (
            <div className="text-sm text-neutral-500">No items linked to this kit.</div>
          ) : (
            <div className="space-y-2">
              {kitItems.map((row, idx) => {
                const meta = kitItemsMeta[row.item_uid] || {};
                const zoneName = meta.zone_id ? kitItemLocationMap.zoneMap?.[meta.zone_id] : null;
                const bayName = meta.bay_id ? kitItemLocationMap.bayMap?.[meta.bay_id] : null;
                const shelfName = meta.shelf_id ? kitItemLocationMap.shelfMap?.[meta.shelf_id] : null;
                const locParts = [zoneName && `Zone: ${zoneName}`, bayName && `Bay: ${bayName}`, shelfName && `Shelf: ${shelfName}`]
                  .filter(Boolean);
                const locDisplay = locParts.length ? locParts.join(" · ") : (meta.location_last_seen || "-");
                return (
                  <div
                    key={`${row.item_uid}:${idx}`}
                    className="flex items-center justify-between border rounded-md px-3 py-2"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-12 w-12 rounded-md overflow-hidden bg-neutral-100 border shrink-0">
                        {meta.photo_url ? (
                          <img src={meta.photo_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full grid place-items-center text-[10px] text-neutral-400">No image</div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{meta.name || row.item_uid}</div>
                        <div className="text-xs text-neutral-500 truncate">
                          UID: {row.item_uid}{meta.classification ? ` · ${meta.classification}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-neutral-700">
                      <div className="text-left">
                        <div>Qty: {row.quantity}{meta.unit ? ` ${meta.unit}` : ""}</div>
                        <div className="text-xs text-neutral-500">Location: {locDisplay}</div>
                      </div>
                      <Link href={`/inventory/${encodeURIComponent(row.item_uid)}`} className="text-blue-600 hover:underline">
                        View
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
