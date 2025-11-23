// app/inventory/[uid]/page.js
import ItemDetailClient from "./ItemDetailClient";

export default async function Page({ params, searchParams }) {
  // params may be a Promise in Next 14+ when using sync dynamic APIs
  const { uid } = await params;
  const sp = await searchParams;
  const openEdit = sp?.edit === "1" || sp?.edit === "true";
  return <ItemDetailClient uid={decodeURIComponent(uid)} openEdit={openEdit} />;
}
