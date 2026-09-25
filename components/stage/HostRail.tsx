"use client";

import { useState } from "react";
import { prettyCode } from "@/lib/api";
import type { Game, Phase } from "@/lib/types";

/**
 * LA REGIE DE L'HOTE.
 *
 * L'animateur est automatique : cette barre ne sert donc pas a animer, mais a
 * depanner. L'hote peut lancer le show, faire avancer une phase qui attend un
 * joueur parti, et relancer une partie. Il ne peut jamais choisir la suite ni
 * designer un gagnant - le serveur reste seul maitre du jeu.
 */
export default function HostRail({
  game,
  busy,
  onStart,
  onSkip,
  onRestart,
  onLeave,
}: {
  game: Game;
  busy: boolean;
  onStart: () => void;
  onSkip: () => void;
  onRestart: () => void;
  onLeave: () => void;
}) {
  const [confirm, setConfirm] = useState<"restart" | "leave" | null>(null);

  const waiting: Phase[] = ["BUZZING", "ANSWERING", "TEAM_TURN", "STEAL",
    "FINALE_PLAYER_ONE", "FINALE_PLAYER_TWO"];
  const canSkip = game.status === "playing" && !!game.phase_ends_at;

  return (
    <div className="panel flex flex-wrap items-center gap-2 px-3 py-2">
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-gold/80">
        régie
      </span>

      <span className="rounded-md bg-white/[0.06] px-2 py-1 font-mono text-[10px] tracking-[0.12em] text-white/60">
        {prettyCode(game.code)}
      </span>

      <span className="rounded-md bg-white/[0.06] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-white/45">
        {game.phase} · {game.phase_seq}
      </span>

      <span className="flex-1" />

      {game.status === "lobby" && (
        <button type="button" onClick={onStart} disabled={busy} className="btn btn-gold px-4 py-2 text-[11px]">
          🚀 Lancer
        </button>
      )}

      {canSkip && (
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          title={
            waiting.includes(game.phase)
              ? "Un joueur ne répond pas ? Passe à la suite."
              : "Passer cette phase tout de suite."
          }
          className="btn btn-ghost px-3 py-2 text-[11px]"
        >
          ⏭ Passer la phase
        </button>
      )}

      {confirm === "restart" ? (
        <span className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setConfirm(null);
              onRestart();
            }}
            className="btn btn-r px-3 py-2 text-[11px]"
          >
            Confirmer
          </button>
          <button type="button" onClick={() => setConfirm(null)} className="btn btn-ghost px-3 py-2 text-[11px]">
            Annuler
          </button>
        </span>
      ) : (
        game.status !== "lobby" && (
          <button
            type="button"
            onClick={() => setConfirm("restart")}
            disabled={busy}
            className="btn btn-ghost px-3 py-2 text-[11px]"
          >
            ↺ Nouveau show
          </button>
        )
      )}

      {confirm === "leave" ? (
        <span className="flex items-center gap-1.5">
          <button type="button" onClick={onLeave} className="btn btn-r px-3 py-2 text-[11px]">
            Quitter
          </button>
          <button type="button" onClick={() => setConfirm(null)} className="btn btn-ghost px-3 py-2 text-[11px]">
            Annuler
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirm("leave")}
          className="btn btn-ghost px-3 py-2 text-[11px]"
        >
          Quitter
        </button>
      )}
    </div>
  );
}
