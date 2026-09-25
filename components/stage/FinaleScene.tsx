"use client";

import { playerName } from "@/lib/api";
import Timer from "@/components/stage/Timer";
import { TEAM_DOT, TEAM_NAME } from "@/lib/types";
import type { Finale, Game, Player } from "@/lib/types";

/**
 * LA GRANDE FINALE.
 *
 * Cinq questions, deux joueurs. Le second ne voit pas les reponses du premier :
 * ce n'est pas un masquage d'interface, le serveur ne les lui envoie pas (voir
 * _tf_finale() dans schema.sql). Puis la revelation, question par question,
 * une reponse a la fois.
 */
export default function FinaleScene({
  game,
  finale,
  players,
  remainingMs,
  phaseTotalMs,
  compact = false,
}: {
  game: Game;
  finale: Finale | null;
  players: Player[];
  remainingMs: number;
  phaseTotalMs: number;
  compact?: boolean;
}) {
  if (!finale) return null;

  const team = finale.team ?? "R";
  const answering =
    game.phase === "FINALE_PLAYER_ONE" || game.phase === "FINALE_PLAYER_TWO";
  const revealing = game.phase === "FINALE_REVEAL";
  const slot = game.finale_slot;
  const activeName = playerName(players, slot === 1 ? finale.p1 : finale.p2);

  const total = finale.total ?? 0;
  const pct = Math.min(100, (total / finale.target) * 100);

  const answerAt = (s: number, i: number) =>
    finale.answers.find((a) => a.slot === s && a.index === i) ?? null;

  return (
    <div className="screen px-3 py-4 sm:px-5 sm:py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-gold">
          Grande finale · {TEAM_DOT[team]} équipe {TEAM_NAME[team].toLowerCase()}
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/40">
          objectif {finale.target} points
        </p>
      </div>

      {answering && (
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/40">
              Joueur {slot} sur 2 · question {game.finale_q_index + 1} sur 5
            </p>
            <p
              className="display mt-1 text-white"
              style={{ fontSize: compact ? "1.1rem" : "clamp(1.1rem,3vw,1.8rem)" }}
            >
              {activeName}
            </p>
          </div>
          <div className="min-w-[10rem]">
            <Timer remainingMs={remainingMs} totalMs={phaseTotalMs} label="Réponse" />
          </div>
        </div>
      )}

      {/* La question courante, en clair, pour tout le monde sauf l'autre
          finaliste (le serveur ne l'envoie qu'au bon moment). */}
      {answering && (
        <p
          className="display mt-3 text-balance text-gold-soft"
          style={{ fontSize: compact ? "1rem" : "clamp(1rem,2.4vw,1.6rem)" }}
        >
          {finale.questions[game.finale_q_index]?.prompt ?? "· · ·"}
        </p>
      )}

      {/* La grille des cinq questions */}
      <div className="mt-4 space-y-2">
        {finale.questions.map((q, i) => {
          const a1 = answerAt(1, i);
          const a2 = answerAt(2, i);
          const step = revealing ? game.finale_reveal_step : 0;
          const live1 = revealing && step === i * 2 + 1;
          const live2 = revealing && step === i * 2 + 2;

          return (
            <div
              key={i}
              className={`rounded-xl border px-3 py-2.5 transition-all duration-500 ${
                live1 || live2
                  ? "border-gold/60 bg-gold/[0.08] shadow-glowGold"
                  : "border-white/10 bg-white/[0.025]"
              }`}
            >
              <p className="flex items-start gap-2 text-[12px] leading-snug text-white/65">
                <span className="mt-[1px] grid h-4 w-4 shrink-0 place-items-center rounded bg-white/10 font-mono text-[9px] text-white/60">
                  {i + 1}
                </span>
                <span className="min-w-0">{q.prompt ?? "· · · · ·"}</span>
              </p>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <FinaleCell
                  label={`J1 · ${playerName(players, finale.p1)}`}
                  answer={a1}
                  live={live1}
                />
                <FinaleCell
                  label={`J2 · ${playerName(players, finale.p2)}`}
                  answer={a2}
                  live={live2}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* La jauge vers l'objectif */}
      {(revealing || game.status === "finished") && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-white/40">
              Total finale
            </p>
            <p className="display tabular-nums text-gold neon-gold text-[clamp(1.5rem,4.5vw,2.6rem)]">
              {total}
              <span className="text-white/30 text-[0.55em]"> / {finale.target}</span>
            </p>
          </div>
          <div className="timer-bar mt-2 h-2.5">
            <div
              className="timer-fill"
              data-danger={pct < 100 ? "true" : "false"}
              style={{ width: `${pct}%`, transition: "width 700ms cubic-bezier(.22,1,.36,1)" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function FinaleCell({
  label,
  answer,
  live,
}: {
  label: string;
  answer: { visible: boolean; raw: string | null; label: string | null; points: number | null; duplicate: boolean } | null;
  live: boolean;
}) {
  const shown = answer?.visible;
  return (
    <div
      className={`rounded-lg px-2.5 py-2 transition-all duration-300 ${
        live ? "bg-gold/15 ring-1 ring-gold/50" : "bg-black/25"
      }`}
    >
      <p className="truncate font-mono text-[8px] uppercase tracking-[0.14em] text-white/35">
        {label}
      </p>
      {!answer ? (
        <p className="display mt-0.5 text-white/18 text-[0.95rem]">— — —</p>
      ) : !shown ? (
        <p className="display mt-0.5 text-white/22 text-[0.95rem]">▓▓▓▓▓</p>
      ) : (
        <div className="mt-0.5 flex items-baseline justify-between gap-2">
          <span className="display min-w-0 flex-1 truncate text-white text-[0.95rem]">
            {answer.raw || "—"}
          </span>
          {answer.points !== null && (
            <span
              className={`display shrink-0 tabular-nums text-[0.95rem] ${
                answer.duplicate
                  ? "text-white/30"
                  : answer.points > 0
                    ? "text-gold"
                    : "text-teamR/70"
              }`}
            >
              {answer.duplicate ? "déjà donné" : answer.points}
            </span>
          )}
        </div>
      )}
      {shown && answer?.label && answer.points !== null && !answer.duplicate && answer.points > 0 && (
        <p className="mt-0.5 truncate font-mono text-[8px] uppercase tracking-[0.12em] text-emerald-300/70">
          panel : {answer.label}
        </p>
      )}
    </div>
  );
}
