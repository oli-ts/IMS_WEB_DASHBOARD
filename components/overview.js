"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../lib/supabase-browser.js";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Button } from "./ui/button";

export default function Overview() {
  const [kpi, setKpi] = useState({
    stock: 0,
    activeJobs: 0,
    exceptions: 0,
    lowStock: 0,
    totalItems: 0,
  });
  const [needsRepair, setNeedsRepair] = useState([]);
  const [needsMaintenance, setNeedsMaintenance] = useState([]);
  const sb = useMemo(() => supabaseBrowser(), []);

  async function fetchConditionItems(conditionValue) {
    const columns = "uid,name,condition,photo_url,classification,maintenance_priority";
    const target = conditionValue === "broken" ? "broken" : "needs_service";
    let res = await sb
      .from("inventory_union")
      .select(columns)
      .eq("condition", target)
      .limit(200);
    if (res.error) {
      if (/maintenance_priority/i.test(res.error.message || "")) {
        res = await sb
          .from("inventory_union")
          .select("uid,name,condition,photo_url")
          .eq("condition", target)
          .limit(200);
      }
      console.warn("[overview] condition fetch failed", res.error);
      if (res.error) return [];
    }
    const rows = res.data || [];
    // Also try uid_registry as a fallback for items that might not be in the union
    if (rows.length < 50) {
      try {
        let reg = await sb
          .from("uid_registry")
          .select(columns)
          .eq("condition", target)
          .limit(200);
        if (reg.error && /maintenance_priority/i.test(reg.error.message || "")) {
          reg = await sb
            .from("uid_registry")
            .select("uid,name,condition,photo_url")
            .eq("condition", target)
            .limit(200);
        }
        if (!reg.error && reg.data?.length) {
          const seen = new Set(rows.map((r) => r.uid));
          for (const row of reg.data) {
            if (!seen.has(row.uid)) rows.push(row);
          }
        }
      } catch (err) {
        console.warn("[overview] uid_registry fallback failed", err?.message || err);
      }
    }
    return rows.map((r) => ({
      ...r,
      maintenance_priority: typeof r.maintenance_priority === "number" ? r.maintenance_priority : 0,
    }));
  }

  useEffect(() => {
    async function load() {
      const [{ data: cons }, { data: jobs }, { data: ex }, repairItems, maintenanceItems] = await Promise.all([
        sb.from("consumable_stock").select("uid"),
        sb.from("active_manifests").select("id"),
        sb.from("exceptions").select("id"),
        fetchConditionItems("broken"),
        fetchConditionItems("needs_service"),
      ]);
      let totalItems = 0;
      try {
        const { count, error } = await sb
          .from("uid_registry")
          .select("uid", { count: "exact", head: true });
        if (error) throw error;
        totalItems = count || 0;
      } catch (err) {
        console.warn("[overview] uid_registry count failed, falling back", err?.message || err);
        const { count } = await sb
          .from("inventory_union")
          .select("uid", { count: "exact", head: true });
        totalItems = count || 0;
      }
      setKpi({
        stock: cons?.length || 0,
        activeJobs: jobs?.length || 0,
        exceptions: ex?.length || 0,
        lowStock: 0,
        totalItems,
      });
      const order = (rows) => {
        const weight = (cls) => {
          const c = (cls || "").toUpperCase();
          if (c === "HEAVY_TOOL") return 1;
          if (c === "LIGHT_TOOL") return 2;
          return 3;
        };
        return [...rows].sort((a, b) => {
          const wa = weight(a.classification);
          const wb = weight(b.classification);
          if (wa !== wb) return wa - wb;
          return (a.name || "").localeCompare(b.name || "");
        });
      };
      setNeedsRepair(order(repairItems));
      setNeedsMaintenance(order(maintenanceItems));
    }
    load();
  }, [sb]);

  const cards = [
    { title: "Total Items (UID Registry)", value: kpi.totalItems },
    { title: "Active Jobs", value: kpi.activeJobs },
    { title: "Exceptions", value: kpi.exceptions },
    { title: "Low Stock Alerts", value: kpi.lowStock },
  ];

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.title}>
            <CardHeader>{c.title}</CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="border-red-200 dark:border-red-500 max-h-[500px] overflow-hidden overflow-y-auto scrollbar-ghost">
          <CardHeader>Needs Repair</CardHeader>
          <CardContent className="space-y-3">
            {needsRepair.length === 0 ? (
              <div className="text-sm text-neutral-500">No items flagged for repair.</div>
            ) : (
              needsRepair.map((item) => (
                <div
                  key={item.uid}
                  className="flex gap-3 p-2 rounded-xl border bg-white dark:bg-neutral-900 dark:border-neutral-800"
                >
                  <div className="h-14 w-14 rounded-lg overflow-hidden bg-neutral-100 border shrink-0">
                    {item.photo_url ? (
                      <img src={item.photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full grid place-items-center text-[10px] text-neutral-400">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{item.name || "Unnamed"}</div>
                    <div className="text-xs text-neutral-500 truncate">UID: {item.uid}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-neutral-500 uppercase">
                      {(item.classification || "").replace(/_/g, " ")}
                    </div>
                    <Link href={`/inventory/${encodeURIComponent(item.uid)}`}>
                      <Button size="sm" variant="outline">View</Button>
                    </Link>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-amber-200 dark:border-amber-500 max-h-[500px] overflow-hidden overflow-y-auto scrollbar-ghost">
          <CardHeader>Needs Maintenance</CardHeader>
          <CardContent className="space-y-3">
            {needsMaintenance.length === 0 ? (
              <div className="text-sm text-neutral-500">No items waiting for maintenance.</div>
            ) : (
              needsMaintenance.map((item) => (
                <div
                  key={item.uid}
                  className="flex gap-3 p-2 rounded-xl border bg-white dark:bg-neutral-900 dark:border-neutral-800"
                >
                  <div className="h-14 w-14 rounded-lg overflow-hidden bg-neutral-100 border shrink-0">
                    {item.photo_url ? (
                      <img src={item.photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full grid place-items-center text-[10px] text-neutral-400">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{item.name || "Unnamed"}</div>
                    <div className="text-xs text-neutral-500 truncate">UID: {item.uid}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-neutral-500 uppercase">
                      {(item.classification || "").replace(/_/g, " ")}
                    </div>
                    <Link href={`/inventory/${encodeURIComponent(item.uid)}`}>
                      <Button size="sm" variant="outline">View</Button>
                    </Link>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
