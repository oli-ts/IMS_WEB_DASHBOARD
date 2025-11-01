"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../../lib/supabase-browser.js";
import { Card, CardContent } from "../../components/ui/card.js";
import { Input } from "../../components/ui/input.js";
import { Button } from "@/components/ui/button.js";

export default function VansPage() {
  const sb = supabaseBrowser();
  const [vans, setVans] = useState([]);
  const [q, setQ] = useState("");
  const [view, setView] = useState("grid");

  useEffect(() => {
    (async () => {
      // Fetch vans
      const { data: vs } = await sb
        .from("vans")
        .select(
          "id, reg_number, make, model, mot_date, photo_url, assigned_team_id, current_job_id, teams(name)"
        );

      // For each van, fetch its active manifest + job
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
          (v.reg_number || "").toLowerCase().includes(q.toLowerCase()) ||
          (v.manifest?.jobs?.name || "").toLowerCase().includes(q.toLowerCase())
        );
      }),
    [vans, q]
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
          <Input
            placeholder="Search by reg or job..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Link href="/vans/new">
            <Button>New Van</Button>
          </Link>
        </div>
      </div>

      {view === "grid" && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((v) => (
            <Card key={v.id}>
              <CardContent>
                <div className="p-3 space-y-2">
                  <div className="aspect-square rounded-xl overflow-hidden bg-neutral-100 border w-1/2 h-1/2">
                    {v.photo_url ? (
                      <img
                        src={v.photo_url}
                        alt={`${v.reg_number} photo`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full grid place-items-center text-xs text-neutral-400">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-neutral-500">Van</div>
                  <div className="text-xl font-semibold">{v.reg_number}</div>
                  <div className="text-sm">Make/Model: {(v.make || "-") + " " + (v.model || "")}</div>
                  <div className="text-sm">
                    MOT: {v.mot_date ? new Date(v.mot_date).toLocaleDateString() : "-"}
                  </div>
                  <div className="text-sm">Team: {v.teams?.name || "-"}</div>
                  <div className="text-sm">Job: {v.manifest?.jobs?.name || "-"}</div>
                  <div className="text-sm">Status: {v.manifest?.status || "idle"}</div>
                  <Link href={`/vans/${v.id}`} className="inline-block mt-2 underline">
                    Open details
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {view === "list" && (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-500">
              <tr className="border-b dark:border-neutral-800">
                <th className="py-2 pr-3">Image</th>
                <th className="py-2 pr-3">Reg</th>
                <th className="py-2 pr-3">Make/Model</th>
                <th className="py-2 pr-3">MOT</th>
                <th className="py-2 pr-3">Team</th>
                <th className="py-2 pr-3">Job</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id} className="border-b last:border-0 dark:border-neutral-800">
                  <td className="py-2 pr-3">
                    <div className="h-12 w-12 rounded-lg overflow-hidden bg-neutral-100 border">
                      {v.photo_url ? (
                        <img
                          src={v.photo_url}
                          alt={`${v.reg_number} photo`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full grid place-items-center text-[10px] text-neutral-400">No image</div>
                      )}
                    </div>
                  </td>
                  <td className="py-2 pr-3 font-medium">{v.reg_number}</td>
                  <td className="py-2 pr-3">{(v.make || "") + (v.make || v.model ? " " : "") + (v.model || "")}</td>
                  <td className="py-2 pr-3">{v.mot_date ? new Date(v.mot_date).toLocaleDateString() : "-"}</td>
                  <td className="py-2 pr-3">{v.teams?.name || "-"}</td>
                  <td className="py-2 pr-3">{v.manifest?.jobs?.name || "-"}</td>
                  <td className="py-2 pr-3">{v.manifest?.status || "idle"}</td>
                  <td className="py-2 pr-3">
                    <Link href={`/vans/${v.id}`}>
                      <Button size="sm" variant="outline">View</Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
