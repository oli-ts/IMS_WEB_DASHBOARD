"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../../../lib/supabase-browser";
import { Card, CardContent } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { toast } from "sonner";

export default function VanDetailClient({ vanId }) {
  const sb = supabaseBrowser();
  const [van, setVan] = useState(null);
  const [manifest, setManifest] = useState(null);
  const [items, setItems] = useState([]);
  const [itemMap, setItemMap] = useState({});
  const [exceptions, setExceptions] = useState([]);
  const channelRef = useRef(null);
  const [serviceEntry, setServiceEntry] = useState("");
  const [savingService, setSavingService] = useState(false);

  useEffect(() => {
    (async () => {
         const { data: vs } = await sb
        .from("vans")
        .select("id, reg_number, assigned_team_id, current_job_id, make, model, mot_date, service_history, photo_url, teams(name)")
        .eq("id", vanId)
        .single();
      setVan(vs || null);

      const { data: mans } = await sb
        .from("active_manifests")
        .select("id,status,created_at,job_id, jobs(name,address)")
        .eq("van_id", vanId)
        .in("status", ["pending", "active"])
        .order("created_at", { ascending: false })
        .limit(1);
      const m = mans?.[0] || null;
      setManifest(m);

      if (!m) {
        setItems([]);
        setItemMap({});
        setExceptions([]);
        return;
      }

      await reloadItemsAndEnrichment(sb, m.id, setItems, setItemMap);
      await reloadExceptions(sb, m.id, setExceptions);
    })();
  }, [vanId, sb]);

  // realtime subscriptions
  useEffect(() => {
    if (!manifest?.id) return;
    if (channelRef.current) {
      sb.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    const channel = sb
      .channel(`van-${vanId}-manifest-${manifest.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "manifest_items",
          filter: `manifest_id=eq.${manifest.id}`,
        },
        async () => {
          await reloadItemsAndEnrichment(sb, manifest.id, setItems, setItemMap);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "exceptions",
          filter: `manifest_id=eq.${manifest.id}`,
        },
        async () => {
          await reloadExceptions(sb, manifest.id, setExceptions);
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) {
        sb.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [manifest?.id, sb, vanId]);

  const onboard = useMemo(
    () =>
      items.filter(
        (i) => Number(i.qty_checked_out || 0) - Number(i.qty_checked_in || 0) > 0
      ),
    [items]
  );

  const kpi = useMemo(() => {
    const totals = items.reduce(
      (acc, i) => {
        acc.req += Number(i.qty_required || 0);
        acc.out += Number(i.qty_checked_out || 0);
        acc.in += Number(i.qty_checked_in || 0);
        return acc;
      },
      { req: 0, out: 0, in: 0 }
    );
    const onboardQty = Math.max(totals.out - totals.in, 0);
    const exTotal = exceptions.length;
    const exMissing = exceptions.filter((e) => e.type === "missing").length;
    const exDamaged = exceptions.filter((e) => e.type === "damaged").length;

    return {
      onboardQty,
      exTotal,
      exMissing,
      exDamaged,
      required: totals.req,
      checkedOut: totals.out,
      checkedIn: totals.in,
    };
  }, [items, exceptions]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-neutral-500">Van</div>
          <div className="text-2xl font-semibold">{van?.reg_number || "—"}</div>
          <div className="text-sm">Make/Model: {(van?.make || "—") + " " + (van?.model || "")}</div>
          <div className="text-sm">MOT: {van?.mot_date ? new Date(van.mot_date).toLocaleDateString() : "—"}</div>
          <div className="text-sm">Team: {van?.teams?.name || "—"}</div>
        </div>
        {manifest && (
          <Link href={`/manifests/${manifest.id}`} className="underline">
            Open manifest
          </Link>
        )}
      </div>
       {/* Van Photo */}
      <Card>
        <CardContent>
          <div className="p-3">
            <div className="font-semibold mb-2">Photo</div>
            <div className="aspect-square rounded-2xl overflow-hidden bg-neutral-100 border max-w-sm">
              {van?.photo_url ? (
                <img src={van.photo_url} alt={`${van?.reg_number} photo`} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full grid place-items-center text-sm text-neutral-400">No image</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="p-3">
            <div className="font-semibold mb-2">Add Service Entry</div>
            <div className="grid gap-2 sm:grid-cols-5">
              <div className="sm:col-span-4">
                <Input
                  placeholder="Add service note (e.g. 2025-06-02: Brake pads)"
                  value={serviceEntry}
                  onChange={(e) => setServiceEntry(e.target.value)}
                />
              </div>
              <div className="sm:col-span-1">
                <Button
                  type="button"
                  disabled={savingService || !serviceEntry.trim()}
                  onClick={async () => {
                    if (!serviceEntry.trim()) return;
                    try {
                      setSavingService(true);
                      const stamp = new Date().toISOString().slice(0, 10);
                      const newLine = `${stamp}: ${serviceEntry.trim()}`;
                      const combined = van?.service_history ? `${van.service_history}\n${newLine}` : newLine;
                      const { error: upErr } = await sb
                        .from("vans")
                        .update({ service_history: combined })
                        .eq("id", vanId);
                      if (upErr) throw upErr;
                      setVan((prev) => ({ ...(prev || {}), service_history: combined }));
                      setServiceEntry("");
                      toast.success("Service history updated");
                    } catch (e) {
                      console.error(e);
                      toast.error(e.message || "Failed to update service history");
                    } finally {
                      setSavingService(false);
                    }
                  }}
                >
                  {savingService ? "Saving..." : "Add"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Onboard (qty)" value={kpi.onboardQty} />
        <Stat label="Required" value={kpi.required} />
        <Stat label="Checked Out" value={kpi.checkedOut} />
        <Stat label="Checked In" value={kpi.checkedIn} />
        <Stat label="Exceptions" value={kpi.exTotal} />
        <Stat label="Missing / Damaged" value={`${kpi.exMissing} / ${kpi.exDamaged}`} />
      </div>

      <Card>
        <CardContent>
          <div className="p-3">
            <div className="font-semibold mb-2">Assignment</div>
            <div className="text-sm">Job: {manifest?.jobs?.name || "—"}</div>
            <div className="text-sm">Status: {manifest?.status || "idle"}</div>
            <div className="text-sm">
              Created:{" "}
              {manifest
                ? new Date(manifest.created_at).toLocaleString()
                : "—"}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="p-3">
            <div className="font-semibold mb-3">What's onboard</div>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {onboard.map((i) => {
                const info = itemMap[i.item_uid];
                const out = Number(i.qty_checked_out || 0);
                const inq = Number(i.qty_checked_in || 0);
                return (
                  <div
                    key={i.id}
                    className="p-3 rounded-xl border bg-white dark:bg-neutral-900 dark:border-neutral-800"
                  >
                    <div className="text-sm text-neutral-500">
                      {info?.classification || "—"}
                    </div>
                    <div className="font-medium">
                      {info?.name || i.item_uid}
                    </div>
                    <div className="text-sm">UID: {i.item_uid}</div>
                    <div className="text-sm">Qty on van: {out - inq}</div>
                    <div className="text-xs text-neutral-500">
                      Last seen: {info?.location_last_seen || "—"}
                    </div>
                  </div>
                );
              })}
              {onboard.length === 0 && (
                <div className="text-sm text-neutral-500">
                  No outstanding items on this van.
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
            <Card>
        <CardContent>
          <div className="p-3">
            <div className="font-semibold mb-2">Service History</div>
           <div className="text-sm whitespace-pre-wrap">{van?.service_history || "—"}</div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-white rounded-xl border p-3">
      <div className="text-sm text-neutral-500">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

async function reloadItemsAndEnrichment(sb, manifestId, setItems, setItemMap) {
  const { data: mis } = await sb
    .from("manifest_items")
    .select(
      "id,item_uid,qty_required,qty_checked_out,qty_checked_in,status"
    )
    .eq("manifest_id", manifestId);
  setItems(mis || []);
  const uids = Array.from(new Set((mis || []).map((i) => i.item_uid)));
  if (uids.length) {
    const { data: inv } = await sb
      .from("inventory_union")
      .select("uid,name,classification,location_last_seen,status")
      .in("uid", uids);
    const map = Object.fromEntries((inv || []).map((i) => [i.uid, i]));
    setItemMap(map);
  } else {
    setItemMap({});
  }
}

async function reloadExceptions(sb, manifestId, setExceptions) {
  const { data: ex } = await sb
    .from("exceptions")
    .select("id,type,item_uid,created_at")
    .eq("manifest_id", manifestId)
    .order("created_at", { ascending: false });
  setExceptions(ex || []);
}
