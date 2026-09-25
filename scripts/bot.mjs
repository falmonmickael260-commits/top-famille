#!/usr/bin/env node
/**
 * UN JOUEUR ROBOT, pour tester sans reunir six telephones.
 *
 *   npm run bot -- TF-4827 Sarah B           rejoint, puis attend
 *   npm run bot -- TF-4827 Sarah B --play    rejoint ET joue tout seul
 *
 * Il se connecte comme un vrai joueur — session anonyme, uniquement les RPC
 * publiques — donc il apparait sur les podiums, buzze, repond a son tour,
 * participe au vol et a la finale. On peut en lancer autant qu'on veut, en
 * parallele, pour completer les equipes.
 *
 * En mode --play, il connait les reponses du panel (il lit
 * data/questions.json, ce qu'aucun navigateur ne peut faire) :
 *
 *   --level good     repond juste des qu'il peut         (defaut)
 *   --level mixed    se trompe une fois sur trois
 *   --level bad      repond toujours a cote
 *
 * Utile pour voir le plateau vivre : lance le show sur la television, garde
 * un vrai telephone en main, et laisse les robots tenir les autres postes.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const PLAY = argv.includes("--play");
const LEVEL = (() => {
  const i = argv.indexOf("--level");
  return i >= 0 ? (argv[i + 1] ?? "good") : "good";
})();
const positional = argv.filter((a) => !a.startsWith("--") && !["good", "mixed", "bad"].includes(a));

const CODE = (positional[0] ?? "")
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, "")
  .replace(/^TF/, "");
const NAME = positional[1] ?? "Robot";
const TEAM = (positional[2] ?? "B").toUpperCase();

if (!CODE) {
  console.error("Usage : npm run bot -- TF-4827 Sarah B [--play] [--level good|mixed|bad]");
  process.exit(1);
}

const env = {};
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    // Node 20 n'expose pas WebSocket nativement.
    realtime: { transport: ws },
  }
);

const PANEL = JSON.parse(readFileSync(join(root, "data/questions.json"), "utf8"));
const BY_PROMPT = new Map(PANEL.questions.map((q) => [q.prompt, q]));
const WRONG = ["zzzzz", "brouette quantique", "patapouf", "xylophone bleu"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (m) => console.log(`  ${NAME} · ${m}`);

const { data: auth, error: authErr } = await sb.auth.signInAnonymously();
if (authErr) {
  console.error(`connexion impossible : ${authErr.message}`);
  process.exit(1);
}

const rpc = async (fn, args) => {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
};
const tryRpc = async (fn, args) => {
  try {
    return { data: await rpc(fn, args), error: null };
  } catch (e) {
    return { data: null, error: e.message };
  }
};

let state;
try {
  state = await rpc("tf_join", { p_code: CODE, p_name: NAME, p_team: TEAM });
} catch (e) {
  console.error(`impossible de rejoindre TF-${CODE} : ${e.message}`);
  process.exit(1);
}
const ME = auth.user.id;
say(`a rejoint TF-${CODE} en equipe ${TEAM} · ${state.players.length} joueur(s)`);

if (!PLAY) {
  say("en attente (ajoute --play pour qu'il joue tout seul)");
  // On garde le processus vivant : tf_state sert de battement de coeur, sans
  // quoi le serveur le considere hors ligne au bout de 40 s et saute son tour.
  setInterval(() => void tryRpc("tf_state", { p_code: CODE }), 12000);
} else {
  const hidden = (s) => {
    const q = BY_PROMPT.get(s.board?.prompt ?? "");
    if (!q) return null;
    for (const sl of s.board.slots) if (!sl.revealed) return q.answers[sl.rank - 1].label;
    return null;
  };
  const answerFor = (s) => {
    const good = hidden(s);
    const wrong = WRONG[Math.floor(Math.random() * WRONG.length)];
    if (LEVEL === "bad") return wrong;
    if (LEVEL === "mixed") return Math.random() < 0.34 ? wrong : (good ?? wrong);
    return good ?? wrong;
  };

  let lastSeq = -1;
  for (;;) {
    const { data: s, error } = await tryRpc("tf_state", { p_code: CODE });
    if (error) {
      await sleep(1500);
      continue;
    }
    const g = s.game;

    if (g.phase_seq !== lastSeq) {
      lastSeq = g.phase_seq;
      if (g.phase === "VICTORY") {
        say(`fin du show — equipe ${g.winner_team} gagnante (${g.score_r} — ${g.score_b})`);
      }
    }

    // Le robot ne fait avancer QUE ce qui le concerne. Les chronos sont
    // pousses par les clients : il appelle donc tf_tick comme un telephone.
    if (g.phase_ends_at && new Date(g.phase_ends_at).getTime() <= Date.now()) {
      await tryRpc("tf_tick", { p_code: CODE });
      await sleep(250);
      continue;
    }

    const mine =
      (g.phase === "BUZZING" && (g.faceoff_r === ME || g.faceoff_b === ME)) ||
      (g.phase === "ANSWERING" && g.buzz_winner === ME) ||
      (g.phase === "TEAM_TURN" && g.active_player_id === ME) ||
      (g.phase === "STEAL" && g.steal_team === TEAM && !g.steal_by) ||
      ((g.phase === "FINALE_PLAYER_ONE" || g.phase === "FINALE_PLAYER_TWO") &&
        (g.finale_slot === 1 ? g.finale_p1 : g.finale_p2) === ME);

    if (!mine) {
      await sleep(500);
      continue;
    }

    // Un temps de reflexion : sinon le robot repond en 50 ms et le plateau
    // n'a pas le temps de raconter quoi que ce soit.
    await sleep(900 + Math.random() * 1400);

    if (g.phase === "BUZZING") {
      const r = await tryRpc("tf_buzz", { p_code: CODE });
      if (!r.error) say("BUZZ !");
      continue;
    }

    if (g.phase === "FINALE_PLAYER_ONE" || g.phase === "FINALE_PLAYER_TWO") {
      const q = BY_PROMPT.get(s.finale?.questions?.[g.finale_q_index]?.prompt ?? "");
      const a = q ? q.answers[Math.min(g.finale_slot, q.answers.length - 1)].label : WRONG[0];
      await tryRpc("tf_submit", { p_code: CODE, p_raw: a });
      say(`finale Q${g.finale_q_index + 1} : « ${a} »`);
      continue;
    }

    const a = answerFor(s);
    const r = await tryRpc("tf_submit", { p_code: CODE, p_raw: a });
    if (!r.error) say(`« ${a} »`);
  }
}
