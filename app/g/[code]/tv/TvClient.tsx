"use client";

import GameGate from "@/components/GameGate";
import TvStage from "@/components/stage/TvStage";
import { useGame } from "@/lib/useGame";

export default function TvClient({ code }: { code: string }) {
  const g = useGame(code);

  if (g.loading || g.notFound || !g.game) {
    return <GameGate g={g} code={code} requirePlayer={false} />;
  }
  return <TvStage g={g} code={code} />;
}
