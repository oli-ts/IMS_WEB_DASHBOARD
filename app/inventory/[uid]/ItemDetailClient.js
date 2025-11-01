// app/inventory/[uid]/ItemDetailClient.js
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../../../lib/supabase-browser";
import { Card, CardContent, CardHeader } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Select } from "../../../components/ui/select";
import { buildZplForItem } from "../../../lib/zpl";
import { LiveStatusBadge } from "@/components/live-status-badge";
import { QtyBadge } from "@/components/qty-badge";

export default function ItemDetailClient({ uid }) {
  const sb = supabaseBrowser();

  // core item + derived live status
  const [item, setItem] = useState(null);
  const [live, setLive] = useState(null); // { status, total_on_jobs, assignments: [{manifest_id, van_id, job_id, qty}, ...] }
  const [assignMeta, setAssignMeta] = useState({}); // manifest_id -> { job_name, van_reg }

  // movement history (tx_item_moves)
  const [moves, setMoves] = useState([]);
  const [ex, setEx] = useState([]);

  // label preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewSrc, setPreviewSrc] = useState("");
  const [zpl, setZpl] = useState("");
  const [previewSize, setPreviewSize] = useState("4x6");
  const [previewDpmm, setPreviewDpmm] = useState("8dpmm");
  const [previewZoom, setPreviewZoom] = useState(2);
  // accessories for parent items
  const [accessories, setAccessories] = useState([]);

  // edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [whList, setWhList] = useState([]);
  const [zoneList, setZoneList] = useState([]);
  const [bayList, setBayList] = useState([]);
  const [shelfList, setShelfList] = useState([]);
  const [efClassification, setEfClassification] = useState(null);
  const [efWarehouse, setEfWarehouse] = useState(null);
  const [efZone, setEfZone] = useState(null);
  const [efBay, setEfBay] = useState(null);
  const [efShelf, setEfShelf] = useState(null);
  const [efName, setEfName] = useState("");
  const [efBrand, setEfBrand] = useState("");
  const [efModel, setEfModel] = useState("");
  const [efSerial, setEfSerial] = useState("");
  const [efUnit, setEfUnit] = useState("pcs");
  const [efQty, setEfQty] = useState(0);
  const [efNotes, setEfNotes] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoAltFile, setPhotoAltFile] = useState(null);
  const [previewMain, setPreviewMain] = useState(null);
  const [previewAlt, setPreviewAlt] = useState(null);

  // classification options & constants
  const CLASS_OPTIONS = [
    { value: "light_tooling", label: "Light Tooling (LT)" },
    { value: "heavy_tooling", label: "Heavy Tooling (HT)" },
    { value: "devices", label: "Devices (DV)" },
    { value: "ppe", label: "PPE (PPE)" },
    { value: "consumables_material", label: "Consumables / Material (MAT)" },
    { value: "consumable_equipment", label: "Consumables / Equipment (CEQ)" },
    { value: "sundries", label: "Sundries (SUN)" },
    { value: "workshop_tools", label: "Workshop Tools (WT)" },
    { value: "vehicles", label: "Vehicles (VEH)" },
  ];
  const TABLE_CLASS_CONST = {
    light_tooling: "LIGHT_TOOL",
    heavy_tooling: "HEAVY_TOOL",
    devices: "DEVICE",
    ppe: "PPE",
    consumables_material: "CONSUMABLE_MATERIAL",
    consumable_equipment: "CONSUMABLE_EQUIPMENT",
    sundries: "SUNDRY",
    workshop_tools: "WORKSHOP_TOOL",
    vehicles: "VEHICLE",
  };
  const DB_TO_CLASS_VALUE = Object.fromEntries(
    Object.entries(TABLE_CLASS_CONST).map(([k, v]) => [v, k])
  );

  function toPreview(file, setter) {
    if (!file) return setter(null);
    const url = URL.createObjectURL(file);
    setter(url);
  }

  async function updatePreviewFromZpl(nextZpl, opts = {}) {
    setPreviewLoading(true);
    setPreviewError("");
    try {
      if (previewSrc) URL.revokeObjectURL(previewSrc);
      setPreviewSrc("");
    } catch {}
    try {
      const dpmm = opts.dpmm || previewDpmm;
      const size = opts.size || previewSize;
      const res = await fetch("/api/label-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ zpl: nextZpl || zpl, dpmm, size }),
      });
      if (!res.ok) throw new Error("Server preview failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPreviewSrc(url);
    } catch {
      try {
        const dpmm = (opts.dpmm || previewDpmm) || "12dpmm";
        const size = (opts.size || previewSize) || "2x1.25";
        const url = `https://api.labelary.com/v1/printers/${dpmm}/labels/${size}/0/`;
        const fd = new FormData();
        fd.append("file", new Blob([nextZpl || zpl], { type: "text/plain" }), "label.zpl");
        const res2 = await fetch(url, { method: "POST", headers: { Accept: "image/png" }, body: fd });
        if (!res2.ok) throw new Error();
        const blob2 = await res2.blob();
        const url2 = URL.createObjectURL(blob2);
        setPreviewSrc(url2);
        setPreviewError("");
      } catch {
        setPreviewError("Could not render PNG preview. Check network or ZPL.");
      }
    } finally {
      setPreviewLoading(false);
    }
  }

  // LOAD: item, live status, moves, exceptions, and manifest metadata for assignments
  useEffect(() => {
    (async () => {
      // 1) Core item info (from union view)
      const { data: items } = await sb
        .from("inventory_union")
        .select(
          "source_table,id,uid,classification,name,brand,model,serial_number,photo_url,alt_photo_url,is_container,nested_parent_uid,condition,warehouse_id,zone_id,bay_id,shelf_id,location_last_seen,verified,qr_payload,notes,quantity_total,quantity_reserved,quantity_available,unit,status,assigned_to,created_at,updated_at"
        )
        .eq("uid", uid)
        .limit(1);
      const itm = items?.[0] || null;
      setItem(itm);

      // Load accessories for this item if any
      if (itm?.uid) {
        const { data: acc } = await sb
          .from("accessories")
          .select("uid,name,brand,model,quantity_total,quantity_available,unit,photo_url")
          .eq("nested_parent_uid", itm.uid)
          .order("name");
        setAccessories(acc || []);
      } else {
        setAccessories([]);
      }

      // 2) Derived live status + assignments
      const { data: ls } = await sb
        .from("item_live_status")
        .select("status,total_on_jobs,assignments")
        .eq("item_uid", uid)
        .single();
      setLive(ls || null);

      // 3) If we have assignments, fetch manifest meta (job name & van reg) for pretty links
      if (ls?.assignments?.length) {
        const manifestIds = [...new Set(ls.assignments.map((a) => a.manifest_id))];
        const { data: meta } = await sb
          .from("active_manifests")
          .select("id, jobs(name), vans(reg_number)")
          .in("id", manifestIds);
        const map = Object.fromEntries(
          (meta || []).map((m) => [
            m.id,
            { job_name: m?.jobs?.name || null, van_reg: m?.vans?.reg_number || null },
          ])
        );
        setAssignMeta(map);
      } else {
        setAssignMeta({});
      }

      // 4) Movement history (tx_item_moves)
      const { data: mv } = await sb
        .from("tx_item_moves")
        .select("created_at, action, manifest_id, qty, from_ref, to_ref")
        .eq("item_uid", uid)
        .order("created_at", { ascending: false })
        .limit(100);
      setMoves(mv || []);

      // 5) Exceptions
      const { data: e } = await sb
        .from("exceptions")
        .select("id,type,notes,photo_url,created_at,manifest_id")
        .eq("item_uid", uid)
        .order("created_at", { ascending: false })
        .limit(25);
      setEx(e || []);
    })();
  }, [uid, sb]);

  // qty breakdown (derived)
  const qty = useMemo(() => {
    if (!item) return { total: null, available: null, reserved: null, unit: "pcs" };
    const total = item.quantity_total ?? null;
    const onJobs = live?.total_on_jobs ?? 0;
    const inWarehouse = typeof total === "number" ? Math.max(total - onJobs, 0) : null;
    return {
      total,
      onJobs,
      inWarehouse,
      reserved: item.quantity_reserved ?? null,
      available: item.quantity_available ?? null,
      unit: item.unit ?? "pcs",
    };
  }, [item, live]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-neutral-500">Item</div>
          <h1 className="text-2xl font-semibold">{item?.name || uid}</h1>
          <div className="text-sm text-neutral-600">UID: {uid}</div>
          {item?.source_table === "accessories" && item?.nested_parent_uid && (
            <div className="text-sm text-neutral-600 mt-1">
              Parent tool: <Link className="underline" href={`/inventory/${encodeURIComponent(item.nested_parent_uid)}`}>{item.nested_parent_uid}</Link>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Link href="/inventory">
            <Button variant="outline">Back to Inventory</Button>
          </Link>

          {item && (
            <Button
              variant="outline"
              onClick={async () => {
                // Initialize edit form from loaded item
                setEfName(item.name || "");
                setEfBrand(item.brand || "");
                setEfModel(item.model || "");
                setEfSerial(item.serial_number || "");
                setEfUnit(item.unit || "pcs");
                setEfQty(item.quantity_total ?? 0);
                setEfNotes(item.notes || "");
                setPhotoFile(null);
                setPhotoAltFile(null);
                setPreviewMain(item.photo_url || null);
                setPreviewAlt(item.alt_photo_url || null);

                // Warehouses → zones → bays → shelves chained selects
                const { data: wh } = await sb.from("warehouse").select("id, wh_number, name").order("wh_number");
                const whItems = (wh || []).map((w) => ({ value: w.id, label: `${w.wh_number || "WH"} — ${w.name}` }));
                setWhList(whItems);
                const foundWh = whItems.find((x) => x.value === item.warehouse_id) || null;
                setEfWarehouse(foundWh);

                if (foundWh?.value) {
                  const { data: zones } = await sb.from("zones").select("id,name").eq("warehouse_id", foundWh.value).order("name");
                  const zItems = (zones || []).map((z) => ({ value: z.id, label: z.name }));
                  setZoneList(zItems);
                  const foundZ = zItems.find((x) => x.value === item.zone_id) || null;
                  setEfZone(foundZ);

                  if (foundZ?.value) {
                    const { data: bays } = await sb.from("bays").select("id,label").eq("zone_id", foundZ.value).order("label");
                    const bItems = (bays || []).map((b) => ({ value: b.id, label: b.label }));
                    setBayList(bItems);
                    const foundB = bItems.find((x) => x.value === item.bay_id) || null;
                    setEfBay(foundB);

                    if (foundB?.value) {
                      const { data: shelves } = await sb.from("shelfs").select("id,label").eq("bay_id", foundB.value).order("label");
                      const sItems = (shelves || []).map((s) => ({ value: s.id, label: s.label }));
                      setShelfList(sItems);
                      const foundS = sItems.find((x) => x.value === item.shelf_id) || null;
                      setEfShelf(foundS);
                    } else {
                      setShelfList([]); setEfShelf(null);
                    }
                  } else {
                    setBayList([]); setEfBay(null); setShelfList([]); setEfShelf(null);
                  }
                } else {
                  setZoneList([]); setEfZone(null); setBayList([]); setEfBay(null); setShelfList([]); setEfShelf(null);
                }

                // Classification mirror (read-only)
                const classVal = DB_TO_CLASS_VALUE[item.classification] || null;
                const classOpt = CLASS_OPTIONS.find((o) => o.value === classVal) || null;
                setEfClassification(classOpt);

                setEditOpen(true);
              }}
            >
              Edit
            </Button>
          )}

          {/* Reprint label */}
          <Button
            variant="outline"
            onClick={async () => {
              if (!item) return;
              const z = buildZplForItem({ ...item, uid });
              const size = "2x1.25";
              const dpmm = "12dpmm";
              setPreviewSize(size);
              setPreviewDpmm(dpmm);
              setZpl(z);
              setPreviewError("");
              setPreviewSrc("");
              setPreviewOpen(true);
              setPreviewLoading(true);
              await updatePreviewFromZpl(z, { size, dpmm });
            }}
          >
            Reprint Label
          </Button>
        </div>
      </div>

      {/* Summary & Live status */}
      <Card>
        <CardHeader>Summary</CardHeader>
        <CardContent>
          {item ? (
            <>
              {/* image row */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="aspect-square rounded-2xl overflow-hidden bg-neutral-100 border w-64 h-64">
                  {item.photo_url ? (
                    <img src={item.photo_url} alt={`${item.name} photo`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-sm text-neutral-400">No image</div>
                  )}
                </div>
                <div className="aspect-square rounded-2xl overflow-hidden bg-neutral-100 border w-64 h-64">
                  {item.alt_photo_url ? (
                    <img src={item.alt_photo_url} alt={`${item.name} alt`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-sm text-neutral-400">No alt image</div>
                  )}
                </div>
              </div>

              {/* Allocations (requested snippet) */}
              <div className="mt-4">
                {Array.isArray(item?.assignments) && item.assignments.length > 0 ? (
                  item.assignments.map((a, i) => (
                    <div key={i} className="text-sm">
                      On <a className="underline" href={`/manifests/${a.manifest_id}`}>manifest</a>
                      {a.van_id && (<> · van <a className="underline" href={`/vans/${a.van_id}`}>{a.van_id}</a></>)}
                      {a.job_id && (<> · job {a.job_id}</>)}
                      {typeof a.qty === "number" && (<> · qty {a.qty}</>)}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-neutral-500">No active allocations.</div>
                )}
              </div>

              {/* Consumable qty badges */}
              {(() => {
                const cls = item.classification;
                const show = [
                  "sundries",
                  "ppe",
                  "consumables_material",
                  "consumable_equipment",
                ].includes(cls);
                if (!show) return null;
                const onJobs = Number(live?.total_on_jobs || 0);
                const total = typeof item.quantity_total === "number" ? item.quantity_total : null;
                const inWh = typeof total === "number" ? Math.max(total - onJobs, 0) : null;
                return (
                  <div className="flex flex-wrap gap-2 mb-2">
                    <QtyBadge label="On job" value={onJobs} unit={item.unit} tone="amber" />
                    <QtyBadge label="In warehouse" value={inWh} unit={item.unit} tone="green" />
                  </div>
                );
              })()}

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Row label="Classification" value={item.classification} />
                  <Row label="Brand / Model" value={[item.brand, item.model].filter(Boolean).join(" ") || "—"} />
                  <Row label="Serial" value={item.serial_number || "—"} />
                  {/* Live and DB-reported status */}
                  <Row label="Status (live)" value={<LiveStatusBadge status={live?.status || "in_warehouse"} />} />
                  {null}
                  <Row label="Assigned To (db)" value={fmtRef(item.assigned_to)} />
                  <Row label="Verified" value={item.verified ? "Yes" : "No"} />
                  <Row label="Location Last Seen" value={item.location_last_seen || "—"} />
                </div>
                <div className="space-y-1">
                  <Row label="Quantity (total)" value={fmtNum(qty.total)} />
                  {!["sundries","ppe","consumables_material","consumable_equipment"].includes(item.classification) && (
                    <>
                      <Row label="On job (live)" value={fmtNum(qty.onJobs)} />
                      <Row label="In warehouse (live)" value={fmtNum(qty.inWarehouse)} />
                    </>
                  )}
                  {"reserved" in qty && <Row label="Reserved (legacy)" value={fmtNum(qty.reserved)} />}
                  {"available" in qty && <Row label="Available (legacy)" value={fmtNum(qty.available)} />}
                  <Row label="Unit" value={qty.unit} />
                  <Row label="QR Payload" value={<code className="break-all">{item.qr_payload}</code>} />
                  <Row label="Notes" value={item.notes || "—"} />
                </div>
              </div>

              {/* Assignments list (links to manifest & van) */}
              <div className="mt-4">
                <div className="text-sm text-neutral-500 mb-1">Assignments (live)</div>
                {live?.assignments?.length ? (
                  <ul className="space-y-1">
                    {live.assignments.map((a) => {
                      const meta = assignMeta[a.manifest_id] || {};
                      return (
                        <li key={`${a.manifest_id}:${a.van_id || "no-van"}`} className="text-sm">
                          qty <b>{a.qty}</b> on{" "}
                          <Link className="underline" href={`/manifests/${a.manifest_id}`}>manifest</Link>
                          {meta.job_name ? <> (<span className="italic">{meta.job_name}</span>)</> : null}
                          {a.van_id && (
                            <>
                              {" "}· van{" "}
                              <Link className="underline" href={`/vans/${a.van_id}`}>
                                {meta.van_reg || a.van_id}
                              </Link>
                            </>
                          )}
                          {a.job_id ? <> · job {a.job_id}</> : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="text-sm text-neutral-500">Currently not allocated; in warehouse.</div>
                )}
              </div>
            </>
          ) : (
            <div className="text-sm text-neutral-500">Loading…</div>
          )}
        </CardContent>
      </Card>

      {/* Accessories list for parent tools */}
      {accessories.length > 0 && (
        <Card>
          <CardHeader>Accessories</CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {accessories.map((a) => (
                <div key={a.uid} className="p-3 rounded-2xl border bg-white dark:bg-neutral-900 dark:border-neutral-800 grid grid-cols-2 gap-3">
                  <div className="aspect-square rounded-xl overflow-hidden bg-neutral-100 border">
                    {a.photo_url ? (
                      <img src={a.photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full grid place-items-center text-xs text-neutral-400">No image</div>
                    )}
                  </div>
                  <div>
                    <div className="text-sm text-neutral-500">ACCESSORY</div>
                    <div className="font-semibold">{a.name}</div>
                    <div className="text-sm text-neutral-600">{[a.brand, a.model].filter(Boolean).join(" ")}</div>
                    <div className="text-sm mt-1">Qty: {typeof a.quantity_available === "number" ? a.quantity_available : a.quantity_total} / {a.quantity_total} {a.unit || "pcs"}</div>
                    <div className="mt-2">
                      <Link href={`/inventory/${encodeURIComponent(a.uid)}`}>
                        <Button size="sm" variant="outline">View</Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Label preview modal */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              if (previewSrc) URL.revokeObjectURL(previewSrc);
              setPreviewSrc("");
              setPreviewOpen(false);
            }}
          />
          <div className="relative z-10 w-full max-w-5xl bg-white dark:bg-neutral-900 border rounded-xl shadow-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">Label Preview</div>
              <div className="flex gap-2">
                <div className="flex items-center gap-1 mr-2 text-xs text-neutral-600">
                  <span>Zoom:</span>
                  <Button variant="outline" onClick={() => setPreviewZoom((z) => Math.max(0.5, round2(z - 0.25)))}>-</Button>
                  <span>{Math.round(previewZoom * 250)}%</span>
                  <Button variant="outline" onClick={() => setPreviewZoom(1)}>100%</Button>
                  <Button variant="outline" onClick={() => setPreviewZoom((z) => Math.min(4, round2(z + 0.25)))}>+</Button>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    const blob = new Blob([zpl], { type: "text/plain" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = `${uid}-label.zpl`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }}
                >
                  Download ZPL
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/print-label", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ uid, zpl }),
                      });
                      if (res.ok) alert("Label queued");
                      else alert("Print failed");
                    } catch {
                      alert("Print failed");
                    }
                  }}
                >
                  Print Label
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (previewSrc) URL.revokeObjectURL(previewSrc);
                    setPreviewSrc("");
                    setPreviewOpen(false);
                  }}
                >
                  Close
                </Button>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="min-h-[260px] grid place-items-center border rounded-md bg-neutral-50 dark:bg-neutral-800 overflow-auto p-3">
                {previewLoading ? (
                  <div className="text-sm text-neutral-600">Loading preview…</div>
                ) : previewSrc ? (
                  (() => {
                    const [w, h] = (previewSize || "2x1.25").split("x").map((v) => parseFloat(v) || 0);
                    const px = (inches) => Math.round((inches || 0) * 96 * (previewZoom || 1));
                    const style = { width: px(w || 2) + "px", height: px(h || 1.25) + "px" };
                    return <img src={previewSrc} alt="ZPL preview" style={style} className="object-contain border bg-white" />;
                  })()
                ) : (
                  <div className="w-full">
                    {previewError && <div className="mb-2 text-sm text-red-600">{previewError}</div>}
                    <div className="text-sm text-neutral-600 mb-2">No preview available. Edit ZPL on the right, then Update Preview.</div>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <div className="text-sm font-medium">ZPL (editable)</div>
                <textarea
                  className="w-full min-h-[260px] font-mono text-xs p-3 border rounded-md bg-white dark:bg-neutral-900"
                  value={zpl}
                  onChange={(e) => setZpl(e.target.value)}
                  spellCheck={false}
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => updatePreviewFromZpl()}>Update Preview</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editOpen && (
        <EditModal
          item={item}
          close={() => setEditOpen(false)}
          state={{
            whList, zoneList, bayList, shelfList,
            efClassification, efWarehouse, efZone, efBay, efShelf,
            efName, efBrand, efModel, efSerial, efUnit, efQty, efNotes,
            photoFile, photoAltFile, previewMain, previewAlt
          }}
          set={{
            setWhList, setZoneList, setBayList, setShelfList,
            setEfClassification, setEfWarehouse, setEfZone, setEfBay, setEfShelf,
            setEfName, setEfBrand, setEfModel, setEfSerial, setEfUnit, setEfQty, setEfNotes,
            setPhotoFile, setPhotoAltFile, setPreviewMain, setPreviewAlt
          }}
          sb={sb}
          TABLE_CLASS_CONST={TABLE_CLASS_CONST}
          onSaved={(patch) => setItem((prev) => ({ ...prev, ...patch }))}
        />
      )}

      {/* Movement history */}
      <Card>
        <CardHeader>Transactions</CardHeader>
        <CardContent>
          {moves.length ? (
            <div className="grid gap-2">
              {moves.map((m, i) => (
                <div key={i} className="p-3 rounded-xl border bg-white text-sm">
                  <div className="text-xs text-neutral-500">{new Date(m.created_at).toLocaleString()}</div>
                  <div className="font-medium capitalize">{m.action} · qty {m.qty}</div>
                  <div className="text-xs text-neutral-600">from {fmtRef(m.from_ref)} → {fmtRef(m.to_ref)}</div>
                  <div className="text-xs">
                    manifest{" "}
                    <Link className="underline" href={`/manifests/${m.manifest_id}`}>
                      {m.manifest_id}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-neutral-500">No movement logged yet.</div>
          )}
        </CardContent>
      </Card>

      {/* Exceptions */}
      <Card>
        <CardHeader>Exceptions</CardHeader>
        <CardContent>
          {ex.length ? (
            <ul className="space-y-2">
              {ex.map((e) => (
                <li key={e.id} className="p-3 rounded-xl border bg-white">
                  <div className="font-medium capitalize">{e.type}</div>
                  <div className="text-sm text-neutral-600">{e.notes || "—"}</div>
                  <div className="text-xs text-neutral-500 mt-1">
                    {new Date(e.created_at).toLocaleString()} · Manifest {e.manifest_id?.slice(0, 6) || "—"}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-neutral-500">No exceptions logged for this item.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- Subcomponents / helpers ---------- */

function Row({ label, value }) {
  return (
    <div className="flex gap-3">
      <div className="w-44 text-neutral-500">{label}</div>
      <div className="flex-1">{value}</div>
    </div>
  );
}

function fmtNum(n) {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (Number.isNaN(v)) return "—";
  return String(v);
}

function fmtRef(ref) {
  if (!ref) return "—";
  // expected forms: "warehouse:STAGING-A", "van:<uuid>", "job:<uuid>"
  const [t, id] = String(ref).split(":");
  if (t === "warehouse") return `warehouse ${id || ""}`;
  if (t === "van") return `van ${id?.slice(0, 8) || ""}`;
  if (t === "job") return `job ${id?.slice(0, 8) || ""}`;
  return ref;
}

function round2(x) { return Math.round(x * 100) / 100; }

/* Edit modal extracted for clarity */
function EditModal({ item, close, state, set, sb, TABLE_CLASS_CONST, onSaved }) {
  const {
    whList, zoneList, bayList, shelfList,
    efClassification, efWarehouse, efZone, efBay, efShelf,
    efName, efBrand, efModel, efSerial, efUnit, efQty, efNotes,
    photoFile, photoAltFile, previewMain, previewAlt
  } = state;
  const {
    setWhList, setZoneList, setBayList, setShelfList,
    setEfClassification, setEfWarehouse, setEfZone, setEfBay, setEfShelf,
    setEfName, setEfBrand, setEfModel, setEfSerial, setEfUnit, setEfQty, setEfNotes,
    setPhotoFile, setPhotoAltFile, setPreviewMain, setPreviewAlt
  } = set;

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <div className="relative z-10 w-full max-w-5xl bg-white dark:bg-neutral-900 border rounded-xl shadow-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">Edit Item</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={close}>Close</Button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Classification (fixed) */}
          <div className="space-y-1">
            <div className="text-sm text-neutral-500">Classification</div>
            <div className="text-sm">
              {(efClassification?.label || item?.classification || "").toString()}
              <span className="ml-2 text-neutral-500">(fixed by item type)</span>
            </div>
          </div>

          {/* UID (read-only) */}
          <div className="space-y-1">
            <div className="text-sm text-neutral-500">UID</div>
            <Input value={item?.uid || ""} readOnly />
          </div>

          {/* Name */}
          <div className="space-y-1">
            <div className="text-sm text-neutral-500">Name*</div>
            <Input value={efName} onChange={(e) => setEfName(e.target.value)} />
          </div>

          {/* Brand / Model */}
          <div className="space-y-1">
            <div className="text-sm text-neutral-500">Brand</div>
            <Input value={efBrand} onChange={(e) => setEfBrand(e.target.value)} />
          </div>
          <div className="space-y-1">
            <div className="text-sm text-neutral-500">Model</div>
            <Input value={efModel} onChange={(e) => setEfModel(e.target.value)} />
          </div>

          {/* Serial */}
          <div className="space-y-1">
            <div className="text-sm text-neutral-500">Serial Number</div>
            <Input value={efSerial} onChange={(e) => setEfSerial(e.target.value)} />
          </div>

          {/* Quantity / Unit */}
          <div className="space-y-1">
            <div className="text-sm text-neutral-500">Quantity*</div>
            <Input type="number" min="0" value={efQty} onChange={(e) => setEfQty(e.target.value)} />
          </div>
          <div className="space-y-1">
            <div className="text-sm text-neutral-500">Unit*</div>
            <Input value={efUnit} onChange={(e) => setEfUnit(e.target.value)} />
          </div>

          {/* Location pickers */}
          <div className="space-y-1">
            <div className="text-sm text-neutral-500">Warehouse*</div>
            <Select
              items={whList}
              triggerLabel={efWarehouse?.label || "Select warehouse"}
              onSelect={async (opt) => {
                setEfWarehouse(opt);
                setEfZone(null); setEfBay(null); setEfShelf(null);
                setZoneList([]); setBayList([]); setShelfList([]);
                if (opt?.value) {
                  const { data: zones } = await sb.from("zones").select("id,name").eq("warehouse_id", opt.value).order("name");
                  setZoneList((zones || []).map((z) => ({ value: z.id, label: z.name })));
                }
              }}
            />
          </div>
          <div className="space-y-1">
            <div className="text-sm text-neutral-500">Zone</div>
            <Select
              items={zoneList}
              triggerLabel={efZone?.label || "Select zone"}
              onSelect={async (opt) => {
                setEfZone(opt);
                setEfBay(null); setEfShelf(null);
                setBayList([]); setShelfList([]);
                if (opt?.value) {
                  const { data: bays } = await sb.from("bays").select("id,label").eq("zone_id", opt.value).order("label");
                  setBayList((bays || []).map((b) => ({ value: b.id, label: b.label })));
                }
              }}
            />
          </div>
          <div className="space-y-1">
            <div className="text-sm text-neutral-500">Bay</div>
            <Select
              items={bayList}
              triggerLabel={efBay?.label || "Select bay"}
              onSelect={async (opt) => {
                setEfBay(opt);
                setEfShelf(null); setShelfList([]);
                if (opt?.value) {
                  const { data: shelves } = await sb.from("shelfs").select("id,label").eq("bay_id", opt.value).order("label");
                  setShelfList((shelves || []).map((s) => ({ value: s.id, label: s.label })));
                }
              }}
            />
          </div>
          <div className="space-y-1">
            <div className="text-sm text-neutral-500">Shelf</div>
            <Select items={shelfList} triggerLabel={efShelf?.label || "Select shelf"} onSelect={setEfShelf} />
          </div>

          {/* Notes */}
          <div className="space-y-1 md:col-span-2">
            <div className="text-sm text-neutral-500">Notes</div>
            <Input value={efNotes} onChange={(e) => setEfNotes(e.target.value)} />
          </div>

          {/* Photos */}
          <div className="space-y-2">
            <div className="text-sm text-neutral-500">Main Photo</div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setPhotoFile(f);
                const url = f ? URL.createObjectURL(f) : null;
                setPreviewMain(url);
              }}
            />
            <div className="aspect-square rounded-xl overflow-hidden bg-neutral-100 border w-48 h-48">
              {previewMain ? (
                <img src={previewMain} alt="preview" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full grid place-items-center text-sm text-neutral-400">No image</div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm text-neutral-500">Alt Photo</div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setPhotoAltFile(f);
                const url = f ? URL.createObjectURL(f) : null;
                setPreviewAlt(url);
              }}
            />
            <div className="aspect-square rounded-xl overflow-hidden bg-neutral-100 border w-48 h-48">
              {previewAlt ? (
                <img src={previewAlt} alt="preview" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full grid place-items-center text-sm text-neutral-400">No image</div>
              )}
            </div>
          </div>

          {/* Save */}
          <div className="md:col-span-2 flex justify-end gap-2 pt-2">
            <Button
              onClick={async () => {
                try {
                  const table = item.source_table;
                  const id = item.id;

                  // Upload photos if changed
                  let photo_url = item.photo_url || null;
                  if (photoFile) {
                    const ext = photoFile.name.split(".").pop() || "jpg";
                    const path = `items/${item.uid}/${Date.now()}.${ext}`;
                    const { error: upErr } = await sb.storage.from("item-photos").upload(path, photoFile, { cacheControl: "3600", upsert: true });
                    if (!upErr) {
                      const { data: pub } = sb.storage.from("item-photos").getPublicUrl(path);
                      photo_url = pub?.publicUrl || photo_url;
                    }
                  }
                  let alt_photo_url = item.alt_photo_url || null;
                  if (photoAltFile) {
                    const ext = photoAltFile.name.split(".").pop() || "jpg";
                    const path = `items/${item.uid}/alt.${ext}`;
                    const { error: upErr } = await sb.storage.from("item-photos").upload(path, photoAltFile, { cacheControl: "3600", upsert: true });
                    if (!upErr) {
                      const { data: pub } = sb.storage.from("item-photos").getPublicUrl(path);
                      alt_photo_url = pub?.publicUrl || alt_photo_url;
                    }
                  }

                  // Keep classification consistent with the source table to satisfy DB checks
                  const classification = TABLE_CLASS_CONST[item.source_table] || item.classification;

                  const payload = {
                    warehouse_id: efWarehouse?.value || null,
                    zone_id: efZone?.value || null,
                    bay_id: efBay?.value || null,
                    shelf_id: efShelf?.value || null,
                    name: efName || null,
                    brand: efBrand || null,
                    model: efModel || null,
                    serial_number: efSerial || null,
                    classification,
                    unit: efUnit || "pcs",
                    notes: efNotes || null,
                    quantity_total: Number(efQty) || 0,
                    photo_url,
                    alt_photo_url,
                  };

                  const { error } = await sb.from(table).update(payload).eq("id", id);
                  if (error) throw error;

                  onSaved(payload);
                  close();
                } catch (err) {
                  console.error(err);
                  alert(err.message || "Failed to update item.");
                }
              }}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
