import HostClient from "./HostClient";

/**
 * 🖥️ /g/[code]/host — la console technique de l'hote.
 *
 * L'animateur est automatique : cette page ne sert pas a presenter, mais a
 * garder la main sur le materiel (lancer, debloquer une phase, relancer) quand
 * le plateau tourne sur un autre ecran.
 */
export default async function HostPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <HostClient code={code.toUpperCase()} />;
}
