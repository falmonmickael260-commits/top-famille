"use client";

import { createClient } from "@supabase/supabase-js";

/**
 * Les noms de variables doivent etre EXACTEMENT ceux-ci, ici, dans
 * .env.local et dans les variables Vercel :
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** false tant que .env.local n'est pas rempli : l'UI affiche un mode d'emploi. */
export const isSupabaseConfigured = url.startsWith("http") && key.length > 10;

/**
 * Valeurs de repli : createClient leve "supabaseUrl is required" sur une
 * chaine vide, ce qui ferait planter le prerender de `next build` sur une
 * machine sans .env.local. On construit donc toujours un client valide, et
 * on bloque en amont via isSupabaseConfigured / ensureAuth().
 */
/**
 * La reference du projet, extraite de l'URL. Elle sert a cloisonner la
 * session stockee (voir storageKey ci-dessous).
 */
const projectRef = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? "local";

export const supabase = createClient(
  isSupabaseConfigured ? url : "http://localhost:54321",
  isSupabaseConfigured ? key : "public-anon-key-placeholder",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      /*
       * La cle de stockage porte la reference du projet.
       *
       * Sans elle, une session anonyme emise par un AUTRE projet Supabase
       * (migration, cle regeneree, deux jeux sur la meme machine) restait en
       * place : le client essayait de rafraichir un jeton signe ailleurs, et
       * l'app se figeait sur "Connexion impossible — No suitable key or wrong
       * key type", sans aucune issue pour le joueur. Cloisonner par projet
       * rend la collision impossible ; ensureAuth() repare en plus les
       * sessions deja perimees.
       */
      storageKey: `top-famille-auth-${projectRef}`,
    },
    // Le buzzer a besoin de passer tout de suite.
    realtime: { params: { eventsPerSecond: 30 } },
  }
);
