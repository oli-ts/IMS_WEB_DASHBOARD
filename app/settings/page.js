"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase-browser";

export default function Settings() {
  const sb = supabaseBrowser();
  const [users, setUsers] = useState([]);
  useEffect(() => {
    (async () => {
      const { data } = await sb.from("staff").select("id,name,role");
      setUsers(data || []);
    })();
  }, []);
  return (
    <div className="space-y-3">
      <div className="text-xl font-semsibold">Users</div>
      <div className="grid gap-2">
        {users.map((u) => (
          <div key={u.id} className="p-3 rounded-xl border dark:border-neutral-800 bg-white dark:bg-neutral-900">
            {u.name} — {u.role}
          </div>
        ))}
      </div>
    </div>
  );
}
