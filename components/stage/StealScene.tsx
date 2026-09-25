"use client";

import { playerName } from "@/lib/api";
import Timer from "@/components/stage/Timer";
import { TEAM_DOT, TEAM_NAME } from "@/lib/types";
import type { Game, Player, Team } from "@/lib/types";

/**
 * LE VOL DE MANCHE. Gros plan sur les deux equipes : celle qui a accumule les
 * points, et celle qui peut tout emporter d'un coup.
 *
 * Une seule tentative pour toute l'equipe. Le verrou est cote serveur
 * (`steal_by is null`), pas dans ce composant : deux joueurs qui valident en
 * meme temps ne peuvent pas passer tous les deux.
 */
export default function StealScene({
  game,
  players,
  remainingMs,
  phaseTotalMs,
  result = false,
}: {
  game: Game;
  players: Player[];
  remainingMs: number;
  phaseTotalMs: number;
  result?: boolean;
}) {
  const stealTeam = (game.steal_team ?? "R") as Team;
  const fromTeam = (game.control_team ?? "B") as Team;
  const ev = game.last_event;
  const success = !!game.steal_success;

  return (
    <div className="screen px-4 py-6 sm:py-9">
      {!result ? (
        <>
          <p className="text-center font-mono text-[9px] uppercase tracking-[0.3em] text-white/40">
            {ev?.reason === "time" ? "Temps écoulé" : "Trois fautes"} · vol de manche
          </p>
          <h2
            className="display mt-2 text-center text-gold neon-gold"
            style={{ fontSize: "clamp(1.5rem,5.5vw,3.2rem)" }}
          >
            {TEAM_DOT[stealTeam]} ÉQUIPE {TEAM_NAME[stealTeam]}
          </h2>
          <p className="mt-1 text-center text-sm text-white/60">
            peut voler <b className="text-gold">{game.round_points} points</b> à
            l&apos;équipe {TEAM_NAME[fromTeam].toLowerCase()}
          </p>

          <div className="mx-auto mt-6 max-w-sm">
            <Timer
              remainingMs={remainingMs}
              totalMs={phaseTotalMs}
              label="Concertez-vous"
              big
            />
          </div>

          <div className="mt-6 rounded-xl border border-gold/30 bg-gold/[0.07] px-4 py-3 text-center">
            <p className="display text-[clamp(0.9rem,2.6vw,1.2rem)] text-gold-soft">
              Une seule réponse pour toute l&apos;équipe
            </p>
            <p className="mt-1 text-[12px] text-white/55">
              Discutez à voix haute, puis un seul joueur valide sur son téléphone.
            </p>
          </div>

          {game.steal_by && (
            <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">
              Réponse envoyée par {playerName(players, game.steal_by)}
            </p>
          )}
        </>
      ) : (
        <div className="text-center">
          <p
            className={`display ${success ? "text-emerald-200 neon" : "text-teamR neon-r"}`}
            style={{ fontSize: "clamp(1.8rem,7vw,4rem)" }}
          >
            {success ? "🎉 VOL RÉUSSI !" : "❌ VOL RATÉ"}
          </p>

          {ev?.raw && (
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-white/45">
              réponse donnée : « {ev.raw} »
            </p>
          )}
          {success && ev?.label && (
            <p
              className="display mt-3 text-white"
              style={{ fontSize: "clamp(1.2rem,4vw,2.2rem)" }}
            >
              {ev.label.toUpperCase()}
              <span className="ml-3 rounded-lg bg-gold px-2.5 py-0.5 text-[0.7em] text-[#1b1200]">
                +{ev.awarded ?? 0}
              </span>
            </p>
          )}
          {!success && ev?.alreadyFound && (
            <p className="mt-2 text-sm text-white/55">
              Cette réponse était déjà sur le tableau.
            </p>
          )}

          <p className="mt-5 text-[clamp(0.9rem,2.6vw,1.15rem)] font-extrabold text-white/80">
            {success ? (
              <>
                {game.round_points} points pour{" "}
                <span className={stealTeam === "R" ? "text-teamR" : "text-teamB"}>
                  l&apos;équipe {TEAM_NAME[stealTeam].toLowerCase()}
                </span>
              </>
            ) : (
              <>
                <span className={fromTeam === "R" ? "text-teamR" : "text-teamB"}>
                  L&apos;équipe {TEAM_NAME[fromTeam].toLowerCase()}
                </span>{" "}
                conserve ses {game.round_points} points
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
