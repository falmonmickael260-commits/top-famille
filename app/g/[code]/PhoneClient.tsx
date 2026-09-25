"use client";

import GameGate from "@/components/GameGate";
import PhoneRemote from "@/components/phone/PhoneRemote";
import { useGame } from "@/lib/useGame";

export default function PhoneClient({ code }: { code: string }) {
  const g = useGame(code);
  const gate = <GameGate g={g} code={code} requirePlayer />;

  // GameGate renvoie null quand on est bien inscrit dans la partie.
  if (g.loading || g.notFound || !g.game || !g.me) return gate;
  return <PhoneRemote g={g} code={code} />;
}
