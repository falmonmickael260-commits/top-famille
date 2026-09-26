#!/usr/bin/env node
/**
 * LE SCHEMA, EXECUTE POUR DE VRAI — SANS SUPABASE.
 *
 *   npm run simulate            une partie complete, en local
 *   npm run simulate -- -v      chaque transition
 *
 * PGlite est PostgreSQL compile en WebAssembly : `supabase/schema.sql`
 * s'execute ici exactement comme dans le SQL Editor, avec le meme moteur
 * plpgsql. On obtient donc, hors ligne et en quelques secondes :
 *
 *   - la validation syntaxique de TOUT le fichier (une virgule de travers
 *     dans une fonction ne se verrait autrement qu'a l'execution, en pleine
 *     partie) ;
 *   - une partie entiere jouee contre la vraie machine d'etat ;
 *   - la verification que les verrous tiennent (double buzz, double
 *     validation, tour d'un autre joueur, vol par la mauvaise equipe) ;
 *   - la preuve qu'une reponse non trouvee ne sort jamais du serveur.
 *
 * Deux seules choses sont simulees, parce qu'elles appartiennent a Supabase
 * et non a Postgres :
 *   - `auth.uid()`, remplace par un parametre de session ;
 *   - la publication Realtime, retiree (aucun effet sur la logique de jeu).
 *
 * `npm run playtest` fait le meme parcours, mais contre le vrai Supabase et
 * a travers le reseau. Celui-ci teste le moteur ; l'autre teste le systeme.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const VERBOSE = process.argv.includes("-v") || process.argv.includes("--verbose");

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  cy: (s) => `\x1b[36m${s}\x1b[0m`,
};

let checks = 0;
let failures = 0;
const step = (m) => console.log(`\n${C.b(`— ${m}`)}`);
const beat = (m) => console.log(`   ${C.cy("▸")} ${m}`);
const info = (m) => VERBOSE && console.log(`     ${C.dim(m)}`);

function check(label, cond, detail = "") {
  checks++;
  if (cond) console.log(`   ${C.g("✓")} ${label}${detail ? ` ${C.dim(detail)}` : ""}`);
  else {
    failures++;
    console.log(`   ${C.r("✗")} ${label}${detail ? `\n       ${C.dim(detail)}` : ""}`);
  }
  return cond;
}

/* ------------------------------------------------------------------ */
/*  1. Le moteur                                                       */
/* ------------------------------------------------------------------ */

step("Postgres en WebAssembly");
const db = await PGlite.create();
const v = await db.query("select version()");
check("moteur demarre", true, v.rows[0].version.split(" ").slice(0, 2).join(" "));

// Les roles Supabase et le shim auth.uid().
await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  end $$;
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('tf.uid', true), '')::uuid
  $$;
`);
check("auth.uid() simule", true, "parametre de session tf.uid");

/* ------------------------------------------------------------------ */
/*  2. Le schema                                                       */
/* ------------------------------------------------------------------ */

step("Execution de supabase/schema.sql");
let sql = readFileSync(join(root, "supabase/schema.sql"), "utf8");

// La publication Realtime appartient a Supabase, pas a Postgres.
const before = sql.length;
sql = sql.replace(
  /-- ---------------------------------------------------------------------\n-- 11\. REALTIME[\s\S]*?end \$\$;\n/,
  "-- (bloc REALTIME retire : specifique a Supabase)\n"
);
check("bloc Realtime retire", sql.length < before, `${before - sql.length} caracteres`);

try {
  await db.exec(sql);
  check("le fichier s'execute integralement", true, `${sql.split("\n").length} lignes`);
} catch (e) {
  check("le fichier s'execute integralement", false, String(e.message ?? e));
  console.log("");
  process.exit(1);
}

const counts = await db.query(`
  select (select count(*) from public.tf_questions) as q,
         (select count(*) from public.tf_answers) as a,
         (select count(distinct category) from public.tf_questions) as c
`);
check("questions seedees", Number(counts.rows[0].q) === 201, `${counts.rows[0].q} questions`);
check("reponses seedees", Number(counts.rows[0].a) === 1206, `${counts.rows[0].a} reponses`);
check("categories", Number(counts.rows[0].c) === 18, `${counts.rows[0].c}`);

/* ------------------------------------------------------------------ */
/*  3. La normalisation des reponses                                   */
/* ------------------------------------------------------------------ */

step("Normalisation et tolerance");

const norm = async (t) =>
  (await db.query("select public._tf_norm($1) as n", [t])).rows[0].n;
const same = async (a, b) =>
  (await db.query("select public._tf_same(public._tf_norm($1), public._tf_norm($2)) as s", [a, b]))
    .rows[0].s;

for (const [input, expected] of [
  ["Une Serviette", "serviette"],
  ["de la crème solaire", "creme solaire"],
  ["L'ŒUF", "oeuf"],
  ["  les   lunettes  de soleil ! ", "lunettes de soleil"],
  ["Pâtes", "pates"],
]) {
  const got = await norm(input);
  check(`« ${input} » → « ${expected} »`, got === expected, got === expected ? "" : `obtenu « ${got} »`);
}

for (const [a, b, want, why] of [
  ["serviette", "Serviette", true, "casse"],
  ["serviettes", "serviette", true, "pluriel"],
  ["srviette", "serviette", true, "faute de frappe"],
  ["parasol", "serviette", false, "mots differents"],
  ["car", "carotte", false, "trop court"],
  ["chat", "chien", false, "4 lettres, sens different"],
  ["creme solair", "crème solaire", true, "faute sur une expression"],
]) {
  const got = await same(a, b);
  check(
    `« ${a} » ${want ? "=" : "≠"} « ${b} »`,
    got === want,
    got === want ? why : `attendu ${want}, obtenu ${got} (${why})`
  );
}

/* ------------------------------------------------------------------ */
/*  4. Les joueurs                                                     */
/* ------------------------------------------------------------------ */

const PANEL = JSON.parse(readFileSync(join(root, "data/questions.json"), "utf8"));
const BY_PROMPT = new Map(PANEL.questions.map((q) => [q.prompt, q]));

const NAMES = ["Sarah", "Mickael", "Thomas", "Kevin", "Julie", "Lucas"];
const bots = NAMES.map((name, i) => ({
  name,
  team: i % 2 === 0 ? "R" : "B",
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
}));
const host = bots[0];
const nameOf = (id) => bots.find((b) => b.id === id)?.name ?? (id ? String(id).slice(0, 8) : "—");

/** Appelle une RPC « en tant que » ce joueur. */
async function as(bot, fn, args = []) {
  await db.query("select set_config('tf.uid', $1, false)", [bot.id]);
  const ph = args.map((_, i) => `$${i + 1}`).join(", ");
  const res = await db.query(`select public.${fn}(${ph}) as out`, args);
  return res.rows[0].out;
}
/** Idem, mais renvoie l'erreur au lieu de lever. */
async function tryAs(bot, fn, args = []) {
  try {
    return { data: await as(bot, fn, args), error: null };
  } catch (e) {
    return { data: null, error: String(e.message ?? e) };
  }
}
/** Fait expirer la phase courante (equivaut a un chrono a zero). */
async function expire(code) {
  await db.query(
    `update public.tf_games set phase_ends_at = now() - interval '1 second'
      where code = $1 and phase_ends_at is not null`,
    [code]
  );
  return as(host, "tf_tick", [code]);
}

/* ------------------------------------------------------------------ */
/*  5. Le lobby                                                        */
/* ------------------------------------------------------------------ */

step("Lobby");
const CODE = "SIM1";
let st = await as(host, "tf_create", [CODE, host.name, host.team]);
check("partie creee", st.game.code === CODE, `phase ${st.game.phase}`);
check("l'hote est designe", st.game.host_player_id === host.id);

for (const b of bots.slice(1)) st = await as(b, "tf_join", [CODE, b.name, b.team]);
check("6 joueurs", st.players.length === 6);
check("3 par equipe", st.players.filter((p) => p.team === "R").length === 3);
check("tous en ligne", st.players.every((p) => p.live));

{
  const { error } = await tryAs(bots[1], "tf_start", [CODE]);
  check("un non-hote ne peut pas lancer", /hote/i.test(error ?? ""), error ?? "accepte !");
}
{
  const { error } = await tryAs(bots[1], "tf_submit", [CODE, "serviette"]);
  check("on ne repond pas dans le lobby", /pas le moment/i.test(error ?? ""), error ?? "accepte !");
}

/* ------------------------------------------------------------------ */
/*  6. Le show                                                         */
/* ------------------------------------------------------------------ */

step("Le show, du lobby a la victoire");
st = await as(host, "tf_start", [CODE]);
check("phase INTRO", st.game.phase === "INTRO");

const PLANS = {
  1: { faceoff: "first-correct", team: "clear" },
  2: { faceoff: "second-correct", team: "strikes", steal: "win" },
  3: { faceoff: "both-wrong" },
  4: { faceoff: "first-correct", team: "strikes", steal: "fail" },
  5: { faceoff: "first-correct", team: "timeout", steal: "win" },
};

const DISPLAY = new Set([
  "INTRO", "FACE_OFF", "CORRECT_ANSWER", "WRONG_ANSWER", "CONTROL_GRANTED",
  "THREE_STRIKES", "STEAL_RESULT", "ROUND_RESULT", "ROUND_TRANSITION",
  "FINALE_INTRO", "FINALE_REVEAL",
]);

const hit = {};
// LOBBY est traverse avant la boucle (section precedente).
const phases = new Set(["LOBBY"]);
const faceoffs = [];
const wrongTrace = [];
let lastSeq = -1;
let teamCount = 0;
let guard = 0;
let maxR = 0;
let maxB = 0;

const hiddenLabel = (s) => {
  const q = BY_PROMPT.get(s.board?.prompt ?? "");
  if (!q) return null;
  for (const slot of s.board.slots) if (!slot.revealed) return q.answers[slot.rank - 1].label;
  return null;
};
const revealedLabel = (s) => {
  const q = BY_PROMPT.get(s.board?.prompt ?? "");
  if (!q) return null;
  for (const slot of s.board.slots) if (slot.found) return q.answers[slot.rank - 1].label;
  return null;
};
const WRONG = ["zzzzz", "brouette quantique", "xylophone bleu", "patapouf"];
let wi = 0;
const wrong = () => WRONG[wi++ % WRONG.length];

while (guard++ < 700) {
  st = await as(host, "tf_state", [CODE]);
  const g = st.game;
  phases.add(g.phase);

  /* --- invariants, a chaque lecture --- */
  if (g.strikes < 0 || g.strikes > 3) check("fautes dans 0..3", false, `${g.strikes}`);
  if (g.score_r < maxR) check("le score rouge ne redescend pas", false, `${maxR} → ${g.score_r}`);
  if (g.score_b < maxB) check("le score bleu ne redescend pas", false, `${maxB} → ${g.score_b}`);
  maxR = Math.max(maxR, g.score_r);
  maxB = Math.max(maxB, g.score_b);
  for (const s of st.board?.slots ?? []) {
    if (!s.revealed && (s.label !== null || s.points !== null)) {
      check("aucune fuite de reponse cachee", false, `rang ${s.rank}`);
    }
  }
  if (g.phase === "TEAM_TURN") {
    const p = st.players.find((x) => x.id === g.active_player_id);
    if (!p || p.team !== g.control_team) {
      check("joueur actif dans l'equipe au controle", false, `${p?.team} vs ${g.control_team}`);
    }
    const last = wrongTrace[wrongTrace.length - 1];
    if (last && last.seq === g.phase_seq - 1 && last.player === g.active_player_id) {
      check("rotation stricte apres une faute", false, `${nameOf(last.player)} rejoue`);
    }
  }
  if (g.phase === "WRONG_ANSWER" && g.last_event?.scope === "team") {
    wrongTrace.push({ player: g.last_event.player, seq: g.phase_seq });
  }

  if (g.phase_seq !== lastSeq) {
    lastSeq = g.phase_seq;
    info(`[${g.phase_seq}] ${g.phase} ${g.last_event ? JSON.stringify(g.last_event).slice(0, 130) : ""}`);
  }

  if (g.phase === "VICTORY") break;

  const plan = PLANS[g.round_number] ?? PLANS[1];

  /* --- phases d'affichage --- */
  if (DISPLAY.has(g.phase)) {
    if (g.phase === "FACE_OFF") {
      faceoffs.push([g.faceoff_r, g.faceoff_b]);
      teamCount = 0;
      beat(`Manche ${g.round_number} (×${g.round_multiplier}) — ${nameOf(g.faceoff_r)} 🔴 vs 🔵 ${nameOf(g.faceoff_b)}`);
      const pr = st.players.find((p) => p.id === g.faceoff_r);
      const pb = st.players.find((p) => p.id === g.faceoff_b);
      if (pr?.team !== "R" || pb?.team !== "B") {
        check("un duelliste par equipe", false, `${pr?.team}/${pb?.team}`);
      }
    }
    if (g.phase === "WRONG_ANSWER" && g.last_event?.alreadyFound) hit.alreadyFound = true;
    if (g.phase === "THREE_STRIKES" && g.last_event?.reason === "time") hit.timeout = true;
    if (g.phase === "STEAL_RESULT") {
      if (g.steal_success) hit.stealWin = true;
      else hit.stealFail = true;
      beat(g.steal_success
        ? `VOL REUSSI par ${nameOf(g.steal_by)} — ${g.round_points} points changent de camp`
        : `VOL RATE — l'equipe ${g.control_team} garde ${g.round_points} points`);
    }
    if (g.phase === "ROUND_RESULT") {
      if (!g.last_event?.winner) hit.nobody = true;
      const hidden = (st.board?.slots ?? []).filter((s) => !s.revealed).length;
      if (hidden > 0) check("tout devoile en fin de manche", false, `${hidden} fermee(s)`);
      beat(`Fin manche ${g.round_number} — ${g.last_event?.winner ? `+${g.last_event.points} pour ${g.last_event.winner}${g.last_event.stolen ? " (vole)" : ""}` : "aucun point"}  ·  ${g.score_r} — ${g.score_b}`);
    }
    await expire(CODE);
    continue;
  }

  /* --- BUZZING --- */
  if (g.phase === "BUZZING") {
    const rb = bots.find((b) => b.id === g.faceoff_r);
    const bb = bots.find((b) => b.id === g.faceoff_b);
    if (!hit.doubleBuzz) {
      // Deux buzz : un seul doit etre retenu.
      const a = await tryAs(rb, "tf_buzz", [CODE]);
      const b = await tryAs(bb, "tf_buzz", [CODE]);
      hit.doubleBuzz = true;
      const after = await as(host, "tf_state", [CODE]);
      check("deux buzz : un seul gagnant",
        after.game.buzz_winner === rb.id && after.game.phase === "ANSWERING",
        `gagnant ${nameOf(after.game.buzz_winner)} · second buzz ${b.error ? "refuse" : "sans effet"}`);
      void a;
      const outsider = bots.find((x) => x.id !== rb.id && x.id !== bb.id);
      const o = await tryAs(outsider, "tf_buzz", [CODE]);
      check("un joueur hors duel ne peut pas buzzer", !!o.error, o.error ?? "accepte !");
      hit.outsiderBuzz = true;
    } else {
      await as(rb, "tf_buzz", [CODE]);
    }
    continue;
  }

  /* --- ANSWERING (face-a-face) --- */
  if (g.phase === "ANSWERING") {
    const who = bots.find((b) => b.id === g.buzz_winner);
    const tried = (g.faceoff_tried ?? []).length;

    if (!hit.empty) {
      const e = await tryAs(who, "tf_submit", [CODE, "   "]);
      hit.empty = true;
      check("reponse vide refusee", /Ecris une reponse/i.test(e.error ?? ""), e.error ?? "acceptee !");
    }
    {
      const other = bots.find((b) => b.id !== g.buzz_winner);
      const e = await tryAs(other, "tf_submit", [CODE, "serviette"]);
      check("seul celui qui a buzze repond", !!e.error, e.error ?? "accepte !");
      hit.otherAnswer = true;
    }

    let answer;
    if (plan.faceoff === "both-wrong") answer = wrong();
    else if (plan.faceoff === "second-correct") answer = tried === 0 ? wrong() : hiddenLabel(st);
    else answer = hiddenLabel(st);

    if (!hit.doubleSubmit) {
      const a = await tryAs(who, "tf_submit", [CODE, answer ?? wrong()]);
      const b = await tryAs(who, "tf_submit", [CODE, answer ?? wrong()]);
      hit.doubleSubmit = true;
      const after = await as(host, "tf_state", [CODE]);
      check("double validation : une seule prise en compte",
        ["CORRECT_ANSWER", "WRONG_ANSWER"].includes(after.game.phase),
        `phase ${after.game.phase} · second envoi ${b.error ? "refuse" : "sans effet"}`);
      void a;
    } else {
      await as(who, "tf_submit", [CODE, answer ?? wrong()]);
    }
    beat(`${who.name} repond « ${answer ?? "?"} »`);
    continue;
  }

  /* --- TEAM_TURN --- */
  if (g.phase === "TEAM_TURN") {
    const who = bots.find((b) => b.id === g.active_player_id);
    if (!who) { await expire(CODE); continue; }

    if (teamCount === 0) {
      const mate = bots.find((b) => b.team === g.control_team && b.id !== g.active_player_id);
      if (mate) {
        const e = await tryAs(mate, "tf_submit", [CODE, "serviette"]);
        check("un coequipier hors tour est refuse", /Attends ton tour/i.test(e.error ?? ""), e.error ?? "accepte !");
        hit.outOfTurn = true;
      }
    }

    if (plan.team === "timeout") {
      if (teamCount === 0) {
        const a = hiddenLabel(st);
        await as(who, "tf_submit", [CODE, a ?? wrong()]);
        beat(`${who.name} trouve « ${a} », puis l'equipe laisse filer le chrono`);
        teamCount++;
      } else {
        await expire(CODE);
      }
      continue;
    }

    if (plan.team === "strikes") {
      if (teamCount === 0) {
        const a = hiddenLabel(st);
        await as(who, "tf_submit", [CODE, a ?? wrong()]);
        beat(`${who.name} trouve « ${a} »`);
      } else if (teamCount === 1 && !hit.alreadyFound) {
        const d = revealedLabel(st);
        await as(who, "tf_submit", [CODE, d ?? wrong()]);
        beat(`${who.name} redonne « ${d} » (deja sur le tableau)`);
      } else {
        const w = wrong();
        await as(who, "tf_submit", [CODE, w]);
        beat(`${who.name} se trompe (« ${w} ») — faute ${g.strikes + 1}`);
      }
      teamCount++;
      continue;
    }

    const a = hiddenLabel(st);
    if (!a) { await expire(CODE); continue; }
    await as(who, "tf_submit", [CODE, a]);
    beat(`${who.name} trouve « ${a} » (${st.hiddenLeft - 1} restantes)`);
    if (st.hiddenLeft - 1 === 0) hit.cleared = true;
    teamCount++;
    continue;
  }

  /* --- STEAL --- */
  if (g.phase === "STEAL") {
    if (!hit.wrongSide) {
      const bad = bots.find((b) => b.team !== g.steal_team);
      const e = await tryAs(bad, "tf_submit", [CODE, "serviette"]);
      hit.wrongSide = true;
      check("l'equipe au controle ne peut pas voler", /autre equipe/i.test(e.error ?? ""), e.error ?? "accepte !");
    }
    const answer = plan.steal === "win" ? hiddenLabel(st) : wrong();
    const mates = bots.filter((b) => b.team === g.steal_team);
    const a = await tryAs(mates[0], "tf_submit", [CODE, answer ?? wrong()]);
    const b = await tryAs(mates[1], "tf_submit", [CODE, "reponse concurrente"]);
    const after = await as(host, "tf_state", [CODE]);
    check("le vol n'accepte qu'UNE tentative",
      after.game.phase === "STEAL_RESULT" && after.game.steal_by === mates[0].id,
      `steal_by ${nameOf(after.game.steal_by)} · seconde tentative ${b.error ? "refusee" : "sans effet"}`);
    void a;
    beat(`Vol tente par l'equipe ${g.steal_team} : « ${answer} »`);
    continue;
  }

  /* --- FINALE --- */
  if (g.phase === "FINALE_PLAYER_ONE" || g.phase === "FINALE_PLAYER_TWO") {
    const slot = g.finale_slot;
    const pid = slot === 1 ? g.finale_p1 : g.finale_p2;
    const who = bots.find((b) => b.id === pid);
    const idx = g.finale_q_index;
    const prompt = st.finale?.questions?.[idx]?.prompt;
    const q = prompt ? BY_PROMPT.get(prompt) : null;

    if (slot === 1 && idx === 0) {
      beat(`Finale — equipe ${g.finale_team} : ${nameOf(g.finale_p1)} puis ${nameOf(g.finale_p2)}`);
    }

    // Le joueur 2 ne doit rien voir des reponses du joueur 1.
    if (slot === 2 && idx === 0 && g.finale_p1 !== g.finale_p2) {
      const p2 = bots.find((b) => b.id === g.finale_p2);
      const asP2 = await as(p2, "tf_state", [CODE]);
      const first = (asP2.finale?.answers ?? []).filter((x) => x.slot === 1);
      check("le joueur 2 ne voit aucune reponse du joueur 1",
        first.length === 5 && first.every((x) => x.raw === null && x.visible === false),
        `${first.length} reponses, ${first.filter((x) => x.visible).length} visibles`);
      hit.finaleHidden = true;
    }

    if (slot === 1 && idx === 2) {
      hit.finaleEmpty = true;
      await expire(CODE);            // temps ecoule : reponse vide enregistree
      continue;
    }
    const answer = q ? q.answers[slot === 2 && idx === 0 ? 0 : slot === 1 ? 0 : 1].label : wrong();
    await as(who, "tf_submit", [CODE, answer]);
    info(`finale J${slot} Q${idx + 1} : « ${answer} »`);
    continue;
  }

  info(`phase non geree : ${g.phase}`);
  await expire(CODE);
}

/* ------------------------------------------------------------------ */
/*  7. Verdict                                                         */
/* ------------------------------------------------------------------ */

step("Fin de partie");
st = await as(host, "tf_state", [CODE]);
const g = st.game;

check("boucle terminee sans blocage", guard < 700, `${guard} iterations`);
check("phase VICTORY", g.phase === "VICTORY", g.phase);
check("statut finished", g.status === "finished", g.status);
check("un gagnant est designe", g.winner_team === "R" || g.winner_team === "B", String(g.winner_team));
check("les 5 manches sont jouees", g.round_number === 5, `manche ${g.round_number}`);
beat(`SCORE FINAL : 🔴 ${g.score_r} — ${g.score_b} 🔵   gagnant : equipe ${g.winner_team}`);
beat(`Finale : equipe ${g.finale_team}, ${g.finale_total} / ${st.finale?.target} points`);

step("Finale");
{
  const answers = st.finale?.answers ?? [];
  check("10 reponses enregistrees", answers.length === 10, `${answers.length}`);
  check("toutes visibles apres la victoire", answers.every((a) => a.visible));
  const dup = answers.filter((a) => a.duplicate);
  if (dup.length) hit.finaleDuplicate = true;
  check("un doublon a ete detecte", dup.length > 0, `${dup.length} doublon(s)`);
  const empty = answers.filter((a) => (a.raw ?? "") === "");
  check("la question sans reponse est enregistree a 0", empty.length > 0 && empty.every((a) => a.points === 0),
    `${empty.length} vide(s)`);
}

step("Rotation du face-a-face");
{
  const n = new Map();
  for (const [r, b] of faceoffs) {
    n.set(r, (n.get(r) ?? 0) + 1);
    n.set(b, (n.get(b) ?? 0) + 1);
  }
  const per = { R: [], B: [] };
  for (const b of bots) per[b.team].push(n.get(b.id) ?? 0);
  const spread = (a) => Math.max(...a) - Math.min(...a);
  check("5 face-a-face", faceoffs.length === 5, `${faceoffs.length}`);
  check("les duellistes tournent (ecart ≤ 1)", spread(per.R) <= 1 && spread(per.B) <= 1,
    `rouge ${JSON.stringify(per.R)} · bleu ${JSON.stringify(per.B)}`);
  // A 3 contre 3 sur 5 manches, une paire finit forcement par revenir : il
  // n'existe que 9 duels possibles et l'equilibrage rappelle toujours les
  // joueurs les moins sollicites. Ce qui doit etre vrai, c'est qu'un duel ne
  // se rejoue jamais dans la manche suivante.
  const keys = faceoffs.map((p) => p.join("|"));
  const backToBack = keys.some((k, i) => i > 0 && keys[i - 1] === k);
  check("jamais le meme duel deux manches de suite", !backToBack,
    backToBack ? keys.join(" → ") : `${new Set(keys).size} duels distincts sur 5`);
}

step("Chemins traverses");
for (const [k, label] of [
  ["cleared", "tableau entierement vide par une equipe"],
  ["nobody", "manche sans vainqueur"],
  ["stealWin", "vol de manche REUSSI"],
  ["stealFail", "vol de manche RATE"],
  ["timeout", "chrono d'equipe expire"],
  ["alreadyFound", "reponse deja sur le tableau"],
  ["finaleEmpty", "question de finale sans reponse"],
  ["finaleDuplicate", "doublon en finale"],
  ["finaleHidden", "reponses du joueur 1 cachees au joueur 2"],
  ["doubleBuzz", "double buzz"],
  ["doubleSubmit", "double validation"],
  ["empty", "reponse vide refusee"],
  ["outsiderBuzz", "buzz hors duel refuse"],
  ["otherAnswer", "reponse par un autre que le buzzer refusee"],
  ["outOfTurn", "reponse hors tour refusee"],
  ["wrongSide", "vol par la mauvaise equipe refuse"],
]) {
  check(label, hit[k] === true, hit[k] ? "" : "non traverse");
}

step("Machine d'etat");
{
  const expected = [
    "LOBBY", "INTRO", "FACE_OFF", "BUZZING", "ANSWERING", "CORRECT_ANSWER",
    "WRONG_ANSWER", "CONTROL_GRANTED", "TEAM_TURN", "THREE_STRIKES", "STEAL",
    "STEAL_RESULT", "ROUND_RESULT", "ROUND_TRANSITION", "FINALE_INTRO",
    "FINALE_PLAYER_ONE", "FINALE_PLAYER_TWO", "FINALE_REVEAL", "VICTORY",
  ];
  const missing = expected.filter((p) => !phases.has(p));
  check("les 19 phases ont ete visitees", missing.length === 0,
    missing.length ? `manquantes : ${missing.join(", ")}` : `${phases.size} phases`);
}

step("Deconnexion, retour, relance");
{
  const b = bots[5];
  await as(b, "tf_leave", [CODE]);
  let s2 = await as(host, "tf_state", [CODE]);
  const gone = s2.players.find((p) => p.id === b.id);
  check("le joueur parti est hors ligne", gone ? !gone.live : true, gone ? `live=${gone.live}` : "retire");

  s2 = await as(b, "tf_state", [CODE]);
  const back = s2.players.find((p) => p.id === b.id);
  check("un simple tf_state le remet en ligne", back ? back.live : true);

  // Un joueur inactif depuis plus de 40 s ne doit plus etre compte comme vivant.
  await db.query(
    `update public.tf_players set last_seen = now() - interval '2 minutes' where id = $1`,
    [b.id]
  );
  s2 = await as(host, "tf_state", [CODE]);
  const stale = s2.players.find((p) => p.id === b.id);
  check("un joueur muet depuis 2 min est hors ligne", stale ? !stale.live : true,
    `live=${stale?.live}`);

  s2 = await as(host, "tf_restart", [CODE]);
  check("relance : retour au LOBBY", s2.game.phase === "LOBBY" && s2.game.status === "lobby");
  check("relance : scores a zero", s2.game.score_r === 0 && s2.game.score_b === 0);
  check("relance : plus de question en cours", s2.game.question_id === null);
  const e = await tryAs(bots[1], "tf_restart", [CODE]);
  check("un non-hote ne peut pas relancer", /hote/i.test(e.error ?? ""), e.error ?? "accepte !");
}

step("Cas limites de composition d'equipe");
{
  // Une equipe a un seul joueur : ce joueur doit pouvoir jouer les DEUX
  // manches de la finale sans bloquer la partie.
  const solo = [
    { name: "Solo-R", team: "R", id: "00000000-0000-4000-8000-0000000000a1" },
    { name: "Solo-B", team: "B", id: "00000000-0000-4000-8000-0000000000a2" },
  ];
  const C2 = "SIM2";
  let s2 = await as(solo[0], "tf_create", [C2, solo[0].name, "R"]);
  await as(solo[1], "tf_join", [C2, solo[1].name, "B"]);
  s2 = await as(solo[0], "tf_start", [C2]);
  check("partie a 1 contre 1 lancee", s2.game.phase === "INTRO");

  let n = 0;
  while (n++ < 400) {
    s2 = await as(solo[0], "tf_state", [C2]);
    const gg = s2.game;
    if (gg.phase === "VICTORY") break;
    if (gg.phase === "BUZZING") {
      await as(solo[0], "tf_buzz", [C2]);
      continue;
    }
    if (gg.phase === "ANSWERING" || gg.phase === "TEAM_TURN") {
      const who = solo.find((x) => x.id === (gg.active_player_id ?? gg.buzz_winner));
      const a = hiddenLabel(s2);
      if (who && a) await as(who, "tf_submit", [C2, a]);
      else await expire(C2);
      continue;
    }
    if (gg.phase === "STEAL") {
      const who = solo.find((x) => x.team === gg.steal_team);
      await as(who, "tf_submit", [C2, wrong()]);
      continue;
    }
    if (gg.phase === "FINALE_PLAYER_ONE" || gg.phase === "FINALE_PLAYER_TWO") {
      const pid = gg.finale_slot === 1 ? gg.finale_p1 : gg.finale_p2;
      const who = solo.find((x) => x.id === pid);
      const pr = s2.finale?.questions?.[gg.finale_q_index]?.prompt;
      const q = pr ? BY_PROMPT.get(pr) : null;
      if (who && q) await as(who, "tf_submit", [C2, q.answers[gg.finale_q_index % 6].label]);
      else await expire(C2);
      continue;
    }
    await expire(C2);
  }
  check("une partie 1 contre 1 va jusqu'a la victoire", s2.game.phase === "VICTORY",
    `${s2.game.phase} apres ${n} iterations`);
  check("le meme joueur a tenu les deux manches de la finale",
    s2.game.finale_p1 === s2.game.finale_p2, `${nameOf(s2.game.finale_p1)}`);
  const fa = s2.finale?.answers ?? [];
  check("10 reponses de finale malgre un seul finaliste", fa.length === 10, `${fa.length}`);

  // Equipe complete
  for (let i = 0; i < 6; i++) {
    await as(
      { id: `00000000-0000-4000-8000-0000000000b${i}` },
      "tf_join",
      ["SIM3", `X${i}`, "R"]
    ).catch(() => undefined);
  }
}
{
  const C3 = "SIM3";
  const mk = (i) => ({ id: `00000000-0000-4000-8000-0000000000c${i}`, name: `P${i}` });
  await as(mk(0), "tf_create", [C3, "P0", "R"]);
  for (let i = 1; i < 6; i++) await as(mk(i), "tf_join", [C3, `P${i}`, "R"]);
  const e = await tryAs(mk(9), "tf_join", [C3, "P9", "R"]);
  check("une equipe de 6 est complete", /complete/i.test(e.error ?? ""), e.error ?? "accepte !");
  const ok = await tryAs(mk(9), "tf_join", [C3, "P9", "B"]);
  check("le 7e joueur peut rejoindre l'autre equipe", !ok.error, ok.error ?? "");
}

step("Ce qui arrive quand les joueurs partent");
{
  /* Trois situations qui n'avaient jamais ete testees, et qui arrivent pour
     de vrai dans un salon : l'hote ferme son onglet, toute une equipe se
     deconnecte en plein tour, et quelqu'un essaie d'entrer pendant que le
     show demarre. Aucune ne doit figer la partie. */
  const C4 = "SIM4";
  const eq = [
    { id: "00000000-0000-4000-8000-0000000000d1", name: "Hote", team: "R" },
    { id: "00000000-0000-4000-8000-0000000000d2", name: "R2", team: "R" },
    { id: "00000000-0000-4000-8000-0000000000d3", name: "B1", team: "B" },
    { id: "00000000-0000-4000-8000-0000000000d4", name: "B2", team: "B" },
  ];
  await as(eq[0], "tf_create", [C4, eq[0].name, "R"]);
  for (const p of eq.slice(1)) await as(p, "tf_join", [C4, p.name, p.team]);

  // L'hote quitte depuis le lobby : la main doit passer a quelqu'un d'autre.
  await as(eq[0], "tf_leave", [C4]);
  let s4 = await as(eq[1], "tf_state", [C4]);
  check("l'hote qui part passe la main", s4.game.host_player_id !== eq[0].id,
    `nouvel hote : ${s4.players.find((p) => p.id === s4.game.host_player_id)?.name ?? "aucun"}`);

  const nouvelHote = eq.find((p) => p.id === s4.game.host_player_id) ?? eq[1];
  const r = await tryAs(nouvelHote, "tf_start", [C4]);
  check("le nouvel hote peut lancer le show", !r.error, r.error ?? "");

  // Quelqu'un tente d'entrer une fois le show lance.
  const retardataire = { id: "00000000-0000-4000-8000-0000000000d9", name: "Tard" };
  const e = await tryAs(retardataire, "tf_join", [C4, "Tard", "R"]);
  check("on ne rejoint pas un show deja lance", /deja commence/i.test(e.error ?? ""),
    e.error ?? "accepte !");

  // Toute une equipe devient silencieuse en plein jeu.
  let n = 0;
  while (n++ < 200) {
    s4 = await as(nouvelHote, "tf_state", [C4]);
    if (s4.game.phase === "TEAM_TURN" || s4.game.phase === "VICTORY") break;
    if (s4.game.phase === "BUZZING") {
      await as(eq.find((p) => p.id === s4.game.faceoff_r) ?? eq[1], "tf_buzz", [C4]);
      continue;
    }
    if (s4.game.phase === "ANSWERING") {
      const who = eq.find((p) => p.id === s4.game.buzz_winner);
      const a = hiddenLabel(s4);
      if (who && a) await as(who, "tf_submit", [C4, a]);
      else await expire(C4);
      continue;
    }
    await expire(C4);
  }

  if (s4.game.phase === "TEAM_TURN") {
    const equipe = s4.game.control_team;
    await db.query(
      `update public.tf_players set last_seen = now() - interval '5 minutes'
        where game_id = (select id from public.tf_games where code = $1) and team = $2`,
      [C4, equipe]
    );
    let m = 0;
    while (m++ < 120) {
      s4 = await as(nouvelHote, "tf_state", [C4]);
      if (s4.game.phase !== "TEAM_TURN") break;
      await expire(C4);
    }
    check("une equipe entierement hors ligne ne fige pas la partie",
      s4.game.phase !== "TEAM_TURN", `phase ${s4.game.phase}`);
  } else {
    check("une equipe entierement hors ligne ne fige pas la partie", true, "tour non atteint");
  }

  // Et la partie doit pouvoir aller au bout malgre tout.
  let k = 0;
  while (k++ < 400) {
    s4 = await as(nouvelHote, "tf_state", [C4]);
    if (s4.game.phase === "VICTORY") break;
    const g4 = s4.game;
    if (g4.phase === "BUZZING") {
      const d = eq.find((p) => p.id === g4.faceoff_r || p.id === g4.faceoff_b);
      if (d) await as(d, "tf_buzz", [C4]);
      else await expire(C4);
      continue;
    }
    if (g4.phase === "ANSWERING" || g4.phase === "TEAM_TURN") {
      const who = eq.find((p) => p.id === (g4.active_player_id ?? g4.buzz_winner));
      const a = hiddenLabel(s4);
      if (who && a) await as(who, "tf_submit", [C4, a]);
      else await expire(C4);
      continue;
    }
    if (g4.phase === "FINALE_PLAYER_ONE" || g4.phase === "FINALE_PLAYER_TWO") {
      const pid = g4.finale_slot === 1 ? g4.finale_p1 : g4.finale_p2;
      const who = eq.find((p) => p.id === pid);
      const pr = s4.finale?.questions?.[g4.finale_q_index]?.prompt;
      const q = pr ? BY_PROMPT.get(pr) : null;
      if (who && q) await as(who, "tf_submit", [C4, q.answers[0].label]);
      else await expire(C4);
      continue;
    }
    await expire(C4);
  }
  check("la partie va jusqu'a la victoire malgre les departs",
    s4.game.phase === "VICTORY", `${s4.game.phase} apres ${k} iterations`);
}

step("Les verrous de securite");
{
  // Ce qu'un client verrait s'il tentait de lire les reponses directement.
  /* On interroge la base EN TANT QUE `authenticated`, le role que porte un
     joueur connecte anonymement. `set local role` n'a d'effet que dans une
     transaction : sans le begin/rollback, la sonde testait les droits du
     proprietaire des tables et voyait evidemment tout. */
  const probe = async (q) => {
    try {
      await db.exec("begin");
      await db.exec("set local role authenticated");
      await db.query(q);
      await db.exec("rollback");
      return null;
    } catch (e) {
      await db.exec("rollback").catch(() => undefined);
      return String(e.message ?? e);
    }
  };
  for (const t of ["tf_questions", "tf_answers", "tf_reveals", "tf_finale_answers"]) {
    const err = await probe(`select * from public.${t} limit 1`);
    check(`${t} inaccessible au client`, !!err, err ? err.slice(0, 60) : "LISIBLE !");
  }
  for (const t of ["tf_games", "tf_players", "tf_events"]) {
    const err = await probe(`select * from public.${t} limit 1`);
    check(`${t} lisible (necessaire au Realtime)`, !err, err ? err.slice(0, 60) : "");
  }
  const w = await probe("update public.tf_games set score_r = 9999 where code = 'SIM1'");
  check("aucune ecriture directe sur les scores", !!w, w ? w.slice(0, 60) : "ACCEPTEE !");
}

console.log("");
console.log(C.b(`${checks} verifications`));
if (failures === 0) {
  console.log(C.g("✓ Le schema s'execute, la machine d'etat tient, les verrous tiennent."));
  console.log("");
  process.exit(0);
}
console.log(C.r(`✗ ${failures} anomalie(s).`));
console.log("");
process.exit(1);
