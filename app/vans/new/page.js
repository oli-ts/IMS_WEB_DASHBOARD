import { Suspense } from "react";
import VanNewClient from "./VanNewClient";

export default function Page() {
  // Keep this server component super simple to avoid client/runtime issues
  return (
    <Suspense fallback={null}>
      <VanNewClient />
    </Suspense>
  );
}