// app/templates/[id]/page.js
import { Suspense } from "react";
import TemplateDetailClient from "./TemplateDetailClient";

export default async function Page({ params }) {
  const { id } = await params; // unwrap the promise per Next 14 pattern
  return (
    <Suspense fallback={null}>
      <TemplateDetailClient templateId={id} />
    </Suspense>
  );
}
