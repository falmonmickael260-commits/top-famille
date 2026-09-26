"use client";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { GameState, Player, Team } from "@/lib/types";

/*
 * Aucune question, aucune reponse n'est importee ici : data/questions.json ne
 * sert qu'au seed SQL et au validateur. Le bundle du navigateur ne contient
 * pas une seule reponse du panel.
 */

/** Alphabet sans caracteres ambigus (pas de O/0, I/1) : un code se dicte. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Genere un code de partie du type TF-4827 (stocke sans le prefixe). */
export function generateCode(length = 4): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/** "4827" -> "TF-4827", pour l'affichage uniquement. */
export const prettyCode = (code: string) => `TF-${code.toUpperCase()}`;

/** Accepte "TF-4827", "tf 4827" ou "4827" et renvoie "4827". */
export function parseCode(input: string): string {
  return (input ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^TF/, "")
    .slice(0, 6);
}

/* ------------------------------------------------------------------ */
/*  Erreurs                                                            */
/* ------------------------------------------------------------------ */

const NOT_CONFIGURED =
  "Supabase n'est pas configure. Remplis .env.local avec NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.";

/** Traduit une erreur Supabase/Postgres en message lisible a l'antenne. */
export function cleanError(error: unknown): string {
  const raw =
    typeof error === "string"
      ? error
      : ((error as { message?: string } | null)?.message ?? "");

  if (!raw) return "Une erreur est survenue. Reessaie.";

  if (raw.includes("duplicate key value") || raw.includes("tf_players_pkey")) {
    return "Ta session de joueur etait deja utilisee. Recharge la page puis reessaie.";
  }
  if (raw.includes("UPDATE requires a WHERE clause")) {
    return "Erreur serveur sur la partie. Recharge la page.";
  }
  if (raw.includes("Could not find the function") || raw.includes("PGRST202")) {
    // Deux causes possibles, et la seconde est sournoise : les fonctions
    // existent, mais PostgREST garde un cache de schema perime.
    return "Fonctions SQL introuvables cote API. Rejoue supabase/schema.sql dans le SQL Editor — il se termine par un « notify pgrst » qui recharge le cache.";
  }
  if (raw.includes("Anonymous sign-ins are disabled")) {
    return "Active Anonymous Sign-In dans Supabase (Authentication > Providers > Anonymous).";
  }
  if (raw.includes("JWT") || raw.includes("not authenticated") || raw.includes("28000")) {
    return "Veuillez vous reconnecter.";
  }
  if (raw.includes("No suitable key") || raw.includes("wrong key type")) {
    return "La cle Supabase ne correspond pas a ce projet. Verifie NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.";
  }
  if (raw.includes("Failed to fetch") || raw.includes("NetworkError")) {
    return "Connexion au serveur impossible. Verifie ta connexion internet.";
  }
  if (raw.includes("relation") && raw.includes("does not exist")) {
    return "Les tables SQL sont absentes de Supabase. Execute supabase/schema.sql dans le SQL Editor.";
  }
  // Messages metier remontes volontairement par les fonctions SQL.
  return raw.replace(/^.*?:\s*/, "").slice(0, 200) || "Une erreur est survenue.";
}

/* ------------------------------------------------------------------ */
/*  Authentification anonyme                                           */
/* ------------------------------------------------------------------ */

let authPromise: Promise<string> | null = null;

/** Garantit une session anonyme et renvoie l'UUID du joueur. */
export async function ensureAuth(): Promise<string> {
  if (!isSupabaseConfigured) throw new Error(NOT_CONFIGURED);

  if (!authPromise) {
    authPromise = (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.user?.id) {
        /*
         * Une session stockee n'est pas forcement utilisable : elle peut avoir
         * ete emise par un autre projet Supabase, ou apres une rotation de
         * cle. getUser() la fait valider par le serveur ; si elle est
         * refusee, on l'efface et on en cree une neuve, au lieu de laisser le
         * joueur coince sur un ecran d'erreur dont il ne peut pas sortir.
         */
        const { error: probe } = await supabase.auth.getUser();
        if (!probe) return sessionData.session.user.id;
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      }

      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw new Error(cleanError(error));
      if (!data.user?.id) throw new Error("Connexion impossible");
      return data.user.id;
    })().catch((err) => {
      authPromise = null; // on pourra reessayer au prochain appel
      throw err;
    });
  }
  return authPromise;
}

/* ------------------------------------------------------------------ */
/*  RPC                                                                */
/* ------------------------------------------------------------------ */

async function rpc(fn: string, args: Record<string, unknown>): Promise<GameState> {
  await ensureAuth();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(cleanError(error));
  if (!data || !(data as GameState).game) {
    throw new Error("Reponse inattendue du serveur.");
  }
  return data as GameState;
}

/** Cree une partie. Le code est tire cote client puis verifie en base. */
export async function createGame(name: string, team: Team): Promise<GameState> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      return await rpc("tf_create", { p_code: code, p_name: name, p_team: team });
    } catch (err) {
      lastError = err;
      if (!String((err as Error).message).includes("deja utilise")) throw err;
    }
  }
  throw new Error(cleanError(lastError));
}

export const joinGame = (code: string, name: string, team: Team) =>
  rpc("tf_join", { p_code: parseCode(code), p_name: name, p_team: team });

export const setTeam = (code: string, team: Team) =>
  rpc("tf_set_team", { p_code: parseCode(code), p_team: team });

export const startShow = (code: string) =>
  rpc("tf_start", { p_code: parseCode(code) });

export const buzz = (code: string) => rpc("tf_buzz", { p_code: parseCode(code) });

export const submitAnswer = (code: string, raw: string) =>
  rpc("tf_submit", { p_code: parseCode(code), p_raw: raw });

export const tick = (code: string) => rpc("tf_tick", { p_code: parseCode(code) });

export const fetchState = (code: string) =>
  rpc("tf_state", { p_code: parseCode(code) });

export const leaveGame = (code: string) =>
  rpc("tf_leave", { p_code: parseCode(code) });

export const restartShow = (code: string) =>
  rpc("tf_restart", { p_code: parseCode(code) });

/** Commande technique de l'hote : faire expirer la phase tout de suite. */
export const hostSkip = (code: string) =>
  rpc("tf_host_skip", { p_code: parseCode(code) });

/* ------------------------------------------------------------------ */
/*  Lectures directes (RLS : select seul)                              */
/* ------------------------------------------------------------------ */

/**
 * Les joueurs d'une partie, sans reconstruire tout l'etat.
 *
 * Une arrivee, un depart ou un passage hors ligne ne changent rien au
 * tableau des reponses : redemander tf_state pour ca coutait un aller-retour
 * complet a chaque fois, sur chaque telephone.
 */
export async function fetchPlayers(gameId: string): Promise<Player[]> {
  const { data, error } = await supabase
    .from("tf_players")
    .select("*")
    .eq("game_id", gameId)
    .order("joined_at", { ascending: true });
  if (error) throw new Error(cleanError(error));
  return (data as Player[]) ?? [];
}

export async function gameExists(code: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("tf_games")
    .select("id")
    .eq("code", parseCode(code))
    .maybeSingle();
  if (error) throw new Error(cleanError(error));
  return !!data;
}

/* ------------------------------------------------------------------ */
/*  Helpers d'affichage                                                */
/* ------------------------------------------------------------------ */

export const teamOf = (players: Player[], team: Team) =>
  players.filter((p) => p.team === team);

export const findPlayer = (players: Player[], id: string | null | undefined) =>
  id ? (players.find((p) => p.id === id) ?? null) : null;

export const playerName = (players: Player[], id: string | null | undefined) =>
  findPlayer(players, id)?.name ?? "—";

/** "9.4" — un chrono de plateau se lit a la dixieme de seconde. */
export function formatSeconds(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  return s >= 10 ? String(Math.ceil(s)) : s.toFixed(1);
}
