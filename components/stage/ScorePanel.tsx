"use client";

import { useEffect, useRef, useState } from "react";
import { TEAM_NAME, type Team } from "@/lib/types";

/**
 * Les deux compteurs d'equipe, en permanence a l'image.
 *
 * Les chiffres ne sautent jamais : ils grimpent. Et quand un vol de manche
 * transfere les points, une pastille traverse physiquement l'ecran d'un
 * compteur vers l'autre.
 */
export default function ScorePanel({
  scoreR,
  scoreB,
  controlTeam,
  roundPoints,
  roundNumber,
  multiplier,
  totalRounds,
  fly,
  compact = false,
}: {
  scoreR: number;
  scoreB: number;
  controlTeam: Team | null;
  roundPoints: number;
  roundNumber: number;
  multiplier: number;
  totalRounds: number;
  /** Transfert de points a animer : direction + montant. */
  fly?: { to: Team; points: number; key: number } | null;
  compact?: boolean;
}) {
  return (
    <div className="relative">
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2 sm:gap-3">
        <TeamScore team="R" score={scoreR} active={controlTeam === "R"} compact={compact} />

        {/* Au centre : la manche, le multiplicateur, la cagnotte en cours. */}
        <div className="panel flex min-w-[5.5rem] flex-col items-center justify-center px-3 py-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/38">
            Manche
          </p>
          <p className="display text-white" style={{ fontSize: compact ? "1.4rem" : "1.9rem" }}>
            {Math.max(1, roundNumber)}
            <span className="text-white/30">/{totalRounds}</span>
          </p>
          {multiplier > 1 && (
            <p className="display mt-0.5 rounded-md bg-gold px-2 text-[0.8rem] text-[#1b1200]">
              ×{multiplier}
            </p>
          )}
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className="display tabular-nums text-gold" style={{ fontSize: compact ? "1rem" : "1.25rem" }}>
              {roundPoints}
            </span>
            <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-white/35">
              pts
            </span>
          </div>
        </div>

        <TeamScore team="B" score={scoreB} active={controlTeam === "B"} compact={compact} />
      </div>

      {fly && (
        <span
          key={fly.key}
          aria-hidden
          className="steal-fly display pointer-events-none absolute left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-gold px-4 py-2 text-2xl text-[#1b1200] shadow-glowGold"
          style={
            {
              "--fly-x": fly.to === "R" ? "-36vw" : "36vw",
              "--fly-y": "-1.5rem",
            } as React.CSSProperties
          }
        >
          +{fly.points}
        </span>
      )}
    </div>
  );
}

function TeamScore({
  team,
  score,
  active,
  compact,
}: {
  team: Team;
  score: number;
  active: boolean;
  compact: boolean;
}) {
  const shown = useCountUp(score);
  const [bump, setBump] = useState(0);
  const prev = useRef(score);

  useEffect(() => {
    if (score !== prev.current) {
      prev.current = score;
      setBump((b) => b + 1);
    }
  }, [score]);

  const isR = team === "R";

  return (
    <div
      className="panel relative overflow-hidden px-3 py-2 transition-all duration-300"
      style={{
        borderColor: active
          ? isR
            ? "rgba(255,59,92,0.7)"
            : "rgba(56,168,255,0.7)"
          : undefined,
        boxShadow: active
          ? isR
            ? "0 0 46px -12px rgba(255,59,92,0.7), inset 0 1px 0 rgba(255,255,255,0.14)"
            : "0 0 46px -12px rgba(56,168,255,0.7), inset 0 1px 0 rgba(255,255,255,0.14)"
          : undefined,
      }}
    >
      {/* Le liseret de couleur de l'equipe */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{
          background: isR
            ? "linear-gradient(90deg,transparent,#ff3b5c,transparent)"
            : "linear-gradient(90deg,transparent,#38a8ff,transparent)",
          opacity: active ? 1 : 0.4,
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <p
          className={`display truncate ${isR ? "text-teamR neon-r" : "text-teamB neon-b"}`}
          style={{ fontSize: compact ? "0.82rem" : "clamp(0.82rem,1.3vw,1.05rem)" }}
        >
          {isR ? "🔴" : "🔵"} {TEAM_NAME[team]}
        </p>
        {active && (
          <span className="shrink-0 rounded bg-white/12 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.14em] text-white/70">
            main
          </span>
        )}
      </div>
      <p
        key={bump}
        className={`display tabular-nums ${bump > 0 ? "score-bump" : ""} ${
          isR ? "text-white neon-r" : "text-white neon-b"
        }`}
        style={{ fontSize: compact ? "2.1rem" : "clamp(2.2rem,5vw,3.6rem)" }}
      >
        {shown}
      </p>
    </div>
  );
}

/** Le compteur grimpe en ~520 ms, quelle que soit la marche a monter. */
function useCountUp(target: number) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  const raf = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const b = target;
    if (a === b) return;

    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 520);
      const eased = 1 - Math.pow(1 - k, 3);
      setValue(Math.round(a + (b - a) * eased));
      if (k < 1) {
        raf.current = requestAnimationFrame(step);
      } else {
        from.current = b;
      }
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target]);

  return value;
}
