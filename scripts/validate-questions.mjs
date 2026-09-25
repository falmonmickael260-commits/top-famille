#!/usr/bin/env node
/**
 * Garde-fou qualite de data/questions.json, lance avant chaque build.
 * Il refuse de compiler si la base est incoherente - une question ratee se
 * voit tout de suite a l'antenne.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "data/questions.json"), "utf8"));
const errors = [];
const warn = [];

/** Meme normalisation que _tf_norm() en SQL : on verifie les collisions. */
function norm(s) {
  let v = (s ?? "").toLowerCase();
  const from = "àáâãäåçèéêëìíîïñòóôõöùúûüýÿœæ";
  const to = "aaaaaaceeeeiiiinooooouuuuyyoa";
  v = [...v].map((c) => (from.includes(c) ? to[from.indexOf(c)] : c)).join("");
  v = v.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) {
    v = v.replace(
      /^(le|la|les|l|un|une|des|du|de|d|au|aux|a|mon|ma|mes|son|sa|ses|leur|leurs|the)\s+/,
      ""
    );
  }
  return v.trim();
}

if (!data.meta?.notice) errors.push("meta.notice manquant (provenance des donnees)");
if (!data.meta?.sourceType) errors.push("meta.sourceType manquant");

const ids = new Set();
const prompts = new Set();

for (const q of data.questions ?? []) {
  const at = `question ${q.id}`;

  if (typeof q.id !== "number") errors.push(`${at} : id absent ou non numerique`);
  if (ids.has(q.id)) errors.push(`${at} : id en double`);
  ids.add(q.id);

  if (!q.prompt || q.prompt.length < 12) errors.push(`${at} : intitule trop court`);
  if (q.prompt && !/[.?!]$/.test(q.prompt)) warn.push(`${at} : pas de ponctuation finale`);
  const key = norm(q.prompt);
  if (prompts.has(key)) errors.push(`${at} : intitule en double ("${q.prompt}")`);
  prompts.add(key);

  if (!q.category) errors.push(`${at} : categorie manquante`);
  if (![1, 2, 3].includes(q.difficulty)) errors.push(`${at} : difficulte hors 1-3`);

  const ans = q.answers ?? [];
  if (ans.length < 4 || ans.length > 8) {
    errors.push(`${at} : ${ans.length} reponses (attendu 4 a 8)`);
  }

  let sum = 0;
  let prev = Infinity;
  const seen = new Map();

  for (const [i, a] of ans.entries()) {
    const label = `${at} reponse ${i + 1}`;
    if (!a.label) errors.push(`${label} : libelle vide`);
    if (!Number.isInteger(a.points) || a.points <= 0) {
      errors.push(`${label} : points invalides`);
    }
    if (a.points > prev) {
      errors.push(`${label} : points croissants (${prev} puis ${a.points})`);
    }
    prev = a.points;
    sum += a.points;

    // Une forme acceptee ne doit pas valider deux reponses differentes :
    // sinon le joueur tape un mot et le serveur ne sait pas quoi creditier.
    for (const form of [a.label, ...(a.accepted ?? [])]) {
      const n = norm(form);
      if (!n) {
        errors.push(`${label} : forme acceptee vide ("${form}")`);
        continue;
      }
      if (seen.has(n) && seen.get(n) !== i) {
        errors.push(
          `${at} : "${form}" est acceptee par les reponses ${seen.get(n) + 1} et ${i + 1}`
        );
      }
      seen.set(n, i);
    }
  }

  if (sum < 80 || sum > 100) {
    errors.push(`${at} : total des points = ${sum} (attendu 80 a 100)`);
  }

  // Une question presentee comme un vrai sondage doit etre verifiable.
  const type = q.source?.type ?? data.meta.sourceType;
  if (type === "survey") {
    for (const field of ["url", "date", "population"]) {
      if (!q.source?.[field]) {
        errors.push(`${at} : source_type=survey sans source.${field}`);
      }
    }
  } else if (type !== "panel") {
    errors.push(`${at} : source_type inconnu "${type}"`);
  }
}

if (warn.length) {
  console.log(`⚠︎  ${warn.length} avertissement(s) :`);
  for (const w of warn.slice(0, 10)) console.log(`   - ${w}`);
}

if (errors.length) {
  console.error(`\n✗ ${errors.length} erreur(s) dans data/questions.json :\n`);
  for (const e of errors) console.error(`   - ${e}`);
  process.exit(1);
}

const answers = data.questions.reduce((n, q) => n + q.answers.length, 0);
const cats = new Set(data.questions.map((q) => q.category));
console.log(
  `✓ ${data.questions.length} questions, ${answers} reponses, ${cats.size} categories.`
);
