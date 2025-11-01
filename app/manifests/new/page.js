// app/manifests/new/page.js
import NewManifestClient from "./NewManifestClient";

export default async function Page({ searchParams }) {
  const sp = await searchParams;
  const initial = {
    templateId: sp?.template ?? null,
    jobId: sp?.job ?? null,
  };
  return <NewManifestClient initial={initial} />;
}
