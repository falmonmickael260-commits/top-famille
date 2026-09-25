#!/usr/bin/env node
/**
 * UNE PARTIE DE DEMONSTRATION, jouee toute seule.
 *
 *   npm run demo                 6 robots, du lobby a la victoire
 *   npm run demo -- --players 4
 *   npm run demo -- --base http://192.168.1.12:3000
 *
 * Cree une partie, y fait entrer des robots, lance le show et joue jusqu'au
 * bout — en prenant le temps de reflechir comme des humains, pour que le
 * plateau ait le temps de raconter quelque chose.
 *
 * Il affiche l'URL du plateau des le depart : ouvre-la sur la television et
 * regarde le show se derouler. C'est la facon la plus rapide de voir
 * l'ensemble sans reunir six telephones.
 *
 * A la difference de `npm run playtest`, ce script ne verifie rien : il ne
 * cherche pas les bugs, il joue. Les robots se trompent de temps en temps,
 * laissent parfois filer le chrono, et les manches se terminent donc de
 * toutes les facons possibles — face-a-face rate, tableau vide, trois fautes,
 * vol reussi ou rate.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d;
};
const N = Math.max(2, Math.min(12, Number(opt("players", "6"))));
const BASE = opt("base", "http://localhost:3000");

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  cy: (s) => `\x1b[36m${s}\x1b[0m`,
};

const env = {};
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const PANEL = JSON.parse(readFileSync(join(root, "data/questions.json"), "utf8"));
const BY_PROMPT = new Map(PANEL.questions.map((q) => [q.prompt, q]));

const NAMES = ["Sarah", "Mickael", "Thomas", "Kevin", "Julie", "Lucas",
               "Nora", "Hugo", "Ines", "Yanis", "Lea", "Adam"];
const WRONG = ["zzzzz", "brouette quantique", "patapouf", "xylophone bleu", "grumeau"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const mkClient = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { transport: ws },
  });

const bots = [];
for (let i = 0; i < N; i++) {
  const sb = mkClient();
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) {
    console.error(`connexion impossible : ${error.message}`);
    process.exit(1);
  }
  bots.push({ sb, id: data.user.id, name: NAMES[i % NAMES.length], team: i % 2 === 0 ? "R" : "B" });
}
const host = bots[0];
const nameOf = (id) => bots.find((b) => b.id === id)?.name ?? "—";

const call = async (b, fn, args) => {
  const { data, error } = await b.sb.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
};
const tryCall = async (b, fn, args) => {
  try {
    return { data: await call(b, fn, args), error: null };
  } catch (e) {
    return { data: null, error: e.message };
  }
};

/* ---------- Le lobby ---------- */
let CODE = null;
for (let a = 0; a < 6 && !CODE; a++) {
  const c = `S${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  const r = await tryCall(host, "tf_create", { p_code: c, p_name: host.name, p_team: "R" });
  if (!r.error) CODE = r.data.game.code;
  else if (!/deja utilise/.test(r.error)) {
    console.error(r.error);
    process.exit(1);
  }
}

console.log(C.b("\nTOP FAMILLE — partie de demonstration\n"));
console.log(`  plateau     ${C.cy(`${BASE}/g/${CODE}/tv`)}`);
console.log(`  telephone   ${C.dim(`${BASE}/g/${CODE}`)}`);
console.log(`  code        ${C.b(`TF-${CODE}`)}\n`);

for (const b of bots.slice(1)) {
  await call(b, "tf_join", { p_code: CODE, p_name: b.name, p_team: b.team });
  console.log(`  ${C.dim("+")} ${b.name} rejoint l'equipe ${b.team === "R" ? "rouge" : "bleue"}`);
  await sleep(700);
}

/* Chaque robot doit donner signe de vie, comme le fait un telephone toutes
   les 15 s : sans ce battement, le serveur les considere hors ligne au bout
   de 40 s, saute leur tour, et peut finir par faire jouer la finale au seul
   joueur encore vu recemment. */
const heartbeats = bots.map((b) =>
  setInterval(() => void tryCall(b, "tf_state", { p_code: CODE }), 12000)
);
const stopHeartbeats = () => heartbeats.forEach(clearInterval);

console.log(C.y("\n  Ouvre le plateau maintenant. Le show demarre dans 8 secondes…\n"));
await sleep(8000);
await call(host, "tf_start", { p_code: CODE });

/* ---------- Le show ---------- */
const hidden = (s) => {
  const q = BY_PROMPT.get(s.board?.prompt ?? "");
  if (!q) return null;
  for (const sl of s.board.slots) if (!sl.revealed) return q.answers[sl.rank - 1].label;
  return null;
};

let lastSeq = -1;
let guard = 0;

while (guard++ < 3000) {
  const { data: s, error } = await tryCall(host, "tf_state", { p_code: CODE });
  if (error) {
    await sleep(800);
    continue;
  }
  const g = s.game;

  if (g.phase_seq !== lastSeq) {
    lastSeq = g.phase_seq;
    const ev = g.last_event ?? {};
    const line = {
      intro: () => "Bienvenue dans TOP FAMILLE !",
      face_off: () =>
        `Manche ${g.round_number}${g.round_multiplier > 1 ? ` ×${g.round_multiplier}` : ""} — ${nameOf(g.faceoff_r)} 🔴 contre 🔵 ${nameOf(g.faceoff_b)}`,
      buzz_open: () => `« ${s.board?.prompt ?? "…"} »`,
      buzz: () => `${nameOf(ev.player)} a buzze !`,
      hand_over: () => `La main passe a ${nameOf(ev.player)}`,
      correct_answer: () => `✅ ${ev.label} — ${ev.awarded} points`,
      wrong_answer: () =>
        ev.scope === "team" ? `❌ faute ${ev.strikes} sur 3` : "❌ mauvaise reponse",
      already_found: () => `« ${ev.label} » etait deja sur le tableau`,
      control_granted: () => `L'equipe ${ev.team === "R" ? "rouge" : "bleue"} prend le controle !`,
      team_turn: () => `A ${nameOf(ev.player)}`,
      three_strikes: () => (ev.reason === "time" ? "⏱ temps ecoule" : "❌❌❌ trois fautes"),
      steal_open: () => `VOL DE MANCHE — ${ev.points} points en jeu`,
      steal_result: () => (ev.success ? `🎉 VOL REUSSI (${ev.label})` : "❌ vol rate"),
      round_result: () =>
        ev.winner
          ? `Fin de manche : +${ev.points} pour l'equipe ${ev.winner === "R" ? "rouge" : "bleue"}  ·  ${g.score_r} — ${g.score_b}`
          : `Personne n'a trouve  ·  ${g.score_r} — ${g.score_b}`,
      finale_intro: () => `GRANDE FINALE — equipe ${ev.team === "R" ? "rouge" : "bleue"}`,
      finale_question: () => `finale, joueur ${ev.slot}, question ${ev.index + 1}`,
      finale_switch: () => `Au tour de ${nameOf(ev.player)}`,
      finale_reveal: () => `revelation ${ev.step}/10`,
      victory: () =>
        `🏆 EQUIPE ${ev.winner === "R" ? "ROUGE" : "BLEUE"} GAGNANTE  ·  ${g.score_r} — ${g.score_b}`,
    }[ev.type];
    if (line) console.log(`  ${C.cy("▸")} ${line()}`);
  }

  if (g.phase === "VICTORY") break;

  // Les robots poussent les chronos comme le feraient des telephones.
  if (g.phase_ends_at && new Date(g.phase_ends_at).getTime() <= Date.now()) {
    await tryCall(host, "tf_tick", { p_code: CODE });
    await sleep(200);
    continue;
  }

  const actor = (() => {
    if (g.phase === "BUZZING") {
      // Un des deux duellistes, au hasard, apres un temps de reaction.
      return pick(bots.filter((b) => b.id === g.faceoff_r || b.id === g.faceoff_b));
    }
    if (g.phase === "ANSWERING") return bots.find((b) => b.id === g.buzz_winner);
    if (g.phase === "TEAM_TURN") return bots.find((b) => b.id === g.active_player_id);
    if (g.phase === "STEAL" && !g.steal_by)
      return pick(bots.filter((b) => b.team === g.steal_team));
    if (g.phase === "FINALE_PLAYER_ONE" || g.phase === "FINALE_PLAYER_TWO")
      return bots.find((b) => b.id === (g.finale_slot === 1 ? g.finale_p1 : g.finale_p2));
    return null;
  })();

  if (!actor) {
    await sleep(400);
    continue;
  }

  // Le temps de reflexion : c'est lui qui rend le show regardable.
  await sleep(1200 + Math.random() * 2600);

  if (g.phase === "BUZZING") {
    await tryCall(actor, "tf_buzz", { p_code: CODE });
    continue;
  }

  if (g.phase === "FINALE_PLAYER_ONE" || g.phase === "FINALE_PLAYER_TWO") {
    const q = BY_PROMPT.get(s.finale?.questions?.[g.finale_q_index]?.prompt ?? "");
    const a = q ? q.answers[Math.min(g.finale_slot - 1, q.answers.length - 1)].label : pick(WRONG);
    await tryCall(actor, "tf_submit", { p_code: CODE, p_raw: a });
    continue;
  }

  // Trois fois sur quatre le robot trouve ; sinon il se trompe. De quoi voir
  // des fautes, des vols et des manches perdues sans les forcer.
  const good = hidden(s);
  const answer = !good || Math.random() < 0.25 ? pick(WRONG) : good;
  await tryCall(actor, "tf_submit", { p_code: CODE, p_raw: answer });
}

stopHeartbeats();
console.log(C.g("\n  Fin du show.\n"));
process.exit(0);
