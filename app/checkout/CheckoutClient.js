// app/checkout/CheckoutClient.js
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase-browser";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { Input } from "../../components/ui/input";
import { toast } from "sonner";

export default function CheckoutClient() {
  const sb = supabaseBrowser();

  // dropdowns
  const [manifests, setManifests] = useState([]);
  const [bays, setBays] = useState([]);

  // selection
  const [manifest, setManifest] = useState(null);
  const [manifestInfo, setManifestInfo] = useState(null);
  const [destBay, setDestBay] = useState(null);
  const [isAssigned, setIsAssigned] = useState(false);

  // lines
  const [rows, setRows] = useState([]); // from manifest_item_totals
  const [itemInfo, setItemInfo] = useState({}); // uid -> {name, photo_url, classification}
  const [q, setQ] = useState("");

  // Load manifests + staging bays
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

      const { data: bayRows } = await sb
        .from("staging_bays")
        .select("id,code,label")
        .eq("is_active", true)
        .order("code");

      setBays((bayRows || []).map((b) => ({ value: b.label, label: b.label })));
    })();
  }, [sb]);

  // When manifest changes → load header + derived totals
  useEffect(() => {
    (async () => {
      if (!manifest?.value) {
        setManifestInfo(null);
        setRows([]);
        setItemInfo({});
        return;
      }

      const { data: mh } = await sb
        .from("active_manifests")
        .select("id,status,job_id,van_id, jobs(name), vans(reg_number)")
        .eq("id", manifest.value)
        .single();
      setManifestInfo(mh || null);
      setIsAssigned(Boolean(mh && mh.status === "active"));

      // Pull derived totals (no counter columns)
      const { data: totals } = await sb
        .from("manifest_item_totals")
        .select("item_uid, qty_required, qty_checked_out, qty_checked_in")
        .eq("manifest_id", manifest.value);

      let list = totals || [];

      // Enrich with inventory info
      const uids = [...new Set(list.map((r) => r.item_uid))];
      let infoMap = {};
      if (uids.length) {
        const { data: inv } = await sb
          .from("inventory_union")
          .select("uid,name,photo_url,classification,nested_parent_uid")
          .in("uid", uids);
        infoMap = Object.fromEntries((inv || []).map((i) => [i.uid, i]));
      }
      setItemInfo(infoMap);

      // Ensure accessories are present as manifest lines for any parent items
      try {
        const parentUids = Object.values(infoMap)
          .filter((i) => ["LIGHT_TOOL", "HEAVY_TOOL", "VEHICLE"].includes((i.classification || "").toUpperCase()))
          .map((i) => i.uid);
        if (parentUids.length) {
          const existingSet = new Set(list.map((r) => r.item_uid));
          const { data: accs } = await sb
            .from("accessories")
            .select("uid,quantity_total,nested_parent_uid")
            .in("nested_parent_uid", parentUids);
          const lines = (accs || [])
            .filter((a) => !existingSet.has(a.uid))
            .map((a) => ({ manifest_id: manifest.value, item_uid: a.uid, qty_required: Math.max(1, Number(a.quantity_total || 0)), status: "pending" }));
          if (lines.length) {
            await sb.from("manifest_items").insert(lines);
            // reload totals after insert
            const { data: totals2 } = await sb
              .from("manifest_item_totals")
              .select("item_uid, qty_required, qty_checked_out, qty_checked_in")
              .eq("manifest_id", manifest.value);
            list = totals2 || list;
            // ensure itemInfo includes newly added accessories
            const uids2 = [...new Set((list || []).map((r) => r.item_uid))];
            const missing = uids2.filter((u) => !infoMap[u]);
            if (missing.length) {
              const { data: inv2 } = await sb
                .from("inventory_union")
                .select("uid,name,photo_url,classification,nested_parent_uid")
                .in("uid", missing);
              const add = Object.fromEntries((inv2 || []).map((i) => [i.uid, i]));
              setItemInfo((prev) => ({ ...prev, ...add }));
              infoMap = { ...infoMap, ...add };
            }
          }
        }
      } catch (e) {
        console.warn("[checkout] ensure accessories skipped", e?.message || e);
      }

      // Initialize UI selection based on “remaining to checkout”
      setRows(
        list.map((r) => {
          const remaining = Math.max(0, Number(r.qty_required || 0) - Number(r.qty_checked_out || 0));
          return {
            ...r,
            selected: remaining > 0,
            qty: remaining, // default suggested qty
          };
        })
      );
    })();
  }, [manifest, sb]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const remaining = Math.max(0, Number(r.qty_required || 0) - Number(r.qty_checked_out || 0));
      if (remaining <= 0) return false;
      if (!q) return true;
      const info = itemInfo[r.item_uid];
      const hay = `${r.item_uid} ${(info?.name || "")} ${(info?.classification || "")}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [rows, itemInfo, q]);

  // Group accessories under their parent items for visual clarity
  const grouped = useMemo(() => {
    const parents = [];
    const byParent = new Map();
    for (const r of filtered) {
      const info = itemInfo[r.item_uid] || {};
      const cls = (info.classification || "").toUpperCase();
      if (cls === "ACCESSORY" && info.nested_parent_uid) {
        const list = byParent.get(info.nested_parent_uid) || [];
        list.push(r);
        byParent.set(info.nested_parent_uid, list);
      } else {
        parents.push(r);
      }
    }
    const ordered = [];
    const pushed = new Set();
    const push = (r) => { if (!pushed.has(r.item_uid)) { ordered.push(r); pushed.add(r.item_uid); } };
    for (const p of parents) {
      push(p);
      const kids = byParent.get(p.item_uid) || [];
      for (const k of kids) push(k);
    }
    // Orphan accessories where parent line isn’t present
    for (const [pid, kids] of byParent.entries()) {
      if (!pushed.has(pid)) {
        for (const k of kids) push(k);
      }
    }
    return ordered;
  }, [filtered, itemInfo]);

  async function submit() {
    try {
      if (!manifest?.value) return toast.error("Pick a manifest");
      const bayLabel = destBay?.value || "STAGING-A";

      const lines = filtered
        .filter((r) => r.selected && Number(r.qty) > 0)
        .map((r) => ({ item_uid: r.item_uid, qty: Number(r.qty) }));

      // If no lines selected, still allow staging: update manifest status only
      if (!lines.length) {
        if (!manifest?.value) return toast.error("Pick a manifest");
        const { error } = await sb
          .from("active_manifests")
          .update({ status: "staged" })
          .eq("id", manifest.value);
        if (error) return toast.error(error.message || "Failed to stage");
        toast.success("Manifest marked as staged");
        const copy = { ...manifest };
        setManifest(null);
        setTimeout(() => setManifest(copy), 0);
        return;
      }

      const res = await fetch("/api/manifest/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          manifestId: manifest.value,
          lines,
          to: { type: "staging", label: bayLabel },
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        return toast.error(j.error || "Checkout failed", {
          description: j.details || j.message || (j.reasons ? j.reasons.join(", ") : undefined),
        });
      }

      toast.success(`Checked out ${j.processed || 0} lines`);
      // refresh manifest
      const copy = { ...manifest };
      setManifest(null);
      setTimeout(() => setManifest(copy), 0);
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Failed to check out");
    }
  }

  // ⬇️ NEW: assign to van & activate (after staging)
  async function assignToVanAndActivate() {
    try {
      if (!manifestInfo?.id) return;
      if (!manifestInfo?.van_id) return toast.error("Manifest has no van linked.");
      const r = await fetch("/api/manifest/assign-to-van", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manifestId: manifestInfo.id }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        return toast.error(j.error || "Assign failed");
      }
      toast.success("Assigned to van & activated");
      setIsAssigned(true);
      const copy = { ...manifest };
      setManifest(null);
      setTimeout(() => setManifest(copy), 0);
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Failed to assign");
    }
  }

  const canAssign = Boolean(
    manifestInfo?.id &&
    manifestInfo?.van_id &&
    (manifestInfo?.status === "staged")
  );

  return (
    <div className="space-y-6">
      <div className="text-2xl font-semibold">Check-Out Manifests</div>

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
              items={bays}
              triggerLabel={destBay?.label || "Select staging bay"}
              onSelect={setDestBay}
            />
          </div>

          <div className="mt-4 grid md:grid-cols-3 gap-3">
            <Input placeholder="Filter items…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="flex items-center gap-2">
              {manifestInfo && (
                <Button
                  variant="outline"
                  size="md"
                  onClick={assignToVanAndActivate}
                  disabled={!canAssign}
                  title={canAssign ? "" : "Manifest needs a linked van"}
                >
                  Assign to van & activate
                </Button>
              )}
            </div>
            <Button onClick={submit}>
              Confirm Check-Out to Staging
            </Button>
          </div>

          {manifestInfo && (
            <div className="mt-3 text-sm text-neutral-600">
              <span className="mr-4">Job: <b>{manifestInfo?.jobs?.name || "—"}</b></span>
              <span className="mr-4">Van: <b>{manifestInfo?.vans?.reg_number || "—"}</b></span>
              <span>Status: <b>{manifestInfo?.status}</b></span>
            </div>
          )}

          <div className="mt-4 grid gap-2 max-h-[60vh] overflow-auto">
            {grouped.map((r) => {
              const info = itemInfo[r.item_uid];
              const remaining = Math.max(0, Number(r.qty_required || 0) - Number(r.qty_checked_out || 0));
              const isAcc = ((info?.classification || "").toUpperCase() === "ACCESSORY");

              return (
                <div
                  key={r.item_uid}
                  className={`p-3 rounded-xl border bg-white dark:bg-neutral-900 dark:border-neutral-800 ${r.selected ? "ring-2 ring-black dark:ring-white" : ""} ${isAcc ? "ml-6 border-l-2 pl-3 bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700" : ""}`}
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
                          {r.item_uid} · Remaining: {remaining}
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
                          const val = Math.max(0, Math.min(Number(e.target.value || 0), remaining));
                          setRows((prev) =>
                            prev.map((x) => (x.item_uid === r.item_uid ? { ...x, qty: val } : x))
                          );
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            {manifest && filtered.length === 0 && (
              <div className="text-sm text-neutral-500">No outstanding items on this manifest.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
