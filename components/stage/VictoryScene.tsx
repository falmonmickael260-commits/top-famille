"use client";

import { useEffect, useState } from "react";
import Confetti from "@/components/fx/Confetti";
import { playerName } from "@/lib/api";
import { play } from "@/lib/audio";
import { TEAM_DOT, TEAM_NAME } from "@/lib/types";
import type { Game, Player, Team } from "@/lib/types";

/**
 * LA VICTOIRE. Trophee, confettis, projecteurs, et la camera qui recule sur
 * tout le plateau (voir .cam[data-shot="victory"] dans globals.css).
 */
export default function VictoryScene({
  game,
  players,
  isHost,
  busy,
  onReplay,
  onMenu,
}: {
  game: Game;
  players: Player[];
  isHost: boolean;
  busy: boolean;
  onReplay: () => void;
  onMenu: () => void;
}) {
  const [burst, setBurst] = useState(0);
  const winner = (game.winner_team ?? null) as Team | "TIE" | null;
  const ev = game.last_event;
  const isTie = winner === "TIE" || winner === null;

  useEffect(() => {
    setBurst((b) => b + 1);
    play(isTie ? "defeat" : "victory");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wTeam = (isTie ? null : winner) as Team | null;
  const winners = wTeam ? players.filter((p) => p.team === wTeam) : [];

  return (
    <div className="relative">
      {!isTie && <Confetti burst={burst} />}

      <div className="screen px-4 py-8 text-center sm:py-12">
        <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-white/40">
          Fin du show
        </p>

        <h1 className="wordmark wordmark-sheen display mt-3 text-[clamp(2rem,9vw,5rem)]">
          TOP FAMILLE
        </h1>

        {/* Le trophee, dessine en SVG : aucune image a charger. */}
        <div className="mx-auto mt-6 w-[clamp(5rem,16vw,9rem)] drop-in">
          <Trophy team={wTeam} />
        </div>

        {isTie ? (
          <p
            className="display mt-6 text-white/80"
            style={{ fontSize: "clamp(1.5rem,5vw,3rem)" }}
          >
            MATCH NUL
          </p>
        ) : (
          <>
            <p
              className={`display mt-6 ${
                wTeam === "R" ? "text-teamR neon-r" : "text-teamB neon-b"
              }`}
              style={{ fontSize: "clamp(1.6rem,6.5vw,4rem)" }}
            >
              {TEAM_DOT[wTeam!]} ÉQUIPE {TEAM_NAME[wTeam!]}
            </p>
            <p
              className="display mt-1 text-gold neon-gold"
              style={{ fontSize: "clamp(1.2rem,4.5vw,2.4rem)" }}
            >
              GAGNANTE
            </p>
            <p className="mt-4 text-sm text-white/60">
              {winners.map((p) => p.name).join(" · ")}
            </p>
          </>
        )}

        {/* Le detail de la finale : pourquoi cette equipe l'emporte. */}
        <div className="mx-auto mt-7 max-w-md rounded-xl border border-white/12 bg-black/25 px-4 py-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-white/35">
            Finale · {game.finale_team ? `équipe ${TEAM_NAME[game.finale_team].toLowerCase()}` : "—"}
          </p>
          <p className="mt-1.5 text-[13px] text-white/70">
            {playerName(players, game.finale_p1)} et {playerName(players, game.finale_p2)} ont
            marqué <b className="text-gold">{ev?.finaleTotal ?? game.finale_total} points</b> sur{" "}
            {ev?.target ?? 200}.{" "}
            {ev?.reached
              ? "Objectif atteint."
              : "Objectif manqué : la victoire passe à l’autre équipe."}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <ScoreBox team="R" score={game.score_r} win={wTeam === "R"} />
          <span className="display text-white/20 text-xl">—</span>
          <ScoreBox team="B" score={game.score_b} win={wTeam === "B"} />
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {isHost ? (
            <button
              type="button"
              onClick={onReplay}
              disabled={busy}
              className="btn btn-gold px-8 py-4"
            >
              🔄 Rejouer
            </button>
          ) : (
            <p className="rounded-xl bg-white/[0.04] px-4 py-3.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
              L&apos;hôte peut relancer un show
            </p>
          )}
          <button type="button" onClick={onMenu} className="btn btn-ghost px-8 py-4">
            🏠 Menu
          </button>
        </div>
      </div>
    </div>
  );
}

function ScoreBox({ team, score, win }: { team: Team; score: number; win: boolean }) {
  const isR = team === "R";
  return (
    <div
      className={`rounded-xl px-3 py-2.5 ${
        win
          ? isR
            ? "bg-teamR/20 shadow-glowR"
            : "bg-teamB/20 shadow-glowB"
          : "bg-white/[0.04]"
      }`}
    >
      <p
        className={`display text-[0.8rem] ${isR ? "text-teamR" : "text-teamB"}`}
      >
        {TEAM_DOT[team]} {TEAM_NAME[team]}
      </p>
      <p className="display tabular-nums text-white text-[clamp(1.6rem,4.5vw,2.4rem)]">
        {score}
      </p>
    </div>
  );
}

function Trophy({ team }: { team: Team | null }) {
  const c = team === "R" ? "#ff3b5c" : team === "B" ? "#38a8ff" : "#8aa0c0";
  return (
    <svg viewBox="0 0 120 140" className="w-full" role="img" aria-label="Trophée">
      <defs>
        <linearGradient id="tg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff6d8" />
          <stop offset="0.45" stopColor="#f5c344" />
          <stop offset="1" stopColor="#8a6207" />
        </linearGradient>
        <radialGradient id="tglow" cx="0.5" cy="0.35" r="0.6">
          <stop offset="0" stopColor={c} stopOpacity="0.55" />
          <stop offset="1" stopColor={c} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="52" r="56" fill="url(#tglow)" />
      {/* La coupe */}
      <path
        d="M30 18h60v22c0 18-13 31-30 31S30 58 30 40V18z"
        fill="url(#tg)"
        stroke="#fff6d8"
        strokeOpacity="0.55"
      />
      {/* Les anses */}
      <path d="M30 24H18c-6 0-8 6-6 12 3 9 10 13 18 13" fill="none" stroke="url(#tg)" strokeWidth="5" strokeLinecap="round" />
      <path d="M90 24h12c6 0 8 6 6 12-3 9-10 13-18 13" fill="none" stroke="url(#tg)" strokeWidth="5" strokeLinecap="round" />
      {/* Le pied */}
      <rect x="54" y="71" width="12" height="20" fill="url(#tg)" />
      <rect x="38" y="91" width="44" height="9" rx="3" fill="url(#tg)" />
      <rect x="30" y="100" width="60" height="13" rx="4" fill="url(#tg)" />
      {/* L'etoile */}
      <path
        d="M60 28l4.4 9 9.9 1.4-7.2 7 1.7 9.8-8.8-4.6-8.8 4.6 1.7-9.8-7.2-7 9.9-1.4z"
        fill="#1b1200"
        fillOpacity="0.45"
      />
    </svg>
  );
}
