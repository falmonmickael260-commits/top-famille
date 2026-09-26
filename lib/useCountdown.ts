"use client";

import { useEffect, useRef, useState } from "react";

/**
 * L'horloge de la phase en cours, telle que le serveur l'a fixee.
 *
 * `endsAt` vient de `tf_games.phase_ends_at`, `offsetMs` du recalage sur
 * l'heure serveur : un telephone mal a l'heure affiche quand meme le bon
 * temps restant.
 */
export interface Clock {
  endsAt: string | null;
  offsetMs: number;
  totalMs: number;
}

export const EMPTY_CLOCK: Clock = { endsAt: null, offsetMs: 0, totalMs: 0 };

/** Temps restant, en ms, sans abonnement ni rendu. */
export function remainingOf(clock: Clock): number {
  if (!clock.endsAt) return 0;
  const end = new Date(clock.endsAt).getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, end - (Date.now() - clock.offsetMs));
}

/**
 * Le chronometre, ticke DANS le composant qui l'affiche.
 *
 * C'est la raison d'etre de ce fichier. Avant, un unique `setNow` dans
 * useGame se declenchait dix fois par seconde et faisait re-rendre TOUT
 * l'arbre — plateau, tableau, podiums, et le champ de saisie du telephone.
 * Taper une reponse revenait a se battre contre dix rendus complets par
 * seconde : chaque lettre arrivait en retard.
 *
 * Maintenant, seul le composant qui affiche un chiffre se re-rend. Le champ
 * de reponse, lui, n'est plus jamais touche par le temps qui passe.
 *
 * `hz` : 10 pour un chrono au dixieme, 2 suffit pour un affichage discret.
 */
export function useCountdown(clock: Clock, hz = 10): number {
  const [ms, setMs] = useState(() => remainingOf(clock));
  const clockRef = useRef(clock);
  clockRef.current = clock;

  useEffect(() => {
    setMs(remainingOf(clockRef.current));
    if (!clock.endsAt) return;

    const period = Math.max(50, Math.round(1000 / hz));
    const iv = window.setInterval(() => {
      const next = remainingOf(clockRef.current);
      // On ne provoque un rendu que si le chiffre affiche change vraiment.
      setMs((prev) => (Math.abs(prev - next) < period / 2 ? prev : next));
      if (next <= 0) window.clearInterval(iv);
    }, period);

    return () => window.clearInterval(iv);
  }, [clock.endsAt, clock.offsetMs, hz]);

  return ms;
}
