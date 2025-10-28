"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase-browser";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

export default function Templates() {
  const sb = supabaseBrowser();
  const [rows, setRows] = useState([]);
  const [name, setName] = useState("");
  useEffect(() => {
    (async () => {
      const { data } = await sb
        .from("manifest_templates")
        .select("*")
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
      <div className="flex gap-2">
        <Input
          placeholder="Template name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button onClick={add}>Add</Button>
      </div>
      <div className="grid gap-2">
        {rows.map((r) => (
          <div key={r.id} className="p-3 rounded-xl border dark:border-neutral-800 bg-white dark:bg-neutral-900">
            {r.name}
          </div>
        ))}
      </div>
    </div>
  );
}
