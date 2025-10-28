"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase-browser";
import { Card, CardContent, CardHeader } from "../../components/ui/card";

export default function Reporting() {
  const sb = supabaseBrowser();
  const [snapshot, setSnapshot] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  useEffect(() => {
    (async () => {
      const { data: stock } = await sb
        .from("consumable_stock")
        .select("*")
        .limit(100);
      const { data: ex } = await sb
        .from("exceptions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      setSnapshot(stock || []);
      setExceptions(ex || []);
    })();
  }, []);
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>Warehouse Snapshot (Consumables)</CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th>UID</th>
                  <th>Name</th>
                  <th>Available</th>
                  <th>Unit</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.map((s) => (
                  <tr key={s.uid} className="border-t">
                    <td>{s.uid}</td>
                    <td>{s.name}</td>
                    <td>{s.quantity_available}</td>
                    <td>{s.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>Exceptions (Missing/Damaged/Offsite)</CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {exceptions.map((e) => (
              <li key={e.id} className="p-2 rounded border dark:border-neutral-800 bg-white dark:bg-neutral-900">
                {e.type} · {e.item_uid}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
