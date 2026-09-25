#!/usr/bin/env node
/**
 * POUSSE supabase/schema.sql DANS LE PROJET SUPABASE.
 *
 * Trois chemins, du plus simple au plus manuel :
 *
 *   1. Avec l'URL de connexion Postgres (Supabase > Connect > URI) :
 *
 *        SUPABASE_DB_URL='postgresql://postgres.<ref>:<mdp>@<host>:5432/postgres' \
 *          npm run push:schema
 *
 *   2. Avec un jeton d'acces personnel (Supabase > Account > Access Tokens) :
 *
 *        SUPABASE_ACCESS_TOKEN=sbp_xxx SUPABASE_PROJECT_REF=xxxx \
 *          npm run push:schema
 *
 *   3. A la main : colle supabase/schema.sql dans le SQL Editor et Run.
 *      Les deux moities sont aussi disponibles separement pour un copier-
 *      coller plus leger (voir `npm run build:schema`).
 *
 * Le fichier etant idempotent, ce script peut etre relance sans risque : il
 * ne detruit aucune partie en cours et ne remet aucun score a zero.
 *
 *   --dry   affiche ce qui serait fait, sans rien envoyer
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry");

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};

/* ---------- Ou envoyer ? ---------- */

function envFromFile(name) {
  const p = join(root, ".env.local");
  if (!existsSync(p)) return undefined;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[1] === name) return m[2].replace(/^["']|["']$/g, "").trim();
  }
  return undefined;
}

const DB_URL = process.env.SUPABASE_DB_URL ?? envFromFile("SUPABASE_DB_URL");
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN ?? envFromFile("SUPABASE_ACCESS_TOKEN");
const SUPA_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? envFromFile("NEXT_PUBLIC_SUPABASE_URL") ?? "";
const REF =
  process.env.SUPABASE_PROJECT_REF ??
  envFromFile("SUPABASE_PROJECT_REF") ??
  (SUPA_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? null);

const schemaPath = join(root, "supabase/schema.sql");
const sql = readFileSync(schemaPath, "utf8");

console.log(C.b("\nTOP FAMILLE — envoi du schema\n"));
console.log(`  fichier   ${C.dim(`supabase/schema.sql · ${(sql.length / 1024).toFixed(0)} Ko · ${sql.split("\n").length} lignes`)}`);
console.log(`  projet    ${C.dim(REF ?? "inconnu")}`);

if (!DB_URL && !TOKEN) {
  console.log(`  methode   ${C.y("aucun acces fourni")}\n`);
  console.log(C.b("  Donne-moi l'un des deux, puis relance :\n"));
  console.log("   1. L'URL de connexion Postgres");
  console.log(C.dim(`      Supabase > ${REF ? `projet ${REF} > ` : ""}Connect > URI\n`));
  console.log(C.dim("      SUPABASE_DB_URL='postgresql://…' npm run push:schema\n"));
  console.log("   2. Un jeton d'acces personnel");
  console.log(C.dim("      Supabase > Account > Access Tokens > Generate new token\n"));
  console.log(C.dim("      SUPABASE_ACCESS_TOKEN=sbp_… npm run push:schema\n"));
  console.log(C.b("  Ou a la main, sans rien partager :\n"));
  console.log(
    C.dim(
      `      ${REF ? `https://supabase.com/dashboard/project/${REF}/sql/new` : "SQL Editor > New query"}\n` +
        "      puis colle supabase/schema.sql et Run.\n"
    )
  );
  process.exit(1);
}

if (DRY) {
  console.log(`  methode   ${C.dim(DB_URL ? "connexion Postgres directe" : "Management API")}`);
  console.log(`\n  ${C.y("--dry : rien n'a ete envoye.")}\n`);
  process.exit(0);
}

/* ---------- 1. Connexion Postgres directe ---------- */

if (DB_URL) {
  console.log(`  methode   ${C.dim("connexion Postgres directe")}\n`);
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString: DB_URL,
    // Supabase impose TLS ; le pooler presente un certificat que Node ne
    // connait pas, d'ou rejectUnauthorized: false (le trafic reste chiffre).
    ssl: { rejectUnauthorized: false },
    statement_timeout: 300000,
  });
  try {
    await client.connect();
    const who = await client.query("select current_database() as db, current_user as usr");
    console.log(`  ${C.g("✓")} connecte  ${C.dim(`${who.rows[0].db} / ${who.rows[0].usr}`)}`);
    await client.query(sql);
    console.log(`  ${C.g("✓")} schema execute`);
    const n = await client.query(
      "select (select count(*) from public.tf_questions) q, (select count(*) from public.tf_answers) a"
    );
    console.log(
      `  ${C.g("✓")} panel en place  ${C.dim(`${n.rows[0].q} questions, ${n.rows[0].a} reponses`)}`
    );
    console.log(`\n${C.g("Termine.")} Lance maintenant : ${C.b("npm run check:supabase")}\n`);
  } catch (e) {
    console.log(`  ${C.r("✗")} ${e.message}`);
    if (/password authentication|SASL/i.test(e.message)) {
      console.log(C.dim("      Le mot de passe de l'URL est refuse. Recopie l'URI depuis Supabase > Connect."));
    }
    if (/ENOTFOUND|EAI_AGAIN/i.test(e.message)) {
      console.log(C.dim("      Hote introuvable : verifie la region dans l'URI."));
    }
    console.log("");
    process.exit(1);
  } finally {
    await client.end().catch(() => undefined);
  }
  process.exit(0);
}

/* ---------- 2. Management API ---------- */

if (!REF) {
  console.log(`  ${C.r("✗")} reference du projet introuvable.`);
  console.log(C.dim("      Ajoute SUPABASE_PROJECT_REF, ou NEXT_PUBLIC_SUPABASE_URL dans .env.local.\n"));
  process.exit(1);
}

console.log(`  methode   ${C.dim("Management API")}\n`);
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: sql }),
});

if (!res.ok) {
  const body = await res.text();
  console.log(`  ${C.r("✗")} HTTP ${res.status}`);
  console.log(C.dim(`      ${body.slice(0, 400)}`));
  if (res.status === 401) {
    console.log(C.dim("      Jeton refuse : regenere-le dans Supabase > Account > Access Tokens."));
  }
  console.log("");
  process.exit(1);
}

console.log(`  ${C.g("✓")} schema execute`);
const check = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    query:
      "select (select count(*) from public.tf_questions) q, (select count(*) from public.tf_answers) a",
  }),
});
if (check.ok) {
  const rows = await check.json();
  const r = Array.isArray(rows) ? rows[0] : rows;
  console.log(`  ${C.g("✓")} panel en place  ${C.dim(`${r?.q} questions, ${r?.a} reponses`)}`);
}
console.log(`\n${C.g("Termine.")} Lance maintenant : ${C.b("npm run check:supabase")}\n`);
