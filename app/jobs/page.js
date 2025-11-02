"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase-browser";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent } from "../../components/ui/card";
import { toast } from "sonner";

export default function JobsPage() {
  const sb = supabaseBrowser();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");

  async function loadJobs() {
    setLoading(true);
    const { data, error } = await sb
      .from("jobs")
      .select("id,name,created_at")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      toast.error("Failed to load jobs");
    }
    setJobs(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createJob() {
    const name = (newName || "").trim();
    if (!name) {
      toast.error("Job name is required");
      return;
    }
    setSaving(true);
    const { error } = await sb.from("jobs").insert({ name });
    setSaving(false);
    if (error) {
      console.error(error);
      toast.error("Failed to create job");
      return;
    }
    setNewName("");
    toast.success("Job created");
    loadJobs();
  }

  function startEdit(job) {
    setEditingId(job.id);
    setEditingName(job.name || "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
  }

  async function saveEdit() {
    const name = (editingName || "").trim();
    if (!name) {
      toast.error("Job name is required");
      return;
    }
    const id = editingId;
    setSaving(true);
    const { error } = await sb.from("jobs").update({ name }).eq("id", id);
    setSaving(false);
    if (error) {
      console.error(error);
      toast.error("Failed to update job");
      return;
    }
    toast.success("Job updated");
    setEditingId(null);
    setEditingName("");
    loadJobs();
  }

  async function deleteJob(id) {
    if (!confirm("Delete this job? This cannot be undone.")) return;
    const { error } = await sb.from("jobs").delete().eq("id", id);
    if (error) {
      console.error(error);
      toast.error("Failed to delete job");
      return;
    }
    toast.success("Job deleted");
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Jobs</h1>
      </div>

      <Card>
        <CardContent>
          <div className="flex items-center gap-2 py-4">
            <Input
              placeholder="New job name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createJob();
              }}
            />
            <Button onClick={createJob} disabled={saving}>
              Create
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {loading ? (
            <div className="p-4 text-sm text-neutral-500">Loading…</div>
          ) : jobs.length === 0 ? (
            <div className="p-4 text-sm text-neutral-500">No jobs found.</div>
          ) : (
            <div className="grid gap-2 py-3">
              {jobs.map((j) => (
                <div
                  key={j.id}
                  className="p-3 rounded-xl border dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-neutral-100 dark:bg-neutral-800 grid place-items-center text-xs text-neutral-500 border dark:border-neutral-700">
                      {String(j.id).slice(-3)}
                    </div>
                    <div className="min-w-0">
                      {editingId === j.id ? (
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="h-9 w-64"
                        />
                      ) : (
                        <div className="font-medium truncate max-w-xl">{j.name}</div>
                      )}
                      <div className="text-xs text-neutral-500">
                        {new Date(j.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {editingId === j.id ? (
                      <>
                        <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saving}>
                          Cancel
                        </Button>
                        <Button size="sm" onClick={saveEdit} disabled={saving}>
                          Save
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => startEdit(j)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => deleteJob(j.id)}>
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

