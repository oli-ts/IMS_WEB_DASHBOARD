// app/inventory/[uid]/ItemDetailClient.js
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../../../lib/supabase-browser";
import { Card, CardContent, CardHeader } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";

export default function ItemDetailClient({ uid }) {
  const sb = supabaseBrowser();
  const [item, setItem] = useState(null);
  const [tx, setTx] = useState([]);
  const [ex, setEx] = useState([]);

  useEffect(() => {
    (async () => {
      // 1) Core item info (from union view)
      const { data: items } = await sb
        .from("inventory_union")
        .select(
          "source_table,id,uid,classification,name,brand,model,serial_number,photo_url,alt_photo_url,is_container,nested_parent_uid,condition,status,warehouse_id,zone_id,bay_id,shelf_id,location_last_seen,verified,qr_payload,notes,quantity_total,quantity_reserved,quantity_available,unit,created_at,updated_at"
        )
        .eq("uid", uid)
        .limit(1);

      setItem(items?.[0] || null);

      // 2) Recent transactions
      const { data: t } = await sb
        .from("transactions")
        .select("id,action,performed_by,from_location,to_location,job_id,team_id,van_id,quantity,timestamp,notes")
        .eq("item_uid", uid)
        .order("timestamp", { ascending: false })
        .limit(25);
      setTx(t || []);

      // 3) Exceptions
      const { data: e } = await sb
        .from("exceptions")
        .select("id,type,notes,photo_url,created_at,manifest_id")
        .eq("item_uid", uid)
        .order("created_at", { ascending: false })
        .limit(25);
      setEx(e || []);
    })();
  }, [uid, sb]);

  const qty = useMemo(() => {
    if (!item) return {};
    return {
      total: item.quantity_total ?? null,
      reserved: item.quantity_reserved ?? null,
      available: item.quantity_available ?? null,
      unit: item.unit ?? "pcs",
    };
  }, [item]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-neutral-500">Item</div>
          <h1 className="text-2xl font-semibold">{item?.name || uid}</h1>
          <div className="text-sm text-neutral-600">UID: {uid}</div>
        </div>
        <div className="flex gap-2">
          <Link href="/inventory">
            <Button variant="outline">Back to Inventory</Button>
          </Link>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await fetch("/api/print-label", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ uid }),
                });
                alert("Label queued");
              } catch {
                alert("Print failed");
              }
            }}
         >
            Reprint Label
          </Button>
        </div>
      </div>

      {/* Item summary */}
<Card>
        <CardHeader>Summary</CardHeader>
        <CardContent>
          {item ? (
            <>
              {/* image row */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="aspect-square rounded-2xl overflow-hidden bg-neutral-100 border w-64 h-64">
                 {item.photo_url ? (
                    <img src={item.photo_url} alt={`${item.name} photo`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-sm text-neutral-400">No image</div>
                  )}
                </div>
                <div className="aspect-square rounded-2xl overflow-hidden bg-neutral-100 border  w-64 h-64">
                  {item.alt_photo_url ? (
                   <img src={item.alt_photo_url} alt={`${item.name} alt`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-sm text-neutral-400">No alt image</div>
                  )}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Row label="Classification" value={item.classification} />
                <Row label="Brand / Model" value={[item.brand, item.model].filter(Boolean).join(" ") || "—"} />
                <Row label="Serial" value={item.serial_number || "—"} />
                <Row label="Status" value={item.status} />
                <Row label="Condition" value={item.condition} />
                <Row label="Verified" value={item.verified ? "Yes" : "No"} />
                <Row label="Location Last Seen" value={item.location_last_seen || "—"} />
              </div>
              <div className="space-y-1">
                <Row label="Quantity (total)" value={qty.total ?? "—"} />
                {"reserved" in qty && <Row label="Reserved" value={qty.reserved ?? "—"} />}
                {"available" in qty && <Row label="Available" value={qty.available ?? "—"} />}
                <Row label="Unit" value={qty.unit} />
                <Row label="QR Payload" value={<code className="break-all">{item.qr_payload}</code>} />
                <Row label="Notes" value={item.notes || "—"} />
              </div>
           
                          </div>
            </>
          ) : (
            <div className="text-sm text-neutral-500">Loading…</div>
          )}
        </CardContent>
      </Card>

      {/* Transactions */}
      <Card>
        <CardHeader>Recent Transactions</CardHeader>
        <CardContent>
          {tx.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th>When</th>
                    <th>Action</th>
                    <th>Qty</th>
                    <th>From → To</th>
                    <th>Job</th>
                    <th>Team</th>
                    <th>Van</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {tx.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td>{new Date(r.timestamp).toLocaleString()}</td>
                      <td>{r.action}</td>
                      <td>{r.quantity}</td>
                      <td>{[r.from_location || "—", r.to_location || "—"].join(" → ")}</td>
                      <td>{r.job_id?.slice(0, 6) || "—"}</td>
                      <td>{r.team_id?.slice(0, 6) || "—"}</td>
                      <td>{r.van_id?.slice(0, 6) || "—"}</td>
                      <td className="max-w-[280px] truncate" title={r.notes || ""}>
                        {r.notes || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-neutral-500">No transactions yet.</div>
          )}
        </CardContent>
      </Card>

      {/* Exceptions */}
      <Card>
        <CardHeader>Exceptions</CardHeader>
        <CardContent>
          {ex.length ? (
            <ul className="space-y-2">
              {ex.map((e) => (
                <li key={e.id} className="p-3 rounded-xl border bg-white">
                  <div className="font-medium">{e.type}</div>
                  <div className="text-sm text-neutral-600">{e.notes || "—"}</div>
                  <div className="text-xs text-neutral-500 mt-1">
                    {new Date(e.created_at).toLocaleString()} · Manifest {e.manifest_id?.slice(0, 6) || "—"}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-neutral-500">No exceptions logged for this item.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex gap-3">
      <div className="w-44 text-neutral-500">{label}</div>
      <div className="flex-1">{value}</div>
    </div>
  );
}
