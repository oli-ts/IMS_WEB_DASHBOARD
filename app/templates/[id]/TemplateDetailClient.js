"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "../../../lib/supabase-browser";
import { Card, CardContent, CardHeader } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Select } from "../../../components/ui/select";
import { LiveStatusBadge } from "../../../components/live-status-badge";
import { useLiveStatuses } from "../../../lib/hooks/useLiveStatuses";
import ItemGroupQuickMenu from "@/components/item-group-quick-menu";
import { toast } from "sonner";

const JOB_TYPES = [
  { value: "pouring", label: "Pouring" },
  { value: "polishing", label: "Polishing" },
  { value: "detailing", label: "Detailing" },
];

export default function TemplateDetailClient({ templateId }) {
  const sb = supabaseBrowser();
  const router = useRouter();

  const [template, setTemplate] = useState(null);
  const [rows, setRows] = useState([]);
  const [itemMetaByUid, setItemMetaByUid] = useState({});
  const [statusByUid, setStatusByUid] = useState({});
  const [inv, setInv] = useState([]);
  const [groupSearchResults, setGroupSearchResults] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [groupRows, setGroupRows] = useState([]);
  const groupMetaCache = useRef(new Map());
  const [imagePreview, setImagePreview] = useState(null); // { src, alt }

  const [zones, setZones] = useState([]);
  const [bays, setBays] = useState([]);
  const [shelfs, setShelfs] = useState([]);

  // Live statuses pulled from item_live_status to mirror inventory page behaviour.
  const templateUids = useMemo(() => rows.map((r) => r.item_uid).filter(Boolean), [rows]);
  const searchUids = useMemo(() => inv.map((i) => i.uid).filter(Boolean), [inv]);
  const allStatusUids = useMemo(
    () => Array.from(new Set([...templateUids, ...searchUids])),
    [templateUids, searchUids]
  );
  const { liveMap } = useLiveStatuses(allStatusUids);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: t } = await sb
        .from("manifest_templates")
        .select("id,name,job_type,finish_type,colour,size_multiplier,created_at")
        .eq("id", templateId)
        .single();
      setTemplate(t || null);

      await loadTemplateItems();

      const [{ data: z }, { data: b }, { data: s }] = await Promise.all([
        sb.from("zones").select("id,name").order("name"),
        sb.from("bays").select("id,label").order("label"),
        sb.from("shelfs").select("id,label").order("label"),
      ]);
      setZones((z || []).map((z) => ({ value: z.id, label: z.name })));
      setBays((b || []).map((b) => ({ value: b.id, label: b.label })));
      setShelfs((s || []).map((s) => ({ value: s.id, label: s.label })));

      setLoading(false);
    })();
  }, [templateId]);

  async function loadTemplateItems() {
    const { data } = await sb
      .from("manifest_template_items")
      .select("id,item_uid,qty_required,zone_id,bay_id,shelf_id,sort_order,notes")
      .eq("template_id", templateId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setRows(data || []);
    const uids = Array.from(new Set((data || []).map((r) => r.item_uid).filter(Boolean)));
    if (!uids.length) {
      setItemMetaByUid({});
      setStatusByUid({});
      return;
    }

    // Fetch live status and quantities from inventory union, falling back where possible.
    const statusMap = await fetchStatuses(uids);
    setStatusByUid(statusMap);

    const { data: invMeta } = await sb
      .from("inventory_union")
      .select("uid,name,photo_url,classification,quantity_total,quantity_available,unit,status")
      .in("uid", uids);
    const map = {};
    (invMeta || []).forEach((i) => {
      map[i.uid] = {
        name: i.name,
        photo_url: i.photo_url,
        classification: i.classification,
        quantity_total: i.quantity_total,
        quantity_available: i.quantity_available,
        unit: i.unit,
        status: i.status || statusMap[i.uid] || null,
      };
    });

    let missing = uids.filter((uid) => !map[uid]);
    if (missing.length) {
      const { data: kitMeta } = await sb
        .from("inventory_kits")
        .select("uid,name,photo_url,classification,quantity_total,quantity_available,unit,status")
        .in("uid", missing);
      (kitMeta || []).forEach((k) => {
        map[k.uid] = {
          name: k.name,
          photo_url: k.photo_url,
          classification: k.classification || "KIT",
          quantity_total: k.quantity_total,
          quantity_available: k.quantity_available,
          unit: k.unit,
          status: k.status || statusMap[k.uid] || null,
        };
      });
      missing = uids.filter((uid) => !map[uid]);
    }

    if (missing.length) {
      const { data: metalMeta } = await sb
        .from("metal_diamonds")
        .select("uid,name,photo_url,classification,quantity_total,quantity_available,unit,status")
        .in("uid", missing);
      (metalMeta || []).forEach((m) => {
        map[m.uid] = {
          name: m.name,
          photo_url: m.photo_url,
          classification: m.classification || "METAL_DIAMOND",
          quantity_total: m.quantity_total,
          quantity_available: m.quantity_available,
          unit: m.unit,
          status: m.status || statusMap[m.uid] || null,
        };
      });
      missing = uids.filter((uid) => !map[uid]);
    }

    if (missing.length) {
      const { data: regMeta } = await sb
        .from("uid_registry")
        .select("uid,name,photo_url,classification,quantity_total,quantity_available,unit")
        .in("uid", missing);
      (regMeta || []).forEach((r) => {
        map[r.uid] = {
          name: r.name,
          photo_url: r.photo_url,
          classification: r.classification || map[r.uid]?.classification || null,
          quantity_total: r.quantity_total,
          quantity_available: r.quantity_available,
          unit: r.unit,
          status: statusMap[r.uid] || null,
        };
      });
    }

    setItemMetaByUid(map);
  }

  useEffect(() => {
    const run = async () => {
      if (!q?.trim()) {
        setInv([]);
        setGroupSearchResults([]);
        return;
      }
      const term = q.trim();
      const normalized = term.replace(/\s+/g, "");
      const likeTerm = `%${term}%`;
      const likeNorm = `%${normalized}%`;
      const orClause = [
        `name.ilike.${likeTerm}`,
        `uid.ilike.${likeTerm}`,
        `replace(name,' ','')ilike.${likeNorm}`,
        `replace(uid,' ','')ilike.${likeNorm}`,
      ].join(",");
      let itemQuery = sb
        .from("inventory_union")
        .select("uid,name,classification,brand,model,photo_url,status,quantity_total,quantity_available,unit")
        .or(orClause)
        .limit(25);
      let metalQuery = sb
        .from("metal_diamonds")
        .select("uid,name,classification,brand,model,photo_url,status,quantity_total,quantity_available,unit")
        .or(orClause)
        .limit(25);
      let kitQuery = sb
        .from("inventory_kits")
        .select("uid,name,classification,photo_url,status,quantity_total,quantity_available,unit")
        .or(orClause)
        .limit(25);
      if (/^[A-Z]{2,5}-/.test(q.trim().toUpperCase())) {
        itemQuery = sb
          .from("inventory_union")
          .select("uid,name,classification,brand,model,photo_url,status,quantity_total,quantity_available,unit")
          .or(`uid.ilike.%${q}%,name.ilike.%${q}%`)
          .limit(25);
        metalQuery = sb
          .from("metal_diamonds")
          .select("uid,name,classification,brand,model,photo_url,status,quantity_total,quantity_available,unit")
          .or(`uid.ilike.%${q}%,name.ilike.%${q}%`)
          .limit(25);
        kitQuery = sb
          .from("inventory_kits")
          .select("uid,name,classification,photo_url,status,quantity_total,quantity_available,unit")
          .or(`uid.ilike.%${q}%,name.ilike.%${q}%,uid.ilike.%${normalized}%,name.ilike.%${normalized}%`)
          .limit(25);
      }
      const groupQuery = sb
        .from("item_groups")
        .select("id,name")
        .ilike("name", `%${q}%`)
        .limit(10);
      const [itemRes, metalRes, kitRes, groupRes] = await Promise.all([itemQuery, metalQuery, kitQuery, groupQuery]);
      if (itemRes?.error) {
        console.error("Inventory search failed", itemRes.error);
      }
      if (metalRes?.error) {
        console.error("Metal search failed", metalRes.error);
      }
      const merged = [...(itemRes?.data || [])];
      for (const row of metalRes?.data || []) {
        if (!row?.uid) continue;
        const normalized = {
          ...row,
          classification: row.classification || "METAL_DIAMOND",
        };
        const idx = merged.findIndex((r) => r.uid === normalized.uid);
        if (idx >= 0) {
          merged[idx] = { ...merged[idx], ...normalized };
        } else {
          merged.push(normalized);
        }
      }
      for (const k of kitRes?.data || []) {
        if (!k?.uid) continue;
        const normalized = { ...k, classification: k.classification || "KIT" };
        const idx = merged.findIndex((r) => r.uid === normalized.uid);
        if (idx >= 0) {
          merged[idx] = { ...merged[idx], ...normalized };
        } else {
          merged.push(normalized);
        }
      }
      setInv(merged);
      if (groupRes?.error) {
        console.error("Group search failed", groupRes.error);
      }
      setGroupSearchResults(groupRes?.data || []);
    };
    const t = setTimeout(run, 250);
    return () => clearTimeout(t);
  }, [q, sb]);

  useEffect(() => {
    let active = true;
    if (!q?.trim()) {
      setGroupRows([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const { data, error } = await sb.rpc("find_group_items", { search_text: q });
        if (error) throw error;
        if (!active) return;
        setGroupRows(data || []);
      } catch (err) {
        console.error("[template] group lookup failed", err?.message || err);
        if (active) setGroupRows([]);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [q, sb]);

  useEffect(() => {
    for (const row of groupRows || []) {
      if (row?.item_uid && row.group_id) {
        groupMetaCache.current.set(row.item_uid, {
          group_id: row.group_id,
          group_name: row.group_name || null,
        });
      }
    }
  }, [groupRows]);

  const groupMetaByUid = useMemo(() => {
    const map = {};
    for (const row of groupRows || []) {
      if (!row?.item_uid) continue;
      map[row.item_uid] = {
        group_id: row.group_id,
        group_name: row.group_name || null,
      };
    }
    return map;
  }, [groupRows]);

  async function getGroupMeta(uid) {
    if (!uid) return null;
    if (groupMetaCache.current.has(uid)) return groupMetaCache.current.get(uid);
    try {
      const { data, error } = await sb
        .from("item_group_members")
        .select("group_id, item_groups(name)")
        .eq("item_uid", uid)
        .limit(1)
        .maybeSingle();
      if (error || !data?.group_id) return null;
      const meta = {
        group_id: data.group_id,
        group_name: data?.item_groups?.name || null,
      };
      groupMetaCache.current.set(uid, meta);
      return meta;
    } catch (err) {
      console.error("[template] group meta fetch failed", err?.message || err);
      return null;
    }
  }

  async function getAvailableGroupUids(groupId) {
    if (!groupId) return [];
    try {
      const { data, error } = await sb.rpc("available_group_members", { group_id: groupId });
      if (error) throw error;
      const list = (data || []).map((row) => row?.item_uid).filter(Boolean);
      if (list.length) return list;
    } catch (err) {
      console.warn("[template] available_group_members rpc failed", err?.message || err);
    }
    try {
      const { data: members, error: memberErr } = await sb
        .from("item_group_members")
        .select("item_uid")
        .eq("group_id", groupId);
      if (memberErr) throw memberErr;
      const uids = (members || []).map((m) => m.item_uid).filter(Boolean);
      if (!uids.length) return [];
      const { data: allocations, error: allocErr } = await sb
        .from("item_active_allocations")
        .select("item_uid")
        .in("item_uid", uids);
      if (allocErr) throw allocErr;
      const unavailable = new Set((allocations || []).map((a) => a.item_uid));
      return uids.filter((uid) => !unavailable.has(uid));
    } catch (err) {
      console.warn("[template] group fallback failed", err?.message || err);
      return [];
    }
  }

  async function maybeAddGroupItemsToTemplate(baseUid) {
    const meta = await getGroupMeta(baseUid);
    if (!meta?.group_id) return;
    try {
      const existingSet = new Set(rows.map((r) => r.item_uid));
      existingSet.add(baseUid);
      const extras = (await getAvailableGroupUids(meta.group_id)).filter((uid) => uid && !existingSet.has(uid));
      if (!extras.length) return;
      const statusMap = await fetchStatuses(extras);
      const allowed = extras.filter((uid) => (statusMap[uid] || "").toLowerCase() !== "broken");
      const skipped = extras.length - allowed.length;
      if (!allowed.length) {
        if (skipped) toast.info("Skipped broken group items");
        return;
      }
      const payload = allowed.map((uid) => ({
        template_id: templateId,
        item_uid: uid,
        qty_required: 1,
      }));
      const { error: insErr } = await sb.from("manifest_template_items").insert(payload);
      if (insErr) throw insErr;
      toast.success(`Added ${payload.length} grouped item${payload.length > 1 ? "s" : ""}`);
      if (skipped) toast.info("Skipped broken group items");
    } catch (err) {
      console.error("[template] grouped add failed", err?.message || err);
    }
  }

  async function fetchStatuses(uids) {
    if (!uids?.length) return {};
    try {
      const map = {};
      const { data: inv } = await sb.from("inventory_union").select("uid,status").in("uid", uids);
      for (const row of inv || []) {
        map[row.uid] = row.status || null;
      }
      const missing = uids.filter((uid) => !map[uid]);
      if (missing.length) {
        const { data: metal } = await sb.from("metal_diamonds").select("uid,status").in("uid", missing);
        for (const row of metal || []) {
          map[row.uid] = row.status || null;
        }
      }
      return map;
    } catch (err) {
      console.error("[template] status lookup failed", err?.message || err);
      return {};
    }
  }

  async function addGroupPlaceholder(groupId, groupName) {
    if (!groupId) return;
    try {
      const pool = await getAvailableGroupUids(groupId);
      if (!pool.length) return toast.error(`No available items in ${groupName}`);
      const statusMap = await fetchStatuses(pool);
      const existing = new Set(rows.map((r) => r.item_uid));
      const filtered = pool.filter((uid) => !existing.has(uid) && (statusMap[uid] || "").toLowerCase() !== "broken");
      if (!filtered.length) {
        toast.error(`No usable items in ${groupName}`);
        return;
      }
      const choice = filtered[Math.floor(Math.random() * filtered.length)];
      await addItemToTemplate(choice, 1, { skipGroupCascade: true });
    } catch (err) {
      console.error("[template] add group placeholder failed", err?.message || err);
      toast.error(err?.message || "Failed to add group item");
    }
  }

  async function addItemToTemplate(uid, qty = 1, opts = {}) {
    const skipGroupCascade = Boolean(opts?.skipGroupCascade);
    try {
      const payload = { template_id: templateId, item_uid: uid, qty_required: Number(qty) || 1 };
      const { error } = await sb.from("manifest_template_items").insert(payload);
      if (error) throw error;
      toast.success(`Added ${uid}`);
      if (!skipGroupCascade) await maybeAddGroupItemsToTemplate(uid);
      await loadTemplateItems();
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to add item");
    }
  }

  async function updateQty(id, qty) {
    try {
      const n = Math.max(0, Number(qty) || 0);
      const { error } = await sb.from("manifest_template_items").update({ qty_required: n }).eq("id", id);
      if (error) throw error;
      await loadTemplateItems();
    } catch (err) {
      console.error(err);
      toast.error("Update failed");
    }
  }

  async function removeLine(id) {
    try {
      const { error } = await sb.from("manifest_template_items").delete().eq("id", id);
      if (error) throw error;
      await loadTemplateItems();
    } catch (err) {
      console.error(err);
      toast.error("Delete failed");
    }
  }

  const totalLines = rows.length;
  const totalQty = useMemo(() => rows.reduce((a, r) => a + Number(r.qty_required || 0), 0), [rows]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-neutral-500">Template</div>
          <div className="text-2xl font-semibold">{template?.name || "—"}</div>
          <div className="text-sm text-neutral-500">
            {(template?.job_type || "—")} · {(template?.finish_type || "—")} · {(template?.colour || "—")} · Mult: {template?.size_multiplier ?? "—"}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/manifests/new?templateId=${templateId}`}>
            <Button variant="outline">Create Manifest from Template</Button>
          </Link>
          <Link href="/templates" className="underline">
            Back
          </Link>
        </div>
      </div>

      <Card className="dark:border-neutral-800">
        <CardHeader>Edit Details</CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1 md:col-span-2">
              <div className="text-sm text-neutral-500">Template name</div>
              <Input value={template?.name || ""} onChange={(e) => setTemplate((t) => ({ ...(t || {}), name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Type of job</div>
              <Select
                items={JOB_TYPES}
                triggerLabel={JOB_TYPES.find((x) => x.value === template?.job_type)?.label || "Select job type"}
                onSelect={(v) => setTemplate((t) => ({ ...(t || {}), job_type: v?.value || null }))}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Type of finish</div>
              <Input value={template?.finish_type || ""} onChange={(e) => setTemplate((t) => ({ ...(t || {}), finish_type: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Colour</div>
              <Input value={template?.colour || ""} onChange={(e) => setTemplate((t) => ({ ...(t || {}), colour: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Size (multiplier)</div>
              <Input type="number" step="0.01" value={template?.size_multiplier ?? ""} onChange={(e) => setTemplate((t) => ({ ...(t || {}), size_multiplier: e.target.value }))} />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button
                onClick={async () => {
                  try {
                    const patch = {
                      name: (template?.name || "").trim() || null,
                      job_type: template?.job_type || null,
                      finish_type: template?.finish_type || null,
                      colour: template?.colour || null,
                      size_multiplier: template?.size_multiplier === "" ? null : Number(template?.size_multiplier),
                    };
                    const { error } = await sb.from("manifest_templates").update(patch).eq("id", templateId);
                    if (error) throw error;
                    toast.success("Template updated");
                  } catch (err) {
                    console.error(err);
                    toast.error(err.message || "Update failed");
                  }
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SEARCH inventory to add */}
      <Card className="dark:border-neutral-800">
        <CardHeader>Add Items from Inventory</CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <ItemGroupQuickMenu
                  onAddItem={(item) => addItemToTemplate(item.uid, 1, { skipGroupCascade: true })}
                />
              </div>

            {/* Current template lines */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                <div className="font-semibold">Template Items</div>
                <div className="text-sm text-neutral-500">
                  {totalLines} lines · {totalQty} total qty
                </div>
              </div>
              <div className="grid gap-2 max-h-[420px] overflow-auto">
                {rows.map((r) => {
                  const meta = itemMetaByUid[r.item_uid] || {};
                  const total = typeof meta.quantity_total === "number" ? meta.quantity_total : null;
                  const baseAvailable = typeof meta.quantity_available === "number" ? meta.quantity_available : null;
                  const onJobs = typeof liveMap[r.item_uid]?.total_on_jobs === "number" ? liveMap[r.item_uid].total_on_jobs : 0;
                  const unit = meta.unit || (baseAvailable !== null || total !== null ? "pcs" : "");
                  const unitLabel = unit ? ` ${unit}` : "";
                  const status = String(liveMap[r.item_uid]?.status || statusByUid[r.item_uid] || "in_warehouse").toLowerCase();
                  const available =
                    total !== null
                      ? Math.max(total - onJobs, 0)
                      : baseAvailable !== null
                      ? Math.max(baseAvailable - onJobs, 0)
                      : null;
                  const rowClass = "p-3 rounded-xl border bg-white dark:bg-neutral-900 dark:border-neutral-800";
                  const imgClass = "h-12 w-12 aspect-square flex-shrink-0 rounded-lg overflow-hidden bg-neutral-100 border dark:bg-neutral-800 dark:border-neutral-700 cursor-pointer";
                  return (
                    <div key={r.id} className={rowClass}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={imgClass}
                            onClick={() =>
                              itemMetaByUid[r.item_uid]?.photo_url &&
                              setImagePreview({ src: itemMetaByUid[r.item_uid].photo_url, alt: itemMetaByUid[r.item_uid].name || r.item_uid })
                            }
                          >
                            {itemMetaByUid[r.item_uid]?.photo_url ? (
                              <img src={itemMetaByUid[r.item_uid].photo_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="h-full w-full grid place-items-center text-[10px] text-neutral-400">No image</div>
                            )}
                          </div>
                          <div>
                            <div className="font-medium">{itemMetaByUid[r.item_uid]?.name || r.item_uid}</div>
                            <div className="text-xs text-neutral-500">{r.item_uid}</div>
                            <div className="text-xs mt-1 flex items-center gap-2">
                              <span>Status:</span> <LiveStatusBadge status={status || "in_warehouse"} />
                            </div>
                            {(available !== null || total !== null) && (
                              <div className="text-xs mt-1 text-neutral-500">
                                Available: {available !== null ? available : "-"}
                                {unitLabel}
                                {total !== null ? ` / ${total}${unitLabel}` : ""}
                                {onJobs ? ` (on job: ${onJobs})` : ""}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <QtyEditor value={r.qty_required} onChange={(v) => updateQty(r.id, v)} />
                          <Button size="sm" variant="outline" onClick={() => removeLine(r.id)}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {rows.length === 0 && <div className="text-sm text-neutral-500">No items yet — search on the left to add.</div>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      {imagePreview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setImagePreview(null)} />
          <div className="relative z-10 bg-white dark:bg-neutral-900 rounded-2xl shadow-xl p-4 max-w-4xl w-[90vw]">
            <button
              className="absolute top-2 right-2 text-sm px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800"
              onClick={() => setImagePreview(null)}
            >
              ✕
            </button>
            <div className="w-full">
              <img src={imagePreview.src} alt={imagePreview.alt || "Preview"} className="w-full h-auto object-contain max-h-[80vh] rounded-xl" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AddInline({ uid, onAdd }) {
  const [qty, setQty] = useState("1");
  return (
    <div className="flex items-center gap-2">
      <Input type="number" min="0" className="w-20 h-9" value={qty} onChange={(e) => setQty(e.target.value)} />
      <Button size="sm" onClick={() => onAdd(uid, qty)}>
        Add
      </Button>
    </div>
  );
}

function QtyEditor({ value, onChange }) {
  const [v, setV] = useState(String(value ?? 0));
  useEffect(() => {
    setV(String(value ?? 0));
  }, [value]);
  return (
    <div className="flex items-center gap-2">
      <Input type="number" min="0" className="w-24 h-9" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => onChange(v)} />
    </div>
  );
}
