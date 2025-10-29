// lib/upload.js
"use client";
import { supabaseBrowser } from "./supabase-browser";

export async function uploadStaffAvatar(file, userId) {
  const sb = supabaseBrowser();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `staff/${userId}/avatar.${ext}`;
  const { error } = await sb.storage.from("staff-photos").upload(path, file, {
    cacheControl: "3600",
    upsert: true,
  });
  if (error) throw error;

  // staff-photos is private; generate a signed URL (e.g., valid 1 day)
  const { data, error: signErr } = await sb
    .storage
    .from("staff-photos")
    .createSignedUrl(path, 60 * 60 * 24);
  if (signErr) throw signErr;

  return { path, signedUrl: data.signedUrl };
}
