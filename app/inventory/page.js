"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase-browser";
import { Input } from "../../components/ui/input";
import { Card, CardContent } from "../../components/ui/card";
import { Select } from "../../components/ui/select";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function InventoryPage() {
  const sb = supabaseBrowser();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [warehouse, setWarehouse] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [view, setView] = useState("grid");

  useEffect(() => {
    (async () => {
      const { data: wh } = await sb
        .from("warehouse")
        .select("id, wh_number, name");
      setWarehouses(
        (wh || []).map((w) => ({
          value: w.id,
          label: `${w.wh_number || "WH"} — ${w.name}`,
        }))
      );
    })();
  }, []);

  useEffect(() => {
    (async () => {
      let query = sb.from("inventory_union").select("*").limit(500);
      if (warehouse?.value) query = query.eq("warehouse_id", warehouse.value);
      const { data } = await query;
      setItems(data || []);
    })();
  }, [warehouse]);

  const filtered = useMemo(
    () =>
      items.filter((i) => {
        if (!q) return true;
        const hay = (
          i.uid +
          " " +
          i.name +
          " " +
          (i.brand || "") +
          " " +
          (i.model || "")
        ).toLowerCase();
        return hay.includes(q.toLowerCase());
      }),
    [items, q]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
        <Button
          variant={view === "grid" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("grid")}
        >
          Grid
        </Button>
        <Button
          variant={view === "list" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("list")}
        >
          List
        </Button>
        </div>
        <div className="flex items-center gap-2 w-full justify-end">
        <div className="flex gap-2 items-flex w-1/3">
          <Input
            placeholder="Search UID, name, brand, model…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Select
            items={warehouses}
            triggerLabel={warehouse?.label || "All Warehouses"}
            onSelect={setWarehouse}
          />
        </div>
        <Link href="/inventory/new">
          <Button>New Item</Button>
        </Link>
        </div>
      </div>
      

      <Card>
        <CardContent>
          {view === "grid" && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((i) => (
              <div
                key={`${i.source_table}:${i.id}`}
                className="p-3 rounded-xl border hover:shadow-sm bg-white dark:bg-neutral-900 dark:border-neutral-800 grid grid-cols-2 gap-3 "
              >
                {/* image row */}
                <div className="grid grid-cols-1 gap-2 mb-3">
                  <div className="aspect-square rounded-xl overflow-hidden bg-neutral-100 border">
                    {i.photo_url ? (
                      <img
                        src={i.photo_url}
                        alt={`${i.name} photo`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full grid place-items-center text-xs text-neutral-400">
                        No image
                      </div>
                    )}
                  </div>
                </div>

                {/* text */}
                <div className=" grid-cols-2">
                <div className="text-sm text-neutral-500">
                  {i.classification}
                </div>
                <div className="font-semibold">{i.name}</div>
                <div className="text-sm">UID: {i.uid}</div>
                <div className="text-sm">
                  Loc: {i.location_last_seen || "—"}
                </div>
                <div className="text-sm">Status: {i.status}</div>
                <div className="mt-2">
                  <Link href={`/inventory/${encodeURIComponent(i.uid)}`}>
                    <Button size="sm" variant="outline">
                      View
                    </Button>
                  </Link>
                </div>
              </div>
              </div>
            ))}
          </div>
          )}
          {view === "list" && (
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
                <thead className="text-left text-neutral-500">
                  <tr className="border-b dark:border-neutral-800">
                    <th className="py-2 pr-3">Image</th>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Classification</th>
                    <th className="py-2 pr-3">Brand</th>
                    <th className="py-2 pr-3">Quantity</th>
                    <th className="py-2 pr-3">Location</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((i) => (
                    <tr key={`${i.source_table}:${i.id}`} className="border-b last:border-0 dark:border-neutral-800">
                      <td className="py-2 pr-3">
                        <div className="h-12 w-12 rounded-lg overflow-hidden bg-neutral-100 border">
                          {i.photo_url ? (
                            <img src={i.photo_url} alt={`${i.name} photo`} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full grid place-items-center text-[10px] text-neutral-400">No image</div>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-3 font-medium">{i.name}</td>
                      <td className="py-2 pr-3">{i.classification}</td>
                      <td className="py-2 pr-3">{i.brand}</td>
                      <td className="py-2 pr-3">{i.quantity_total}</td>
                      <td className="py-2 pr-3">{i.location_last_seen || "-"}</td>
                      <td className="py-2 pr-3">{i.status}</td>
                      <td className="py-2 pr-3">
                        <Link href={`/inventory/${encodeURIComponent(i.uid)}`}>
                          <Button size="sm" variant="outline">View</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
