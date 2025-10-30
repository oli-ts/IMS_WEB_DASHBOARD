"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase-browser";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { toast } from "sonner";
import { DndContext, PointerSensor, useSensor, useSensors, closestCorners } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";

function toTransformString(transform) {
  if (!transform) return undefined;
  const x = transform.x ?? 0;
  const y = transform.y ?? 0;
  const scaleX = transform.scaleX ?? 1;
  const scaleY = transform.scaleY ?? 1;
  const rotate = transform.rotate ?? 0;
  return `translate3d(${x}px, ${y}px, 0) scaleX(${scaleX}) scaleY(${scaleY}) rotate(${rotate}deg)`;
}

function ItemRow({ item, dragProps }) {
  return (
    <div className="p-3 rounded-xl border bg-white dark:bg-neutral-900 dark:border-neutral-800 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-lg overflow-hidden bg-neutral-100 border dark:bg-neutral-800 dark:border-neutral-700">
          {item.photo_url ? (
            <img src={item.photo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full grid place-items-center text-[10px] text-neutral-400">No image</div>
          )}
        </div>
        <div>
          <div className="font-medium">{item.item_name || item.item_uid}</div>
          <div className="text-xs text-neutral-500">UID: {item.item_uid}</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-sm text-neutral-700 dark:text-neutral-200">Qty: {item.qty_required ?? item.quantity ?? 0}</div>
        <button
          aria-label="Drag"
          className="h-8 w-8 grid place-items-center rounded-md border dark:border-neutral-700 text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-grab"
          {...(dragProps?.listeners || {})}
          {...(dragProps?.attributes || {})}
        >
          ⋮⋮
        </button>
      </div>
    </div>
  );
}

function SortableItem({ item }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: String(item.id) });
  const style = {
    transform: toTransformString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <ItemRow item={item} dragProps={{ attributes, listeners }} />
    </div>
  );
}

function Droppable({ id, children }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={isOver ? "outline outline-1 outline-blue-500/40 rounded-xl" : undefined}>{children}</div>
  );
}

function Column({ title, containerId, manifest, setManifest, manifestOptions = [], items = [], otherSelection }) {
  return (
    <div className="flex-1 bg-white dark:bg-neutral-900 rounded-xl border dark:border-neutral-800 p-3">
      <div className="mb-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <Select
            items={manifestOptions}
            triggerLabel={manifest?.label || "Select manifest"}
            onSelect={setManifest}
            align="end"
          />
        </div>
        {otherSelection ? (
          <div className="text-xs text-neutral-500 mt-1">
            Hiding {otherSelection} (selected on the other side)
          </div>
        ) : null}
      </div>
      <Droppable id={containerId}>
        <SortableContext id={containerId} items={items.map((i) => String(i.id))} strategy={verticalListSortingStrategy}>
          <div className="grid gap-2 min-h-24">
            {manifest ? (
              items.length ? (
                items.map((i) => <SortableItem key={i.id} item={i} />)
              ) : (
                <div className="text-sm text-neutral-500">No items in this manifest.</div>
              )
            ) : (
              <div className="text-sm text-neutral-500">Select a manifest to view items.</div>
            )}
          </div>
        </SortableContext>
      </Droppable>
    </div>
  );
}

function QtyDialog({ open, max, itemName, onConfirm, onCancel }) {
  const [val, setVal] = useState(1);
  useEffect(() => {
    if (open) setVal(Math.min(Math.max(1, Number(max) || 1), Number(max) || 1));
  }, [open, max]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border bg-white dark:bg-neutral-900 dark:border-neutral-800 p-4 shadow-xl">
        <div className="font-semibold mb-1">Move quantity</div>
        <div className="text-sm text-neutral-600 dark:text-neutral-300 mb-3">{itemName}</div>
        <div className="flex items-center gap-2 mb-4">
          <input
            type="number"
            min={1}
            max={Number(max) || 1}
            value={val}
            onChange={(e) => setVal(Math.min(Number(max) || 1, Math.max(1, Number(e.target.value) || 1)))}
            className="h-9 w-28 px-2 rounded-md border dark:border-neutral-700 bg-white dark:bg-neutral-900"
          />
          <div className="text-sm text-neutral-500">of {max}</div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onConfirm(val)}>Confirm</Button>
        </div>
      </div>
    </div>
  );
}

export default function Transfers() {
  const sb = supabaseBrowser();
  const [manifestOptions, setManifestOptions] = useState([]);
  const [leftManifest, setLeftManifest] = useState(null);
  const [rightManifest, setRightManifest] = useState(null);
  const [leftItems, setLeftItems] = useState([]);
  const [rightItems, setRightItems] = useState([]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Filter options so a selected manifest on one side can't be chosen on the other
  const leftOptions = useMemo(
    () => manifestOptions.filter((o) => o.value !== rightManifest?.value),
    [manifestOptions, rightManifest]
  );
  const rightOptions = useMemo(
    () => manifestOptions.filter((o) => o.value !== leftManifest?.value),
    [manifestOptions, leftManifest]
  );

  // Load manifest options
  useEffect(() => {
    (async () => {
      const { data } = await sb
        .from("active_manifests")
        .select("id,jobs(name),vans(reg_number)")
        .order("id", { ascending: false });
      const opts = (data || []).map((m) => ({
        value: m.id,
        label: `${m?.jobs?.name || "Job"} - Van ${m?.vans?.reg_number || "-"}`,
      }));
      setManifestOptions(opts);
      if (opts.length >= 1 && !leftManifest) setLeftManifest(opts[0]);
      if (opts.length >= 2 && !rightManifest) setRightManifest(opts[1]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Safety: if both sides accidentally select the same manifest, clear the right side
  useEffect(() => {
    if (leftManifest?.value && rightManifest?.value && leftManifest.value === rightManifest.value) {
      setRightManifest(null);
    }
  }, [leftManifest, rightManifest]);

  async function loadManifestItems(manifestId) {
    const { data } = await sb
      .from("manifest_items")
      .select("id,item_uid,qty_required,status")
      .eq("manifest_id", manifestId)
      .limit(500);
    const rows = data || [];
    const uids = Array.from(new Set(rows.map((r) => r.item_uid).filter(Boolean)));

    let metaMap = {};
    if (uids.length) {
      const { data: inv } = await sb
        .from("inventory_union")
        .select("uid,name,photo_url")
        .in("uid", uids);
      metaMap = Object.fromEntries((inv || []).map((r) => [r.uid, r]));
    }

    return rows.map((r) => ({
      ...r,
      item_name: metaMap[r.item_uid]?.name || null,
      photo_url: metaMap[r.item_uid]?.photo_url || null,
    }));
  }

  // Load items when either manifest changes
  useEffect(() => {
    (async () => {
      if (leftManifest?.value) {
        const items = await loadManifestItems(leftManifest.value);
        setLeftItems(items);
      } else {
        setLeftItems([]);
      }
    })();
  }, [leftManifest]);

  useEffect(() => {
    (async () => {
      if (rightManifest?.value) {
        const items = await loadManifestItems(rightManifest.value);
        setRightItems(items);
      } else {
        setRightItems([]);
      }
    })();
  }, [rightManifest]);

  function sideForOverId(overId) {
    if (!overId) return null;
    const idStr = String(overId);
    if (idStr === "left-container") return "left";
    if (idStr === "right-container") return "right";
    const leftIds = new Set(leftItems.map((i) => String(i.id)));
    const rightIds = new Set(rightItems.map((i) => String(i.id)));
    if (leftIds.has(idStr)) return "left";
    if (rightIds.has(idStr)) return "right";
    return null;
  }

  async function persistMoveAll(itemId, toManifestId) {
    return sb.from("manifest_items").update({ manifest_id: toManifestId }).eq("id", itemId);
  }

  async function persistMovePartial(item, qty, toManifestId) {
    const remaining = Math.max(0, Number(item.qty_required || 0) - Number(qty));
    // reduce source
    const { error: upErr } = await sb
      .from("manifest_items")
      .update({ qty_required: remaining })
      .eq("id", item.id);
    if (upErr) throw upErr;
    // insert target line
    const insert = await sb
      .from("manifest_items")
      .insert({ manifest_id: toManifestId, item_uid: item.item_uid, qty_required: Number(qty), status: item.status || "pending" })
      .select()
      .single();
    if (insert.error) throw insert.error;
    return insert.data; // new row
  }

  const [movePrompt, setMovePrompt] = useState(null);

  async function onDragEnd(event) {
    const { active, over } = event;
    if (!active || !over) return;
    const activeId = String(active.id);
    const fromSide = sideForOverId(active.id);
    const toSide = sideForOverId(over.id);
    if (!fromSide || !toSide || fromSide === toSide) return;

    const toManifestId = toSide === "left" ? leftManifest?.value : rightManifest?.value;
    const toManifestLabel = toSide === "left" ? leftManifest?.label : rightManifest?.label;
    if (!toManifestId) return;

    const pick = (list) => list.find((i) => String(i.id) === activeId);
    const item = fromSide === "left" ? pick(leftItems) : pick(rightItems);
    if (!item) return;

    const qtyAvail = Number(item.qty_required || 1);
    if (qtyAvail > 1) {
      setMovePrompt({ item, fromSide, toSide, toManifestId, toManifestLabel });
      return;
    }

    // Move whole line optimistically
    if (fromSide === "left") {
      setLeftItems((prev) => prev.filter((i) => String(i.id) !== activeId));
      setRightItems((prev) => [{ ...item }, ...prev]);
    } else {
      setRightItems((prev) => prev.filter((i) => String(i.id) !== activeId));
      setLeftItems((prev) => [{ ...item }, ...prev]);
    }

    try {
      const { error } = await persistMoveAll(item.id, toManifestId);
      if (error) throw error;
      toast.success(`Moved ${item.item_name || item.item_uid} to ${toManifestLabel || "target manifest"}`);
    } catch (e) {
      // revert
      if (fromSide === "left") {
        setRightItems((prev) => prev.filter((i) => String(i.id) !== activeId));
        setLeftItems((prev) => [{ ...item }, ...prev]);
      } else {
        setLeftItems((prev) => prev.filter((i) => String(i.id) !== activeId));
        setRightItems((prev) => [{ ...item }, ...prev]);
      }
      console.error(e);
      toast.error("Failed to save transfer. Please try again.");
    }
  }

  async function confirmPartialMove(qty) {
    const ctx = movePrompt;
    if (!ctx) return;
    setMovePrompt(null);
    const { item, fromSide, toManifestId, toManifestLabel, toSide } = ctx;
    const moveQty = Math.max(1, Math.min(Number(item.qty_required || 1), Number(qty) || 1));

    // Optimistic UI: adjust quantities
    if (fromSide === "left") {
      setLeftItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, qty_required: (i.qty_required || 0) - moveQty } : i)).filter((i) => (i.id === item.id ? (i.qty_required || 0) > 0 : true)));
      setRightItems((prev) => [{ ...item, id: `temp-${item.id}-${Date.now()}`, qty_required: moveQty }, ...prev]);
    } else {
      setRightItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, qty_required: (i.qty_required || 0) - moveQty } : i)).filter((i) => (i.id === item.id ? (i.qty_required || 0) > 0 : true)));
      setLeftItems((prev) => [{ ...item, id: `temp-${item.id}-${Date.now()}`, qty_required: moveQty }, ...prev]);
    }

    try {
      const newRow = await persistMovePartial(item, moveQty, toManifestId);
      // Replace temp with real id
      const replaceTemp = (listSetter) =>
        listSetter((prev) =>
          prev.map((r) => (String(r.id).startsWith("temp-") ? { ...r, id: newRow.id } : r))
        );
      if (toSide === "left") replaceTemp(setLeftItems); else replaceTemp(setRightItems);
      toast.success(`Moved ${moveQty} of ${item.item_name || item.item_uid} to ${toManifestLabel || "target manifest"}`);
    } catch (e) {
      // reload both lists to be safe
      if (leftManifest?.value) setLeftItems(await loadManifestItems(leftManifest.value));
      if (rightManifest?.value) setRightItems(await loadManifestItems(rightManifest.value));
      console.error(e);
      toast.error("Failed to save transfer. Please try again.");
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd} collisionDetection={closestCorners}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Transfers</h1>
          <Button variant="outline" disabled>Changes auto-saved</Button>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <Column
            title="From Manifest"
            containerId="left-container"
            manifest={leftManifest}
            setManifest={setLeftManifest}
            manifestOptions={leftOptions}
            otherSelection={rightManifest?.label}
            items={leftItems}
          />
          <Column
            title="To Manifest"
            containerId="right-container"
            manifest={rightManifest}
            setManifest={setRightManifest}
            manifestOptions={rightOptions}
            otherSelection={leftManifest?.label}
            items={rightItems}
          />
        </div>
      </div>
      <QtyDialog
        open={!!movePrompt}
        max={movePrompt?.item?.qty_required || 1}
        itemName={movePrompt?.item?.item_name || movePrompt?.item?.item_uid}
        onConfirm={confirmPartialMove}
        onCancel={() => setMovePrompt(null)}
      />
    </DndContext>
  );
}
