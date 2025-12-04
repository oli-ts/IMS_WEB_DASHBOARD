"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "../../../lib/supabase-browser";
import { Button } from "../../../components/ui/button";
import { toast } from "sonner";
import Link from "next/link";
import ItemGroupQuickMenu from "@/components/item-group-quick-menu";

export default function ManifestDetailClient({ manifestId }) {
  const sb = supabaseBrowser();
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [dupMap, setDupMap] = useState({});
  const [imagePreview, setImagePreview] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  async function addParentAndAccessoriesToManifest(manifestIdParam, parentUid, parentQty = 1) {
    const n = Math.max(1, Number(parentQty) || 1);
    await sb
      .from("manifest_items")
      .insert({ manifest_id: manifestIdParam, item_uid: parentUid, qty_required: n, status: "pending" });
    const { data: accs } = await sb
      .from("accessories")
      .select("uid,quantity_total")
      .eq("nested_parent_uid", parentUid);
    if (accs?.length) {
      const { data: existing } = await sb
        .from("manifest_items")
        .select("item_uid")
        .eq("manifest_id", manifestIdParam);
      const existingSet = new Set((existing || []).map((r) => r.item_uid));
      const lines = accs
        .filter((a) => !existingSet.has(a.uid))
        .map((a) => ({
          manifest_id: manifestIdParam,
          item_uid: a.uid,
          qty_required: Math.max(1, Number(a.quantity_total || 0)),
          status: "pending",
        }));
      if (lines.length) await sb.from("manifest_items").insert(lines);
    }
  }

  async function loadItems() {
    const { data } = await sb
      .from("manifest_items")
      .select("id,item_uid,qty_required,qty_checked_out,qty_checked_in,zone_id,bay_id,shelf_id,status")
      .eq("manifest_id", manifestId)
      .order("zone_id", { ascending: true })
      .order("bay_id", { ascending: true })
      .order("shelf_id", { ascending: true });
    const itemsData = data || [];

    const uids = Array.from(new Set(itemsData.map((i) => i.item_uid).filter(Boolean)));

    let metaMap = {};
    if (uids.length) {
      const { data: inv } = await sb
        .from("inventory_union")
        .select("uid,name,photo_url,zone_id,bay_id,shelf_id,quantity_total,quantity_available,unit,classification")
        .in("uid", uids);
      metaMap = Object.fromEntries((inv || []).map((r) => [r.uid, r]));
      let missingAfterInv = uids.filter((u) => !metaMap[u]);
      if (missingAfterInv.length) {
        const { data: kits } = await sb
          .from("inventory_kits")
          .select("uid,name,photo_url,zone_id,bay_id,shelf_id,quantity_total,quantity_available,unit,classification")
          .in("uid", missingAfterInv);
        (kits || []).forEach((r) => {
          metaMap[r.uid] = {
            uid: r.uid,
            name: r.name,
            photo_url: r.photo_url,
            zone_id: r.zone_id,
            bay_id: r.bay_id,
            shelf_id: r.shelf_id,
            quantity_total: r.quantity_total,
            quantity_available: r.quantity_available,
            unit: r.unit,
            classification: r.classification || "KIT",
          };
        });
        missingAfterInv = uids.filter((u) => !metaMap[u]);
      }
      if (missingAfterInv.length) {
        const { data: acc } = await sb
          .from("accessories")
          .select("uid,name,photo_url,zone_id,bay_id,shelf_id,quantity_total,unit")
          .in("uid", missingAfterInv);
        (acc || []).forEach((r) => {
          metaMap[r.uid] = {
            uid: r.uid,
            name: r.name,
            photo_url: r.photo_url,
            zone_id: r.zone_id,
            bay_id: r.bay_id,
            shelf_id: r.shelf_id,
            quantity_total: r.quantity_total,
            unit: r.unit,
            classification: "ACCESSORY",
          };
        });
        const stillMissing = missingAfterInv.filter((u) => !metaMap[u]);
        if (stillMissing.length) {
          const { data: metals } = await sb
            .from("metal_diamonds")
            .select("uid,name,photo_url,zone_id,bay_id,shelf_id,quantity_total,unit")
            .in("uid", stillMissing);
          (metals || []).forEach((r) => {
            metaMap[r.uid] = {
              uid: r.uid,
              name: r.name,
              photo_url: r.photo_url,
              zone_id: r.zone_id,
              bay_id: r.bay_id,
              shelf_id: r.shelf_id,
              quantity_total: r.quantity_total,
              unit: r.unit,
              classification: r.classification || "METAL_DIAMOND",
            };
          });
        }
      }
    }

    const [z, b, s] = await Promise.all([
      sb.from("zones").select("id,name"),
      sb.from("bays").select("id,label"),
      sb.from("shelfs").select("id,label"),
    ]);
    const zoneMap = Object.fromEntries((z.data || []).map((r) => [r.id, r.name]));
    const bayMap = Object.fromEntries((b.data || []).map((r) => [r.id, r.label]));
    const shelfMap = Object.fromEntries((s.data || []).map((r) => [r.id, r.label]));

    setItems(
      itemsData.map((i) => {
        const metaRow = metaMap[i.item_uid] || {};
        const zid = i.zone_id || metaRow.zone_id;
        const bid = i.bay_id || metaRow.bay_id;
        const sid = i.shelf_id || metaRow.shelf_id;
        const qtyAvailRaw = typeof metaRow.quantity_available === "number" ? metaRow.quantity_available : null;
        const qtyTotalRaw = typeof metaRow.quantity_total === "number" ? metaRow.quantity_total : null;
        const available = qtyAvailRaw ?? qtyTotalRaw ?? null;
        const insufficient = available !== null && Number(i.qty_required || 0) > Number(available || 0);
        return {
          ...i,
          item_name: metaRow.name || null,
          photo_url: metaRow.photo_url || null,
          zone_label: zid ? zoneMap[zid] : undefined,
          bay_label: bid ? bayMap[bid] : undefined,
          shelf_label: sid ? shelfMap[sid] : undefined,
          available_qty: available,
          total_qty: qtyTotalRaw,
          unit: metaRow.unit || null,
          classification: metaRow.classification || null,
          insufficient,
        };
      })
    );
  }

  useEffect(() => {
    (async () => {
      const { data: mh } = await sb
        .from("active_manifests")
        .select("id, status, jobs(name)")
        .eq("id", manifestId)
        .single();
      setMeta(mh || null);
    })();
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifestId]);

  async function addItemToManifest(uid, qty = 1) {
    const n = Math.max(1, Number(qty) || 1);
    const { error } = await sb
      .from("manifest_items")
      .insert({ manifest_id: manifestId, item_uid: uid, qty_required: n, status: "pending" });
    if (error) throw error;
  }

  async function addGroupPlaceholder(groupId, name) {
    const { data, error } = await sb
      .rpc("add_any_group_member_to_manifest", { manifest_id_input: manifestId, group_id_input: groupId });
    if (error) throw error;
    toast.success(`Added a ${name} to manifest`);
    await loadItems();
  }

  async function addGroupMembers(groupId) {
    const { data, error } = await sb
      .rpc("add_all_group_members_to_manifest", { manifest_id_input: manifestId, group_id_input: groupId });
    if (error) throw error;
    const lines = data || [];
    toast.success(`Added ${lines.length} grouped item${lines.length > 1 ? "s" : ""}`);
    await loadItems();
  }

  async function handleAddFromMenu(item) {
    try {
      await addItemToManifest(item.uid, 1);
      toast.success("Item added to manifest");
      await loadItems();
    } catch (err) {
      console.error("Add from menu failed", err);
      toast.error(err?.message || "Failed to add item");
    }
  }

  function maybeAddGroupItems(baseUid) {
    return async () => {
      const { data, error } = await sb.rpc("find_groups_by_item", { item_uid: baseUid });
      if (error) {
        console.error("Group lookup failed", error);
        return;
      }
      const groups = data || [];
      if (!groups.length) {
        await addParentAndAccessoriesToManifest(manifestId, baseUid, 1);
        await loadItems();
        return;
      }
      const groupNames = groups.map((g) => g.name).join(", ");
      const ok = window.confirm(`This item is part of: ${groupNames}. Add all group members too?`);
      if (ok) {
        for (const g of groups) {
          await addGroupMembers(g.id);
        }
      } else {
        await addParentAndAccessoriesToManifest(manifestId, baseUid, 1);
      }
      await loadItems();
    };
  }

  function updateQty(id, qty) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, qty_required: Math.max(1, Number(qty) || 1) } : i))
    );
  }

  async function saveQty(id, qty) {
    const qNum = Math.max(1, Number(qty) || 1);
    await sb.from("manifest_items").update({ qty_required: qNum }).eq("id", id);
    toast.success("Quantity updated");
    await loadItems();
  }

  async function removeLine(id) {
    await sb.from("manifest_items").delete().eq("id", id);
    toast.success("Removed line");
    await loadItems();
  }

  useEffect(() => {
    (async () => {
      const { data } = await sb.rpc("find_item_manifest_duplicates", { manifest_id_input: manifestId });
      const map = {};
      (data || []).forEach((row) => {
        if (!map[row.item_uid]) map[row.item_uid] = [];
        map[row.item_uid].push({
          manifestId: row.manifest_id,
          jobName: row.job_name,
          vanReg: row.van_reg,
        });
      });
      setDupMap(map);
    })();
  }, [sb, manifestId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-semibold">Manifest #{manifestId}</div>
          <div className="text-sm text-neutral-500">
            {meta?.jobs?.name ? `Job: ${meta.jobs.name}` : "Job: Unknown"} · Status: {meta?.status || "unknown"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/manifests">
            <Button variant="outline">Back</Button>
          </Link>
          <Button
            variant="outline"
            onClick={async () => {
              const toastId = toast.loading("Closing manifest...");
              try {
                const { error } = await sb.rpc("close_manifest", { manifest_id_input: manifestId });
                if (error) throw error;
                toast.success("Manifest closed", { id: toastId });
                await loadItems();
              } catch (err) {
                console.error("Close manifest failed", err);
                toast.error(err?.message || "Failed to close manifest", { id: toastId });
              }
            }}
          >
            Close Manifest
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        <div className="font-semibold">Add Items</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setMenuOpen((v) => !v)}>
            {menuOpen ? "Hide item groups" : "Show item groups"}
          </Button>
        </div>
        <ItemGroupQuickMenu onAddItem={handleAddFromMenu} showGroups={menuOpen} />
      </div>
      <div className="flex gap-3">
        <Stat label="Required" value={items.reduce((sum, i) => sum + Number(i.qty_required || 0), 0)} />
        <Stat label="Checked Out" value={items.reduce((sum, i) => sum + Number(i.qty_checked_out || 0), 0)} />
        <Stat label="Checked In" value={items.reduce((sum, i) => sum + Number(i.qty_checked_in || 0), 0)} />
      </div>
      <div className="grid gap-2">
        {items.map((mi) => {
          const available = typeof mi.available_qty === "number" ? mi.available_qty : null;
          const total = typeof mi.total_qty === "number" ? mi.total_qty : null;
          const unit = mi.unit || (available !== null || total !== null ? "pcs" : "");
          const unitLabel = unit ? ` ${unit}` : "";
          const duplicates = dupMap[mi.item_uid] || [];
          const duplicateClass = duplicates.length
            ? "border-blue-300 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20"
            : "";
          return (
            <div
              key={mi.id}
              className={`p-3 rounded-xl border flex items-center justify-between ${
                duplicateClass ||
                (mi.insufficient
                  ? "border-red-300 bg-red-50 dark:border-red-400 dark:bg-red-500/10"
                  : "bg-white dark:bg-neutral-900 dark:border-neutral-800")
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`h-12 w-12 rounded-lg overflow-hidden border ${mi.insufficient ? "border-red-300 bg-red-100/70" : "bg-neutral-100"}`}>
                  {mi.photo_url ? (
                    <img
                      src={mi.photo_url}
                      alt=""
                      className="h-full w-full object-cover cursor-pointer"
                      onClick={() => setImagePreview({ src: mi.photo_url, alt: mi.item_name || mi.item_uid })}
                    />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-[10px] text-neutral-400">No image</div>
                  )}
                </div>
                <div>
                  <div className="font-medium">{mi.item_name || mi.item_uid}</div>
                  <div className="text-sm text-neutral-500">
                    Zone: {mi.zone_label || "-"} · Bay: {mi.bay_label || "-"} · Shelf: {mi.shelf_label || "-"}
                  </div>
                  {(available !== null || total !== null) && (
                    <div className={`text-xs mt-1 ${mi.insufficient ? "text-red-600" : "text-neutral-500"}`}>
                      Available: {available !== null ? available : "-"}
                      {unitLabel}
                      {total !== null ? ` / ${total}${unitLabel}` : ""}
                    </div>
                  )}
                  {mi.insufficient && (
                    <div className="text-xs text-red-600 mt-1">
                      Required {mi.qty_required} exceeds available quantity.
                    </div>
                  )}
                </div>
              </div>
              <div className="text-sm flex items-center gap-2">
                <QtyEditor value={mi.qty_required} onChange={(v) => updateQty(mi.id, v)} onBlur={(v) => saveQty(mi.id, v)} />
                <Button size="sm" variant="outline" onClick={() => removeLine(mi.id)}>
                  Remove
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {imagePreview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setImagePreview(null)} />
          <div className="relative z-10 bg-white dark:bg-neutral-900 rounded-2xl shadow-xl p-4 max-w-4xl w-[90vw]">
            <button
              className="absolute top-2 right-2 text-sm px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800"
              onClick={() => setImagePreview(null)}
            >
              Close
            </button>
            <div className="w-full">
              <img
                src={imagePreview.src}
                alt={imagePreview.alt || "Preview"}
                className="w-full h-auto object-contain max-h-[80vh] rounded-xl"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="p-3 rounded-xl border bg-white dark:bg-neutral-900 dark:border-neutral-800">
      <div className="text-sm text-neutral-500">{label}</div>
      <div className="text-xl font-semibold">{value ?? "-"}</div>
    </div>
  );
}

function QtyEditor({ value, onChange, onBlur }) {
  return (
    <input
      type="number"
      min="1"
      className="w-20 h-9 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => onBlur?.(e.target.value)}
    />
  );
}
