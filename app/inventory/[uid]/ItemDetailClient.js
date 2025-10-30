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

export default function ItemDetailClient({ uid }) {
  const sb = supabaseBrowser();
  const [item, setItem] = useState(null);
  const [tx, setTx] = useState([]);
  const [ex, setEx] = useState([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewSrc, setPreviewSrc] = useState("");
  const [zpl, setZpl] = useState("");
  const [previewSize, setPreviewSize] = useState("4x6"); // in inches WxH
  const [previewDpmm, setPreviewDpmm] = useState("8dpmm"); // 203dpi default
  const [previewZoom, setPreviewZoom] = useState(2); // 2 = 200%
  const [editOpen, setEditOpen] = useState(false);

  // Edit form state (mirrors new-item layout)
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

  const CLASS_DB_CONST = {
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
    Object.entries(CLASS_DB_CONST).map(([k, v]) => [v, k])
  );

  // Enforced classification per source table (to satisfy DB check constraints)
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
    } catch (err) {
      // Fallback: call Labelary directly from the browser (CORS-enabled)
      try {
        const dpmm = (opts.dpmm || previewDpmm) || "12dpmm";
        const size = (opts.size || previewSize) || "2x1.25";
        const url = `https://api.labelary.com/v1/printers/${dpmm}/labels/${size}/0/`;
        const fd = new FormData();
        fd.append(
          "file",
          new Blob([nextZpl || zpl], { type: "text/plain" }),
          "label.zpl"
        );
        const res2 = await fetch(url, { method: "POST", headers: { Accept: "image/png" }, body: fd });
        if (!res2.ok) throw new Error("Direct preview failed");
        const blob2 = await res2.blob();
        const url2 = URL.createObjectURL(blob2);
        setPreviewSrc(url2);
        setPreviewError("");
      } catch (e2) {
        setPreviewError("Could not render PNG preview. Check network or ZPL.");
      }
    } finally {
      setPreviewLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      // 1) Core item info (from union view)
      const { data: items } = await sb
        .from("inventory_union")
        .select(
          "source_table,id,uid,classification,name,brand,model,serial_number,photo_url,alt_photo_url,is_container,nested_parent_uid,condition,status,warehouse_id,zone_id,bay_id,shelf_id,location_last_seen,verified,qr_payload,notes,quantity_total,quantity_reserved,quantity_available,unit,created_at,updated_at"
        )
        .eq("uid", uid)
        .limit(1);

      setItem(items?.[0] || null);

      // 2) Recent transactions
      const { data: t } = await sb
        .from("transactions")
        .select("id,action,performed_by,from_location,to_location,job_id,team_id,van_id,quantity,timestamp,notes")
        .eq("item_uid", uid)
        .order("timestamp", { ascending: false })
        .limit(25);
      setTx(t || []);

      // 3) Exceptions
      const { data: e } = await sb
        .from("exceptions")
        .select("id,type,notes,photo_url,created_at,manifest_id")
        .eq("item_uid", uid)
        .order("created_at", { ascending: false })
        .limit(25);
      setEx(e || []);
    })();
  }, [uid, sb]);

  const qty = useMemo(() => {
    if (!item) return {};
    return {
      total: item.quantity_total ?? null,
      reserved: item.quantity_reserved ?? null,
      available: item.quantity_available ?? null,
      unit: item.unit ?? "pcs",
    };
  }, [item]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-neutral-500">Item</div>
          <h1 className="text-2xl font-semibold">{item?.name || uid}</h1>
          <div className="text-sm text-neutral-600">UID: {uid}</div>
        </div>
        <div className="flex gap-2">
          <Link href="/inventory">
            <Button variant="outline">Back to Inventory</Button>
          </Link>
          {item && (
            <Button
              variant="outline"
              onClick={async () => {
                // Initialize edit form state from the loaded item
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

                // Load warehouses list, then preselect based on item.warehouse_id
                const { data: wh } = await sb
                  .from("warehouse")
                  .select("id, wh_number, name")
                  .order("wh_number");
                const whItems = (wh || []).map((w) => ({
                  value: w.id,
                  label: `${w.wh_number || "WH"} — ${w.name}`,
                }));
                setWhList(whItems);
                const foundWh = whItems.find((x) => x.value === item.warehouse_id) || null;
                setEfWarehouse(foundWh);

                // Load zones for selected warehouse
                if (foundWh?.value) {
                  const { data: zones } = await sb
                    .from("zones")
                    .select("id,name")
                    .eq("warehouse_id", foundWh.value)
                    .order("name");
                  const zItems = (zones || []).map((z) => ({ value: z.id, label: z.name }));
                  setZoneList(zItems);
                  const foundZ = zItems.find((x) => x.value === item.zone_id) || null;
                  setEfZone(foundZ);

                  // Load bays for selected zone
                  if (foundZ?.value) {
                    const { data: bays } = await sb
                      .from("bays")
                      .select("id,label")
                      .eq("zone_id", foundZ.value)
                      .order("label");
                    const bItems = (bays || []).map((b) => ({ value: b.id, label: b.label }));
                    setBayList(bItems);
                    const foundB = bItems.find((x) => x.value === item.bay_id) || null;
                    setEfBay(foundB);

                    // Load shelves for selected bay
                    if (foundB?.value) {
                      const { data: shelves } = await sb
                        .from("shelfs")
                        .select("id,label")
                        .eq("bay_id", foundB.value)
                        .order("label");
                      const sItems = (shelves || []).map((s) => ({ value: s.id, label: s.label }));
                      setShelfList(sItems);
                      const foundS = sItems.find((x) => x.value === item.shelf_id) || null;
                      setEfShelf(foundS);
                    } else {
                      setShelfList([]);
                      setEfShelf(null);
                    }
                  } else {
                    setBayList([]);
                    setEfBay(null);
                    setShelfList([]);
                    setEfShelf(null);
                  }
                } else {
                  setZoneList([]);
                  setEfZone(null);
                  setBayList([]);
                  setEfBay(null);
                  setShelfList([]);
                  setEfShelf(null);
                }

                // Classification preselect from DB const back to UI option
                const classVal = DB_TO_CLASS_VALUE[item.classification] || null;
                const classOpt = CLASS_OPTIONS.find((o) => o.value === classVal) || null;
                setEfClassification(classOpt);

                setEditOpen(true);
              }}
            >
              Edit
            </Button>
          )}
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

      {/* Item summary */}
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
                <div className="aspect-square rounded-2xl overflow-hidden bg-neutral-100 border  w-64 h-64">
                  {item.alt_photo_url ? (
                   <img src={item.alt_photo_url} alt={`${item.name} alt`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-sm text-neutral-400">No alt image</div>
                  )}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Row label="Classification" value={item.classification} />
                <Row label="Brand / Model" value={[item.brand, item.model].filter(Boolean).join(" ") || "—"} />
                <Row label="Serial" value={item.serial_number || "—"} />
                <Row label="Status" value={item.status} />
                <Row label="Condition" value={item.condition} />
                <Row label="Verified" value={item.verified ? "Yes" : "No"} />
                <Row label="Location Last Seen" value={item.location_last_seen || "—"} />
              </div>
              <div className="space-y-1">
                <Row label="Quantity (total)" value={qty.total ?? "—"} />
                {"reserved" in qty && <Row label="Reserved" value={qty.reserved ?? "—"} />}
                {"available" in qty && <Row label="Available" value={qty.available ?? "—"} />}
                <Row label="Unit" value={qty.unit} />
                <Row label="QR Payload" value={<code className="break-all">{item.qr_payload}</code>} />
                <Row label="Notes" value={item.notes || "—"} />
              </div>
           
                          </div>
            </>
          ) : (
            <div className="text-sm text-neutral-500">Loading…</div>
          )}
        </CardContent>
      </Card>

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
                  <Button variant="outline" onClick={() => setPreviewZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}>-</Button>
                  <span>{Math.round(previewZoom * 250)}%</span>
                  <Button variant="outline" onClick={() => setPreviewZoom(1)}>100%</Button>
                  <Button variant="outline" onClick={() => setPreviewZoom((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100))}>+</Button>
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
                        // Pass edited ZPL too; backend can opt-in to use it
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
                    const [w, h] = (previewSize || "2x1.25")
                      .split("x")
                      .map((v) => parseFloat(v) || 0);
                    const px = (inches) => Math.round((inches || 0) * 96 * (previewZoom || 1));
                    const style = { width: px(w || 2) + "px", height: px(h || 1.25) + "px" };
                    return (
                      <img
                        src={previewSrc}
                        alt="ZPL preview"
                        style={style}
                        className="object-contain border bg-white"
                      />
                    );
                  })()
                ) : (
                  <div className="w-full">
                    {previewError && (
                      <div className="mb-2 text-sm text-red-600">{previewError}</div>
                    )}
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

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setEditOpen(false)}
          />
          <div className="relative z-10 w-full max-w-5xl bg-white dark:bg-neutral-900 border rounded-xl shadow-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">Edit Item</div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditOpen(false)}>Close</Button>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {/* Classification */}
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

              {/* Location */}
              <div className="space-y-1">
                <div className="text-sm text-neutral-500">Warehouse*</div>
                <Select
                  items={whList}
                  triggerLabel={efWarehouse?.label || "Select warehouse"}
                  onSelect={async (opt) => {
                    setEfWarehouse(opt);
                    setEfZone(null);
                    setEfBay(null);
                    setEfShelf(null);
                    setZoneList([]);
                    setBayList([]);
                    setShelfList([]);
                    if (opt?.value) {
                      const { data: zones } = await sb
                        .from("zones")
                        .select("id,name")
                        .eq("warehouse_id", opt.value)
                        .order("name");
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
                    setEfBay(null);
                    setEfShelf(null);
                    setBayList([]);
                    setShelfList([]);
                    if (opt?.value) {
                      const { data: bays } = await sb
                        .from("bays")
                        .select("id,label")
                        .eq("zone_id", opt.value)
                        .order("label");
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
                    setEfShelf(null);
                    setShelfList([]);
                    if (opt?.value) {
                      const { data: shelves } = await sb
                        .from("shelfs")
                        .select("id,label")
                        .eq("bay_id", opt.value)
                        .order("label");
                      setShelfList((shelves || []).map((s) => ({ value: s.id, label: s.label })));
                    }
                  }}
                />
              </div>
              <div className="space-y-1">
                <div className="text-sm text-neutral-500">Shelf</div>
                <Select
                  items={shelfList}
                  triggerLabel={efShelf?.label || "Select shelf"}
                  onSelect={setEfShelf}
                />
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
                    toPreview(f, setPreviewMain);
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
                    toPreview(f, setPreviewAlt);
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

              <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                <Button
                  onClick={async () => {
                    if (!item) return;
                    try {
                      const table = item.source_table;
                      const id = item.id;

                      // Upload photos if changed
                      let photo_url = item.photo_url || null;
                      if (photoFile) {
                        const ext = photoFile.name.split(".").pop() || "jpg";
                        const path = `items/${item.uid}/${Date.now()}.${ext}`;
                        const { error: upErr } = await sb.storage
                          .from("item-photos")
                          .upload(path, photoFile, { cacheControl: "3600", upsert: true });
                        if (!upErr) {
                          const { data: pub } = sb.storage.from("item-photos").getPublicUrl(path);
                          photo_url = pub?.publicUrl || photo_url;
                        }
                      }
                      let alt_photo_url = item.alt_photo_url || null;
                      if (photoAltFile) {
                        const ext = photoAltFile.name.split(".").pop() || "jpg";
                        const path = `items/${item.uid}/alt.${ext}`;
                        const { error: upErr } = await sb.storage
                          .from("item-photos")
                          .upload(path, photoAltFile, { cacheControl: "3600", upsert: true });
                        if (!upErr) {
                          const { data: pub } = sb.storage.from("item-photos").getPublicUrl(path);
                          alt_photo_url = pub?.publicUrl || alt_photo_url;
                        }
                      }

                      // Keep classification consistent with the source table to satisfy DB check constraints
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

                      // refresh local state display
                      setItem({ ...item, ...payload });
                      setEditOpen(false);
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
      )}

      {/* Transactions */}
      <Card>
        <CardHeader>Recent Transactions</CardHeader>
        <CardContent>
          {tx.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th>When</th>
                    <th>Action</th>
                    <th>Qty</th>
                    <th>From → To</th>
                    <th>Job</th>
                    <th>Team</th>
                    <th>Van</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {tx.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td>{new Date(r.timestamp).toLocaleString()}</td>
                      <td>{r.action}</td>
                      <td>{r.quantity}</td>
                      <td>{[r.from_location || "—", r.to_location || "—"].join(" → ")}</td>
                      <td>{r.job_id?.slice(0, 6) || "—"}</td>
                      <td>{r.team_id?.slice(0, 6) || "—"}</td>
                      <td>{r.van_id?.slice(0, 6) || "—"}</td>
                      <td className="max-w-[280px] truncate" title={r.notes || ""}>
                        {r.notes || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-neutral-500">No transactions yet.</div>
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
                  <div className="font-medium">{e.type}</div>
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

function Row({ label, value }) {
  return (
    <div className="flex gap-3">
      <div className="w-44 text-neutral-500">{label}</div>
      <div className="flex-1">{value}</div>
    </div>
  );
}
