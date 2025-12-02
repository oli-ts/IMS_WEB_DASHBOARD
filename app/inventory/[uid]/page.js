// app/inventory/[uid]/page.js
import ItemDetailClient from "./ItemDetailClient";

export default function Page({ params, searchParams }) {
  const uid = params?.uid ? decodeURIComponent(params.uid) : "";
  const openEdit = searchParams?.edit === "1" || searchParams?.edit === "true";
  return <ItemDetailClient uid={uid} openEdit={openEdit} />;
}
