#!/usr/bin/env node
/**
 * Diagnostic de bout en bout de la connexion Supabase.
 *
 *   npm run check:supabase
 *
 * Repond precisement aux pannes classiques, dans l'ordre ou elles arrivent :
 *   - .env.local absent ou mal nomme
 *   - Anonymous Sign-In desactive
 *   - schema.sql pas (ou partiellement) execute
 *   - questions non seedees
 *   - verrous de securite desarmes (tf_answers lisible = les reponses fuient)
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let failed = 0;
const ok = (m, d = "") =>
  console.log(`  \x1b[32m✓\x1b[0m ${m}${d ? `  \x1b[2m${d}\x1b[0m` : ""}`);
const ko = (m, d = "") => {
  failed++;
  console.log(`  \x1b[31m✗\x1b[0m ${m}${d ? `\n      \x1b[2m${d}\x1b[0m` : ""}`);
};
const warn = (m, d = "") =>
  console.log(`  \x1b[33m!\x1b[0m ${m}${d ? `\n      \x1b[2m${d}\x1b[0m` : ""}`);
const head = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

/* ---------- 1. Variables d'environnement ---------- */
head("1. Configuration");

const envPath = join(root, ".env.local");
if (!existsSync(envPath)) {
  ko(".env.local introuvable", "cp .env.example .env.local  puis remplis les 2 variables.");
  process.exit(1);
}
const env = {};
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url) ko("NEXT_PUBLIC_SUPABASE_URL manquante");
else ok("NEXT_PUBLIC_SUPABASE_URL", url.replace(/^(https:\/\/.{8}).*/, "$1…"));
if (!key) ko("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY manquante");
else ok("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", `${key.slice(0, 16)}…`);
if (failed) process.exit(1);

const client = () =>
  createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

/* ---------- 2. Authentification anonyme ---------- */
head("2. Authentification anonyme");
const sb = client();
const { data: auth, error: authErr } = await sb.auth.signInAnonymously();
if (authErr) {
  ko("signInAnonymously a echoue", authErr.message);
  if (/disabled/i.test(authErr.message)) {
    warn("Active le provider", "Supabase > Authentication > Providers > Anonymous > Enable");
  }
  process.exit(1);
}
ok("session anonyme obtenue", auth.user.id);

/* ---------- 3. Tables et RLS ---------- */
head("3. Tables et verrous de securite");

const { error: gamesErr } = await sb.from("tf_games").select("id").limit(1);
if (gamesErr) {
  ko("tf_games illisible", gamesErr.message);
  warn("Execute supabase/schema.sql", "Supabase > SQL Editor > New query > colle tout > Run");
} else {
  ok("tf_games lisible (necessaire au Realtime)");
}

for (const t of ["tf_players", "tf_events"]) {
  const { error } = await sb.from(t).select("*").limit(1);
  if (error) ko(`${t} illisible`, error.message);
  else ok(`${t} lisible`);
}

// Les tables qui contiennent des reponses ne doivent JAMAIS etre lisibles.
for (const t of ["tf_questions", "tf_answers", "tf_reveals", "tf_finale_answers"]) {
  const { data, error } = await sb.from(t).select("*").limit(1);
  if (error) {
    ok(`${t} verrouillee`, error.message.slice(0, 48));
  } else {
    ko(
      `${t} EST LISIBLE — les reponses fuitent !`,
      "Rejoue la section RLS + GRANTS de schema.sql."
    );
    if (data?.length) console.log("      ", JSON.stringify(data[0]).slice(0, 120));
  }
}

/* ---------- 4. Fonctions RPC ---------- */
head("4. Fonctions RPC");

const RPCS = [
  ["tf_create", { p_code: "ZZZZ", p_name: "", p_team: "R" }],
  ["tf_join", { p_code: "ZZZZ", p_name: "", p_team: "R" }],
  ["tf_set_team", { p_code: "ZZZZ", p_team: "R" }],
  ["tf_start", { p_code: "ZZZZ" }],
  ["tf_buzz", { p_code: "ZZZZ" }],
  ["tf_submit", { p_code: "ZZZZ", p_raw: "" }],
  ["tf_tick", { p_code: "ZZZZ" }],
  ["tf_state", { p_code: "ZZZZ" }],
  ["tf_leave", { p_code: "ZZZZ" }],
  ["tf_restart", { p_code: "ZZZZ" }],
  ["tf_host_skip", { p_code: "ZZZZ" }],
];

for (const [fn, args] of RPCS) {
  const { error } = await sb.rpc(fn, args);
  // On s'attend a une erreur METIER ("Partie introuvable", "Choisis un pseudo") :
  // c'est la preuve que la fonction existe et qu'elle valide ses entrees.
  if (error && (error.code === "PGRST202" || /Could not find the function/i.test(error.message))) {
    ko(`${fn} absente`, "schema.sql n'a pas ete execute entierement.");
  } else {
    ok(fn, error ? error.message.slice(0, 44) : "repond");
  }
}

/* ---------- 5. Le panel de questions ---------- */
head("5. Panel de questions");

const local = JSON.parse(readFileSync(join(root, "data/questions.json"), "utf8"));
ok(`data/questions.json`, `${local.questions.length} questions en local`);

// On ne peut pas compter les questions depuis un client (et c'est voulu) :
// on verifie donc via une vraie partie que le serveur sait en tirer une.
const code = `Z${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const { error: cErr } = await sb.rpc("tf_create", {
  p_code: code,
  p_name: "Diagnostic",
  p_team: "R",
});
if (cErr) {
  ko("creation d'une partie de test impossible", cErr.message);
} else {
  const sb2 = client();
  const { error: a2 } = await sb2.auth.signInAnonymously();
  if (a2) {
    warn("second joueur impossible", a2.message);
  } else {
    await sb2.rpc("tf_join", { p_code: code, p_name: "Diagnostic2", p_team: "B" });
    const { data: st, error: sErr } = await sb.rpc("tf_start", { p_code: code });
    if (sErr) {
      ko("tf_start a echoue", sErr.message);
    } else {
      ok("tf_start", `phase ${st.game.phase}`);
      // INTRO -> FACE_OFF -> BUZZING : on force pour voir arriver une question.
      await sb.rpc("tf_host_skip", { p_code: code });
      await sb.rpc("tf_host_skip", { p_code: code });
      const { data: st2 } = await sb.rpc("tf_state", { p_code: code });
      if (st2?.board?.prompt) {
        ok("une question est servie", `« ${st2.board.prompt.slice(0, 52)}… »`);
        const hidden = (st2.board.slots ?? []).filter((s) => !s.revealed).length;
        ok(`tableau de ${st2.board.slots.length} cases`, `${hidden} encore cachees`);
        const leaked = (st2.board.slots ?? []).some((s) => !s.revealed && s.label !== null);
        if (leaked) ko("une case cachee contient deja son libelle !");
        else ok("aucune reponse cachee ne fuite dans la charge utile");
      } else {
        ko("aucune question servie", "Le bloc QUESTIONS de schema.sql n'a pas ete execute.");
      }
    }
  }
  await sb.rpc("tf_leave", { p_code: code });
}

/* ---------- Bilan ---------- */
console.log("");
if (failed) {
  console.log(`\x1b[31m${failed} probleme(s) a corriger.\x1b[0m\n`);
  process.exit(1);
}
console.log("\x1b[32mTout est en place. npm run dev\x1b[0m\n");
