"use client";

import { playerName } from "@/lib/api";
import { TEAM_DOT } from "@/lib/types";
import type { Game, Player } from "@/lib/types";

/**
 * LE FACE-A-FACE. Les deux duellistes arrivent des deux bords, se croisent au
 * centre, et un compte a rebours 3 - 2 - 1 - GO les envoie sur le buzzer.
 *
 * Le decompte est derive du chrono serveur : les deux telephones et la
 * television affichent exactement le meme chiffre au meme moment.
 */
export default function FaceOff({
  game,
  players,
  remainingMs,
}: {
  game: Game;
  players: Player[];
  remainingMs: number;
}) {
  const nR = playerName(players, game.faceoff_r);
  const nB = playerName(players, game.faceoff_b);

  // 5 s de phase : les 3 dernieres secondes servent au decompte.
  const s = Math.ceil(remainingMs / 1000);
  const count = s <= 3 && s >= 1 ? s : null;
  const go = remainingMs > 0 && remainingMs <= 260;

  return (
    <div className="screen relative overflow-hidden px-4 py-8 sm:py-12">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <Duelist name={nR} team="R" from="left" />

        <div className="grid place-items-center">
          {count !== null ? (
            <span
              key={count}
              className="display drop-in text-gold neon-gold"
              style={{ fontSize: "clamp(3rem,12vw,7rem)" }}
            >
              {count}
            </span>
          ) : go ? (
            <span
              className="display pop text-emerald-200 neon"
              style={{ fontSize: "clamp(2.4rem,9vw,5rem)" }}
            >
              GO !
            </span>
          ) : (
            <span
              className="display text-white/30"
              style={{ fontSize: "clamp(1.6rem,5vw,3rem)" }}
            >
              VS
            </span>
          )}
        </div>

        <Duelist name={nB} team="B" from="right" />
      </div>

      <p className="mt-7 text-center font-mono text-[9px] uppercase tracking-[0.26em] text-white/35">
        Manche {game.round_number}
        {game.round_multiplier > 1 && (
          <span className="ml-2 rounded bg-gold px-1.5 py-0.5 text-[#1b1200]">
            ×{game.round_multiplier}
          </span>
        )}
        <span className="mx-2 text-white/15">·</span>
        le premier qui buzze prend la main
      </p>
    </div>
  );
}

function Duelist({
  name,
  team,
  from,
}: {
  name: string;
  team: "R" | "B";
  from: "left" | "right";
}) {
  const isR = team === "R";
  return (
    <div
      className="text-center"
      style={{
        animation: `duel-${from} 680ms cubic-bezier(0.22,1,0.36,1) both`,
      }}
    >
      <style>{`
        @keyframes duel-left {
          0% { transform: translateX(-60px) scale(0.9); opacity: 0; filter: blur(8px); }
          100% { transform: translateX(0) scale(1); opacity: 1; filter: blur(0); }
        }
        @keyframes duel-right {
          0% { transform: translateX(60px) scale(0.9); opacity: 0; filter: blur(8px); }
          100% { transform: translateX(0) scale(1); opacity: 1; filter: blur(0); }
        }
      `}</style>
      <p className="text-[clamp(1.6rem,5vw,2.6rem)] leading-none">{TEAM_DOT[team]}</p>
      <p
        className={`display mt-2 truncate ${isR ? "text-teamR neon-r" : "text-teamB neon-b"}`}
        style={{ fontSize: "clamp(1.1rem,3.6vw,2.4rem)" }}
      >
        {name}
      </p>
      <div
        aria-hidden
        className="mx-auto mt-2 h-[2px] w-16 rounded-full"
        style={{
          background: isR ? "#ff3b5c" : "#38a8ff",
          boxShadow: `0 0 16px ${isR ? "#ff3b5c" : "#38a8ff"}`,
        }}
      />
    </div>
  );
}
