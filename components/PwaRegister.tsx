"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker (public/sw.js), condition posee par Chrome
 * pour proposer "Installer l'application" / l'ajout a l'ecran d'accueil.
 * Aucun rendu : ce composant n'existe que pour son effet de bord.
 */
export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* pas grave : l'app fonctionne aussi sans, juste non installable */
      });
    }
  }, []);

  return null;
}
