"use client";

// lib/supabase-browser.js
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export function supabaseBrowser() {
  // You can omit the options and it will infer from cookies/env,
  // but passing explicit values is fine too.
  return createClientComponentClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
