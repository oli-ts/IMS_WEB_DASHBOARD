"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../../lib/supabase-browser.js";
import { Card, CardContent } from "../../components/ui/card.js";
import { Input } from "../../components/ui/input.js";

export default function VansPage() {
  const sb = supabaseBrowser();
  const [vans, setVans] = useState([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      // Fetch vans
      const { data: vs } = await sb
        .from("vans")
        .select(
          "id, reg_number, assigned_team_id, current_job_id, teams(name)"
        );

      // For each van, fetch its active manifest + job (FK on active_manifests.job_id allows join)
      const withManifests = await Promise.all(
        (vs || []).map(async (v) => {
          const { data: man } = await sb
            .from("active_manifests")
            .select("id,status,created_at, job_id, jobs(name,address)")
            .eq("van_id", v.id)
            .in("status", ["pending", "active"])
            .limit(1);
          return { ...v, manifest: (man && man[0]) || null };
        })
      );
      setVans(withManifests);
    })();
  }, []);

  const filtered = useMemo(
    () =>
      vans.filter((v) => {
        if (!q) return true;
        return (
          v.reg_number.toLowerCase().includes(q.toLowerCase()) ||
          (v.manifest?.jobs?.name || "").toLowerCase().includes(q.toLowerCase())
        );
      }),
    [vans, q]
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <Input
          placeholder="Search by reg or job…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((v) => (
          <Card key={v.id}>
            <CardContent>
              <div className="p-3 space-y-2">
                <div className="text-sm text-neutral-500">Van</div>
                <div className="text-xl font-semibold">{v.reg_number}</div>
                <div className="text-sm">Team: {v.teams?.name || "—"}</div>
                <div className="text-sm">
                  Job: {v.manifest?.jobs?.name || "—"}
                </div>
                <div className="text-sm">
                  Status: {v.manifest?.status || "idle"}
                </div>
                <Link
                  href={`/vans/${v.id}`}
                  className="inline-block mt-2 underline"
                >
                  Open details
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
