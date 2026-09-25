"use client";

import type { Team } from "@/lib/types";

/**
 * LE PLATEAU. Fond, grille en perspective, sol reflechissant, projecteurs
 * qui balaient, rampes LED, vignettage, scanlines.
 *
 * Tout est en CSS : zero image, zero requete, net sur une television 4K.
 * `accent` change la couleur du decor selon le moment du jeu - c'est ce qui
 * donne l'impression que la regie suit l'action.
 */
export default function Studio({
  accent = null,
}: {
  accent?: Team | "GOLD" | null;
}) {
  return (
    <div className="studio" data-accent={accent ?? ""} aria-hidden>
      <div className="studio-floor" />
      <div className="studio-grid" />
      <div className="studio-reflect" />
      <div className="spot spot-a" />
      <div className="spot spot-b" />
      <div className="spot spot-c" />
      <div className="led-top" />
      <div className="led-rail led-rail-l" />
      <div className="led-rail led-rail-r" />
      <div className="studio-scan" />
      <div className="studio-vignette" />
    </div>
  );
}
