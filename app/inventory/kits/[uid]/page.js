"use client";

import KitDetailClient from "./KitDetailClient";

export default function Page({ params }) {
  const uid = params?.uid ? decodeURIComponent(params.uid) : "";
  return <KitDetailClient uid={uid} />;
}
