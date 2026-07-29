import { redirect } from "next/navigation";

export default async function PlayRoundPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string }>;
}) {
  const query = await searchParams;
  redirect(query.scenario ? `/?scenario=${query.scenario}` : "/");
}
