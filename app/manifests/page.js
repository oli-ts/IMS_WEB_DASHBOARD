"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase-browser";
import Link from "next/link";
import { Button } from "../../components/ui/button";

export default function Manifests() {
  const sb = supabaseBrowser();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    (async () => {
      const { data } = await sb
        .from("active_manifests")
        .select("id, status, created_at, jobs(name), vans(reg_number)");
      setRows(data || []);
    })();
  }, []);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Active Manifests</h1>
          <Link href="/manifests/new">
          <Button variant="outline">New Manifest</Button>
        </Link>
      </div>
      <div className="grid gap-2">
        {rows.map((m) => (
          <Link
            key={m.id}
            href={`/manifests/${m.id}`}
            className="p-3 rounded-xl border dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:shadow-sm"
          >
            <div className="font-medium">{m?.jobs?.name || "—"}</div>
            <div className="text-sm text-neutral-500">
              Van: {m?.vans?.reg_number || "—"} · Status: {m.status} ·{" "}
              {new Date(m.created_at).toLocaleString()}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
