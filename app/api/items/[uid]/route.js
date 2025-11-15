import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

const ADMIN_ROLES = new Set(["admin", "sysadmin"]);
const ITEM_TABLES = [
  "light_tooling",
  "heavy_tooling",
  "devices",
  "ppe",
  "consumables_material",
  "consumable_equipment",
  "sundries",
  "workshop_tools",
  "vehicles",
  "metal_diamonds",
  "accessories",
];

function json(status, payload) {
  return new NextResponse(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function DELETE(req, { params }) {
  try {
    const rawUid = params?.uid ? decodeURIComponent(params.uid) : "";
    const uid = rawUid?.trim();
    if (!uid) {
      return json(400, { error: "UID is required" });
    }

    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr) {
      return json(500, { error: userErr.message || "Session lookup failed" });
    }
    if (!user?.id) {
      return json(401, { error: "Unauthorized" });
    }

    const { data: staffRow, error: staffErr } = await supabase
      .from("staff")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();
    if (staffErr) {
      return json(500, { error: staffErr.message || "Staff lookup failed" });
    }
    if (!staffRow || !ADMIN_ROLES.has((staffRow.role || "").toLowerCase())) {
      return json(403, { error: "Admins only" });
    }

    const admin = supabaseAdmin();
    const { data: rows, error: lookupErr } = await admin
      .from("inventory_union")
      .select("id, source_table")
      .eq("uid", uid);
    if (lookupErr) {
      return json(500, { error: lookupErr.message || "Inventory lookup failed" });
    }

    const deleteTargets = new Map();
    if (rows?.length) {
      for (const row of rows) {
        const table = row?.source_table;
        const id = row?.id;
        if (!table) continue;
        if (!deleteTargets.has(table)) {
          deleteTargets.set(table, []);
        }
        if (id != null) deleteTargets.get(table).push(id);
      }
    }
    for (const table of ITEM_TABLES) {
      if (!deleteTargets.has(table)) deleteTargets.set(table, null);
    }

    const deletedTables = [];
    for (const [table, ids] of deleteTargets.entries()) {
      let res;
      if (ids?.length) {
        res = await admin.from(table).delete({ count: "exact" }).in("id", ids);
      } else {
        res = await admin.from(table).delete({ count: "exact" }).eq("uid", uid);
      }
      if (res?.error) {
        return json(500, { error: res.error.message || `Delete failed for ${table}` });
      }
      if ((res?.count || 0) > 0) {
        deletedTables.push(table);
      }
    }

    const accRes = await admin
      .from("accessories")
      .delete({ count: "exact" })
      .eq("nested_parent_uid", uid);
    if (accRes?.error) {
      return json(500, { error: accRes.error.message || "Failed to delete nested accessories" });
    }
    if (accRes.count) {
      deletedTables.push("accessories_nested");
    }

    if (!deletedTables.length) {
      return json(404, { error: "Item not found" });
    }

    return json(200, { ok: true, deletedTables });
  } catch (err) {
    return json(500, { error: err?.message || "Server error" });
  }
}
