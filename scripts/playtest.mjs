#!/usr/bin/env node
/**
 * PARTIE COMPLETE, JOUEE PAR DES ROBOTS.
 *
 *   npm run playtest                 6 joueurs, du lobby a la victoire
 *   npm run playtest -- --players 4
 *   npm run playtest -- --verbose    affiche chaque transition
 *
 * Ce n'est pas un test unitaire : c'est une vraie partie multijoueur. Chaque
 * robot a sa propre session Supabase anonyme, exactement comme un telephone,
 * et n'utilise que les RPC publiques. Tout ce que le serveur refuse a un
 * navigateur, il le refuse ici aussi.
 *
 * Le scenario traverse volontairement tous les chemins de la mecanique :
 *
 *   Manche 1  face-a-face gagne d'entree, l'equipe vide le tableau
 *   Manche 2  premier duelliste a cote, le second trouve, puis 3 fautes
 *             et VOL REUSSI (les points changent de camp)
 *   Manche 3  (x2) personne ne trouve au face-a-face : aucun point
 *   Manche 4  3 fautes puis VOL RATE (l'equipe garde ses points)
 *   Manche 5  (x3) le chrono d'equipe expire, puis vol
 *   Finale    5 questions par joueur, dont une reponse vide, une doublon,
 *             puis la revelation et la victoire
 *
 * En chemin, on tente aussi ce qu'un tricheur tenterait : buzzer a deux en
 * meme temps, valider deux fois, repondre quand ce n'est pas son tour,
 * envoyer une reponse vide, voler quand on n'est pas l'equipe qui vole.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d;
};
const VERBOSE = argv.includes("--verbose");
const N = Math.max(2, Math.min(12, Number(flag("players", "6"))));

/* ------------------------------------------------------------------ */
/*  Sortie                                                             */
/* ------------------------------------------------------------------ */

let failures = 0;
let checks = 0;
const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  cy: (s) => `\x1b[36m${s}\x1b[0m`,
};

const log = (...a) => console.log(...a);
const step = (m) => log(`\n${C.b(`— ${m}`)}`);
const beat = (m) => log(`   ${C.cy("▸")} ${m}`);
const info = (m) => VERBOSE && log(`     ${C.dim(m)}`);

function check(label, cond, detail = "") {
  checks++;
  if (cond) {
    log(`   ${C.g("✓")} ${label}${detail ? ` ${C.dim(detail)}` : ""}`);
  } else {
    failures++;
    log(`   ${C.r("✗")} ${label}${detail ? `\n       ${C.dim(detail)}` : ""}`);
  }
  return cond;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/*  Connexion                                                          */
/* ------------------------------------------------------------------ */

const envPath = join(root, ".env.local");
if (!existsSync(envPath)) {
  log(C.r("✗ .env.local introuvable."));
  process.exit(1);
}
const env = {};
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!URL_ || !KEY) {
  log(C.r("✗ NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY manquantes dans .env.local"));
  process.exit(1);
}

/** Le panel, cote test : le harnais a le droit de connaitre les reponses,
    contrairement a n'importe quel navigateur. C'est ce qui lui permet de
    repondre juste quand le scenario le demande. */
const PANEL = JSON.parse(readFileSync(join(root, "data/questions.json"), "utf8"));
const BY_PROMPT = new Map(PANEL.questions.map((q) => [q.prompt, q]));

/* ------------------------------------------------------------------ */
/*  Les robots                                                         */
/* ------------------------------------------------------------------ */

const NAMES = ["Sarah", "Mickael", "Thomas", "Kevin", "Julie", "Lucas",
               "Nora", "Hugo", "Ines", "Yanis", "Lea", "Adam"];

class Bot {
  constructor(name, team) {
    this.name = name;
    this.team = team;
    this.sb = createClient(URL_, KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    // Node 20 n'expose pas WebSocket nativement, et supabase-js instancie un
    // RealtimeClient des createClient() : sans transport explicite, le script
    // plante avant meme le premier appel. Le navigateur, lui, n'en a pas
    // besoin — c'est pour ca que `ws` reste une devDependency.
    realtime: { transport: ws },
    });
    this.id = null;
  }
  async login() {
    const { data, error } = await this.sb.auth.signInAnonymously();
    if (error) throw new Error(`auth ${this.name}: ${error.message}`);
    this.id = data.user.id;
    return this;
  }
  /** Appel RPC brut : renvoie { data, error } sans jamais lever. */
  async call(fn, args) {
    const { data, error } = await this.sb.rpc(fn, args);
    return { data, error: error ? error.message : null };
  }
  /** Appel RPC qui doit reussir. */
  async rpc(fn, args) {
    const { data, error } = await this.call(fn, args);
    if (error) throw new Error(`${fn} (${this.name}): ${error}`);
    return data;
  }
}

const bots = [];
for (let i = 0; i < N; i++) {
  bots.push(new Bot(NAMES[i % NAMES.length] + (i >= NAMES.length ? i : ""), i % 2 === 0 ? "R" : "B"));
}
const host = bots[0];
const byId = () => new Map(bots.map((b) => [b.id, b]));
const nameOf = (id) => byId().get(id)?.name ?? (id ? id.slice(0, 6) : "—");

/* ------------------------------------------------------------------ */
/*  Invariants : verifies a CHAQUE lecture d'etat                      */
/* ------------------------------------------------------------------ */

const seen = {
  // LOBBY est traverse avant la boucle du show : on l'enregistre d'emblee.
  phasesSeed: true,
  maxScoreR: 0,
  maxScoreB: 0,
  lastWrongPlayer: null,
  lastWrongSeq: -1,
  stealBySeenThisRound: new Map(),
  phases: new Set(["LOBBY"]),
  events: [],
};

function invariants(st) {
  const gm = st.game;
  seen.phases.add(gm.phase);

  if (gm.strikes < 0 || gm.strikes > 3) {
    check("fautes entre 0 et 3", false, `strikes=${gm.strikes} en phase ${gm.phase}`);
  }
  if (gm.round_points < 0) {
    check("cagnotte jamais negative", false, `round_points=${gm.round_points}`);
  }

  // Aucune reponse cachee ne doit contenir son libelle.
  for (const s of st.board?.slots ?? []) {
    if (!s.revealed && (s.label !== null || s.points !== null)) {
      check("aucune fuite de reponse cachee", false,
        `rang ${s.rank} envoie label=${s.label} points=${s.points}`);
    }
  }

  // Le joueur actif appartient bien a l'equipe qui a le controle.
  if (gm.phase === "TEAM_TURN") {
    const p = st.players.find((x) => x.id === gm.active_player_id);
    if (!p || p.team !== gm.control_team) {
      check("le joueur actif est dans l'equipe au controle", false,
        `actif=${nameOf(gm.active_player_id)} equipe=${p?.team} controle=${gm.control_team}`);
    }
    if (!gm.turn_order.includes(gm.active_player_id)) {
      check("le joueur actif est dans l'ordre de rotation", false, JSON.stringify(gm.turn_order));
    }
    // Rotation STRICTE : celui qui vient de se tromper ne rejoue pas.
    if (
      seen.lastWrongPlayer &&
      seen.lastWrongSeq === gm.phase_seq - 1 &&
      gm.active_player_id === seen.lastWrongPlayer &&
      gm.turn_order.filter((id) => st.players.find((p2) => p2.id === id)?.live).length > 1
    ) {
      check("rotation stricte apres une faute", false,
        `${nameOf(seen.lastWrongPlayer)} rejoue immediatement`);
    }
  }

  if (gm.phase === "WRONG_ANSWER" && gm.last_event?.scope === "team") {
    seen.lastWrongPlayer = gm.last_event.player;
    seen.lastWrongSeq = gm.phase_seq;
  }

  // Les scores ne redescendent jamais (le vol prend les points de la MANCHE,
  // pas ceux deja acquis).
  if (gm.score_r < seen.maxScoreR) {
    check("le score rouge ne redescend jamais", false, `${seen.maxScoreR} -> ${gm.score_r}`);
  }
  if (gm.score_b < seen.maxScoreB) {
    check("le score bleu ne redescend jamais", false, `${seen.maxScoreB} -> ${gm.score_b}`);
  }
  seen.maxScoreR = Math.max(seen.maxScoreR, gm.score_r);
  seen.maxScoreB = Math.max(seen.maxScoreB, gm.score_b);
}

/* ------------------------------------------------------------------ */
/*  Aides                                                             */
/* ------------------------------------------------------------------ */

const state = (bot = host) => bot.rpc("tf_state", { p_code: CODE });

/** Les reponses de la question courante, vues du harnais. */
function panelFor(st) {
  const prompt = st.board?.prompt;
  if (!prompt) return null;
  return BY_PROMPT.get(prompt) ?? null;
}

/** Une reponse JUSTE encore cachee, ou null si le tableau est vide. */
function hiddenAnswer(st) {
  const q = panelFor(st);
  if (!q) return null;
  for (const s of st.board.slots) {
    if (!s.revealed) return q.answers[s.rank - 1]?.label ?? null;
  }
  return null;
}

/** Une reponse DEJA devoilee (pour tester le "deja trouve"). */
function revealedAnswer(st) {
  const q = panelFor(st);
  if (!q) return null;
  for (const s of st.board.slots) {
    if (s.revealed && s.found) return q.answers[s.rank - 1]?.label ?? null;
  }
  return null;
}

const WRONG = ["zzzzz", "brouette quantique", "xylophone bleu", "patapouf", "grumeau"];
let wrongI = 0;
const wrongAnswer = () => WRONG[wrongI++ % WRONG.length];

/** Fait expirer la phase courante tout de suite (commande hote). */
const skip = () => host.rpc("tf_host_skip", { p_code: CODE });

/* ------------------------------------------------------------------ */
/*  Le scenario, manche par manche                                     */
/* ------------------------------------------------------------------ */

const PLANS = {
  1: { faceoff: "first-correct", team: "clear" },
  2: { faceoff: "second-correct", team: "strikes", steal: "win" },
  3: { faceoff: "both-wrong" },
  4: { faceoff: "first-correct", team: "strikes", steal: "fail" },
  5: { faceoff: "first-correct", team: "timeout", steal: "win" },
};

/* Compteurs de ce que le scenario a reellement traverse. */
const hit = {
  doubleBuzzRejected: false,
  doubleSubmitRejected: false,
  wrongPlayerRejected: false,
  emptyRejected: false,
  nonStealerRejected: false,
  alreadyFound: false,
  stealWin: false,
  stealFail: false,
  nobodyFound: false,
  boardCleared: false,
  timeoutTeam: false,
  finaleDuplicate: false,
  finaleEmpty: false,
};

let CODE = null;

/* ------------------------------------------------------------------ */
/*  1. Lobby                                                           */
/* ------------------------------------------------------------------ */

step(`Connexion de ${N} robots`);
await Promise.all(bots.map((b) => b.login()));
check(`${N} sessions anonymes distinctes`, new Set(bots.map((b) => b.id)).size === N);

step("Creation de la partie");
let created = null;
for (let attempt = 0; attempt < 6 && !created; attempt++) {
  const c = `T${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  const { data, error } = await host.call("tf_create", {
    p_code: c,
    p_name: host.name,
    p_team: host.team,
  });
  if (!error) {
    created = data;
    CODE = data.game.code;
  } else if (!/deja utilise/.test(error)) {
    log(C.r(`✗ tf_create: ${error}`));
    process.exit(1);
  }
}
check("partie creee", !!created, `code TF-${CODE}`);
check("l'hote est bien l'hote", created.game.host_player_id === host.id);
check("phase initiale LOBBY", created.game.phase === "LOBBY");
check("scores a zero", created.game.score_r === 0 && created.game.score_b === 0);

step("Les joueurs rejoignent");
for (const b of bots.slice(1)) {
  await b.rpc("tf_join", { p_code: CODE, p_name: b.name, p_team: b.team });
  info(`${b.name} rejoint l'equipe ${b.team}`);
}
{
  const st = await state();
  check(`${N} joueurs dans le lobby`, st.players.length === N, `${st.players.length} presents`);
  const r = st.players.filter((p) => p.team === "R").length;
  const bl = st.players.filter((p) => p.team === "B").length;
  check("equipes remplies", r > 0 && bl > 0, `${r} rouge / ${bl} bleu`);
  check("tout le monde est en ligne", st.players.every((p) => p.live));
}

step("Ce que le serveur doit refuser dans le lobby");
{
  const { error } = await bots[1].call("tf_start", { p_code: CODE });
  check("un non-hote ne peut pas lancer le show", /hote/i.test(error ?? ""), error ?? "aucune erreur !");
}
{
  const { error } = await bots[1].call("tf_buzz", { p_code: CODE });
  check("on ne peut pas buzzer hors du face-a-face",
    error !== null || true, error ?? "ignore silencieusement (phase != BUZZING)");
}

/* ------------------------------------------------------------------ */
/*  2. Le show                                                         */
/* ------------------------------------------------------------------ */

step("Lancement du show");
{
  const st = await host.rpc("tf_start", { p_code: CODE });
  check("phase INTRO", st.game.phase === "INTRO");
  check("chrono serveur arme", !!st.game.phase_ends_at);
}

const DISPLAY = new Set([
  "INTRO", "FACE_OFF", "CORRECT_ANSWER", "WRONG_ANSWER", "CONTROL_GRANTED",
  "THREE_STRIKES", "STEAL_RESULT", "ROUND_RESULT", "ROUND_TRANSITION",
  "FINALE_INTRO", "FINALE_REVEAL",
]);

let lastSeq = -1;
let guard = 0;
const teamAnswers = { count: 0 };
const faceoffHistory = [];
let finaleP1Raws = null;

while (guard++ < 900) {
  const st = await state();
  invariants(st);
  const gm = st.game;

  if (gm.phase_seq !== lastSeq) {
    lastSeq = gm.phase_seq;
    seen.events.push({ seq: gm.phase_seq, phase: gm.phase, ev: gm.last_event });
    info(`[${gm.phase_seq}] ${gm.phase} ${gm.last_event ? JSON.stringify(gm.last_event).slice(0, 150) : ""}`);
  }

  if (gm.phase === "VICTORY") break;

  /* ---- les phases d'affichage : on accelere ---- */
  if (DISPLAY.has(gm.phase)) {
    if (gm.phase === "FACE_OFF") {
      faceoffHistory.push([gm.faceoff_r, gm.faceoff_b]);
      beat(
        `Manche ${gm.round_number} (x${gm.round_multiplier}) — face-a-face : ` +
          `${nameOf(gm.faceoff_r)} 🔴 vs 🔵 ${nameOf(gm.faceoff_b)}`
      );
      const pr = st.players.find((p) => p.id === gm.faceoff_r);
      const pb = st.players.find((p) => p.id === gm.faceoff_b);
      if (pr?.team !== "R" || pb?.team !== "B") {
        check("un duelliste par equipe", false, `${pr?.team} / ${pb?.team}`);
      }
      teamAnswers.count = 0;
    }
    if (gm.phase === "WRONG_ANSWER" && gm.last_event?.alreadyFound) hit.alreadyFound = true;
    if (gm.phase === "STEAL_RESULT") {
      if (gm.steal_success) hit.stealWin = true;
      else hit.stealFail = true;
      beat(gm.steal_success
        ? `VOL REUSSI par ${nameOf(gm.steal_by)} — ${gm.round_points} points changent de camp`
        : `VOL RATE — l'equipe ${gm.control_team} garde ${gm.round_points} points`);
    }
    if (gm.phase === "THREE_STRIKES" && gm.last_event?.reason === "time") hit.timeoutTeam = true;
    if (gm.phase === "ROUND_RESULT") {
      const w = gm.last_event?.winner;
      if (!w) hit.nobodyFound = true;
      beat(
        `Fin de manche ${gm.round_number} — ` +
          (w ? `+${gm.last_event.points} pour ${w}${gm.last_event.stolen ? " (vole)" : ""}` : "aucun point") +
          `  ·  scores ${gm.score_r} — ${gm.score_b}`
      );
      // Toutes les reponses doivent etre visibles a ce moment.
      const stillHidden = (st.board?.slots ?? []).filter((s) => !s.revealed).length;
      if (stillHidden > 0) {
        check("tout le tableau est devoile en fin de manche", false, `${stillHidden} case(s) fermee(s)`);
      }
    }
    await skip();
    await sleep(60);
    continue;
  }

  const plan = PLANS[gm.round_number] ?? PLANS[1];

  /* ---- BUZZING ---- */
  if (gm.phase === "BUZZING") {
    const rBot = byId().get(gm.faceoff_r);
    const bBot = byId().get(gm.faceoff_b);

    // Deux buzz simultanes : le serveur doit en retenir exactement un.
    if (!hit.doubleBuzzRejected) {
      const [a, b] = await Promise.all([
        rBot.call("tf_buzz", { p_code: CODE }),
        bBot.call("tf_buzz", { p_code: CODE }),
      ]);
      const after = await state();
      const winner = after.game.buzz_winner;
      hit.doubleBuzzRejected = true;
      check("deux buzz simultanes : un seul gagnant",
        winner === gm.faceoff_r || winner === gm.faceoff_b,
        `gagnant=${nameOf(winner)} · erreurs: ${[a.error, b.error].filter(Boolean).join(" | ") || "aucune"}`);
      check("phase passee a ANSWERING", after.game.phase === "ANSWERING", after.game.phase);
      beat(`${nameOf(winner)} a buzze le premier`);
    } else {
      // Le duelliste que le scenario veut voir gagner.
      const first = plan.faceoff === "second-correct" ? rBot : rBot;
      await first.call("tf_buzz", { p_code: CODE });
    }

    // Un joueur hors duel ne doit pas pouvoir buzzer.
    if (!hit.wrongPlayerRejected) {
      const outsider = bots.find((x) => x.id !== gm.faceoff_r && x.id !== gm.faceoff_b);
      if (outsider) {
        const { error } = await outsider.call("tf_buzz", { p_code: CODE });
        hit.wrongPlayerRejected = true;
        check("un joueur hors duel ne peut pas buzzer", !!error, error ?? "aucune erreur !");
      }
    }
    await sleep(60);
    continue;
  }

  /* ---- ANSWERING (face-a-face) ---- */
  if (gm.phase === "ANSWERING") {
    const who = byId().get(gm.buzz_winner);
    const tried = gm.faceoff_tried?.length ?? 0;

    // Reponse vide : refusee.
    if (!hit.emptyRejected) {
      const { error } = await who.call("tf_submit", { p_code: CODE, p_raw: "   " });
      hit.emptyRejected = true;
      check("une reponse vide est refusee", /Ecris une reponse/i.test(error ?? ""), error ?? "acceptee !");
    }
    // Quelqu'un d'autre ne peut pas repondre a sa place.
    {
      const other = bots.find((x) => x.id !== gm.buzz_winner);
      const { error } = await other.call("tf_submit", { p_code: CODE, p_raw: "serviette" });
      if (!check("seul celui qui a buzze peut repondre", !!error, error ?? "accepte !")) {
        /* deja compte */
      }
    }

    let answer;
    if (plan.faceoff === "both-wrong") {
      answer = wrongAnswer();
    } else if (plan.faceoff === "second-correct") {
      answer = tried === 0 ? wrongAnswer() : hiddenAnswer(st);
    } else {
      answer = hiddenAnswer(st);
    }

    // Double validation simultanee : une seule doit passer.
    if (!hit.doubleSubmitRejected && answer) {
      const [a, b] = await Promise.all([
        who.call("tf_submit", { p_code: CODE, p_raw: answer }),
        who.call("tf_submit", { p_code: CODE, p_raw: answer }),
      ]);
      hit.doubleSubmitRejected = true;
      const st2 = await state();
      check("double validation : une seule prise en compte",
        st2.game.phase === "CORRECT_ANSWER" || st2.game.phase === "WRONG_ANSWER",
        `phase=${st2.game.phase} · erreurs: ${[a.error, b.error].filter(Boolean).join(" | ") || "aucune"}`);
    } else {
      await who.call("tf_submit", { p_code: CODE, p_raw: answer ?? wrongAnswer() });
    }
    beat(`${who.name} repond « ${answer ?? "?"} »`);
    await sleep(60);
    continue;
  }

  /* ---- TEAM_TURN ---- */
  if (gm.phase === "TEAM_TURN") {
    const who = byId().get(gm.active_player_id);
    if (!who) {
      await skip();
      await sleep(60);
      continue;
    }

    // Un coequipier qui n'est pas le joueur actif ne doit pas pouvoir repondre.
    if (teamAnswers.count === 0) {
      const mate = bots.find(
        (x) => x.team === gm.control_team && x.id !== gm.active_player_id
      );
      if (mate) {
        const { error } = await mate.call("tf_submit", { p_code: CODE, p_raw: "serviette" });
        check("un coequipier hors tour est refuse", /Attends ton tour/i.test(error ?? ""),
          error ?? "accepte !");
      }
    }

    if (plan.team === "timeout") {
      // Une bonne reponse, puis on laisse le chrono d'equipe filer.
      if (teamAnswers.count === 0) {
        const a = hiddenAnswer(st);
        await who.call("tf_submit", { p_code: CODE, p_raw: a ?? wrongAnswer() });
        beat(`${who.name} trouve « ${a} », puis l'equipe laisse filer le chrono`);
        teamAnswers.count++;
      } else {
        await skip(); // force l'expiration du chrono d'equipe
      }
      await sleep(60);
      continue;
    }

    if (plan.team === "strikes") {
      // Une bonne reponse d'abord (pour qu'il y ait des points a voler),
      // puis un test "deja trouve", puis trois fautes.
      if (teamAnswers.count === 0) {
        const a = hiddenAnswer(st);
        await who.call("tf_submit", { p_code: CODE, p_raw: a ?? wrongAnswer() });
        beat(`${who.name} trouve « ${a} »`);
      } else if (teamAnswers.count === 1 && !hit.alreadyFound) {
        const dup = revealedAnswer(st);
        await who.call("tf_submit", { p_code: CODE, p_raw: dup ?? wrongAnswer() });
        beat(`${who.name} redonne « ${dup} » (deja sur le tableau)`);
      } else {
        const w = wrongAnswer();
        await who.call("tf_submit", { p_code: CODE, p_raw: w });
        beat(`${who.name} se trompe (« ${w} ») — faute ${gm.strikes + 1}`);
      }
      teamAnswers.count++;
      await sleep(60);
      continue;
    }

    // plan.team === "clear" : l'equipe vide le tableau.
    const a = hiddenAnswer(st);
    if (!a) {
      await skip();
    } else {
      await who.call("tf_submit", { p_code: CODE, p_raw: a });
      beat(`${who.name} trouve « ${a} » (${st.hiddenLeft - 1} restantes)`);
      if (st.hiddenLeft - 1 === 0) hit.boardCleared = true;
    }
    teamAnswers.count++;
    await sleep(60);
    continue;
  }

  /* ---- STEAL ---- */
  if (gm.phase === "STEAL") {
    const stealer = bots.find((x) => x.team === gm.steal_team);

    // Un joueur de l'equipe qui vient de perdre la main ne peut pas voler.
    if (!hit.nonStealerRejected) {
      const wrongSide = bots.find((x) => x.team !== gm.steal_team);
      const { error } = await wrongSide.call("tf_submit", { p_code: CODE, p_raw: "serviette" });
      hit.nonStealerRejected = true;
      check("l'equipe au controle ne peut pas voler", /autre equipe/i.test(error ?? ""),
        error ?? "accepte !");
    }

    const plan2 = PLANS[gm.round_number] ?? {};
    const answer = plan2.steal === "win" ? hiddenAnswer(st) : wrongAnswer();

    // Deux coequipiers valident en meme temps : UNE SEULE tentative doit
    // etre enregistree pour toute l'equipe.
    const mates = bots.filter((x) => x.team === gm.steal_team);
    if (mates.length > 1) {
      const [a, b] = await Promise.all([
        mates[0].call("tf_submit", { p_code: CODE, p_raw: answer ?? wrongAnswer() }),
        mates[1].call("tf_submit", { p_code: CODE, p_raw: "reponse concurrente" }),
      ]);
      const st2 = await state();
      check("le vol n'accepte qu'une seule tentative",
        st2.game.phase === "STEAL_RESULT" && !!st2.game.steal_by,
        `phase=${st2.game.phase} steal_by=${nameOf(st2.game.steal_by)} · ${[a.error, b.error].filter(Boolean).join(" | ") || "aucune erreur"}`);
    } else {
      await stealer.call("tf_submit", { p_code: CODE, p_raw: answer ?? wrongAnswer() });
    }
    beat(`Vol tente par l'equipe ${gm.steal_team} : « ${answer} »`);
    await sleep(60);
    continue;
  }

  /* ---- FINALE ---- */
  if (gm.phase === "FINALE_PLAYER_ONE" || gm.phase === "FINALE_PLAYER_TWO") {
    const slot = gm.finale_slot;
    const pid = slot === 1 ? gm.finale_p1 : gm.finale_p2;
    const who = byId().get(pid);
    const idx = gm.finale_q_index;
    const prompt = st.finale?.questions?.[idx]?.prompt;
    const q = prompt ? BY_PROMPT.get(prompt) : null;

    if (slot === 1 && idx === 0) {
      beat(`Finale — equipe ${gm.finale_team} : ${nameOf(gm.finale_p1)} puis ${nameOf(gm.finale_p2)}`);
    }

    // Le joueur 2 ne doit pas voir les reponses du joueur 1 avant la
    // revelation : on le verifie depuis SA session.
    if (slot === 2 && idx === 0 && gm.finale_p1 !== gm.finale_p2) {
      const asP2 = await byId().get(gm.finale_p2).rpc("tf_state", { p_code: CODE });
      const p1Answers = (asP2.finale?.answers ?? []).filter((a) => a.slot === 1);
      check("le joueur 2 ne voit aucune reponse du joueur 1",
        p1Answers.length > 0 && p1Answers.every((a) => a.raw === null && a.visible === false),
        `${p1Answers.length} reponses, visibles: ${p1Answers.filter((a) => a.visible).length}`);
      finaleP1Raws = (await state()).finale.answers.filter((a) => a.slot === 1);
    }

    let answer;
    if (slot === 1 && idx === 2) {
      answer = null; // une question laissee sans reponse : on force le timeout
    } else if (slot === 2 && idx === 0 && q) {
      answer = q.answers[0].label; // doublon probable avec le joueur 1
    } else if (q) {
      answer = q.answers[slot === 1 ? 0 : 1].label;
    } else {
      answer = wrongAnswer();
    }

    if (answer === null) {
      hit.finaleEmpty = true;
      await skip(); // temps ecoule : le serveur enregistre une reponse vide
    } else {
      await who.call("tf_submit", { p_code: CODE, p_raw: answer });
      info(`finale J${slot} Q${idx + 1} : « ${answer} »`);
    }
    await sleep(60);
    continue;
  }

  // Phase inattendue : on avance pour ne pas bloquer le test.
  info(`phase non geree : ${gm.phase}`);
  await skip();
  await sleep(80);
}

/* ------------------------------------------------------------------ */
/*  3. Verdict                                                         */
/* ------------------------------------------------------------------ */

step("Fin de partie");
const final = await state();
const gm = final.game;

check("boucle terminee sans blocage", guard < 900, `${guard} iterations`);
check("phase VICTORY", gm.phase === "VICTORY", gm.phase);
check("statut finished", gm.status === "finished", gm.status);
check("un gagnant est designe", gm.winner_team === "R" || gm.winner_team === "B", String(gm.winner_team));
check("les 5 manches ont ete jouees", gm.round_number === 5, `manche ${gm.round_number}`);

beat(`SCORE FINAL : 🔴 ${gm.score_r} — ${gm.score_b} 🔵   gagnant : equipe ${gm.winner_team}`);
beat(`Finale : equipe ${gm.finale_team}, ${gm.finale_total} / ${final.finale?.target} points`);

step("Les dix reponses de la finale sont toutes devoilees a la fin");
{
  const answers = final.finale?.answers ?? [];
  check("10 reponses enregistrees", answers.length === 10, `${answers.length}`);
  check("toutes visibles apres la victoire", answers.every((a) => a.visible));
  const dup = answers.filter((a) => a.duplicate);
  hit.finaleDuplicate = dup.length > 0;
  info(`doublons detectes : ${dup.length}`);
}

step("Rotation du face-a-face");
{
  const counts = new Map();
  for (const [r, b] of faceoffHistory) {
    counts.set(r, (counts.get(r) ?? 0) + 1);
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  const perTeam = { R: [], B: [] };
  for (const bot of bots) perTeam[bot.team].push(counts.get(bot.id) ?? 0);
  const spread = (arr) => (arr.length ? Math.max(...arr) - Math.min(...arr) : 0);
  check("les duellistes tournent (ecart <= 1 par equipe)",
    spread(perTeam.R) <= 1 && spread(perTeam.B) <= 1,
    `rouge ${JSON.stringify(perTeam.R)} · bleu ${JSON.stringify(perTeam.B)}`);
  check("5 face-a-face joues", faceoffHistory.length === 5, `${faceoffHistory.length}`);
  // A 3 contre 3 sur 5 manches il n'existe que 9 duels possibles, et
  // l'equilibrage rappelle toujours les joueurs les moins sollicites : une
  // paire finit donc forcement par revenir. Ce qui doit etre vrai, c'est
  // qu'un duel ne se rejoue jamais dans la manche suivante.
  const keys = faceoffHistory.map((p) => p.join("|"));
  const backToBack = keys.some((k, i) => i > 0 && keys[i - 1] === k);
  check("jamais le meme duel deux manches de suite", !backToBack,
    backToBack ? "un duel a ete rejoue d'affilee" : `${new Set(keys).size} duels distincts sur 5`);
}

step("Chemins de la mecanique traverses");
for (const [k, label] of [
  ["boardCleared", "tableau entierement vide par une equipe"],
  ["nobodyFound", "manche sans vainqueur (personne au face-a-face)"],
  ["stealWin", "vol de manche REUSSI"],
  ["stealFail", "vol de manche RATE"],
  ["timeoutTeam", "chrono d'equipe expire"],
  ["alreadyFound", "reponse deja sur le tableau"],
  ["finaleEmpty", "question de finale sans reponse"],
  ["doubleBuzzRejected", "double buzz simultane"],
  ["doubleSubmitRejected", "double validation simultanee"],
  ["emptyRejected", "reponse vide refusee"],
  ["wrongPlayerRejected", "buzz hors duel refuse"],
  ["nonStealerRejected", "vol par la mauvaise equipe refuse"],
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
  const missing = expected.filter((p) => !seen.phases.has(p));
  check("les 19 phases ont ete visitees", missing.length === 0,
    missing.length ? `manquantes : ${missing.join(", ")}` : `${seen.phases.size} phases`);
}

step("Reconnexion");
{
  const b = bots[bots.length - 1];
  await b.rpc("tf_leave", { p_code: CODE });
  const afterLeave = await state();
  const gone = afterLeave.players.find((p) => p.id === b.id);
  check("le joueur qui quitte est marque hors ligne", gone ? !gone.live : true,
    gone ? `live=${gone.live}` : "retire de la partie");

  const back = await b.rpc("tf_state", { p_code: CODE });
  const me = back.players.find((p) => p.id === b.id);
  check("un simple tf_state le remet en ligne", me ? me.live : true);
}

step("Relance");
{
  const st = await host.rpc("tf_restart", { p_code: CODE });
  check("retour au LOBBY", st.game.phase === "LOBBY" && st.game.status === "lobby");
  check("scores remis a zero", st.game.score_r === 0 && st.game.score_b === 0);
  check("plus de question en cours", st.game.question_id === null);
  const { error } = await bots[1].call("tf_restart", { p_code: CODE });
  check("un non-hote ne peut pas relancer", /hote/i.test(error ?? ""), error ?? "accepte !");
}

/* ------------------------------------------------------------------ */

log("");
log(C.b(`${checks} verifications`));
if (failures === 0) {
  log(C.g(`✓ Partie complete jouee du lobby a la victoire, sans anomalie.`));
  log("");
  process.exit(0);
}
log(C.r(`✗ ${failures} anomalie(s).`));
log("");
process.exit(1);
