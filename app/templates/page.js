"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase-browser";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import Link from "next/link";

export default function Templates() {
  const sb = supabaseBrowser();
  const [rows, setRows] = useState([]);
  const [name, setName] = useState("");
  useEffect(() => {
    (async () => {
      const { data } = await sb
        .from("manifest_templates")
        .select(
          "id,name,finish_type,colour,size_multiplier,job_type,created_at"
        )
        .order("created_at", { ascending: false });
      setRows(data || []);
    })();
  }, []);
  async function add() {
    if (!name) return;
    await sb.from("manifest_templates").insert({ name });
    const { data } = await sb
      .from("manifest_templates")
      .select("*")
      .order("created_at", { ascending: false });
    setRows(data || []);
    setName("");
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Input placeholder="Quick add name" value={name} onChange={e=>setName(e.target.value)} />
          <Button onClick={add}>Add</Button>
        </div>
        <Link href="/templates/new"><Button variant="outline">New Template</Button></Link>
      </div>
      <div className="grid gap-2">
       {rows.map(r => (
          <div key={r.id} className="p-3 rounded-xl border bg-white dark:bg-neutral-900 dark:border-neutral-800">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium">{r.name}</div>
                <div className="text-sm text-neutral-500">
                  {r.job_type ? `Job: ${r.job_type}` : 'Job: —'} · {r.finish_type || 'Finish: —'} · {r.colour || 'Colour: —'} · Mult: {r.size_multiplier ?? '—'}
                </div>
              </div>
              <Link href={`/templates/${r.id}`} className="underline">Open</Link>
            </div>
          </div>
        ))} 
      </div>
    </div>
  );
}
