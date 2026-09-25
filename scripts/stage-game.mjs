#!/usr/bin/env node
/**
 * MET UNE VRAIE PARTIE DANS UN ETAT DONNE, pour travailler le plateau.
 *
 *   npm run stage
 *
 * Ouvrir le plateau sur une partie vide ne montre rien : pas de question,
 * pas de score, aucune case ouverte. Ce script cree une vraie partie a six
 * joueurs et la conduit jusqu'a un moment riche a l'image — manche en cours,
 * face-a-face gagne, trois reponses devoilees, une faute au compteur, un
 * joueur actif — puis rend la main.
 *
 * Il affiche l'URL du plateau : il n'y a plus qu'a l'ouvrir. Le TV reprend
 * ensuite les ticks tout seul, comme n'importe quel client.
 *
 * Les joueurs sont de vraies sessions anonymes et tout passe par les RPC
 * publiques : ce qui s'affiche est exactement ce que le serveur enverrait a
 * une television dans un salon.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const PANEL = JSON.parse(readFileSync(join(root, "data/questions.json"), "utf8"));
const BY_PROMPT = new Map(PANEL.questions.map((q) => [q.prompt, q]));

const mk = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { transport: ws },
  });

const NAMES = ["Sarah", "Mickael", "Thomas", "Kevin", "Julie", "Lucas"];
const bots = [];
for (let i = 0; i < 6; i++) {
  const sb = mk();
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) throw new Error(error.message);
  bots.push({ sb, id: data.user.id, name: NAMES[i], team: i % 2 === 0 ? "R" : "B" });
}
const host = bots[0];
const call = async (b, fn, args) => {
  const { data, error } = await b.sb.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
};

const CODE = `D${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
await call(host, "tf_create", { p_code: CODE, p_name: host.name, p_team: "R" });
for (const b of bots.slice(1))
  await call(b, "tf_join", { p_code: CODE, p_name: b.name, p_team: b.team });
await call(host, "tf_start", { p_code: CODE });

const skip = () => call(host, "tf_host_skip", { p_code: CODE });
const state = () => call(host, "tf_state", { p_code: CODE });
const hidden = (s) => {
  const q = BY_PROMPT.get(s.board?.prompt ?? "");
  if (!q) return null;
  for (const sl of s.board.slots) if (!sl.revealed) return q.answers[sl.rank - 1].label;
  return null;
};

// INTRO -> FACE_OFF -> BUZZING
await skip();
await skip();

let s = await state();
const duel = bots.find((b) => b.id === s.game.faceoff_r);
await call(duel, "tf_buzz", { p_code: CODE });
s = await state();
await call(duel, "tf_submit", { p_code: CODE, p_raw: hidden(s) ?? "zzz" });
await skip(); // CORRECT_ANSWER -> CONTROL_GRANTED
await skip(); // -> TEAM_TURN

// Deux bonnes reponses de plus, pour que le tableau soit a moitie ouvert.
for (let i = 0; i < 2; i++) {
  s = await state();
  if (s.game.phase !== "TEAM_TURN") break;
  const who = bots.find((b) => b.id === s.game.active_player_id);
  const a = hidden(s);
  if (!who || !a) break;
  await call(who, "tf_submit", { p_code: CODE, p_raw: a });
  await skip(); // CORRECT_ANSWER -> TEAM_TURN
}

// Une faute, pour qu'une croix soit allumee a l'image.
s = await state();
if (s.game.phase === "TEAM_TURN") {
  const who = bots.find((b) => b.id === s.game.active_player_id);
  await call(who, "tf_submit", { p_code: CODE, p_raw: "brouette quantique" });
  await skip();
}

s = await state();
console.log(
  JSON.stringify(
    {
      code: CODE,
      phase: s.game.phase,
      manche: s.game.round_number,
      cagnotte: s.game.round_points,
      fautes: s.game.strikes,
      controle: s.game.control_team,
      actif: s.players.find((p) => p.id === s.game.active_player_id)?.name,
      devoilees: s.board.slots.filter((x) => x.revealed).length,
      tv: `${process.env.TF_BASE ?? "http://localhost:3000"}/g/${CODE}/tv`,
      telephone: `${process.env.TF_BASE ?? "http://localhost:3000"}/g/${CODE}`,
    },
    null,
    1
  )
);
