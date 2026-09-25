"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Announcer from "@/components/Announcer";
import Confetti from "@/components/fx/Confetti";
import Particles from "@/components/fx/Particles";
import Slam from "@/components/fx/Slam";
import SoundToggles from "@/components/fx/SoundToggles";
import Studio from "@/components/fx/Studio";
import Board from "@/components/stage/Board";
import FaceOff from "@/components/stage/FaceOff";
import FinaleScene from "@/components/stage/FinaleScene";
import HostRail from "@/components/stage/HostRail";
import Lobby from "@/components/stage/Lobby";
import Roster from "@/components/stage/Roster";
import ScorePanel from "@/components/stage/ScorePanel";
import StealScene from "@/components/stage/StealScene";
import Strikes from "@/components/stage/Strikes";
import Timer from "@/components/stage/Timer";
import VictoryScene from "@/components/stage/VictoryScene";
import { hostSkip, playerName, restartShow, startShow, teamOf } from "@/lib/api";
import { initAudio, play, setMood } from "@/lib/audio";
import { script } from "@/lib/announcer";
import { TEAM_NAME, TOTAL_ROUNDS, type Team } from "@/lib/types";
import type { UseGame } from "@/lib/useGame";

/**
 * 📺 L'ECRAN TV — le plateau principal.
 *
 * C'est la seule vue qui montre tout : la question, le tableau, les reponses
 * cachees et devoilees, les scores, les joueurs, l'equipe active, le chrono,
 * les fautes. Elle ne decide rien : elle met en scene ce que le serveur dit.
 *
 * Trois choses la font ressembler a une realisation TV :
 *   - `data-shot` sur .cam : la camera zoome selon le moment (duel, gros plan,
 *     tableau, large) — voir globals.css section 2 ;
 *   - `accent` sur le studio : le decor change de couleur avec l'equipe qui
 *     mene l'action ;
 *   - les beats : chaque changement de phase declenche un son, une replique
 *     d'animateur et, pour les gros moments, un bandeau plein ecran.
 */
export default function TvStage({ g, code }: { g: UseGame; code: string }) {
  const router = useRouter();
  const { game, players, state, myId, isHost, busy, error, remainingMs, phaseTotalMs } = g;

  const [shake, setShake] = useState(0);
  const [fly, setFly] = useState<{ to: Team; points: number; key: number } | null>(null);
  const lastBeat = useRef(-1);

  const sc = useMemo(() => (state ? script(state) : null), [state]);

  /* Les beats : un son, une secousse, un transfert de points. Cales sur
     phase_seq, donc joues une seule fois meme si l'etat se rafraichit. */
  useEffect(() => {
    if (!game || !sc) return;
    if (lastBeat.current === game.phase_seq) return;
    lastBeat.current = game.phase_seq;

    initAudio();
    if (sc.cue) play(sc.cue);
    if (sc.mood !== undefined) setMood(sc.mood);

    const hard =
      game.phase === "THREE_STRIKES" ||
      game.phase === "ANSWERING" ||
      (game.phase === "WRONG_ANSWER" && game.last_event?.scope === "team") ||
      (game.phase === "STEAL_RESULT" && !!game.last_event?.success);
    if (hard) setShake((s) => s + 1);

    // Vol reussi : les points quittent visuellement un compteur pour l'autre.
    if (game.phase === "STEAL_RESULT" && game.last_event?.success && game.steal_team) {
      setFly({
        to: game.steal_team,
        points: game.round_points,
        key: game.phase_seq,
      });
      window.setTimeout(() => setFly(null), 1400);
    }
  }, [game, sc]);

  if (!game || !state || !sc) return null;

  const teamR = teamOf(players, "R");
  const teamB = teamOf(players, "B");
  const phase = game.phase;

  /* La couleur du decor suit l'action. */
  const accent: Team | "GOLD" | null =
    phase === "VICTORY"
      ? ((game.winner_team === "R" || game.winner_team === "B" ? game.winner_team : "GOLD") as Team | "GOLD")
      : phase === "STEAL" || phase === "STEAL_RESULT"
        ? (game.steal_team ?? null)
        : phase === "LOBBY" || phase === "INTRO" || phase.startsWith("FINALE")
          ? "GOLD"
          : (game.control_team ?? null);

  const isPlayPhase = [
    "BUZZING",
    "ANSWERING",
    "CORRECT_ANSWER",
    "WRONG_ANSWER",
    "CONTROL_GRANTED",
    "TEAM_TURN",
    "THREE_STRIKES",
  ].includes(phase);

  const showBoard =
    isPlayPhase || phase === "STEAL" || phase === "STEAL_RESULT" ||
    phase === "ROUND_RESULT" || phase === "ROUND_TRANSITION";

  const activeName = playerName(players, game.active_player_id ?? game.buzz_winner);

  /* Le lobby (podiums d'arrivee) et la victoire (palmares) affichent deja les
     deux equipes : les colonnes laterales du plateau feraient doublon. */
  const showRosters = phase !== "LOBBY" && phase !== "VICTORY";

  return (
    <main className="relative min-h-dvh overflow-hidden" onPointerDown={() => initAudio()}>
      <Studio accent={accent} />
      <Particles count={44} />
      <Slam text={sc.slam} keyId={game.phase_seq} tone={sc.tone === "neutral" ? "drama" : sc.tone} />

      <div
        key={shake}
        className={`cam mx-auto flex min-h-dvh w-full max-w-[110rem] flex-col gap-3 px-3 py-3 sm:px-5 sm:py-4 ${
          shake > 0 ? "shake" : ""
        }`}
        data-shot={sc.camera}
      >
        {/* ---------- Bandeau haut ---------- */}
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="wordmark display text-[clamp(1.1rem,2.6vw,1.9rem)]">
            TOP FAMILLE
          </h1>
          <span className="byline text-[8px] sm:text-[9px]">by Lewishalmito</span>
          <span className="flex-1" />
          {!g.live && (
            <span className="rounded-lg bg-gold/12 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-gold pulse-soft">
              Reconnexion…
            </span>
          )}
          {g.reconnected && (
            <span className="rise rounded-lg bg-emerald-400/12 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-300">
              Connexion rétablie
            </span>
          )}
          <SoundToggles />
        </header>

        {isHost && (
          <HostRail
            game={game}
            busy={busy}
            onStart={() => g.run(() => startShow(code))}
            onSkip={() => g.run(() => hostSkip(code))}
            onRestart={() => g.run(() => restartShow(code))}
            onLeave={() => router.push("/")}
          />
        )}

        {/* ---------- Scores ---------- */}
        {game.status !== "lobby" && (
          <ScorePanel
            scoreR={game.score_r}
            scoreB={game.score_b}
            controlTeam={game.control_team}
            roundPoints={game.round_points}
            roundNumber={game.round_number}
            multiplier={game.round_multiplier}
            totalRounds={TOTAL_ROUNDS}
            fly={fly}
          />
        )}

        {/* ---------- Le plateau ---------- */}
        <div
          className={`grid flex-1 gap-3 ${
            showRosters ? "lg:grid-cols-[minmax(11rem,15%)_1fr_minmax(11rem,15%)]" : ""
          }`}
        >
          {/* Podiums rouge */}
          <aside
            className={`panel order-2 hidden p-3 lg:order-1 ${showRosters ? "lg:block" : ""}`}
          >
            <Roster
              team="R"
              players={teamR}
              activeId={game.control_team === "R" ? game.active_player_id : null}
              faceoffId={game.faceoff_r}
              turnOrder={game.control_team === "R" ? game.turn_order : undefined}
              hostId={game.host_player_id}
            />
          </aside>

          {/* Le grand ecran central */}
          <section className="order-1 flex min-w-0 flex-col gap-3 lg:order-2">
            {phase === "LOBBY" && (
              <Lobby
                game={game}
                players={players}
                myId={myId}
                isHost={isHost}
                busy={busy}
                onStart={() => g.run(() => startShow(code))}
              />
            )}

            {phase === "INTRO" && <IntroSplash remainingMs={remainingMs} totalMs={phaseTotalMs} />}

            {phase === "FACE_OFF" && (
              <FaceOff game={game} players={players} remainingMs={remainingMs} />
            )}

            {showBoard && (
              <>
                {(phase === "STEAL" || phase === "STEAL_RESULT") && (
                  <StealScene
                    game={game}
                    players={players}
                    remainingMs={remainingMs}
                    phaseTotalMs={phaseTotalMs}
                    result={phase === "STEAL_RESULT"}
                  />
                )}

                <Board board={state.board} />

                {/* La barre de jeu : chrono, fautes, joueur actif */}
                {isPlayPhase && (
                  <div className="panel flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
                    <div className="min-w-[8rem] flex-1">
                      <Timer
                        remainingMs={remainingMs}
                        totalMs={phaseTotalMs}
                        label={
                          phase === "BUZZING"
                            ? "Buzzez !"
                            : phase === "ANSWERING"
                              ? "Réponse du duel"
                              : phase === "TEAM_TURN"
                                ? "Temps de l’équipe"
                                : "—"
                        }
                        ticking={phase === "TEAM_TURN" || phase === "ANSWERING" || phase === "BUZZING"}
                      />
                    </div>

                    {game.control_team && (
                      <div>
                        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/40">
                          Fautes de l’équipe {TEAM_NAME[game.control_team].toLowerCase()}
                        </p>
                        <div className="mt-1.5">
                          <Strikes count={game.strikes} />
                        </div>
                      </div>
                    )}

                    {(game.active_player_id || game.buzz_winner) && (
                      <div className="min-w-0">
                        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/40">
                          {phase === "TEAM_TURN" ? "C’est à" : "Au micro"}
                        </p>
                        <p className="display truncate text-white text-[clamp(1rem,2vw,1.5rem)]">
                          {activeName}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {(phase === "ROUND_RESULT" || phase === "ROUND_TRANSITION") && (
                  <RoundResult game={game} />
                )}
              </>
            )}

            {(phase === "FINALE_INTRO" ||
              phase === "FINALE_PLAYER_ONE" ||
              phase === "FINALE_PLAYER_TWO" ||
              phase === "FINALE_REVEAL") && (
              <FinaleScene
                game={game}
                finale={state.finale}
                players={players}
                remainingMs={remainingMs}
                phaseTotalMs={phaseTotalMs}
              />
            )}

            {phase === "VICTORY" && (
              <VictoryScene
                game={game}
                players={players}
                isHost={isHost}
                busy={busy}
                onReplay={() => g.run(() => restartShow(code))}
                onMenu={() => router.push("/")}
              />
            )}

            <Announcer script={sc} size="lg" />

            {error && (
              <p
                role="alert"
                className="rise rounded-xl border border-teamR/35 bg-teamR/10 px-4 py-2.5 text-sm font-semibold text-teamR-soft"
              >
                {error}
              </p>
            )}
          </section>

          {/* Podiums bleu */}
          <aside className={`panel order-3 hidden p-3 ${showRosters ? "lg:block" : ""}`}>
            <Roster
              team="B"
              players={teamB}
              activeId={game.control_team === "B" ? game.active_player_id : null}
              faceoffId={game.faceoff_b}
              turnOrder={game.control_team === "B" ? game.turn_order : undefined}
              hostId={game.host_player_id}
              align="right"
            />
          </aside>

          {/* Sur un ecran etroit, les deux equipes passent sous le plateau. */}
          <div
            className={`order-4 grid-cols-2 gap-3 lg:hidden ${showRosters ? "grid" : "hidden"}`}
          >
            <div className="panel p-3">
              <Roster
                team="R"
                players={teamR}
                activeId={game.control_team === "R" ? game.active_player_id : null}
                faceoffId={game.faceoff_r}
                turnOrder={game.control_team === "R" ? game.turn_order : undefined}
                hostId={game.host_player_id}
                compact
              />
            </div>
            <div className="panel p-3">
              <Roster
                team="B"
                players={teamB}
                activeId={game.control_team === "B" ? game.active_player_id : null}
                faceoffId={game.faceoff_b}
                turnOrder={game.control_team === "B" ? game.turn_order : undefined}
                hostId={game.host_player_id}
                compact
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------- */

function IntroSplash({ remainingMs, totalMs }: { remainingMs: number; totalMs: number }) {
  return (
    <div className="screen relative overflow-hidden px-4 py-12 text-center sm:py-20">
      <Confetti burst={1} />
      <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-white/40">
        Le show commence
      </p>
      <h2 className="wordmark wordmark-sheen display mt-4 text-[clamp(2.2rem,10vw,6rem)]">
        TOP FAMILLE
      </h2>
      <p className="byline mt-5 text-[clamp(0.55rem,1.6vw,0.8rem)]">by Lewishalmito</p>
      <div className="mx-auto mt-10 w-[min(20rem,70vw)]">
        <div className="timer-bar">
          <div
            className="timer-fill"
            style={{ width: `${100 - (remainingMs / Math.max(1, totalMs)) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function RoundResult({ game }: { game: Parameters<typeof RoundResultInner>[0]["game"] }) {
  return <RoundResultInner game={game} />;
}

function RoundResultInner({
  game,
}: {
  game: { last_event: { winner?: Team | null; points?: number; stolen?: boolean; round?: number } | null; round_number: number };
}) {
  const ev = game.last_event;
  const winner = ev?.winner ?? null;
  return (
    <div
      className={`panel px-4 py-3.5 text-center ${
        winner === "R" ? "border-teamR/40" : winner === "B" ? "border-teamB/40" : ""
      }`}
    >
      <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-white/40">
        Fin de la manche {ev?.round ?? game.round_number}
      </p>
      {winner ? (
        <p
          className={`display mt-1.5 ${winner === "R" ? "text-teamR neon-r" : "text-teamB neon-b"}`}
          style={{ fontSize: "clamp(1.1rem,3.2vw,1.9rem)" }}
        >
          +{ev?.points ?? 0} pour l’équipe {TEAM_NAME[winner].toLowerCase()}
          {ev?.stolen && <span className="ml-2 text-gold">· volés !</span>}
        </p>
      ) : (
        <p className="display mt-1.5 text-white/70" style={{ fontSize: "clamp(1.1rem,3.2vw,1.9rem)" }}>
          Personne n’a trouvé — aucun point
        </p>
      )}
    </div>
  );
}
