"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AnswerForm from "@/components/phone/AnswerForm";
import Buzzer from "@/components/phone/Buzzer";
import RulesModal, { RULES_SEEN_KEY } from "@/components/RulesModal";
import SoundToggles from "@/components/fx/SoundToggles";
import Studio from "@/components/fx/Studio";
import Lobby from "@/components/stage/Lobby";
import Strikes from "@/components/stage/Strikes";
import Timer, { SecondsLeft } from "@/components/stage/Timer";
import {
  buzz,
  leaveGame,
  playerName,
  prettyCode,
  restartShow,
  setTeam,
  startShow,
  submitAnswer,
} from "@/lib/api";
import { initAudio, installAudioUnlock, play, setMood } from "@/lib/audio";
import { TEAM_DOT, TEAM_NAME, type Team } from "@/lib/types";
import { useCountdown, type Clock } from "@/lib/useCountdown";
import { useWakeLock } from "@/lib/useWakeLock";
import type { UseGame } from "@/lib/useGame";

/**
 * 📱 LE TELEPHONE — une telecommande, rien de plus.
 *
 * Regle de conception : le joueur, telephone pose sur la table, doit savoir en
 * un dixieme de seconde dans laquelle des quatre situations il se trouve —
 * BUZZ, C'EST TON TOUR, ÉCRIS TA RÉPONSE, ATTENDS TON TOUR. D'ou le fond de
 * l'ecran qui change de couleur, les titres enormes, et zero information dont
 * il n'a pas besoin : le tableau complet, c'est sur la television.
 */
export default function PhoneRemote({ g, code }: { g: UseGame; code: string }) {
  const router = useRouter();
  const { game, players, state, myId, me, isHost, busy, error, clock } = g;

  const [rules, setRules] = useState(false);
  const lastBeat = useRef(-1);

  // L'ecran du joueur ne doit pas s'eteindre : il raterait son tour.
  useWakeLock(!!game && game.status !== "finished");

  useEffect(() => {
    installAudioUnlock();
    try {
      if (!window.localStorage.getItem(RULES_SEEN_KEY)) setRules(true);
    } catch {
      /* ignore */
    }
  }, []);

  /* Le telephone joue peu de sons : un buzz, une bonne reponse, une faute.
     Le gros du son sort de la television. Mais la vibration, elle, compte :
     c'est ce qui fait lever les yeux au bon moment. */
  useEffect(() => {
    if (!game || !me) return;
    if (lastBeat.current === game.phase_seq) return;
    lastBeat.current = game.phase_seq;
    initAudio();
    setMood(null); // pas de lit musical sur le telephone

    const mine =
      game.active_player_id === myId ||
      (game.phase === "ANSWERING" && game.buzz_winner === myId) ||
      (game.phase === "BUZZING" && (game.faceoff_r === myId || game.faceoff_b === myId)) ||
      (game.phase === "STEAL" && game.steal_team === me.team) ||
      ((game.phase === "FINALE_PLAYER_ONE" || game.phase === "FINALE_PLAYER_TWO") &&
        (game.finale_slot === 1 ? game.finale_p1 : game.finale_p2) === myId);

    if (mine) {
      play("ui");
      try {
        navigator.vibrate?.([40, 60, 40]);
      } catch {
        /* ignore */
      }
    }
  }, [game, me, myId]);

  const closeRules = () => {
    setRules(false);
    try {
      window.localStorage.setItem(RULES_SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  if (!game || !state) return null;

  const phase = game.phase;
  const iAmDuelist = game.faceoff_r === myId || game.faceoff_b === myId;
  const iBuzzed = game.buzz_winner === myId;
  const iAmActive = game.active_player_id === myId;
  const myTeam = me?.team ?? null;
  const iControl = !!myTeam && game.control_team === myTeam;
  const iSteal = !!myTeam && game.steal_team === myTeam;
  const finalist =
    (game.finale_slot === 1 ? game.finale_p1 : game.finale_p2) === myId;
  const iAmFinalist = game.finale_p1 === myId || game.finale_p2 === myId;

  /** Le prochain joueur de la rotation, pour l'affichage uniquement. */
  const nextPlayer = useMemo(() => {
    const order = game.turn_order;
    if (order.length === 0) return null;
    for (let k = 1; k <= order.length; k++) {
      const id = order[(game.turn_index + k) % order.length];
      const p = players.find((x) => x.id === id);
      if (p?.live) return p;
    }
    return null;
  }, [game.turn_order, game.turn_index, players]);

  /* Le mode donne la couleur du fond : rouge = buzz, or = a toi, sombre = attends. */
  const mode: "buzz" | "turn" | "wait" =
    phase === "BUZZING" && iAmDuelist
      ? "buzz"
      : (phase === "ANSWERING" && iBuzzed) ||
          (phase === "TEAM_TURN" && iAmActive) ||
          (phase === "STEAL" && iSteal) ||
          ((phase === "FINALE_PLAYER_ONE" || phase === "FINALE_PLAYER_TWO") && finalist)
        ? "turn"
        : "wait";

  return (
    <div className="remote relative" data-mode={mode} onPointerDown={() => initAudio()}>
      <Studio accent={mode === "buzz" ? "R" : mode === "turn" ? "GOLD" : (game.control_team ?? null)} />

      <div className="relative z-10 flex min-h-dvh flex-col px-4 py-4">
        {/* ---------- Bandeau : qui je suis ---------- */}
        <header className="flex items-center gap-2">
          <span
            className={`display truncate text-[0.95rem] ${
              myTeam === "R" ? "text-teamR" : myTeam === "B" ? "text-teamB" : "text-white/60"
            }`}
          >
            {myTeam ? TEAM_DOT[myTeam] : "⚪"} {me?.name ?? "—"}
          </span>
          {isHost && (
            <span className="rounded bg-gold/15 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.14em] text-gold">
              host
            </span>
          )}
          <span className="flex-1" />
          <span className="font-mono text-[9px] tracking-[0.14em] text-white/35">
            {prettyCode(game.code)}
          </span>
          <SoundToggles compact />
        </header>

        {!g.live && (
          <p className="mt-2 rounded-lg bg-gold/12 px-3 py-1.5 text-center font-mono text-[9px] uppercase tracking-[0.18em] text-gold pulse-soft">
            Reconnexion…
          </p>
        )}
        {g.reconnected && (
          <p className="rise mt-2 rounded-lg bg-emerald-400/12 px-3 py-1.5 text-center font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-300">
            Connexion rétablie
          </p>
        )}

        {/* ---------- Le corps ---------- */}
        <div className="remote-body py-5">
          {/* --- LOBBY --- */}
          {phase === "LOBBY" && (
            <Lobby
              game={game}
              players={players}
              myId={myId}
              isHost={isHost}
              busy={busy}
              onStart={() => g.run(() => startShow(code))}
              onSwitchTeam={(t: Team) => g.run(() => setTeam(code, t))}
              onRules={() => setRules(true)}
              compact
            />
          )}

          {phase === "INTRO" && (
            <Big title="Le show commence" sub="Prépare-toi…" tone="gold" />
          )}

          {/* --- FACE-A-FACE --- */}
          {phase === "FACE_OFF" &&
            (iAmDuelist ? (
              <Big
                title="Tu es sur le face-à-face"
                sub={`Contre ${playerName(
                  players,
                  game.faceoff_r === myId ? game.faceoff_b : game.faceoff_r
                )} — le doigt sur le buzzer`}
                tone="r"
                countClock={clock}
              />
            ) : (
              <Big
                title="Face-à-face"
                sub={`${TEAM_DOT.R} ${playerName(players, game.faceoff_r)} contre ${TEAM_DOT.B} ${playerName(players, game.faceoff_b)}`}
                tone="wait"
              />
            ))}

          {/* --- BUZZER --- */}
          {phase === "BUZZING" &&
            (iAmDuelist ? (
              <div className="flex flex-col items-center gap-6">
                <Question text={state.board?.prompt} />
                <Buzzer armed resetKey={game.phase_seq} onBuzz={() => g.run(() => buzz(code))} />
                <div className="w-full max-w-xs">
                  <Timer clock={clock} label="Fenêtre de buzz" />
                </div>
              </div>
            ) : (
              <>
                <Question text={state.board?.prompt} />
                <Big
                  title="Ils buzzent"
                  sub={`${playerName(players, game.faceoff_r)} contre ${playerName(players, game.faceoff_b)}`}
                  tone="wait"
                />
              </>
            ))}

          {/* --- REPONSE DU DUEL --- */}
          {phase === "ANSWERING" &&
            (iBuzzed ? (
              <>
                <Question text={state.board?.prompt} />
                <AnswerForm
                  title="Écris ta réponse"
                  clock={clock}
                  busy={busy}
                  resetKey={game.phase_seq}
                  tone={myTeam === "B" ? "b" : "r"}
                  onSubmit={(v) => g.run(() => submitAnswer(code, v))}
                />
              </>
            ) : (
              <Big
                title={`${playerName(players, game.buzz_winner)} répond`}
                sub="Silence sur le plateau"
                tone="wait"
                clock={clock}
              />
            ))}

          {/* --- RETOURS --- */}
          {phase === "CORRECT_ANSWER" && (
            <Big
              title="✅ Bonne réponse"
              sub={
                game.last_event?.label
                  ? `${game.last_event.label.toUpperCase()} — ${game.last_event.awarded ?? 0} points`
                  : undefined
              }
              tone="good"
            />
          )}

          {phase === "WRONG_ANSWER" && (
            <Big
              title={
                game.last_event?.type === "already_found"
                  ? "Déjà trouvé"
                  : game.last_event?.timeout
                    ? "⏱ Temps écoulé"
                    : "❌ Mauvaise réponse"
              }
              sub={
                game.last_event?.scope === "team"
                  ? `Faute ${game.last_event?.strikes ?? game.strikes} sur 3`
                  : undefined
              }
              tone="bad"
              strikes={game.last_event?.scope === "team" ? (game.last_event?.strikes ?? game.strikes) : undefined}
            />
          )}

          {phase === "CONTROL_GRANTED" && (
            <Big
              title={iControl ? "Ton équipe prend le contrôle" : "L’autre équipe prend le contrôle"}
              sub={iControl ? "Vous jouez chacun votre tour" : "Prépare-toi à voler la manche"}
              tone={iControl ? "good" : "wait"}
            />
          )}

          {/* --- TOUR D'EQUIPE --- */}
          {phase === "TEAM_TURN" &&
            (iAmActive ? (
              <>
                <Question text={state.board?.prompt} />
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="display text-gold neon-gold text-[1.15rem]">🔥 C’EST TON TOUR</p>
                  <Strikes count={game.strikes} size="sm" />
                </div>
                <AnswerForm
                  title="Réponds !"
                  clock={clock}
                  busy={busy}
                  resetKey={game.phase_seq}
                  tone="gold"
                  onSubmit={(v) => g.run(() => submitAnswer(code, v))}
                />
              </>
            ) : iControl ? (
              <>
                <Question text={state.board?.prompt} />
                <Big
                  title="⏳ Attends ton tour"
                  sub={`Joueur actif : ${playerName(players, game.active_player_id)}${
                    nextPlayer ? ` · puis ${nextPlayer.name}` : ""
                  }`}
                  tone="wait"
                  clock={clock}
                  strikes={game.strikes}
                />
              </>
            ) : (
              <Big
                title="L’autre équipe joue"
                sub={`${playerName(players, game.active_player_id)} répond · concertez-vous pour le vol`}
                tone="wait"
                clock={clock}
                strikes={game.strikes}
              />
            ))}

          {phase === "THREE_STRIKES" && (
            <Big
              title={game.last_event?.reason === "time" ? "⏱ TEMPS ÉCOULÉ" : "❌ ❌ ❌"}
              sub={iControl ? "Vous perdez la main" : "À vous de voler la manche !"}
              tone={iControl ? "bad" : "good"}
            />
          )}

          {/* --- VOL DE MANCHE --- */}
          {phase === "STEAL" &&
            (iSteal ? (
              <>
                <Question text={state.board?.prompt} />
                <div className="mb-3 rounded-xl border border-gold/35 bg-gold/[0.08] px-3.5 py-2.5 text-center">
                  <p className="display text-[1rem] text-gold-soft">
                    UNE SEULE RÉPONSE POUR L’ÉQUIPE
                  </p>
                  <p className="mt-1 text-[12px] text-white/60">
                    {game.round_points} points en jeu. Discutez, puis un seul valide.
                  </p>
                </div>
                <AnswerForm
                  title="La réponse de l’équipe"
                  clock={clock}
                  busy={busy}
                  resetKey={game.phase_seq}
                  tone={myTeam === "R" ? "r" : "b"}
                  onSubmit={(v) => g.run(() => submitAnswer(code, v))}
                />
              </>
            ) : (
              <Big
                title="Vol de manche"
                sub={`L’équipe ${TEAM_NAME[(game.steal_team ?? "R") as Team].toLowerCase()} peut vous prendre ${game.round_points} points`}
                tone="bad"
                clock={clock}
              />
            ))}

          {phase === "STEAL_RESULT" && (
            <Big
              title={game.steal_success ? "🎉 VOL RÉUSSI" : "❌ VOL RATÉ"}
              sub={
                game.steal_success
                  ? `${game.round_points} points pour l’équipe ${TEAM_NAME[(game.steal_team ?? "R") as Team].toLowerCase()}`
                  : `L’équipe ${TEAM_NAME[(game.control_team ?? "R") as Team].toLowerCase()} garde ses points`
              }
              tone={
                game.steal_success
                  ? iSteal
                    ? "good"
                    : "bad"
                  : iControl
                    ? "good"
                    : "bad"
              }
            />
          )}

          {(phase === "ROUND_RESULT" || phase === "ROUND_TRANSITION") && (
            <Big
              title={
                game.last_event?.winner
                  ? `+${game.last_event.points ?? 0} pour l’équipe ${TEAM_NAME[game.last_event.winner].toLowerCase()}`
                  : "Personne n’a trouvé"
              }
              sub="Regarde la télévision pour les réponses du panel"
              tone={game.last_event?.winner ? "good" : "wait"}
            />
          )}

          {/* --- FINALE --- */}
          {phase === "FINALE_INTRO" && (
            <Big
              title="GRANDE FINALE"
              sub={
                iAmFinalist
                  ? "Tu joues la finale. Cinq questions, vingt secondes chacune."
                  : `${playerName(players, game.finale_p1)} et ${playerName(players, game.finale_p2)} jouent la finale`
              }
              tone="gold"
            />
          )}

          {(phase === "FINALE_PLAYER_ONE" || phase === "FINALE_PLAYER_TWO") &&
            (finalist ? (
              <>
                <Question text={state.finale?.questions[game.finale_q_index]?.prompt} />
                <p className="mb-3 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
                  question {game.finale_q_index + 1} sur 5
                </p>
                <AnswerForm
                  title="Ta réponse"
                  clock={clock}
                  busy={busy}
                  resetKey={game.phase_seq}
                  tone="gold"
                  onSubmit={(v) => g.run(() => submitAnswer(code, v))}
                />
              </>
            ) : (
              <Big
                title={
                  iAmFinalist
                    ? "Ne regarde pas l’écran !"
                    : `${playerName(players, game.finale_slot === 1 ? game.finale_p1 : game.finale_p2)} répond`
                }
                sub={
                  iAmFinalist
                    ? "Tu passes juste après. Tu ne dois pas voir ses réponses."
                    : `Question ${game.finale_q_index + 1} sur 5`
                }
                tone={iAmFinalist ? "bad" : "wait"}
                clock={clock}
              />
            ))}

          {phase === "FINALE_REVEAL" && (
            <Big
              title="Révélation"
              sub="Tout se passe sur la télévision"
              tone="gold"
            />
          )}

          {phase === "VICTORY" && (
            <div className="text-center">
              <p className="wordmark wordmark-sheen display text-[2.4rem]">TOP FAMILLE</p>
              <p
                className={`display mt-5 text-[1.8rem] ${
                  game.winner_team === "R"
                    ? "text-teamR neon-r"
                    : game.winner_team === "B"
                      ? "text-teamB neon-b"
                      : "text-white/70"
                }`}
              >
                {game.winner_team === "R" || game.winner_team === "B"
                  ? `${TEAM_DOT[game.winner_team]} ÉQUIPE ${TEAM_NAME[game.winner_team]} GAGNE`
                  : "MATCH NUL"}
              </p>
              <p className="mt-2 text-sm text-white/55">
                {game.score_r} — {game.score_b}
              </p>
              {myTeam && game.winner_team === myTeam && (
                <p className="display mt-4 text-[1.2rem] text-gold neon-gold">
                  Bravo, tu as gagné !
                </p>
              )}
              <div className="mt-8 space-y-3">
                {isHost && (
                  <button
                    type="button"
                    onClick={() => g.run(() => restartShow(code))}
                    disabled={busy}
                    className="btn btn-gold w-full py-4"
                  >
                    🔄 Rejouer
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => router.push("/")}
                  className="btn btn-ghost w-full py-4"
                >
                  🏠 Menu
                </button>
              </div>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="rise mt-4 rounded-xl border border-teamR/35 bg-teamR/10 px-3.5 py-2.5 text-[13px] font-semibold text-teamR-soft"
            >
              {error}
            </p>
          )}
        </div>

        {/* ---------- Pied ---------- */}
        <footer className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setRules(true)}
            className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/30 transition hover:text-white/60"
          >
            ❓ Règles
          </button>
          <Link
            href={`/g/${code}/tv`}
            className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/30 transition hover:text-gold"
            title="Le plateau, a mettre sur la television"
          >
            📺 Plateau
          </Link>
          <button
            type="button"
            onClick={async () => {
              try {
                await leaveGame(code);
              } catch {
                /* on quitte l'ecran quoi qu'il arrive */
              }
              router.push("/");
            }}
            className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/30 transition hover:text-teamR"
          >
            Quitter
          </button>
        </footer>
      </div>

      <RulesModal open={rules} onClose={closeRules} />
    </div>
  );
}

/* -------------------------------------------------------------------- */

/** La question, telle que le joueur la voit sur son telephone. */
function Question({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    <div className="mb-4 rounded-xl border border-white/12 bg-black/35 px-3.5 py-3">
      <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-white/35">
        Question
      </p>
      <p className="mt-1 text-balance text-[15px] font-bold leading-snug text-white">
        {text}
      </p>
    </div>
  );
}

/**
 * Le grand message d'etat. Il occupe tout l'ecran : pose sur la table, le
 * joueur lit son statut sans prendre le telephone en main.
 */
function Big({
  title,
  sub,
  tone,
  clock,
  countClock,
  strikes,
}: {
  title: string;
  sub?: string;
  tone: "gold" | "good" | "bad" | "wait" | "r";
  /** Chrono discret, quand le joueur n'agit pas mais doit suivre. */
  clock?: Clock;
  /** Gros compte a rebours (face-a-face). */
  countClock?: Clock;
  strikes?: number;
}) {
  const color =
    tone === "good"
      ? "text-emerald-300 neon"
      : tone === "bad"
        ? "text-teamR neon-r"
        : tone === "gold"
          ? "text-gold neon-gold"
          : tone === "r"
            ? "text-teamR neon-r"
            : "text-white/75";

  return (
    <div className="pop text-center">
      {countClock && <BigCount clock={countClock} />}
      <p className={`display mt-3 text-balance text-[clamp(1.5rem,8vw,2.6rem)] ${color}`}>
        {title}
      </p>
      {sub && (
        <p className="mx-auto mt-3 max-w-[22rem] text-balance text-[14px] leading-snug text-white/55">
          {sub}
        </p>
      )}
      {strikes !== undefined && strikes > 0 && (
        <div className="mt-5 flex justify-center">
          <Strikes count={strikes} size="sm" />
        </div>
      )}
      {clock && (
        <SecondsLeft clock={clock} className="mt-5 text-white/35 text-[1.6rem]" />
      )}
    </div>
  );
}

/**
 * Le 3 - 2 - 1 du face-a-face. Isole dans son propre composant pour que le
 * decompte ne fasse pas re-rendre tout l'ecran du telephone.
 */
function BigCount({ clock }: { clock: Clock }) {
  const ms = useCountdown(clock, 10);
  const n = Math.ceil(ms / 1000);
  if (n < 1 || n > 3) return null;
  return (
    <p key={n} className="display drop-in text-gold neon-gold text-[5rem] leading-none">
      {n}
    </p>
  );
}
