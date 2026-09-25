#!/usr/bin/env node
/**
 * Regenere le bloc QUESTIONS de supabase/schema.sql depuis data/questions.json.
 *
 *   npm run build:schema
 *
 * Le bloc est encadre par des marqueurs : le reste du fichier n'est jamais
 * touche. Les ids sont deterministes (answer_id = question_id * 10 + rang),
 * donc rejouer le script puis le SQL ne cree aucun doublon.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const START = "-- >>> QUESTIONS_DEBUT >>>";
const END = "-- <<< QUESTIONS_FIN <<<";

const q = (v) =>
  v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`;
const arr = (list) =>
  list.length === 0
    ? "'{}'::text[]"
    : `array[${list.map((x) => q(x)).join(", ")}]::text[]`;

const data = JSON.parse(readFileSync(join(root, "data/questions.json"), "utf8"));
const meta = data.meta;
const lines = [];

lines.push(START);
lines.push(`-- ${data.questions.length} questions. Bloc genere par : npm run build:schema`);
lines.push("-- Ne pas editer a la main : editez data/questions.json puis relancez.");
lines.push("--");
for (const l of meta.notice.match(/.{1,68}(\s|$)/g) ?? []) {
  lines.push(`-- ${l.trim()}`);
}
lines.push("");
lines.push(
  "insert into public.tf_questions (id, prompt, category, difficulty, source_type,"
);
lines.push(
  "                                 source_label, source_url, source_date,"
);
lines.push("                                 population, country, sample_size) values");

const qrows = data.questions.map((item) => {
  const src = item.source ?? {};
  const type = src.type ?? meta.sourceType;
  return (
    `  (${item.id}, ${q(item.prompt)}, ${q(item.category)}, ${item.difficulty}, ` +
    `${q(type)}, ${q(src.label ?? meta.sourceLabel)}, ${q(src.url ?? meta.sourceUrl)}, ` +
    `${src.date ?? meta.sourceDate ? q(src.date ?? meta.sourceDate) + "::date" : "null"}, ` +
    `${q(src.population ?? meta.population)}, ${q(src.country ?? meta.country)}, ` +
    `${src.sampleSize ?? meta.sampleSize})`
  );
});
lines.push(qrows.join(",\n"));
lines.push("on conflict (id) do update set");
lines.push("  prompt = excluded.prompt, category = excluded.category,");
lines.push("  difficulty = excluded.difficulty, source_type = excluded.source_type,");
lines.push("  source_label = excluded.source_label, source_url = excluded.source_url,");
lines.push("  source_date = excluded.source_date, population = excluded.population,");
lines.push("  country = excluded.country, sample_size = excluded.sample_size;");
lines.push("");
lines.push("insert into public.tf_answers (id, question_id, rank, label, points, accepted) values");

const arows = [];
for (const item of data.questions) {
  item.answers.forEach((a, i) => {
    const rank = i + 1;
    arows.push(
      `  (${item.id * 10 + rank}, ${item.id}, ${rank}, ${q(a.label)}, ${a.points}, ${arr(
        a.accepted ?? []
      )})`
    );
  });
}
lines.push(arows.join(",\n"));
lines.push("on conflict (id) do update set");
lines.push("  question_id = excluded.question_id, rank = excluded.rank,");
lines.push("  label = excluded.label, points = excluded.points,");
lines.push("  accepted = excluded.accepted;");
lines.push("");
lines.push("-- Retire les reponses qui ne sont plus dans data/questions.json.");
lines.push("delete from public.tf_answers a");
lines.push(" where a.question_id in (select id from public.tf_questions)");
lines.push("   and a.id not in (");
lines.push(
  "     " +
    arows
      .map((r) => r.trim().slice(1).split(",")[0])
      .join(", ")
      .replace(/^/, "")
);
lines.push("   );");
lines.push(END);

const schemaPath = join(root, "supabase/schema.sql");
let sql = readFileSync(schemaPath, "utf8");
const block = lines.join("\n");

if (sql.includes(START) && sql.includes(END)) {
  const before = sql.slice(0, sql.indexOf(START));
  const after = sql.slice(sql.indexOf(END) + END.length);
  sql = before + block + after;
} else {
  sql =
    sql.trimEnd() +
    "\n\n-- ---------------------------------------------------------------------\n" +
    "-- 12. QUESTIONS\n" +
    "-- ---------------------------------------------------------------------\n\n" +
    block +
    "\n";
}

writeFileSync(schemaPath, sql);
console.log(
  `schema.sql : ${data.questions.length} questions, ${arows.length} reponses injectees.`
);
