// app/checkin/CheckinClient.js
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase-browser";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { Input } from "../../components/ui/input";
import { toast } from "sonner";

export default function CheckinClient() {
  const sb = supabaseBrowser();

  const [manifests, setManifests] = useState([]);
  const [manifest, setManifest] = useState(null);
  const [manifestInfo, setManifestInfo] = useState(null);

  const [staging, setStaging] = useState([]);
  const [destOpt, setDestOpt] = useState(null);

  const [rows, setRows] = useState([]); // from manifest_item_onvan
  const [itemInfo, setItemInfo] = useState({});
  const [q, setQ] = useState("");

  // Report modal state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportItemUid, setReportItemUid] = useState("");
  const [reportTypes, setReportTypes] = useState([]); // ["missing","damaged","dirty",...]
  const [reportNotes, setReportNotes] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const REPORT_OPTIONS = [
    { value: "missing", label: "Missing" },
    { value: "damaged", label: "Damaged" },
    { value: "dirty", label: "Dirty" },
    { value: "incorrect", label: "Incorrect Item" },
  ];

  // load manifests + staging bays
  useEffect(() => {
    (async () => {
      const { data: mans } = await sb
        .from("active_manifests")
        .select("id,status,created_at, jobs(name), vans(reg_number)")
        .in("status", ["pending", "active", "staged"])
        .order("created_at", { ascending: false });

      setManifests(
        (mans || []).map((m) => ({
          value: m.id,
          label: `${m?.jobs?.name || "—"} · ${m?.vans?.reg_number || "no van"} · ${m.status}`,
        }))
      );

      const { data: bays } = await sb
        .from("staging_bays")
        .select("id,code,label")
        .eq("is_active", true)
        .order("code");

      setStaging((bays || []).map((b) => ({ value: b.label, label: b.label })));
    })();
  }, [sb]);

  // when manifest changes → load header + derived "on van" rows
  useEffect(() => {
    (async () => {
      if (!manifest?.value) {
        setRows([]);
        setItemInfo({});
        setManifestInfo(null);
        return;
      }

      const { data: mh } = await sb
        .from("active_manifests")
        .select("id,status,job_id,van_id, jobs(name), vans(reg_number)")
        .eq("id", manifest.value)
        .single();
      setManifestInfo(mh || null);

      const { data: onvan } = await sb
        .from("manifest_item_onvan")
        .select("item_uid, qty_on_van, qty_required, qty_checked_out, qty_checked_in")
        .eq("manifest_id", manifest.value);

      const list = (onvan || []).filter((r) => Number(r.qty_on_van || 0) > 0);

      const uids = [...new Set(list.map((r) => r.item_uid))];
      let infoMap = {};
      if (uids.length) {
        const { data: inv } = await sb
          .from("inventory_union")
          .select("uid,name,photo_url,classification")
          .in("uid", uids);
        infoMap = Object.fromEntries((inv || []).map((i) => [i.uid, i]));
      }
      setItemInfo(infoMap);

      // initialize selection with "on van" qty
      setRows(
        list.map((r) => ({
          ...r,
          selected: Number(r.qty_on_van || 0) > 0,
          qty: Number(r.qty_on_van || 0),
        }))
      );
    })();
  }, [manifest, sb]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const onvan = Math.max(0, Number(r.qty_on_van || 0));
      if (onvan <= 0) return false;
      if (!q) return true;
      const info = itemInfo[r.item_uid];
      const hay = `${r.item_uid} ${(info?.name || "")} ${(info?.classification || "")}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [rows, itemInfo, q]);

  async function submit() {
    try {
      if (!manifest?.value) return toast.error("Pick a manifest");
      const bay = destOpt?.value || "STAGING-A";

      const lines = filtered
        .filter((r) => r.selected && Number(r.qty) > 0)
        .map((r) => ({
          item_uid: r.item_uid,
          qty: Math.min(Number(r.qty), Number(r.qty_on_van || 0)),
        }));

      if (!lines.length) return toast.error("Select at least one line");

      const res = await fetch("/api/manifest/checkin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          manifestId: manifest.value,
          lines,
          to: { type: "staging", label: bay },
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        return toast.error(j.error || "Check-in failed", {
          description: j.details || j.message || (j.reasons ? j.reasons.join(", ") : undefined),
        });
      }

      toast.success(`Checked in ${j.processed || 0} lines`);
      const copy = { ...manifest };
      setManifest(null);
      setTimeout(async () => {
  // reload header
  const sb = supabaseBrowser();
  const { data: mh } = await sb
    .from("active_manifests")
    .select("status")
    .eq("id", copy.value)
    .single();
  if (!mh || mh.status === "closed") {
    toast.success("Manifest closed");
  } else {
    setManifest(copy);
  }
}, 0);
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Failed to check in");
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-2xl font-semibold">Check-In Manifests</div>

      <Card>
        <CardHeader>Pick manifest & staging bay</CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-3">
            <Select
              items={manifests}
              triggerLabel={manifest?.label || "Select manifest"}
              onSelect={setManifest}
            />
            <Select
              items={staging}
              triggerLabel={destOpt?.label || "Select staging bay"}
              onSelect={setDestOpt}
            />
          </div>

          <div className="mt-4 grid md:grid-cols-3 gap-3">
            <Input placeholder="Filter items…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div />
            <Button onClick={submit}>Confirm Check-In</Button>
          </div>

          {manifestInfo && (
            <div className="mt-3 text-sm text-neutral-600">
              <span className="mr-4">Job: <b>{manifestInfo?.jobs?.name || "—"}</b></span>
              <span className="mr-4">Van: <b>{manifestInfo?.vans?.reg_number || "—"}</b></span>
              <span>Status: <b>{manifestInfo?.status}</b></span>
            </div>
          )}

          <div className="mt-4 grid gap-2 max-h-[60vh] overflow-auto">
            {filtered.map((r) => {
              const info = itemInfo[r.item_uid];
              const onvan = Math.max(0, Number(r.qty_on_van || 0));

              return (
                <div
                  key={r.item_uid}
                  className={`p-3 rounded-xl border bg-white ${r.selected ? "ring-2 ring-black" : ""}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-lg overflow-hidden bg-neutral-100 border">
                        {info?.photo_url ? (
                          <img src={info.photo_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full grid place-items-center text-[10px] text-neutral-400">No image</div>
                        )}
                      </div>
                      <div>
                        <div className="font-medium">{info?.name || r.item_uid}</div>
                        <div className="text-xs text-neutral-500">
                          {r.item_uid} · On van: {onvan}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={r.selected}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((x) =>
                              x.item_uid === r.item_uid ? { ...x, selected: e.target.checked } : x
                            )
                          )
                        }
                      />
                      <Input
                        type="number"
                        min="0"
                        className="w-24 h-9"
                        value={r.qty}
                        onChange={(e) => {
                          const cap = onvan;
                          const val = Math.max(0, Math.min(Number(e.target.value || 0), cap));
                          setRows((prev) =>
                            prev.map((x) => (x.item_uid === r.item_uid ? { ...x, qty: val } : x))
                          );
                        }}
                      />
                      <Button
                        variant="outline"
                        onClick={() => {
                          setReportItemUid(r.item_uid);
                          setReportTypes([]);
                          setReportNotes("");
                          setReportOpen(true);
                        }}
                      >
                        Report
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
            {manifest && filtered.length === 0 && (
              <div className="text-sm text-neutral-500">Nothing to check in — all items returned.</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Report Modal */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => !reportSubmitting && setReportOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border bg-white p-4 shadow-lg dark:bg-neutral-900 dark:border-neutral-800">
            <div className="text-lg font-semibold mb-2">Report Item</div>
            <div className="text-sm text-neutral-500 mb-3">UID: {reportItemUid}</div>
            <div className="space-y-2">
              <div className="text-sm text-neutral-500">Issues</div>
              <div className="flex flex-wrap gap-2">
                {REPORT_OPTIONS.map((opt) => {
                  const active = reportTypes.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setReportTypes((prev) =>
                          active ? prev.filter((v) => v !== opt.value) : [...prev, opt.value]
                        )
                      }
                      className={`px-2 py-1 rounded text-xs border ${
                        active
                          ? "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700"
                          : "bg-neutral-50 text-neutral-800 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <div className="space-y-1">
                <div className="text-sm text-neutral-500">Notes</div>
                <Input value={reportNotes} onChange={(e) => setReportNotes(e.target.value)} placeholder="Add any details..." />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" disabled={reportSubmitting} onClick={() => setReportOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={reportSubmitting}
                onClick={async () => {
                  try {
                    if (!manifest?.value) return toast.error("Pick a manifest first");
                    if (!reportItemUid) return toast.error("No item selected");
                    if (!reportTypes.length) return toast.error("Select at least one issue");
                    setReportSubmitting(true);
                    const rows = reportTypes.map((t) => ({
                      item_uid: reportItemUid,
                      manifest_id: manifest.value,
                      type: t,
                      notes: reportNotes || null,
                    }));
                    const { error } = await sb.from("exceptions").insert(rows);
                    if (error) throw new Error(error.message);
                    toast.success("Report logged");
                    setReportOpen(false);
                  } catch (e) {
                    console.error(e);
                    toast.error(e.message || "Failed to log report");
                  } finally {
                    setReportSubmitting(false);
                  }
                }}
              >
                Submit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
