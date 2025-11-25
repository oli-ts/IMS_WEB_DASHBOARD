"use client";

// lib/supabase-browser.js
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export function supabaseBrowser() {
  // Infers URL/key from NEXT_PUBLIC_* env and uses client-side cookies.
  return createClientComponentClient();
}
