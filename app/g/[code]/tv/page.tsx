import TvClient from "./TvClient";

/**
 * 📺 /g/[code]/tv — le plateau, a mettre sur la television ou l'ordinateur.
 * Se regarde meme sans etre joueur.
 */
export default async function TvPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <TvClient code={code.toUpperCase()} />;
}
