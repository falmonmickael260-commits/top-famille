"use client";

import { useEffect } from "react";

/**
 * Empeche le telephone de s'endormir pendant le show.
 *
 * Sans ca, un joueur pose son telephone, l'ecran s'eteint au bout de 30
 * secondes, et il rate son tour : quand il le rallume, la rotation est
 * passee. C'est le genre de detail qui casse une soiree entiere.
 *
 * L'API n'existe pas partout (Safari iOS ne l'a que depuis peu) : on essaie,
 * et on ne fait rien de special si elle manque. Le verrou est relache par le
 * navigateur des que l'onglet passe en arriere-plan, d'ou la reprise sur
 * `visibilitychange`.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined") return;

    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
    };
    if (!nav.wakeLock) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      if (sentinel && !sentinel.released) return;
      try {
        sentinel = await nav.wakeLock!.request("screen");
      } catch {
        /* refus du navigateur (batterie faible, onglet cache) : sans effet */
      }
    };

    void acquire();
    const onVisible = () => void acquire();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
