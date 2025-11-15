import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const sb = supabaseAdmin();
    let query = sb
      .from("kit_details")
      .select("*")
      .order("name")
      .limit(25);
    if (q) {
      query = query.ilike("name", `%${q}%`);
    }
    const { data, error } = await query;
    if (error) {
      throw error;
    }
    return NextResponse.json({ data: data || [] });
  } catch (err) {
    console.error("[kits/search] error", err);
    return NextResponse.json({ error: err?.message || "Failed to load kits" }, { status: 500 });
  }
}
