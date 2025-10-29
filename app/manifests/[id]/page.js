// app/manifests/[id]/page.js
import ManifestDetailClient from "./ManifestDetailClient";

export default async function Page({ params }) {
  const { id } = await params;
  return <ManifestDetailClient manifestId={decodeURIComponent(id)} />;
}