"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "../../../lib/supabase-browser";
import { Card, CardContent, CardHeader } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Select } from "../../../components/ui/select";
import { toast } from "sonner";
import Link from "next/link";

const JOB_TYPES = [
  { value: "pouring", label: "Pouring" },
  { value: "polishing", label: "Polishing" },
  { value: "detailing", label: "Detailing" },
];

export default function NewTemplateClient() {
  const sb = supabaseBrowser();
  const router = useRouter();

  const [name, setName] = useState("");
  const [jobType, setJobType] = useState(null);
  const [finish, setFinish] = useState("");
  const [colour, setColour] = useState("");
  const [mult, setMult] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  function validate() {
    const e = {};
    if (!name.trim()) e.name = "Template name is required";
    if (!jobType?.value) e.jobType = "Job type is required";
    if (mult !== "" && isNaN(Number(mult))) e.mult = "Multiplier must be a number";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!validate()) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    try {
      setSubmitting(true);
      const payload = {
        name: name.trim(),
        job_type: jobType.value,
        finish_type: finish || null,
        colour: colour || null,
        size_multiplier: mult === "" ? null : Number(mult),
      };
      const { data, error } = await sb.from("manifest_templates").insert(payload).select("id").single();
      if (error) throw error;
      toast.success("Template created");
      // Navigate to unified editor for adding items and later manifest creation
      router.replace(`/templates/${data.id}`);
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to create template");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">New Template</h1>
        <Link className="underline" href="/templates">Back to Templates</Link>
      </div>

      <Card className="dark:border-neutral-800">
        <CardHeader>Details</CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid md:grid-cols-2 gap-4">
            {/* Name */}
            <div className="space-y-1 md:col-span-2">
              <div className="text-sm text-neutral-500">Template name*</div>
              <Input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Polishing – 50m² – Dark Grey – Matt" />
              {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
            </div>

            {/* Job type */}
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Type of job*</div>
              <Select
                items={JOB_TYPES}
                triggerLabel={jobType?.label || "Select job type"}
                onSelect={setJobType}
              />
              {errors.jobType && <p className="text-xs text-red-600 mt-1">{errors.jobType}</p>}
            </div>

            {/* Finish */}
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Type of finish</div>
              <Input value={finish} onChange={e=>setFinish(e.target.value)} placeholder="e.g. Matt / Gloss / Exposed" />
            </div>

            {/* Colour */}
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Colour</div>
              <Input value={colour} onChange={e=>setColour(e.target.value)} placeholder="e.g. Dark Grey" />
            </div>

            {/* Size multiplier */}
            <div className="space-y-1">
              <div className="text-sm text-neutral-500">Size (multiplier)</div>
              <Input type="number" step="0.01" value={mult} onChange={e=>setMult(e.target.value)} placeholder="e.g. 1.5" />
              {errors.mult && <p className="text-xs text-red-600 mt-1">{errors.mult}</p>}
            </div>

            {/* Summary */}
            <div className="md:col-span-2 p-3 rounded-xl border bg-white dark:bg-neutral-900 dark:border-neutral-800">
              <div className="font-semibold mb-2">Summary</div>
              <ul className="text-sm">
                <li className="flex gap-2"><div className="w-28 text-neutral-500">Job</div><div>{jobType?.label || "—"}</div></li>
                <li className="flex gap-2"><div className="w-28 text-neutral-500">Finish</div><div>{finish || "—"}</div></li>
                <li className="flex gap-2"><div className="w-28 text-neutral-500">Colour</div><div>{colour || "—"}</div></li>
                <li className="flex gap-2"><div className="w-28 text-neutral-500">Multiplier</div><div>{mult || "—"}</div></li>
              </ul>
            </div>

            <div className="md:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => history.back()}>Cancel</Button>
              <Button type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create Template"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

