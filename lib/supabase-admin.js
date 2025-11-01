// lib/supabase-admin.js
import { createClient } from "@supabase/supabase-js";

export function supabaseAdmin() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,   // server-only secret
    { auth: { persistSession: false } }
  );
}