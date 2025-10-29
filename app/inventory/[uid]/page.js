// app/inventory/[uid]/page.js
import ItemDetailClient from "./ItemDetailClient";

export default async function Page({ params }) {
  // params may be a Promise in Next 14+ when using sync dynamic APIs
  const { uid } = await params;
  return <ItemDetailClient uid={decodeURIComponent(uid)} />;
}