// app/vans/[id]/page.js
import VanDetailClient from "./VanDetailClient";

export default async function Page({ params }) {
  const { id } = await params;               // unwrap the Promise
  return <VanDetailClient vanId={decodeURIComponent(id)} />;
}
