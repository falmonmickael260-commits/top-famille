"use client";

import { useEffect, useRef } from "react";
import Roster from "@/components/stage/Roster";
import { prettyCode, teamOf } from "@/lib/api";
import { play } from "@/lib/audio";
import { MAX_PER_TEAM, TEAM_NAME, type Game, type Player, type Team } from "@/lib/types";

/**
 * LE LOBBY. Le code en grand (il doit se lire depuis le canape), les deux
 * equipes sur leurs podiums, et le bouton qui lance le show.
 *
 * A chaque arrivee : une animation, un son, et le joueur apparait sur son
 * podium. C'est le moment ou la partie devient reelle pour tout le monde.
 */
export default function Lobby({
  game,
  players,
  myId,
  isHost,
  busy,
  onStart,
  onSwitchTeam,
  onRules,
  compact = false,
}: {
  game: Game;
  players: Player[];
  myId: string | null;
  isHost: boolean;
  busy: boolean;
  onStart: () => void;
  onSwitchTeam?: (t: Team) => void;
  onRules?: () => void;
  compact?: boolean;
}) {
  const teamR = teamOf(players, "R");
  const teamB = teamOf(players, "B");
  const ready = teamR.length > 0 && teamB.length > 0;

  // Un son a chaque nouvel arrivant, jamais au premier rendu.
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(players.map((p) => p.id));
    if (known.current === null) {
      known.current = ids;
      return;
    }
    for (const id of ids) {
      if (!known.current.has(id)) {
        play("join");
        break;
      }
    }
    known.current = ids;
  }, [players]);

  const me = players.find((p) => p.id === myId) ?? null;

  return (
    <div className="space-y-4">
      {/* Le code de la partie */}
      <div className="screen px-4 py-5 text-center">
        <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/40">
          Code de la partie
        </p>
        <p
          className="display mt-1.5 tabular-nums text-gold neon-gold"
          style={{ fontSize: compact ? "2.4rem" : "clamp(2.6rem,10vw,5.5rem)", letterSpacing: "0.06em" }}
        >
          {prettyCode(game.code)}
        </p>
        <p className="mt-2 text-[13px] text-white/55">
          Sur chaque téléphone : <b className="text-white/80">Rejoindre une partie</b>,
          puis ce code.
        </p>
      </div>

      {/* Les deux equipes */}
      <div className="grid grid-cols-2 gap-3">
        <div className="panel p-3">
          <Roster
            team="R"
            players={teamR}
            hostId={game.host_player_id}
            compact={compact}
          />
          <TeamMeta count={teamR.length} />
        </div>
        <div className="panel p-3">
          <Roster
            team="B"
            players={teamB}
            hostId={game.host_player_id}
            compact={compact}
          />
          <TeamMeta count={teamB.length} />
        </div>
      </div>

      {/* Changer d'equipe (sur le telephone) */}
      {me && onSwitchTeam && (
        <div className="panel p-3.5">
          <p className="label">Ton équipe</p>
          <div className="grid grid-cols-2 gap-2.5">
            {(["R", "B"] as const).map((t) => {
              const on = me.team === t;
              const full = (t === "R" ? teamR : teamB).filter((p) => p.id !== myId).length >= MAX_PER_TEAM;
              return (
                <button
                  key={t}
                  type="button"
                  disabled={busy || full || on}
                  onClick={() => onSwitchTeam(t)}
                  className={`btn py-3 text-sm ${
                    on ? (t === "R" ? "btn-r" : "btn-b") : "btn-ghost"
                  }`}
                >
                  {t === "R" ? "🔴" : "🔵"} {TEAM_NAME[t]}
                  {full && !on ? " · complète" : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Le lancement */}
      <div className="panel p-4">
        {isHost ? (
          <>
            <button
              type="button"
              onClick={onStart}
              disabled={busy || !ready}
              className="btn btn-gold w-full py-5 text-base"
            >
              🚀 Lancer le show
            </button>
            {!ready && (
              <p className="mt-2.5 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-gold/70">
                Il faut au moins un joueur dans chaque équipe
              </p>
            )}
          </>
        ) : (
          <p className="text-center font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
            {ready
              ? "En attente de l’hôte…"
              : "Il faut au moins un joueur dans chaque équipe"}
          </p>
        )}
        {onRules && (
          <button
            type="button"
            onClick={onRules}
            className="mt-3 w-full rounded-xl py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40 transition hover:text-white/75"
          >
            ❓ Comment jouer
          </button>
        )}
      </div>
    </div>
  );
}

function TeamMeta({ count }: { count: number }) {
  return (
    <p className="mt-2.5 font-mono text-[9px] uppercase tracking-[0.18em] text-white/28">
      {count} / {MAX_PER_TEAM}
      {count >= MAX_PER_TEAM ? " · complète" : ""}
    </p>
  );
}
