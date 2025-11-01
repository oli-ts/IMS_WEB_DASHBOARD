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

  const [template, setTemplate] = useState(null);
  const [job, setJob] = useState(null);
  const [van, setVan] = useState(null);
  const [note, setNote] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  // Load lists
  useEffect(() => {
    (async () => {
      const [{ data: tpls }, { data: js }, { data: vs }] = await Promise.all([
        sb.from("manifest_templates").select("id,name").order("name"),
        sb.from("jobs").select("id,name").order("name"),
        sb.from("vans").select("id,reg_number").order("reg_number"),
      ]);

      const tOpts = (tpls || []).map(t => ({ value: t.id, label: t.name }));
      const jOpts = (js || []).map(j => ({ value: j.id, label: j.name }));
      const vOpts = (vs || []).map(v => ({ value: v.id, label: v.reg_number }));

      setTemplates(tOpts);
      setJobs(jOpts);
      setVans(vOpts);

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

  function validate() {
    const e = {};
    if (!template?.value) e.template = "Template is required";
    if (!job?.value) e.job = "Job is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const summary = useMemo(() => {
    return [
      { k: "Template", v: template?.label || "-" },
      { k: "Job", v: job?.label || "-" },
      { k: "Van", v: van?.label || "-" },
    ];
  }, [template, job, van]);

  async function createManifest() {
    // 1) Insert active_manifests
    const insertPayload = {
      job_id: job.value,
      van_id: van?.value || null,
      status: "pending",
      note: note || null, // if your table has a note/description column; else remove this
    };
    const { data: man, error: manErr } = await sb
      .from("active_manifests")
      .insert(insertPayload)
      .select("id")
      .single();

    if (manErr) throw manErr;

    const manifestId = man.id;

    // 2) Copy template items -> manifest_items
    // Assumes a table like `manifest_template_items` with: template_id, item_uid, qty_required, zone_id, bay_id, shelf_id
    const { data: ti, error: tmpErr } = await sb
      .from("manifest_template_items")
      .select("item_uid, qty_required, zone_id, bay_id, shelf_id")
      .eq("template_id", template.value);

    if (tmpErr) {
      // If the table doesn't exist in your DB, skip gracefully (you'll add items manually later)
      console.warn("Template items fetch failed; creating empty manifest", tmpErr);
      return manifestId;
    }

    const items = (ti || []).map(r => ({
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
      // After base lines inserted, include accessories for any parent items
      try {
        const parentUids = Array.from(new Set(items.map((r) => r.item_uid)));
        if (parentUids.length) {
          const { data: info } = await sb
            .from("inventory_union")
            .select("uid,classification")
            .in("uid", parentUids);
          const parents = (info || [])
            .filter((r) => ["LIGHT_TOOL", "HEAVY_TOOL", "VEHICLE"].includes((r.classification || "").toUpperCase()))
            .map((r) => r.uid);
          if (parents.length) {
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
              .map((a) => ({ manifest_id: manifestId, item_uid: a.uid, qty_required: Math.max(1, Number(a.quantity_total || 0)), status: "pending" }));
            if (lines.length) await sb.from("manifest_items").insert(lines);
          }
        }
      } catch (e) {
        console.warn("[new manifest] accessories add skipped", e?.message || e);
      }
    }

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
            {/* Template */}
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Template*</div>
              <Select
                items={templates}
                triggerLabel={template?.label || "Select template"}
                onSelect={setTemplate}
              />
              {errors.template && <p className="text-xs text-red-600 mt-1">{errors.template}</p>}
            </div>

            {/* Job */}
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Job*</div>
              <Select
                items={jobs}
                triggerLabel={job?.label || "Select job"}
                onSelect={setJob}
              />
              {errors.job && <p className="text-xs text-red-600 mt-1">{errors.job}</p>}
            </div>

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
