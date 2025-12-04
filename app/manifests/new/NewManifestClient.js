"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "../../../lib/supabase-browser";
import { Card, CardContent, CardHeader } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Select } from "../../../components/ui/select";
import { Input } from "../../../components/ui/input";
import { toast } from "sonner";

export default function NewManifestClient({ initial }) {
  const sb = supabaseBrowser();
  const router = useRouter();

  const [templates, setTemplates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [vans, setVans] = useState([]);
  const [staffList, setStaffList] = useState([]);

  const [template, setTemplate] = useState(null);
  const [job, setJob] = useState(null);
  const [van, setVan] = useState(null);
  const [staff, setStaff] = useState(null);
  const [isInternal, setIsInternal] = useState(false);
  const [note, setNote] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [draftResults, setDraftResults] = useState([]);
  const [draftLines, setDraftLines] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  // Load lists
  useEffect(() => {
    (async () => {
      const [{ data: tpls }, { data: js }, { data: vs }, { data: staffRows }] = await Promise.all([
        sb.from("manifest_templates").select("id,name").order("name"),
        sb.from("jobs").select("id,name").order("name"),
        sb.from("vans").select("id,reg_number").order("reg_number"),
        sb.from("staff").select("id,name").order("name"),
      ]);

      const tOpts = (tpls || []).map(t => ({ value: t.id, label: t.name }));
      const jOpts = (js || []).map(j => ({ value: j.id, label: j.name }));
      const vOpts = (vs || []).map(v => ({ value: v.id, label: v.reg_number }));
      const sOpts = (staffRows || []).map((s) => ({ value: s.id, label: s.name }));

      setTemplates(tOpts);
      setJobs(jOpts);
      setVans(vOpts);
      setStaffList(sOpts);

      // Preselect from query if provided
      if (initial?.templateId) {
        const found = tOpts.find(o => String(o.value) === String(initial.templateId));
        if (found) setTemplate(found);
      }
      if (initial?.jobId) {
        const found = jOpts.find(o => String(o.value) === String(initial.jobId));
        if (found) setJob(found);
      }
    })();
  }, [sb, initial]);

  useEffect(() => {
    let active = true;
    if (!draftSearch?.trim()) {
      setDraftResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const term = draftSearch.trim();
        const normalized = term.replace(/\s+/g, "");
        const likeTerm = `%${term}%`;
        const likeNorm = `%${normalized}%`;
        const orClause = [
          `name.ilike.${likeTerm}`,
          `uid.ilike.${likeTerm}`,
          `replace(name,' ','')ilike.${likeNorm}`,
          `replace(uid,' ','')ilike.${likeNorm}`,
        ].join(",");
        let invQuery = sb
          .from("inventory_union")
          .select("uid,name,classification,photo_url,quantity_total,quantity_available,unit")
          .or(orClause)
          .limit(20);
        let metalQuery = sb
          .from("metal_diamonds")
          .select("uid,name,classification,photo_url,quantity_total,quantity_available,unit")
          .or(orClause)
          .limit(20);
        if (/^[A-Z]{2,5}-/.test(term.toUpperCase())) {
          invQuery = sb
            .from("inventory_union")
            .select("uid,name,classification,photo_url,quantity_total,quantity_available,unit")
            .or(`uid.ilike.%${term}%,name.ilike.%${term}%,uid.ilike.%${normalized}%,name.ilike.%${normalized}%`)
            .limit(20);
          metalQuery = sb
            .from("metal_diamonds")
            .select("uid,name,classification,photo_url,quantity_total,quantity_available,unit")
            .or(`uid.ilike.%${term}%,name.ilike.%${term}%,uid.ilike.%${normalized}%,name.ilike.%${normalized}%`)
            .limit(20);
        }
        const [invRes, metalRes] = await Promise.all([invQuery, metalQuery]);
        if (!active) return;
        const merged = [...(invRes?.data || [])];
        for (const row of metalRes?.data || []) {
          if (!row?.uid) continue;
          const normalizedRow = { ...row, classification: row.classification || "METAL_DIAMOND" };
          const idx = merged.findIndex((i) => i.uid === normalizedRow.uid);
          if (idx >= 0) merged[idx] = { ...merged[idx], ...normalizedRow };
          else merged.push(normalizedRow);
        }
        setDraftResults(merged);
      } catch (err) {
        console.warn("[new manifest] draft search failed", err?.message || err);
        if (active) setDraftResults([]);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [draftSearch, sb]);

  function validate() {
    const e = {};
    if (!isInternal && !job?.value) e.job = "Job is required";
    if (isInternal && !staff?.value) e.staff = "Pick a staff member for internal works";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const summary = useMemo(() => {
    return [
      { k: "Type", v: isInternal ? "Internal works" : "Actual work" },
      { k: "Template", v: template?.label || "None" },
      { k: "Job", v: job?.label || (isInternal ? "Internal" : "—") },
      { k: "Staff", v: isInternal ? (staff?.label || "Required") : "—" },
      { k: "Van", v: van?.label || "—" },
      { k: "Items", v: draftLines.length ? `${draftLines.length} selected` : "Add items below" },
    ];
  }, [template, job, van, isInternal, staff, draftLines.length]);

  function addDraftLine(result) {
    const uid = result?.uid;
    if (!uid) return;
    setDraftLines((prev) => {
      const existing = prev.find((l) => l.uid === uid);
      if (existing) {
        return prev.map((l) => (l.uid === uid ? { ...l, qty: Math.max(1, Number(l.qty || 1) + 1) } : l));
      }
      return [
        ...prev,
        {
          uid,
          qty: 1,
          name: result.name || uid,
          photo_url: result.photo_url || null,
          classification: result.classification || "",
          unit: result.unit || "",
          quantity_available: result.quantity_available,
          quantity_total: result.quantity_total,
        },
      ];
    });
  }

  function updateDraftQty(uid, qty) {
    setDraftLines((prev) =>
      prev.map((l) => (l.uid === uid ? { ...l, qty: Math.max(1, Number(qty) || 1) } : l))
    );
  }

  function removeDraftLine(uid) {
    setDraftLines((prev) => prev.filter((l) => l.uid !== uid));
  }

  function buildNoteWithInternal() {
    const parts = [];
    if (note?.trim()) parts.push(note.trim());
    if (isInternal) parts.push(`Internal works${staff?.label ? ` · Staff: ${staff.label}` : ""}`);
    return parts.join(" | ");
  }

  async function attachAccessories(manifestId, itemUids) {
    try {
      const parentUids = Array.from(new Set(itemUids));
      if (!parentUids.length) return;
      const { data: info } = await sb
        .from("inventory_union")
        .select("uid,classification")
        .in("uid", parentUids);
      const parents = (info || [])
        .filter((r) => ["LIGHT_TOOL", "HEAVY_TOOL", "VEHICLE"].includes((r.classification || "").toUpperCase()))
        .map((r) => r.uid);
      if (!parents.length) return;
      const { data: existing } = await sb
        .from("manifest_items")
        .select("item_uid")
        .eq("manifest_id", manifestId);
      const existingSet = new Set((existing || []).map((r) => r.item_uid));
      const { data: accs } = await sb
        .from("accessories")
        .select("uid,quantity_total,nested_parent_uid")
        .in("nested_parent_uid", parents);
      const lines = (accs || [])
        .filter((a) => !existingSet.has(a.uid))
        .map((a) => ({
          manifest_id: manifestId,
          item_uid: a.uid,
          qty_required: Math.max(1, Number(a.quantity_total || 0)),
          status: "pending",
        }));
      if (lines.length) await sb.from("manifest_items").insert(lines);
    } catch (e) {
      console.warn("[new manifest] accessories add skipped", e?.message || e);
    }
  }

  async function addDraftLines(manifestId, insertedSet) {
    if (!draftLines.length) return;
    const { data: existing } = await sb
      .from("manifest_items")
      .select("id,item_uid,qty_required")
      .eq("manifest_id", manifestId);
    const existingMap = new Map((existing || []).map((r) => [r.item_uid, r]));
    const inserts = [];
    const updates = [];
    for (const line of draftLines) {
      const qty = Math.max(1, Number(line.qty) || 1);
      const uid = line.uid;
      insertedSet.add(uid);
      if (existingMap.has(uid)) {
        updates.push({ id: existingMap.get(uid).id, qty });
      } else {
        inserts.push({ manifest_id: manifestId, item_uid: uid, qty_required: qty, status: "pending" });
      }
    }
    if (inserts.length) {
      const { error } = await sb.from("manifest_items").insert(inserts);
      if (error) throw error;
    }
    for (const upd of updates) {
      await sb.from("manifest_items").update({ qty_required: upd.qty }).eq("id", upd.id);
    }
  }

  async function createManifest() {
    const insertPayload = {
      job_id: job?.value || null,
      van_id: van?.value || null,
      status: "pending",
      note: buildNoteWithInternal() || null,
    };
    if (isInternal) {
      insertPayload.purpose = "internal";
      insertPayload.staff_id = staff?.value || null;
    }

    let manifestId = null;
    const { data: man, error: manErr } = await sb
      .from("active_manifests")
      .insert(insertPayload)
      .select("id")
      .single();

    if (manErr) {
      console.warn("[new manifest] insert with internal fields failed, retrying without extras", manErr.message || manErr);
      const fallbackPayload = { ...insertPayload };
      delete fallbackPayload.purpose;
      delete fallbackPayload.staff_id;
      const { data: retry, error: retryErr } = await sb
        .from("active_manifests")
        .insert(fallbackPayload)
        .select("id")
        .single();
      if (retryErr) throw retryErr;
      manifestId = retry.id;
    } else {
      manifestId = man.id;
    }

    const insertedUids = new Set();

    if (template?.value) {
      const { data: ti, error: tmpErr } = await sb
        .from("manifest_template_items")
        .select("item_uid, qty_required, zone_id, bay_id, shelf_id")
        .eq("template_id", template.value);

      if (tmpErr) {
        console.warn("Template items fetch failed; continuing empty manifest", tmpErr);
      } else {
        const items = (ti || []).map((r) => ({
          manifest_id: manifestId,
          item_uid: r.item_uid,
          qty_required: Number(r.qty_required || 0),
          qty_checked_out: 0,
          qty_checked_in: 0,
          zone_id: r.zone_id || null,
          bay_id: r.bay_id || null,
          shelf_id: r.shelf_id || null,
          status: "pending",
        }));
        if (items.length) {
          const { error: miErr } = await sb.from("manifest_items").insert(items);
          if (miErr) throw miErr;
          items.forEach((r) => insertedUids.add(r.item_uid));
        }
      }
    }

    await addDraftLines(manifestId, insertedUids);
    await attachAccessories(manifestId, Array.from(insertedUids));

    return manifestId;
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!validate()) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    try {
      setSubmitting(true);
      const id = await createManifest();
      toast.success("Manifest created");
      router.replace(`/manifests/${id}`);
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to create manifest");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">New Manifest</h1>
        <Link href="/manifests" className="underline">Back to Manifests</Link>
      </div>

      <Card>
        <CardHeader>Details</CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid md:grid-cols-2 gap-4">
            {/* Manifest type */}
            <div className="space-y-1 md:col-span-2">
              <div className="text-sm text-neutral-500">Manifest Type</div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={!isInternal ? "default" : "outline"}
                  onClick={() => setIsInternal(false)}
                  size="sm"
                >
                  Actual Work
                </Button>
                <Button
                  type="button"
                  variant={isInternal ? "default" : "outline"}
                  onClick={() => setIsInternal(true)}
                  size="sm"
                >
                  Internal Works
                </Button>
              </div>
              <div className="text-xs text-neutral-500">
                Internal works will be tagged to a staff member for non-job tasks.
              </div>
            </div>
            {/* Template */}
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Template</div>
              <Select
                items={templates}
                triggerLabel={template?.label || "Select template"}
                onSelect={setTemplate}
              />
              {errors.template && <p className="text-xs text-red-600 mt-1">{errors.template}</p>}
            </div>

            {/* Job */}
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Job{isInternal ? "" : "*"}</div>
              <Select
                items={jobs}
                triggerLabel={job?.label || "Select job"}
                onSelect={setJob}
              />
              {errors.job && <p className="text-xs text-red-600 mt-1">{errors.job}</p>}
            </div>

            {/* Staff for internal */}
            {isInternal && (
              <div className="space-y-1">
                <div className="text-sm text-neutral-500">Assign Staff*</div>
                <Select
                  items={staffList}
                  triggerLabel={staff?.label || "Pick staff"}
                  onSelect={setStaff}
                />
                {errors.staff && <p className="text-xs text-red-600 mt-1">{errors.staff}</p>}
              </div>
            )}

            {/* Van (optional) */}
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Assign Van</div>
              <Select
                items={vans}
                triggerLabel={van?.label || "Select van (optional)"}
                onSelect={setVan}
              />
            </div>

            {/* Note (optional) */}
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Note</div>
              <Input value={note} onChange={e => setNote(e.target.value)} placeholder="(optional)" />
            </div>

            {/* Build manifest items inline */}
            <div className="md:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Build Manifest (no template)</div>
                <div className="text-xs text-neutral-500">{draftLines.length} selected</div>
              </div>
              <Input
                value={draftSearch}
                onChange={(e) => setDraftSearch(e.target.value)}
                placeholder="Search inventory to add items"
              />
              <div className="grid gap-2 max-h-[260px] overflow-auto">
                {draftResults.map((res) => (
                  <div
                    key={res.uid}
                    className="p-3 rounded-xl border bg-white dark:bg-neutral-900 dark:border-neutral-800 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-lg overflow-hidden bg-neutral-100 border">
                        {res.photo_url ? (
                          <img src={res.photo_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full grid place-items-center text-[10px] text-neutral-400">
                            No image
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="font-medium">{res.name || res.uid}</div>
                        <div className="text-xs text-neutral-500">
                          {res.uid} · {res.classification || "Item"}
                        </div>
                        {typeof res.quantity_available === "number" ? (
                          <div className="text-xs text-neutral-500 mt-1">
                            Available: {res.quantity_available}
                            {typeof res.quantity_total === "number" ? ` / ${res.quantity_total}` : ""}{" "}
                            {res.unit || ""}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => addDraftLine(res)}>
                      Add
                    </Button>
                  </div>
                ))}
                {draftSearch && draftResults.length === 0 && (
                  <div className="text-sm text-neutral-500">No matches found.</div>
                )}
              </div>
              {draftLines.length ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Items to add</div>
                  {draftLines.map((line) => (
                    <div
                      key={line.uid}
                      className="p-3 rounded-xl border bg-white dark:bg-neutral-900 dark:border-neutral-800 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-lg overflow-hidden bg-neutral-100 border">
                          {line.photo_url ? (
                            <img src={line.photo_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full grid place-items-center text-[10px] text-neutral-400">
                              No image
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-medium">{line.name || line.uid}</div>
                          <div className="text-xs text-neutral-500">
                            {line.uid} · {line.classification || "Item"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="1"
                          className="w-20 h-9"
                          value={line.qty}
                          onChange={(e) => updateDraftQty(line.uid, e.target.value)}
                        />
                        <Button type="button" variant="outline" onClick={() => removeDraftLine(line.uid)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Summary */}
            <div className="md:col-span-2 p-3 rounded-xl border bg-white dark:bg-neutral-900 dark:border-neutral-800">
              <div className="font-semibold mb-2">Summary</div>
              <ul className="text-sm">
                {summary.map(r => (
                  <li key={r.k} className="flex gap-2">
                    <div className="w-28 text-neutral-500 dark:text-neutral-400">{r.k}</div>
                    <div className="flex-1">{r.v}</div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="md:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => history.back()}>Cancel</Button>
              <Button type="submit" disabled={submitting}>{submitting ? "Creating�?�" : "Create Manifest"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
