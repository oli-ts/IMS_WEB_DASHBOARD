import NewTemplateClient from "./NewTemplateClient";

export default async function Page({ params }) {
  const { id } = await params;               // unwrap the Promise
  return <NewTemplateClient/>;
}
