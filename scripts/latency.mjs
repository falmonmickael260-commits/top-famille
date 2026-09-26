#!/usr/bin/env node
/**
 * TOUTES LES LATENCES DU JEU, CHRONOMETREES.
 *
 *   npm run latency
 *   npm run latency -- --rounds 20
 *
 * Mesure ce que le joueur ressent reellement, geste par geste :
 *
 *   plancher reseau      un aller-retour vide vers Supabase
 *   buzz                 l'aller-retour de tf_buzz, ce que le joueur attend
 *                        avant de voir « a toi de repondre »
 *   reponse              l'aller-retour de tf_submit, jusqu'au verdict
 *   avancer une phase    tf_host_skip, l'avancement d'une phase expiree
 *   echo aux autres      le moment ou les AUTRES ecrans l'apprennent, par
 *                        Realtime, sans rien demander au serveur
 *
 * Les deux dernieres sont mesurees SEPAREMENT : l'echo Realtime arrive
 * forcement apres la reponse a l'appel, les confondre donnerait un buzz
 * artificiellement lent.
 *
 * Chaque chiffre est donne en mediane et en p95 : la mediane dit le confort
 * habituel, le p95 dit ce qui arrive quand le reseau tousse.
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
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : d;
};
const ROUNDS = Math.max(4, opt("rounds", 12));

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};

const env = {};
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const PANEL = JSON.parse(readFileSync(join(root, "data/questions.json"), "utf8"));
const BY_PROMPT = new Map(PANEL.questions.map((q) => [q.prompt, q]));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mk = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { transport: ws, params: { eventsPerSecond: 30 } },
  });

/** Mediane et p95, les deux chiffres qui decrivent une latence. */
function stats(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const q = (k) => s[Math.min(s.length - 1, Math.floor(s.length * k))];
  return { n: s.length, min: s[0], median: q(0.5), p95: q(0.95), max: s[s.length - 1] };
}
function show(label, st, seuil) {
  if (!st) {
    console.log(`  ${label.padEnd(26)} ${C.dim("aucune mesure")}`);
    return;
  }
  const verdict =
    st.median <= seuil ? C.g("bon") : st.median <= seuil * 2 ? C.y("passable") : C.r("lent");
  console.log(
    `  ${label.padEnd(26)} mediane ${String(st.median + " ms").padEnd(8)} p95 ${String(
      st.p95 + " ms"
    ).padEnd(8)} ${C.dim(`(${st.n} mesures, ${st.min}-${st.max} ms)`)}  ${verdict}`
  );
}

console.log(C.b("\nTOP FAMILLE — latences mesurees\n"));
console.log(`  projet  ${C.dim(env.NEXT_PUBLIC_SUPABASE_URL)}`);

/* ---------- Les joueurs ---------- */
const bots = [];
for (let i = 0; i < 4; i++) {
  const sb = mk();
  const { error } = await sb.auth.signInAnonymously();
  if (error) {
    console.error(`connexion impossible : ${error.message}`);
    process.exit(1);
  }
  const { data } = await sb.auth.getUser();
  bots.push({ sb, id: data.user.id, name: `P${i + 1}`, team: i % 2 === 0 ? "R" : "B" });
}
const [host, , , spectateur] = bots;
const rpc = async (b, fn, args) => {
  const { data, error } = await b.sb.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
};
const tryRpc = async (b, fn, args) => {
  try {
    return { data: await rpc(b, fn, args), error: null };
  } catch (e) {
    return { data: null, error: e.message };
  }
};

let CODE = null;
for (let a = 0; a < 6 && !CODE; a++) {
  const c = `X${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  const r = await tryRpc(host, "tf_create", { p_code: c, p_name: host.name, p_team: "R" });
  if (!r.error) CODE = r.data.game.code;
}
for (const b of bots.slice(1)) {
  await rpc(b, "tf_join", { p_code: CODE, p_name: b.name, p_team: b.team });
}

/* ---------- Le canal Realtime d'un SPECTATEUR ----------
   C'est lui qui mesure la propagation : le delai entre le geste d'un joueur
   et le moment ou les autres ecrans l'apprennent. */
const gameId = (await rpc(host, "tf_state", { p_code: CODE })).game.id;
let onPush = null;
const canal = spectateur.sb.channel(`tf:${CODE}`);
canal.on(
  "postgres_changes",
  { event: "*", schema: "public", table: "tf_games", filter: `id=eq.${gameId}` },
  (payload) => {
    if (onPush) onPush(payload.new);
  }
);
await new Promise((resolve) => {
  canal.subscribe((st) => {
    if (st === "SUBSCRIBED") resolve();
  });
});
/**
 * Joue `action` et mesure DEUX choses distinctes :
 *   - `action` : l'aller-retour RPC, ce que le joueur qui agit attend ;
 *   - `propagation` : le moment ou les AUTRES ecrans l'apprennent, par
 *     Realtime, sans rien demander au serveur.
 *
 * Les confondre donnerait un « buzz » artificiellement lent : l'echo
 * Realtime arrive forcement apres la reponse a l'appel.
 */
async function mesurer(action) {
  let t0 = 0;
  const attendu = new Promise((resolve) => {
    onPush = () => {
      onPush = null;
      resolve(Date.now() - t0);
    };
  });
  t0 = Date.now();
  await action();
  const actionMs = Date.now() - t0;
  const propagationMs = await Promise.race([attendu, sleep(4000).then(() => null)]);
  onPush = null;
  return { actionMs, propagationMs };
}

/* ---------- Le plancher : un aller-retour vide ---------- */
const plancher = [];
for (let i = 0; i < 10; i++) {
  const t = Date.now();
  await host.sb.from("tf_games").select("id").eq("code", CODE).maybeSingle();
  plancher.push(Date.now() - t);
}

/* ---------- Le show ---------- */
await rpc(host, "tf_start", { p_code: CODE });

const mes = { buzz: [], reponse: [], tick: [], propagation: [], etat: [] };
const hidden = (s) => {
  const q = BY_PROMPT.get(s.board?.prompt ?? "");
  if (!q) return null;
  for (const sl of s.board.slots) if (!sl.revealed) return q.answers[sl.rank - 1].label;
  return null;
};
const expirer = async () => {
  const t = Date.now();
  await rpc(host, "tf_host_skip", { p_code: CODE });
  mes.tick.push(Date.now() - t);
};

let guard = 0;
while (guard++ < 600 && mes.buzz.length < ROUNDS) {
  const t = Date.now();
  const s = await rpc(host, "tf_state", { p_code: CODE });
  mes.etat.push(Date.now() - t);
  const g = s.game;
  if (g.phase === "VICTORY") break;

  if (g.phase === "BUZZING") {
    const duel = bots.find((b) => b.id === g.faceoff_r);
    const m = await mesurer(() => rpc(duel, "tf_buzz", { p_code: CODE }));
    mes.buzz.push(m.actionMs);
    if (m.propagationMs !== null) mes.propagation.push(m.propagationMs);
    continue;
  }

  if (g.phase === "ANSWERING" || g.phase === "TEAM_TURN") {
    const who = bots.find((b) => b.id === (g.active_player_id ?? g.buzz_winner));
    if (!who) {
      await expirer();
      continue;
    }
    const a = hidden(s) ?? "zzzz";
    const m = await mesurer(() => tryRpc(who, "tf_submit", { p_code: CODE, p_raw: a }));
    mes.reponse.push(m.actionMs);
    if (m.propagationMs !== null) mes.propagation.push(m.propagationMs);
    continue;
  }

  if (g.phase === "STEAL" && !g.steal_by) {
    const who = bots.find((b) => b.team === g.steal_team);
    await tryRpc(who, "tf_submit", { p_code: CODE, p_raw: "zzzz" });
    continue;
  }

  await expirer();
}

await tryRpc(host, "tf_leave", { p_code: CODE });
await spectateur.sb.removeChannel(canal);

/* ---------- Verdict ---------- */
console.log("");
show("plancher reseau", stats(plancher), 150);
show("lire l'etat (tf_state)", stats(mes.etat), 150);
console.log("");
show("BUZZ (aller-retour)", stats(mes.buzz), 250);
show("REPONSE (aller-retour)", stats(mes.reponse), 250);
show("avancer une phase", stats(mes.tick), 250);
console.log("");
show("echo aux AUTRES ecrans", stats(mes.propagation), 400);

const p = stats(mes.propagation);
const b = stats(mes.buzz);
console.log("");
if (b && b.median <= 250 && p && p.median <= 400) {
  console.log(C.g("  Le jeu repond dans les temps d'un jeu de buzzer.\n"));
} else {
  console.log(C.y("  Certaines latences meritent un oeil — voir les lignes marquees.\n"));
}
