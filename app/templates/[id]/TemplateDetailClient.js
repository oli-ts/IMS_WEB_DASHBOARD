"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "../../../lib/supabase-browser";
import { Card, CardContent, CardHeader } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Select } from "../../../components/ui/select";
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
  const [nameByUid, setNameByUid] = useState({});
  const [inv, setInv] = useState([]);
  const [kitResults, setKitResults] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const [zones, setZones] = useState([]);
  const [bays, setBays] = useState([]);
  const [shelfs, setShelfs] = useState([]);

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
      setZones((z || []).map(z => ({ value: z.id, label: z.name })));
      setBays((b || []).map(b => ({ value: b.id, label: b.label })));
      setShelfs((s || []).map(s => ({ value: s.id, label: s.label })));

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
    const uids = Array.from(new Set((data || []).map(r => r.item_uid).filter(Boolean)));
    if (uids.length) {
      const { data: invNames } = await sb
        .from("inventory_union")
        .select("uid,name")
        .in("uid", uids);
      const map = {};
      (invNames || []).forEach(i => { map[i.uid] = i.name; });
      setNameByUid(map);
    } else {
      setNameByUid({});
    }
  }

  useEffect(() => {
    const run = async () => {
      if (!q?.trim()) { setInv([]); setKitResults([]); return; }
      let itemQuery = sb.from("inventory_union")
        .select("uid,name,classification,brand,model,photo_url,status")
        .ilike("name", `%${q}%`)
        .limit(25);
      if (/^[A-Z]{2,5}-/.test(q.trim().toUpperCase())) {
        itemQuery = sb.from("inventory_union")
          .select("uid,name,classification,brand,model,photo_url,status")
          .or(`uid.ilike.%${q}%,name.ilike.%${q}%`)
          .limit(25);
      }
      const [itemRes, kitsRes] = await Promise.all([
        itemQuery,
      fetch(`/api/kits/search?q=${encodeURIComponent(q)}`)
      ]);
      if (itemRes?.error) {
        console.error("Inventory search failed", itemRes.error);
      }
      setInv(itemRes?.data || []);
      if (kitsRes.ok) {
        const payload = await kitsRes.json().catch(() => ({}));
        setKitResults(payload?.data || []);
      } else {
        setKitResults([]);
      }
    };
    const t = setTimeout(run, 250);
    return () => clearTimeout(t);
  }, [q, sb]);

  async function addItemToTemplate(uid, qty = 1) {
    try {
      const payload = { template_id: templateId, item_uid: uid, qty_required: Number(qty) || 1 };
      const { error } = await sb.from("manifest_template_items").insert(payload);
      if (error) throw error;
      toast.success(`Added ${uid}`);
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

  async function addKitToTemplate(kitId) {
    try {
      const { data, error } = await sb
        .from("kit_items")
        .select("item_uid,quantity")
        .eq("kit_id", kitId);
      if (error) throw error;
      for (const row of data || []) {
        await addItemToTemplate(row.item_uid, row.quantity || 1);
      }
      toast.success("Kit added");
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to add kit");
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
          <Link href="/templates" className="underline">Back</Link>
        </div>
      </div>

      <Card className="dark:border-neutral-800">
        <CardHeader>Edit Details</CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1 md:col-span-2">
              <div className="text-sm text-neutral-500">Template name</div>
              <Input value={template?.name || ""} onChange={e=>setTemplate(t=>({ ...(t||{}), name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Type of job</div>
              <Select
                items={JOB_TYPES}
                triggerLabel={JOB_TYPES.find(x=>x.value===template?.job_type)?.label || "Select job type"}
                onSelect={(v)=>setTemplate(t=>({ ...(t||{}), job_type: v?.value || null }))}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Type of finish</div>
              <Input value={template?.finish_type || ""} onChange={e=>setTemplate(t=>({ ...(t||{}), finish_type: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Colour</div>
              <Input value={template?.colour || ""} onChange={e=>setTemplate(t=>({ ...(t||{}), colour: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Size (multiplier)</div>
              <Input type="number" step="0.01" value={template?.size_multiplier ?? ""} onChange={e=>setTemplate(t=>({ ...(t||{}), size_multiplier: e.target.value }))} />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button onClick={async()=>{
                try {
                  const patch = {
                    name: (template?.name || "").trim() || null,
                    job_type: template?.job_type || null,
                    finish_type: template?.finish_type || null,
                    colour: template?.colour || null,
                    size_multiplier: (template?.size_multiplier === "" ? null : Number(template?.size_multiplier)),
                  };
                  const { error } = await sb.from("manifest_templates").update(patch).eq("id", templateId);
                  if (error) throw error;
                  toast.success("Template updated");
                } catch (err) {
                  console.error(err);
                  toast.error(err.message || "Update failed");
                }
              }}>Save</Button>
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
              <Input className="h-9" placeholder="Search inventory by name or UID" value={q} onChange={e=>setQ(e.target.value)} />
              <div className="grid gap-2 max-h-[420px] overflow-auto">
                {kitResults.map(k => (
                  <div key={k.id} className="p-3 rounded-xl border bg-white dark:bg-neutral-900 dark:border-neutral-800 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{k.name}</div>
                      <div className="text-xs text-neutral-500">Kit · {k.item_count || 0} items</div>
                      {k.description ? <div className="text-xs text-neutral-500 mt-1">{k.description}</div> : null}
                    </div>
                    <Button size="sm" variant="outline" onClick={()=>addKitToTemplate(k.id)}>Add Kit</Button>
                  </div>
                ))}
                {inv.map(i => (
                  <div key={i.uid} className="p-3 rounded-xl border bg-white dark:bg-neutral-900 dark:border-neutral-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-lg overflow-hidden bg-neutral-100 border dark:bg-neutral-800 dark:border-neutral-700">
                        {i.photo_url ? (
                          <img src={i.photo_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full grid place-items-center text-[10px] text-neutral-400">No image</div>
                        )}
                      </div>
                      <div>
                        <div className="font-medium">{i.name}</div>
                        <div className="text-xs text-neutral-500">{i.uid} · {i.classification}</div>
                      </div>
                    </div>
                    <AddInline uid={i.uid} onAdd={addItemToTemplate} />
                  </div>
                ))}
                {q && inv.length === 0 && kitResults.length === 0 && <div className="text-sm text-neutral-500">No matches.</div>}
              </div>
            </div>

            {/* Current template lines */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Template Items</div>
                <div className="text-sm text-neutral-500">{totalLines} lines · {totalQty} total qty</div>
              </div>
              <div className="grid gap-2 max-h-[420px] overflow-auto">
                {rows.map(r => (
                  <div key={r.id} className="p-3 rounded-xl border bg-white dark:bg-neutral-900 dark:border-neutral-800">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{nameByUid[r.item_uid] || r.item_uid}</div>
                      <div className="flex items-center gap-2">
                        <QtyEditor value={r.qty_required} onChange={v=>updateQty(r.id, v)} />
                        <Button size="sm" variant="outline" onClick={()=>removeLine(r.id)}>Remove</Button>
                      </div>
                    </div>
                  </div>
                ))}
                {rows.length === 0 && <div className="text-sm text-neutral-500">No items yet — search on the left to add.</div>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AddInline({ uid, onAdd }) {
  const [qty, setQty] = useState("1");
  return (
    <div className="flex items-center gap-2">
      <Input type="number" min="0" className="w-20 h-9" value={qty} onChange={e=>setQty(e.target.value)} />
      <Button size="sm" onClick={()=>onAdd(uid, qty)}>Add</Button>
    </div>
  );
}

function QtyEditor({ value, onChange }) {
  const [v, setV] = useState(String(value ?? 0));
  useEffect(()=>{ setV(String(value ?? 0)); }, [value]);
  return (
    <div className="flex items-center gap-2">
      <Input type="number" min="0" className="w-24 h-9" value={v} onChange={e=>setV(e.target.value)} onBlur={()=>onChange(v)} />
    </div>
  );
}
