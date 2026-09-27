"use client";

import { AnimatePresence, motion } from "framer-motion";
import { TEAM_NAME, type Player, type Team } from "@/lib/types";

/**
 * Les podiums d'une equipe. Le joueur actif est surligne et surelevé : depuis
 * le canape, on doit voir en un coup d'oeil qui a la parole.
 */
export default function Roster({
  team,
  players,
  activeId,
  faceoffId,
  turnOrder,
  hostId,
  compact = false,
  align = "left",
}: {
  team: Team;
  players: Player[];
  activeId?: string | null;
  faceoffId?: string | null;
  turnOrder?: string[];
  hostId?: string | null;
  compact?: boolean;
  align?: "left" | "right";
}) {
  const isR = team === "R";

  return (
    <div className={align === "right" ? "text-right" : ""}>
      <p
        className={`display flex items-center gap-1.5 ${
          align === "right" ? "justify-end" : ""
        } ${isR ? "text-teamR neon-r" : "text-teamB neon-b"}`}
        style={{ fontSize: compact ? "0.86rem" : "clamp(0.86rem,1.5vw,1.15rem)" }}
      >
        {isR ? "🔴" : "🔵"} ÉQUIPE {TEAM_NAME[team]}
        <span className="font-mono text-[9px] tracking-[0.16em] text-white/30">
          {players.length}
        </span>
      </p>

      <div className="mt-2 space-y-1.5">
        {players.length === 0 && (
          <p className="rounded-lg border border-dashed border-white/12 px-3 py-2.5 font-mono text-[9px] uppercase tracking-[0.18em] text-white/25">
            Aucun joueur
          </p>
        )}
        <AnimatePresence initial={false}>
          {players.map((p) => {
          const active = activeId === p.id;
          const duel = faceoffId === p.id;
          const order = turnOrder?.indexOf(p.id) ?? -1;
          return (
            <motion.div
              key={p.id}
              layout
              initial={{ opacity: 0, scale: 0.85, y: 14 }}
              animate={{
                // Le podium reste maitre de sa mise en avant (data-active) et
                // de son extinction (data-off) via CSS : Framer ecrit le
                // transform et l'opacite en inline, ce qui ecraserait
                // silencieusement ces regles si on ne les reprenait pas ici.
                opacity: p.live ? 1 : 0.38,
                scale: active || duel ? 1.035 : 1,
                y: active || duel ? -4 : 0,
              }}
              exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.18 } }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="podium flex items-center gap-2 px-2.5 py-2"
              data-team={team}
              data-active={active || duel ? "true" : "false"}
              data-off={!p.live ? "true" : "false"}
            >
              {/* Pastille de rotation : la position dans l'ordre de passage. */}
              {order >= 0 && (
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-white/10 font-mono text-[9px] font-bold text-white/60">
                  {order + 1}
                </span>
              )}
              <span
                aria-hidden
                className={`h-2 w-2 shrink-0 rounded-full ${
                  p.live ? (isR ? "bg-teamR" : "bg-teamB") : "bg-white/20"
                }`}
                style={
                  p.live
                    ? {
                        boxShadow: `0 0 10px ${isR ? "#ff3b5c" : "#38a8ff"}`,
                      }
                    : undefined
                }
              />
              <span
                className={`min-w-0 flex-1 truncate font-extrabold ${
                  active || duel ? "text-white" : "text-white/70"
                }`}
                style={{ fontSize: compact ? "0.8rem" : "clamp(0.8rem,1.2vw,0.98rem)" }}
              >
                {p.name}
              </span>
              {hostId === p.id && (
                <span className="shrink-0 font-mono text-[8px] uppercase tracking-[0.14em] text-gold/80">
                  host
                </span>
              )}
              {active && (
                <span className="shrink-0 rounded bg-gold px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#1b1200]">
                  à lui
                </span>
              )}
              {duel && !active && (
                <span className="shrink-0 rounded bg-white/15 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-white/75">
                  duel
                </span>
              )}
              {!p.live && (
                <span className="shrink-0 font-mono text-[8px] uppercase tracking-[0.12em] text-white/30">
                  hors ligne
                </span>
              )}
            </motion.div>
          );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
