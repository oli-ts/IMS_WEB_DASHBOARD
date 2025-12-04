"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase-browser";
import { Input } from "../../components/ui/input";
import { Card, CardContent } from "../../components/ui/card";
import { Select } from "../../components/ui/select";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useLiveStatuses } from "@/lib/hooks/useLiveStatuses";
import { getConditionMeta } from "@/lib/conditions";
import { LiveStatusBadge } from "@/components/live-status-badge";
import { QtyBadge } from "@/components/qty-badge";
import { toast } from "sonner";

export default function InventoryPage() {
  const sb = supabaseBrowser();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 60;
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
  const [groupRows, setGroupRows] = useState([]);
  const [isIpad, setIsIpad] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showConditionStyling, setShowConditionStyling] = useState(true);
  const [aliasMatches, setAliasMatches] = useState([]);
  const [debouncedQ, setDebouncedQ] = useState("");
  const CACHE_KEYS = {
    items: "inventory_items_v1",
    warehouses: "inventory_warehouses_v1",
    locations: "inventory_locations_v1",
  };
  const [loadingItems, setLoadingItems] = useState(false);
  const [prevItems, setPrevItems] = useState([]);
  const fetchRef = useRef(0);

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
    const cachedWarehouses = readCache(CACHE_KEYS.warehouses);
    if (cachedWarehouses?.data) setWarehouses(cachedWarehouses.data);

    const cachedLocations = readCache(CACHE_KEYS.locations);
    if (cachedLocations?.zones) setZoneMap(cachedLocations.zones);
    if (cachedLocations?.bays) setBayMap(cachedLocations.bays);
    if (cachedLocations?.shelfs) setShelfMap(cachedLocations.shelfs);
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent || "";
    const touchMac = /Macintosh/.test(ua) && typeof document !== "undefined" && "ontouchend" in document;
    const ipadDetected = /iPad/.test(ua) || touchMac;
    setIsIpad(ipadDetected);
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
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    // Reset to first page when searching across all pages
    if (debouncedQ) setPage(1);
  }, [debouncedQ]);

  useEffect(() => {
    const abort = new AbortController();
    let cancelled = false;
    const fetchId = ++fetchRef.current;
    setLoadingItems(true);
    (async () => {
      try {
        const term = debouncedQ;
        const normalized = term.replace(/\s+/g, "");
        const spaced = `%${term.replace(/\s+/g, "%")}%`;
        const doSearch = Boolean(term);
        const baseSelect =
          "uid,name,brand,model,photo_url,classification,condition,notes,quantity_total,quantity_available,unit,zone_id,bay_id,shelf_id,status,created_at";
        const range = doSearch
          ? { start: 0, end: 499 }
          : { start: (page - 1) * PAGE_SIZE, end: page * PAGE_SIZE - 1 };
        const like = doSearch ? `%${term}%` : null;

        const fetchUnion = async () => {
          let query = sb.from("inventory_union").select(baseSelect);
          if (warehouse?.value) query = query.eq("warehouse_id", warehouse.value);
          if (doSearch && like) {
            const normLike = `%${normalized}%`;
            query = query.or(
              `uid.ilike.${like},name.ilike.${like},brand.ilike.${like},model.ilike.${like},notes.ilike.${like},uid.ilike.${normLike},name.ilike.${normLike},uid.ilike.${spaced},name.ilike.${spaced}`
            );
          }
          query = query.order("created_at", { ascending: false, nullsFirst: false }).range(range.start, range.end);
          const { data, error } = await query.abortSignal(abort.signal);
          if (error) throw error;
          return data || [];
        };

        const fetchMetals = async () => {
          let query = sb
            .from("metal_diamonds")
            .select("uid,name,brand,model,photo_url,classification,notes,quantity_total,quantity_available,unit,zone_id,bay_id,shelf_id,status,created_at");
          if (warehouse?.value) query = query.eq("warehouse_id", warehouse.value);
          if (doSearch && like) {
            const normLike = `%${normalized}%`;
            query = query.or(
              `uid.ilike.${like},name.ilike.${like},brand.ilike.${like},model.ilike.${like},notes.ilike.${like},uid.ilike.${normLike},name.ilike.${normLike},uid.ilike.${spaced},name.ilike.${spaced}`
            );
          }
          query = query.order("created_at", { ascending: false, nullsFirst: false }).range(range.start, range.end);
          const { data, error } = await query.abortSignal(abort.signal);
          if (error) throw error;
          return data || [];
        };

        const fetchKits = async () => {
          let query = sb
            .from("inventory_kits")
            .select("uid,name,photo_url,classification,notes,quantity_total,unit,zone_id,bay_id,shelf_id,status,created_at,warehouse_id");
          if (warehouse?.value) query = query.eq("warehouse_id", warehouse.value);
          if (doSearch && like) {
            const normLike = `%${normalized}%`;
            query = query.or(
              `uid.ilike.${like},name.ilike.${like},notes.ilike.${like},uid.ilike.${normLike},name.ilike.${normLike},uid.ilike.${spaced},name.ilike.${spaced}`
            );
          }
          query = query.order("created_at", { ascending: false, nullsFirst: false }).range(range.start, range.end);
          const { data, error } = await query.abortSignal(abort.signal);
          if (error) throw error;
          return data || [];
        };

        const [baseItems, metalRaw, kitRaw] = await Promise.all([fetchUnion(), fetchMetals(), fetchKits()]);

        let aliasRows = [];
        if (doSearch && aliasMatches.length) {
          const { data, error } = await sb
            .from("inventory_union")
            .select(baseSelect)
            .in("uid", aliasMatches)
            .abortSignal(abort.signal);
          if (error) throw error;
          aliasRows = data || [];
        }

        const mergedBase = [...baseItems, ...aliasRows];
        const seen = new Set(mergedBase.map((i) => i.uid));
        const normalizedMetal = (metalRaw || [])
          .filter((m) => m?.uid && !seen.has(m.uid))
          .map((m) => ({
            ...m,
            source_table: m.source_table || "metal_diamonds",
            classification: m.classification || "METAL_DIAMOND",
          }));
        for (const k of kitRaw || []) {
          if (!k?.uid || seen.has(k.uid)) continue;
          mergedBase.push({
            ...k,
            source_table: k.source_table || "inventory_kits",
            classification: k.classification || "KIT",
          });
          seen.add(k.uid);
        }

        const merged = [...mergedBase, ...normalizedMetal];
        if (!cancelled && fetchRef.current === fetchId) {
          setItems(merged);
          setPrevItems(merged);
        }
      } catch (err) {
        if (!abort.signal.aborted) {
          console.error("[inventory] fetch failed", err?.message || err);
          if (!cancelled && fetchRef.current === fetchId) {
            if (prevItems.length) {
              setItems(prevItems);
            }
            toast.error("Failed to load items. Showing previous list.");
          }
        }
      } finally {
        if (!cancelled && fetchRef.current === fetchId) setLoadingItems(false);
      }
    })();
    return () => {
      cancelled = true;
      abort.abort("inventory-page-change");
    };
  }, [warehouse, page, debouncedQ, aliasMatches]);

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
    if (!classVals.includes("KIT")) classVals.push("KIT");
    const statusVals = uniq((items || []).map((i) => (i.status || "").trim()).filter(Boolean)).sort((a, b) => a.localeCompare(b));

    setBrands([{ value: "", label: "None" }, ...brandVals.map((v) => ({ value: v, label: v }))]);
    const labelMap = { ACCESSORY: "Accessories (ACC)", METAL_DIAMOND: "Metal Diamonds (MD)", KIT: "Kits (KIT)" };
    setClassifications([{ value: "", label: "None" }, ...classVals.map((v) => ({ value: v, label: labelMap[v] || v }))]);
    setStatuses([{ value: "", label: "None" }, ...statusVals.map((v) => ({ value: v, label: v }))]);
  }, [items]);

  const itemsByUid = useMemo(() => Object.fromEntries(items.map((itm) => [itm.uid, itm])), [items]);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();
    if (!debouncedQ?.trim()) {
      setGroupRows([]);
      setAliasMatches([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const { data, error } = await sb.rpc("find_group_items", { search_text: debouncedQ }, { signal: controller.signal });
        if (error) throw error;
        if (!isActive) return;
        setGroupRows(data || []);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("[inventory] group search failed", err?.message || err);
        if (isActive) setGroupRows([]);
      }
    }, 200);
    return () => {
      isActive = false;
      controller.abort("group-search-cancel");
      clearTimeout(t);
    };
  }, [debouncedQ, sb]);

  useEffect(() => {
    let active = true;
    if (!debouncedQ?.trim()) {
      setAliasMatches([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const { data, error } = await sb
          .from("item_pseudonyms")
          .select("item_uid")
          .ilike("alias", `%${debouncedQ}%`)
          .limit(200);
        if (error) throw error;
        if (!active) return;
        const uids = Array.from(new Set((data || []).map((r) => r.item_uid).filter(Boolean)));
        setAliasMatches(uids);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn("[inventory] pseudonym search failed", err?.message || err);
        if (active) setAliasMatches([]);
      }
    }, 200);
    return () => {
      active = false;
      controller.abort("alias-search-cancel");
      clearTimeout(t);
    };
  }, [debouncedQ, sb]);

  const groupMetaByUid = useMemo(() => {
    const map = {};
    for (const row of groupRows || []) {
      if (!row?.item_uid) continue;
      map[row.item_uid] = {
        group_id: row.group_id,
        group_name: row.group_name,
      };
    }
    return map;
  }, [groupRows]);

  const filtered = useMemo(() => {
    const aliasMatchesSet = new Set(aliasMatches);
    const lower = debouncedQ?.toLowerCase() || "";
    const base = items.filter((i) => {
      const hay = (
        i.uid +
        " " +
        i.name +
        " " +
        (i.brand || "") +
        " " +
        (i.model || "") +
        " " +
        (i.notes || "")
      ).toLowerCase();
      if (q && !hay.includes(lower) && !aliasMatchesSet.has(i.uid)) return false;
      if (brand?.value && (i.brand || "") !== brand.value) return false;
      if (classification?.value && (i.classification || "") !== classification.value) return false;
      if (status?.value && (i.status || "") !== status.value) return false;
      return true;
    });
    if (!q?.trim() || !groupRows?.length) return base;
    const ordered = new Map();
    for (const item of base) {
      const meta = groupMetaByUid[item.uid];
      ordered.set(item.uid, meta ? { ...item, _groupMeta: meta } : item);
    }
    for (const row of groupRows) {
      const uid = row?.item_uid;
      if (!uid) continue;
      if (!itemsByUid[uid]) continue;
      const meta = { group_id: row.group_id, group_name: row.group_name };
      if (ordered.has(uid)) {
        const existing = ordered.get(uid);
        ordered.set(uid, { ...existing, _groupMeta: meta });
      } else {
        ordered.set(uid, { ...itemsByUid[uid], _groupMeta: meta });
      }
    }
    return Array.from(ordered.values());
  }, [items, brand, classification, status, q, groupRows, groupMetaByUid, itemsByUid, aliasMatches]);

  // Live statuses for filtered items
  const uids = useMemo(() => filtered.map((i) => i.uid), [filtered]);
  const { liveMap } = useLiveStatuses(uids);
  const filterFields = (
    <>
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
    </>
  );

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
        <Button
          variant={showConditionStyling ? "default" : "outline"}
          size="sm"
          onClick={() => setShowConditionStyling((v) => !v)}
        >
          {showConditionStyling ? "Condition On" : "Condition Off"}
        </Button>
        </div>
        {isIpad ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setFiltersOpen(true)}>
              Filters
            </Button>
            <Link href="/inventory/new">
              <Button>New Item</Button>
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-2 w-full justify-end">
            <div className="flex gap-2 items-flex w-full max-w-6xl justify-end">
              {filterFields}
            </div>
            <Link href="/inventory/new">
              <Button>New Item</Button>
            </Link>
          </div>
        )}
      </div>
      <div className="flex justify-end items-center gap-2 text-sm">
        <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))}>
          Prev Page
        </Button>
        <span>Page {page}</span>
        <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)}>
          Next Page
        </Button>
      </div>

      {isIpad && filtersOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFiltersOpen(false)} />
          <div className="relative z-10 w-full max-w-xl bg-white dark:bg-neutral-900 border rounded-xl shadow-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">Filters</div>
              <Button variant="outline" onClick={() => setFiltersOpen(false)}>
                Close
              </Button>
            </div>
            <div className="flex flex-col gap-3">{filterFields}</div>
          </div>
        </div>
      )}
      

      <Card>
        <CardContent>
          {loadingItems && items.length === 0 ? (
            <div className="text-sm text-neutral-500">Loading items…</div>
          ) : null}
          {view === "grid" && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((i) => {
              const meta = getConditionMeta(i.condition);
              const needsRepair = showConditionStyling && meta?.value === "broken";
              const needsMaintenance = showConditionStyling && meta?.value === "needs_service";
              const isGood = showConditionStyling && meta?.value === "good";
              const key = i.id ? `${i.source_table || "unknown"}:${i.id}` : `uid:${i.uid}`;
              const viewHref =
                (i.classification || "").toUpperCase() === "KIT"
                  ? `/inventory/kits/${encodeURIComponent(i.uid)}`
                  : `/inventory/${encodeURIComponent(i.uid)}`;
              const cardClass = needsRepair
                ? "border-red-200 bg-red-50 dark:bg-red-900/30 dark:border-red-600"
                : needsMaintenance
                  ? "border-amber-200 bg-amber-50 dark:bg-amber-900/30 dark:border-amber-500"
                  : isGood
                    ? "border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-600"
                : "bg-white dark:bg-neutral-900 dark:border-neutral-800";
              return (
              <div
                key={key}
                className={`p-3 rounded-xl border hover:shadow-sm grid grid-cols-2 gap-3 ${cardClass}`}
              >
                {/* image row */}
                <div className="grid grid-cols-1 gap-2 mb-3">
                  <div className="aspect-square rounded-xl overflow-hidden bg-neutral-100 border">
                    {i.photo_url ? (
                      <img
                        src={i.photo_url}
                        alt={`${i.name} photo`}
                        className="h-full w-full object-cover"
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
                  {i._groupMeta?.group_name ? (
                    <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      Group: {i._groupMeta.group_name}
                    </span>
                  ) : null}
                  {needsRepair ? (
                    <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Needs Repair
                    </span>
                  ) : needsMaintenance ? (
                    <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Needs Maintenance
                    </span>
                  ) : isGood ? (
                    <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Good
                    </span>
                  ) : null}
                </div>
                <div className="font-semibold">{i.name}</div>
                <div className="text-sm">UID: {i.uid}</div>
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
                  <Link href={viewHref}>
                    <Button size="sm" variant="outline">
                      View
                    </Button>
                  </Link>
                </div>
              </div>
              </div>
              );
            })}
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
                  {filtered.map((i) => {
                    const viewHref =
                      (i.classification || "").toUpperCase() === "KIT"
                        ? `/inventory/kits/${encodeURIComponent(i.uid)}`
                        : `/inventory/${encodeURIComponent(i.uid)}`;
                    return (
                      <tr
                        key={i.id ? `${i.source_table || "unknown"}:${i.id}` : `uid:${i.uid}`}
                        className={`border-b last:border-0 dark:border-neutral-800 ${(() => {
                          if (!showConditionStyling) return "";
                          const meta = getConditionMeta(i.condition);
                          if (meta?.value === "broken") return "bg-red-50 dark:bg-red-900/30";
                          if (meta?.value === "needs_service") return "bg-amber-50 dark:bg-amber-900/30";
                          if (meta?.value === "good") return "bg-green-50 dark:bg-green-900/20";
                          return "";
                        })()}`}
                      >
                      <td className="py-2 pr-3">
                        <div className="h-12 w-12 rounded-lg overflow-hidden bg-neutral-100 border">
                          {i.photo_url ? (
                            <img src={i.photo_url} alt={`${i.name} photo`} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full grid place-items-center text-[10px] text-neutral-400">No image</div>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-3 font-medium">
                        <div className="flex items-center gap-2">
                          <span>{i.name}</span>
                          {(() => {
                            const meta = getConditionMeta(i.condition);
                            if (!showConditionStyling) return null;
                            return meta?.value === "broken" ? (
                              <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                                Needs Repair
                              </span>
                            ) : meta?.value === "needs_service" ? (
                              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                                Needs Maintenance
                              </span>
                            ) : meta?.value === "good" ? (
                              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700">
                                Good
                              </span>
                            ) : null;
                          })()}
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-col gap-1">
                          <span>{i.classification}</span>
                          {i._groupMeta?.group_name ? (
                            <span className="inline-flex w-fit items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                              Group: {i._groupMeta.group_name}
                            </span>
                          ) : null}
                        </div>
                      </td>
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
                        <Link href={viewHref}>
                          <Button size="sm" variant="outline">View</Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
