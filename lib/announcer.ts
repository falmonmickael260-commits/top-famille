"use client";

import { playerName } from "@/lib/api";
import { TEAM_DOT, TEAM_NAME } from "@/lib/types";
import type { GameEventPayload, GameState, Player, Team } from "@/lib/types";

/**
 * L'ANIMATEUR AUTOMATIQUE.
 *
 * Aucun humain n'a besoin de tenir le micro : a chaque changement de phase, le
 * serveur pose un `last_event` sur la ligne de la partie, et cette fonction en
 * tire les repliques, le son a lancer, l'ambiance musicale et le cadrage
 * camera. C'est une fonction pure : meme phase, meme texte, sur les douze
 * telephones et sur la television.
 */

export type Camera =
  | "wide"      // plan large sur tout le plateau
  | "duel"      // les deux joueurs du face-a-face
  | "closeup"   // le joueur qui parle
  | "board"     // le tableau des reponses
  | "teams"     // les deux equipes, pour le vol
  | "finale"
  | "victory";

export type Mood = "lobby" | "play" | "tense" | "finale" | null;

export type Cue = Parameters<typeof import("@/lib/audio").play>[0];

export interface Script {
  /** Unique par beat : sert de cle d'animation et evite de rejouer un son. */
  key: string;
  lines: string[];
  cue?: Cue;
  mood?: Mood;
  camera: Camera;
  tone: "neutral" | "good" | "bad" | "drama" | "win";
  /** Gros bandeau plein ecran (troisieme faute, vol, victoire). */
  slam?: string;
}

const name = (players: Player[], id: string | null | undefined) =>
  playerName(players, id);

const team = (t: Team | null | undefined) =>
  t ? `${TEAM_DOT[t]} ÉQUIPE ${TEAM_NAME[t]}` : "l'équipe";

const multiplierLine = (m: number) =>
  m > 1 ? `Attention, cette manche compte ×${m} !` : "";

export function script(state: GameState): Script {
  const { game, players, board } = state;
  const ev: GameEventPayload = game.last_event ?? { type: game.phase };
  const key = `${game.phase_seq}:${game.phase}`;
  const P = (id: string | null | undefined) => name(players, id);

  switch (game.phase) {
    case "LOBBY":
      return {
        key,
        camera: "wide",
        tone: "neutral",
        mood: "lobby",
        lines: [
          "Bienvenue dans TOP FAMILLE !",
          "Deux équipes. Cinq manches. Une finale.",
          "Les équipes sont-elles prêtes ?",
        ],
      };

    case "INTRO":
      return {
        key,
        camera: "wide",
        tone: "drama",
        mood: "play",
        cue: "intro",
        lines: [
          "Bienvenue dans TOP FAMILLE !",
          `${team("R")} contre ${team("B")}.`,
          "Cinq manches, puis la grande finale.",
          "Que le show commence !",
        ],
      };

    case "FACE_OFF":
      return {
        key,
        camera: "duel",
        tone: "drama",
        mood: "play",
        cue: "faceoff",
        lines: [
          `Manche ${game.round_number}. Place au face-à-face !`,
          multiplierLine(game.round_multiplier),
          `${TEAM_DOT.R} ${P(game.faceoff_r)} contre ${TEAM_DOT.B} ${P(game.faceoff_b)}.`,
          "Le premier qui buzze prend la main.",
        ].filter(Boolean),
      };

    case "BUZZING":
      return {
        key,
        camera: "duel",
        tone: "drama",
        mood: "tense",
        cue: "question",
        lines: [board?.prompt ?? "Attention à la question…", "BUZZEZ !"],
      };

    case "ANSWERING": {
      const who = P(game.buzz_winner);
      const handOver = ev.type === "hand_over";
      return {
        key,
        camera: "closeup",
        tone: handOver ? "neutral" : "drama",
        mood: "tense",
        cue: handOver ? "question" : "buzz",
        lines: handOver
          ? [`La main passe à ${who} !`, "Dix secondes."]
          : [`${who} a buzzé !`, "Dix secondes pour répondre."],
      };
    }

    case "CORRECT_ANSWER": {
      const isFaceoff = ev.scope === "faceoff";
      const lines = [
        "Bonne réponse !",
        ev.label ? `${ev.label.toUpperCase()} — ${ev.awarded ?? 0} points` : "",
      ].filter(Boolean);
      if (isFaceoff) {
        lines.push(`${team(ev.team)} prend le contrôle de la manche !`);
      } else if (ev.cleared) {
        lines.push("Le tableau est vide ! Tout est trouvé !");
      }
      return {
        key,
        camera: isFaceoff ? "closeup" : "board",
        tone: "good",
        mood: "play",
        cue: "correct",
        lines,
      };
    }

    case "WRONG_ANSWER": {
      if (ev.type === "already_found") {
        return {
          key,
          camera: "board",
          tone: "bad",
          mood: "tense",
          cue: "wrong",
          lines: [
            "Déjà trouvé !",
            ev.label ? `${ev.label.toUpperCase()} est déjà sur le tableau.` : "",
            "Pas de faute, mais le tour passe au joueur suivant.",
          ].filter(Boolean),
        };
      }
      const strikes = ev.strikes ?? game.strikes;
      const ordinal =
        strikes === 1 ? "Première faute !" : strikes === 2 ? "Deuxième faute !" : "Troisième faute !";
      return {
        key,
        camera: ev.scope === "faceoff" ? "closeup" : "board",
        tone: "bad",
        mood: "tense",
        cue: ev.scope === "faceoff" ? "wrong" : "strike",
        lines:
          ev.scope === "faceoff"
            ? [
                ev.timeout ? "Temps écoulé !" : "Mauvaise réponse !",
                ev.raw ? `« ${ev.raw} » n'est pas dans le panel.` : "",
              ].filter(Boolean)
            : [ordinal, ev.raw ? `« ${ev.raw} » n'y est pas.` : ""].filter(Boolean),
      };
    }

    case "CONTROL_GRANTED":
      return {
        key,
        camera: "teams",
        tone: "good",
        mood: "play",
        cue: "roundWin",
        slam: `${TEAM_DOT[ev.team ?? "R"]} ÉQUIPE ${TEAM_NAME[ev.team ?? "R"]} PREND LE CONTRÔLE`,
        lines: [
          `${team(ev.team)} prend le contrôle !`,
          "Vous jouez chacun votre tour.",
          "Trois fautes et l'autre équipe peut tout voler.",
        ],
      };

    case "TEAM_TURN": {
      const who = P(game.active_player_id);
      const order = game.turn_order.length;
      return {
        key,
        camera: "board",
        tone: "neutral",
        mood: "tense",
        lines: [
          `À toi, ${who} !`,
          order > 1 ? `Puis ce sera au suivant. Rotation stricte.` : "",
        ].filter(Boolean),
      };
    }

    case "THREE_STRIKES": {
      const byTime = ev.reason === "time";
      return {
        key,
        camera: "teams",
        tone: "drama",
        mood: "tense",
        cue: byTime ? "strike" : "third",
        slam: byTime ? "TEMPS ÉCOULÉ" : "❌ ❌ ❌",
        lines: byTime
          ? [
              "Temps écoulé !",
              `${team(ev.team)} n'a plus la main.`,
              "Place au vol de manche !",
            ]
          : ["Troisième faute !", `${team(ev.team)} perd la main.`, "VOL DE MANCHE !"],
      };
    }

    case "STEAL":
      return {
        key,
        camera: "teams",
        tone: "drama",
        mood: "tense",
        cue: "steal",
        slam: "VOL DE MANCHE",
        lines: [
          `${team(game.steal_team)}, à vous de jouer.`,
          `${ev.points ?? game.round_points} points sont en jeu.`,
          "Concertez-vous : vous n'avez qu'UNE SEULE réponse.",
        ],
      };

    case "STEAL_RESULT": {
      const ok = !!ev.success;
      return {
        key,
        camera: "teams",
        tone: ok ? "good" : "bad",
        mood: "play",
        cue: ok ? "stealWin" : "stealFail",
        slam: ok ? "🎉 VOL RÉUSSI !" : "❌ VOL RATÉ",
        lines: ok
          ? [
              "Vol réussi !",
              ev.label ? `${ev.label.toUpperCase()} !` : "",
              `Tous les points de la manche passent à ${team(ev.team)} !`,
            ].filter(Boolean)
          : [
              ev.timeout ? "Personne n'a validé !" : "Mauvaise réponse !",
              ev.alreadyFound
                ? "Cette réponse était déjà sur le tableau."
                : ev.raw
                  ? `« ${ev.raw} » n'y est pas.`
                  : "",
              `${team(game.control_team)} conserve ses points.`,
            ].filter(Boolean),
      };
    }

    case "ROUND_RESULT": {
      const w = ev.winner as Team | null | undefined;
      return {
        key,
        camera: "board",
        tone: w ? "good" : "bad",
        mood: "play",
        cue: w ? "roundWin" : "wrong",
        lines: w
          ? [
              `Fin de la manche ${ev.round ?? game.round_number}.`,
              `${ev.points ?? 0} points pour ${team(w)}${ev.stolen ? " — volés !" : ""}.`,
              "Voici tout ce que le panel avait répondu.",
            ]
          : [
              "Personne n'a trouvé !",
              "Aucune équipe ne prend cette manche.",
              "Voici les réponses du panel.",
            ],
      };
    }

    case "ROUND_TRANSITION":
      return {
        key,
        camera: "wide",
        tone: "neutral",
        mood: "play",
        lines: ev.last
          ? ["Les cinq manches sont jouées.", "Place à la GRANDE FINALE !"]
          : [
              `Manche ${ev.next ?? game.round_number + 1} !`,
              multiplierLine(
                ev.next === 3 ? 2 : ev.next === 5 ? 3 : 1
              ) || "Nouveaux joueurs sur le face-à-face.",
            ],
      };

    case "FINALE_INTRO":
      return {
        key,
        camera: "finale",
        tone: "drama",
        mood: "finale",
        cue: "finale",
        slam: "GRANDE FINALE",
        lines: [
          "Place à la GRANDE FINALE !",
          `${team(ev.team ?? game.finale_team)} est en tête et joue la finale.`,
          `${P(ev.p1 ?? game.finale_p1)} puis ${P(ev.p2 ?? game.finale_p2)}.`,
          `Cinq questions chacun. Objectif : ${ev.target ?? 200} points.`,
        ],
      };

    case "FINALE_PLAYER_ONE":
    case "FINALE_PLAYER_TWO": {
      const slot = game.finale_slot;
      const who = P(slot === 1 ? game.finale_p1 : game.finale_p2);
      const q = game.finale_q_index + 1;
      const switched = ev.type === "finale_switch";
      return {
        key,
        camera: "finale",
        tone: "drama",
        mood: "finale",
        cue: switched ? "finale" : "question",
        lines: switched
          ? [
              `Au tour de ${who}.`,
              "Il n'a rien entendu des réponses précédentes.",
              "Cinq questions, vingt secondes chacune.",
            ]
          : [`${who}, question ${q} sur 5.`, "Vingt secondes."],
      };
    }

    case "FINALE_REVEAL": {
      const step = game.finale_reveal_step;
      if (step >= 10) {
        return {
          key,
          camera: "finale",
          tone: "drama",
          mood: "finale",
          cue: "finaleReveal",
          lines: ["Et le total est…"],
        };
      }
      const qi = Math.floor(step / 2);
      const slot = (step % 2) + 1;
      return {
        key,
        camera: "finale",
        tone: "drama",
        mood: "finale",
        cue: "finaleReveal",
        lines: [
          `Question ${qi + 1}.`,
          `Réponse du joueur ${slot}…`,
          "Le panel avait dit…",
        ],
      };
    }

    case "VICTORY": {
      const w = (ev.winner ?? game.winner_team) as Team | null;
      const reached = !!ev.reached;
      return {
        key,
        camera: "victory",
        tone: "win",
        mood: "finale",
        cue: w ? "victory" : "defeat",
        slam: w ? `${TEAM_DOT[w]} ÉQUIPE ${TEAM_NAME[w]} GAGNANTE` : "MATCH NUL",
        lines: [
          reached
            ? `Objectif atteint : ${ev.finaleTotal ?? 0} points en finale !`
            : `Objectif manqué : ${ev.finaleTotal ?? 0} points sur ${ev.target ?? 200}.`,
          w ? `${team(w)} remporte TOP FAMILLE !` : "Personne ne l'emporte.",
          "Merci d'avoir joué. À très vite !",
        ],
      };
    }

    default:
      return { key, camera: "wide", tone: "neutral", lines: [] };
  }
}
