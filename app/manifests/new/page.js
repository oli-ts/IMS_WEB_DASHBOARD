import { Suspense } from "react";
import NewManifestClient from "./NewManifestClient";

export default function Page({ searchParams }) {
  const initial = {
    templateId: searchParams?.templateId ?? null,
    jobId: searchParams?.jobId ?? null,
  };

  return (
    <Suspense fallback={null}>
      <NewManifestClient initial={initial} />
    </Suspense>
  );
}
