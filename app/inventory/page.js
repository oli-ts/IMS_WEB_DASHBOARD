"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase-browser";
import { Input } from "../../components/ui/input";
import { Card, CardContent } from "../../components/ui/card";
import { Select } from "../../components/ui/select";

export default function InventoryPage() {
  const sb = supabaseBrowser();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [warehouse, setWarehouse] = useState(null);
  const [warehouses, setWarehouses] = useState([]);

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
      <div className="flex gap-2 items-center">
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
      <Card>
        <CardContent>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((i) => (
              <div
                key={`${i.source_table}:${i.id}`}
                className="p-3 rounded-xl border hover:shadow-sm bg-white dark:bg-neutral-900 dark:border-neutral-800"
              >
                <div className="text-sm text-neutral-500">
                  {i.classification}
                </div>
                <div className="font-semibold">{i.name}</div>
                <div className="text-sm">UID: {i.uid}</div>
                <div className="text-sm">
                  Loc: {i.location_last_seen || "—"}
                </div>
                <div className="text-sm">Status: {i.status}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
