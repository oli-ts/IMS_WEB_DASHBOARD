// app/inventory/new/ItemNewClient.js
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "../../../lib/supabase-browser";
import { Card, CardContent, CardHeader } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { Select } from "../../../components/ui/select";
import { CONDITION_OPTIONS, CONDITION_DB_CONST } from "../../../lib/conditions";

const CLASS_OPTIONS = [
  { value: "light_tooling", label: "Light Tooling (LT)" },
  { value: "heavy_tooling", label: "Heavy Tooling (HT)" },
  { value: "devices", label: "Devices (DV)" },
  { value: "ppe", label: "PPE (PPE)" },
  { value: "consumables_material", label: "Consumables — Material (MAT)" },
  { value: "consumable_equipment", label: "Consumables — Equipment (CEQ)" },
  { value: "sundries", label: "Sundries (SUN)" },
  { value: "workshop_tools", label: "Workshop Tools (WT)" },
  { value: "vehicles", label: "Vehicles (VEH)" },
  { value: "metal_diamonds", label: "Metal Diamonds (MD)" },
];

const UNIT_OPTIONS = [
  { value: "pcs", label: "pcs" },
  { value: "kg", label: "kg" },
  { value: "ltrs", label: "ltrs" },
  { value: "set", label: "set" },
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
  metal_diamonds: "METAL_DIAMOND",
};

const PREFIX = {
  light_tooling: "LT",
  heavy_tooling: "HT",
  devices: "DV",
  ppe: "PPE",
  consumables_material: "MAT",
  consumable_equipment: "CEQ",
  sundries: "SUN",
  workshop_tools: "WT",
  vehicles: "VEH",
  metal_diamonds: "MD",
};

export default function ItemNewClient() {
  const sb = supabaseBrowser();
  const router = useRouter();

  // Location dependencies
  const [whList, setWhList] = useState([]);
  const [zoneList, setZoneList] = useState([]);
  const [bayList, setBayList] = useState([]);
  const [shelfList, setShelfList] = useState([]);

  // Selected values
  const [classification, setClassification] = useState(null);
  const [warehouse, setWarehouse] = useState(null);
  const [zone, setZone] = useState(null);
  const [bay, setBay] = useState(null);
  const [shelf, setShelf] = useState(null);

  // Item fields
  const [uid, setUid] = useState("");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [unit, setUnit] = useState({ value: "pcs", label: "pcs" });
  const [qty, setQty] = useState(1);
  const [condition, setCondition] = useState(CONDITION_OPTIONS[0]);
  const [notes, setNotes] = useState("");
  const [photoFile, setPhotoFile] = useState("");
  const [photoAltFile, setPhotoAltFile] = useState(null);
  const [printAfter, setPrintAfter] = useState(true);
  const [baselineHeight, setBaselineHeight] = useState("");
  const [caseUid, setCaseUid] = useState("");
  // Accessories UI state
  const [hasAccessories, setHasAccessories] = useState(false);
  const [accRows, setAccRows] = useState([]); // {_id,name,qty,brand,notes,photoFile,preview}

  const [previewMain, setPreviewMain] = useState(null);
  const [previewAlt, setPreviewAlt] = useState(null);

  function toPreview(file, setter) {
    if (!file) return setter(null);
    const url = URL.createObjectURL(file);
    setter(url);
  }

  const selectedClass = classification?.value || null;
  const uidPrefix = selectedClass ? PREFIX[selectedClass] : null;
  const isMetalDiamond = selectedClass === "metal_diamonds";
  const canHaveAccessories = ["light_tooling", "heavy_tooling", "vehicles"].includes(selectedClass || "");

  // Load warehouse list
  useEffect(() => {
    (async () => {
      const { data } = await sb
        .from("warehouse")
        .select("id, wh_number, name")
        .order("wh_number");
      setWhList(
        (data || []).map((w) => ({
          value: w.id,
          label: `${w.wh_number} — ${w.name}`,
        }))
      );
    })();
  }, [sb]);

  // Load zones when warehouse changes
  useEffect(() => {
    (async () => {
      setZoneList([]);
      setBayList([]);
      setShelfList([]);
      setZone(null);
      setBay(null);
      setShelf(null);
      if (!warehouse?.value) return;
      const { data } = await sb
        .from("zones")
        .select("id, name")
        .eq("warehouse_id", warehouse.value)
        .order("name");
      setZoneList((data || []).map((z) => ({ value: z.id, label: z.name })));
    })();
  }, [warehouse, sb]);

  // Load bays when zone changes
  useEffect(() => {
    (async () => {
      setBayList([]);
      setShelfList([]);
      setBay(null);
      setShelf(null);
      if (!zone?.value) return;
      const { data } = await sb
        .from("bays")
        .select("id, label")
        .eq("zone_id", zone.value)
        .order("label");
      setBayList((data || []).map((b) => ({ value: b.id, label: b.label })));
    })();
  }, [zone, sb]);

  // Load shelfs when bay changes
  useEffect(() => {
    (async () => {
      setShelfList([]);
      setShelf(null);
      if (!bay?.value) return;
      const { data } = await sb
        .from("shelfs")
        .select("id, label")
        .eq("bay_id", bay.value)
        .order("label");
      setShelfList((data || []).map((s) => ({ value: s.id, label: s.label })));
    })();
  }, [bay, sb]);

  useEffect(() => {
    if (!isMetalDiamond) {
      setBaselineHeight("");
      setCaseUid("");
    }
  }, [isMetalDiamond]);

  const canSubmit = useMemo(() => {
    const baselineOk =
      !isMetalDiamond ||
      (baselineHeight !== "" && Number.isFinite(Number(baselineHeight)));
    return (
      !!selectedClass &&
      !!warehouse?.value &&
      !!zone?.value &&
      !!bay?.value &&
      !!shelf?.value &&
      !!name &&
      !!unit &&
      Number(qty) >= 0 &&
      baselineOk
    );
  }, [selectedClass, warehouse, zone, bay, shelf, name, unit, qty, baselineHeight, isMetalDiamond]);

  function genRandom(n = 5) {
    const digits = "0123456789";
    let s = "";
    for (let i = 0; i < n; i++)
      s += digits[Math.floor(Math.random() * digits.length)];
    return s;
  }

  async function ensureUid(base) {
    // Try base, then base-1..-5 for collisions
    for (let i = 0; i < 5; i++) {
      const tryId = i === 0 ? base : `${base}-${i}`;
      const { data } = await sb
        .from("inventory_union")
        .select("uid")
        .eq("uid", tryId)
        .limit(1);
      if (!data || data.length === 0) return tryId;
    }
    // fallback with random
    return `${base}-${genRandom(3)}`;
  }

  async function onSubmit(e) {
    e.preventDefault();
    try {
      if (!canSubmit) return alert("Please fill in required fields.");
      const table = selectedClass;
      const prefix = uidPrefix;
      const baseUid = uid?.trim() || `${prefix}-${genRandom(4)}`;
      const finalUid = await ensureUid(baseUid);
      const baselineHeightNumber = Number(baselineHeight);
      const normalizedCaseUid = (caseUid || "").trim();

      // Optional: upload photo first to get its URL
      let photo_url = null;
      let alt_photo_url = null;
      if (photoFile) {
        const ext = photoFile.name.split(".").pop() || "jpg";
        const path = `items/${finalUid}/${Date.now()}.${ext}`;
        const { error: upErr } = await sb.storage
          .from("item-photos")
          .upload(path, photoFile, {
            cacheControl: "3600",
            upsert: true,
          });
        if (upErr) {
          console.error(upErr);
          alert("Photo upload failed, creating item without photo.");
        } else {
          const { data: pub } = sb.storage
            .from("item-photos")
            .getPublicUrl(path);
          photo_url = pub?.publicUrl || null;
        }
      }
       if (photoAltFile) {
        const ext = photoAltFile.name.split(".").pop() || "jpg";
        const path = `items/${finalUid}/alt.${ext}`;
        const { error: upErr } = await sb.storage.from("item-photos").upload(path, photoAltFile, {
          cacheControl: "3600",
          upsert: true,
        });
        if (upErr) {
          console.error(upErr);
        } else {
          const { data: pub } = sb.storage.from("item-photos").getPublicUrl(path);
          alt_photo_url = pub?.publicUrl || null;
        }
      }

      const payload = {
        uid: finalUid,
        warehouse_id: warehouse?.value || null,
        zone_id: zone?.value || null,
        bay_id: bay?.value || null,
        shelf_id: shelf?.value || null,
        name: name || null,
        brand: brand || null,
        model: model || null,
        serial_number: serial || null,
        classification: CLASS_DB_CONST[selectedClass],
        condition: condition ? CONDITION_DB_CONST[condition.value] : null,
        unit: unit?.value || "pcs",
        notes: notes || null,
        qr_payload: `CPG1|${finalUid}|${
          warehouse?.label?.split(" — ")[0] || ""
        }|${prefix}`,
        quantity_total: Number(qty) || 0,
        photo_url,
        alt_photo_url,
      };

      // For consumable tables, include reserved/available on insert if your schema supports defaults;
      // otherwise leave them to generated columns.
      if (
        table === "consumables_material" ||
        table === "consumable_equipment" ||
        table === "sundries"
      ) {
        payload.quantity_reserved = payload.quantity_reserved ?? 0;
      }

      if (isMetalDiamond) {
        if (!Number.isFinite(baselineHeightNumber)) {
          throw new Error("Baseline height is required for metal diamonds.");
        }
        payload.baseline_height_mm = baselineHeightNumber;
        payload.set_size = 9;
        payload.unit = "set";
        payload.case_uid = normalizedCaseUid || null;
        payload.current_height_mm = baselineHeightNumber;

        const { error: metalErr } = await sb.from("metal_diamonds").insert(payload);
        if (metalErr) throw metalErr;

        const { error: measErr } = await sb.from("metal_diamond_measurements").insert({
          diamond_uid: finalUid,
          baseline_at_measure_mm: baselineHeightNumber,
          current_height_mm: baselineHeightNumber,
          notes: "Initial baseline",
        });
        if (measErr) throw measErr;

        await sb.rpc("metal_diamond_apply_latest", { p_uid: finalUid }).catch(() => {});
      } else {
        const { error } = await sb.from(table).insert(payload);
        if (error) throw error;
      }

      // Insert child accessories if applicable
      if (canHaveAccessories && hasAccessories) {
        const rows = (accRows || [])
          .map((r) => ({ ...r, name: (r.name || "").trim(), qty: Number(r.qty || 0) || 0 }))
          .filter((r) => r.name && r.qty > 0);
        if (rows.length) {
          const accPayloads = [];
          for (const r of rows) {
            const base = `ACC-${genRandom(4)}`;
            const accUid = await ensureUid(base);
            let accPhotoUrl = null;
            if (r.photoFile) {
              try {
                const ext = r.photoFile.name.split(".").pop() || "jpg";
                const path = `items/${accUid}/${Date.now()}.${ext}`;
                const { error: upErr } = await sb.storage
                  .from("item-photos")
                  .upload(path, r.photoFile, { cacheControl: "3600", upsert: true });
                if (!upErr) {
                  const { data: pub } = sb.storage.from("item-photos").getPublicUrl(path);
                  accPhotoUrl = pub?.publicUrl || null;
                }
              } catch (e) {
                console.warn("Accessory photo upload failed", e);
              }
            }
            accPayloads.push({
              uid: accUid,
              classification: "ACCESSORY",
              nested_parent_uid: finalUid,
              name: r.name,
              brand: r.brand || null,
              notes: r.notes || null,
              unit: unit?.value || "pcs",
              quantity_total: r.qty,
              quantity_available: r.qty,
              warehouse_id: warehouse?.value || null,
              zone_id: zone?.value || null,
              bay_id: bay?.value || null,
              shelf_id: shelf?.value || null,
              photo_url: accPhotoUrl,
            });
          }
          let { error: accErr } = await sb.from("accessories").insert(accPayloads);
          if (accErr) {
            // Fallback: if accessories table lacks 'notes', retry mapping notes -> model
            const msg = (accErr?.message || "").toLowerCase();
            if (msg.includes("notes") || msg.includes("column") || msg.includes("cannot find")) {
              const alt = accPayloads.map(({ notes, ...rest }) => ({ ...rest, model: notes || null }));
              const { error: accErr2 } = await sb.from("accessories").insert(alt);
              if (accErr2) console.warn("[new item] accessories insert failed (retry)", accErr2);
              else accErr = null;
            } else {
              console.warn("[new item] accessories insert failed", accErr);
            }
          }
          if (printAfter) {
            for (const p of accPayloads) {
              try {
                await fetch("/api/print-label", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ uid: p.uid }),
                });
              } catch (e) {
                console.warn("[new item] accessory print failed", p.uid, e);
              }
            }
          }
        }
      }

      // Print label if toggled on
      if (printAfter) {
        try {
          await fetch("/api/print-label", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ uid: finalUid }),
          });
        } catch (e) {
          console.warn("Print label call failed", e);
        }
      }

      // Go to the item page
      window?.scrollTo?.(0, 0);
      router.push(`/inventory/${encodeURIComponent(finalUid)}`);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to add item.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Add New Item</h1>
      </div>

      <Card>
        <CardHeader>Details</CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid md:grid-cols-2 gap-4">
            {/* Classification */}
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Classification*</div>
              <Select
                items={CLASS_OPTIONS}
                triggerLabel={classification?.label || "Select classification"}
                onSelect={setClassification}
              />
            </div>

            {/* UID */}
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">UID (optional)</div>
              <Input
                placeholder={uidPrefix ? `${uidPrefix}-0001` : "Auto-generate"}
                value={uid}
                onChange={(e) => setUid(e.target.value)}
              />
            </div>

            {/* Name */}
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Name*</div>
              <Input
                placeholder="e.g. Makita 125mm Angle Grinder"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {isMetalDiamond && (
              <>
                <div className="space-y-1">
                  <div className="text-sm text-neutral-500">Baseline Height (mm)*</div>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="e.g. 42.5"
                    value={baselineHeight}
                    onChange={(e) => setBaselineHeight(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-neutral-500">Case UID</div>
                  <Input
                    placeholder="Optional case UID"
                    value={caseUid}
                    onChange={(e) => setCaseUid(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Brand / Model */}
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Brand</div>
              <Input
                placeholder="e.g. Makita"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Model</div>
              <Input
                placeholder="e.g. GA5040R"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>

            {/* Serial */}
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Serial Number</div>
              <Input
                placeholder="e.g. GA5-040R-001"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
              />
            </div>

            {/* Condition */}
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Condition</div>
              <Select
                items={CONDITION_OPTIONS}
                triggerLabel={condition?.label || "Select condition"}
                onSelect={setCondition}
              />
            </div>

            {/* Quantity / Unit */}
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Quantity*</div>
              <Input
                type="number"
                min="0"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Unit*</div>
              <Select
                items={UNIT_OPTIONS}
                triggerLabel={unit?.label || "Select unit"}
                onSelect={setUnit}
              />
            </div>

            {/* Location */}
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Warehouse*</div>
              <Select
                items={whList}
                triggerLabel={warehouse?.label || "Select warehouse"}
                onSelect={setWarehouse}
              />
            </div>

            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Zone</div>
              <Select
                items={zoneList}
                triggerLabel={zone?.label || "Select zone"}
                onSelect={setZone}
              />
            </div>

            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Bay</div>
              <Select
                items={bayList}
                triggerLabel={bay?.label || "Select bay"}
                onSelect={setBay}
              />
            </div>

            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Shelf</div>
              <Select
                items={shelfList}
                triggerLabel={shelf?.label || "Select shelf"}
                onSelect={setShelf}
              />
            </div>

            {/* Notes */}
            <div className="space-y-1 md:col-span-2">
              <div className="text-sm text-neutral-500">Notes</div>
              <Input
                placeholder="Any notes…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => history.back()}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                Create Item
              </Button>
            </div>

            {/* Accessories (optional) */}
            {canHaveAccessories && (
              <div className="md:col-span-2 space-y-3">
                <div className="flex items-center gap-2">
                  <input id="has-acc" type="checkbox" checked={hasAccessories} onChange={(e)=>setHasAccessories(e.target.checked)} />
                  <label htmlFor="has-acc" className="text-sm">Has accessories</label>
                </div>
                {hasAccessories && (
                  <div className="rounded-2xl border p-3 dark:border-neutral-800">
                    <div className="text-sm text-neutral-600 mb-2">Accessories</div>
                    <div className="grid grid-cols-12 gap-2 mb-1 text-xs text-neutral-500">
                      <div className="col-span-4">Name</div>
                      <div className="col-span-2">Qty</div>
                      <div className="col-span-2">Brand</div>
                      <div className="col-span-3">Notes (Voltage, Model, etc)</div>
                      <div className="col-span-1 text-right">Actions</div>
                    </div>
                    <div className="space-y-2">
                      {accRows.map((r) => (
                        <div key={r._id} className="grid grid-cols-12 gap-2">
                          <Input className="col-span-4 h-9" placeholder="Accessory name" value={r.name || ""} onChange={(e)=>setAccRows(prev=>prev.map(x=>x._id===r._id?{...x,name:e.target.value}:x))} />
                          <Input type="number" min="0" className="col-span-2 h-9" placeholder="0" value={r.qty ?? ""} onChange={(e)=>setAccRows(prev=>prev.map(x=>x._id===r._id?{...x,qty:e.target.value}:x))} />
                          <Input className="col-span-2 h-9" placeholder="Brand" value={r.brand || ""} onChange={(e)=>setAccRows(prev=>prev.map(x=>x._id===r._id?{...x,brand:e.target.value}:x))} />
                          <Input className="col-span-3 h-9" placeholder="Notes (Voltage, Model, etc)" value={r.notes || ""} onChange={(e)=>setAccRows(prev=>prev.map(x=>x._id===r._id?{...x,notes:e.target.value}:x))} />
                          <div className="col-span-1 flex items-center justify-end">
                            <Button type="button" size="sm" variant="outline" onClick={()=>setAccRows(prev=>prev.filter(x=>x._id!==r._id))}>Remove</Button>
                          </div>
                          {/* photo row */}
                          <div className="col-span-12 grid grid-cols-12 gap-2">
                            <div className="col-span-10">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e)=>{
                                  const f = e.target.files?.[0] || null;
                                  setAccRows(prev=>prev.map(x=>{
                                    if(x._id!==r._id) return x;
                                    const next = { ...x, photoFile: f };
                                    try { if (x.preview) URL.revokeObjectURL(x.preview); } catch{}
                                    next.preview = f ? URL.createObjectURL(f) : null;
                                    return next;
                                  }))
                                }}
                                className="block w-full text-xs"
                              />
                            </div>
                            <div className="col-span-2">
                              <div className="h-12 w-12 rounded-lg overflow-hidden bg-neutral-100 border">
                                {r.preview ? (
                                  <img src={r.preview} alt="preview" className="h-full w-full object-cover" />
                                ) : (
                                  <div className="h-full w-full grid place-items-center text-[10px] text-neutral-400">No img</div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3">
                      <Button type="button" size="sm" variant="outline" onClick={()=>setAccRows(prev=>[...prev,{ _id:`row-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, name:"", qty:1, brand:"", notes:"", photoFile:null, preview:null }])}>Add Row</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Photo */}
            <div className="space-y-1 md:col-span-2 ">
              <div className="text-sm text-neutral-500">Photo (optional)</div>
                <div className="grid grid-cols-2 gap-3 ">
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setPhotoFile(f);
                      toPreview(f, setPreviewMain);
                    }}
                    className="block w-full text-sm"
                  />
                 <div className="mt-2 aspect-square rounded-xl overflow-hidden bg-neutral-100 border dark:border-neutral-800 bg-white dark:bg-neutral-900">
                    {previewMain ? (
                      <img src={previewMain} alt="main preview" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full grid place-items-center text-xs text-neutral-400">No image</div>
                    )}
                  </div>
                </div>
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setPhotoAltFile(f);
                      toPreview(f, setPreviewAlt);
                    }}
                    className="block w-full text-sm"
                  />
                  <div className="mt-2 aspect-square rounded-xl overflow-hidden bg-neutral-100 border dark:border-neutral-800 bg-white dark:bg-neutral-900">
                    {previewAlt ? (
                      <img src={previewAlt} alt="alt preview" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full grid place-items-center text-xs text-neutral-400">No alt image</div>
                    )}
                  </div>
                </div>
              </div>
             </div>

            {/* Print after create */}
            <div className="md:col-span-2 flex items-center gap-2">
              <input id="print-after" type="checkbox" checked={printAfter} onChange={e=>setPrintAfter(e.target.checked)} />
              <label htmlFor="print-after" className="text-sm">Print label after create</label>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
