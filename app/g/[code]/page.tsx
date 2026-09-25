import PhoneClient from "./PhoneClient";

/**
 * 📱 /g/[code] — le telephone du joueur.
 * Server Component : dans Next 15, `params` est une promesse.
 */
export default async function PlayerPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <PhoneClient code={code.toUpperCase()} />;
}
