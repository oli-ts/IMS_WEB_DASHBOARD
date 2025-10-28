"use client";
import { useState } from "react";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";

export default function Labels() {
  const [uid, setUid] = useState("");
  async function reprint() {
    // Call Supabase Edge Function `print_label` with UID
    const res = await fetch("/api/print-label", {
      method: "POST",
      body: JSON.stringify({ uid }),
    });
    if (res.ok) alert("Label queued");
    else alert("Print failed");
  }
  return (
    <div className="space-y-3">
      <div className="text-xl font-semibold">QR Label Reprint</div>
      <div className="flex gap-2 max-w-md">
        <Input
          placeholder="UID e.g. EQ-000123"
          value={uid}
          onChange={(e) => setUid(e.target.value)}
        />
        <Button onClick={reprint}>Reprint</Button>
      </div>
    </div>
  );
}
