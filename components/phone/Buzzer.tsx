"use client";

import { useRef, useState } from "react";
import { play } from "@/lib/audio";

/**
 * LE BUZZER. Gros, rond, au milieu du pouce, et il respire tant qu'il est
 * arme : on doit pouvoir taper dessus sans regarder l'ecran.
 *
 * Deux protections cote client, en plus du verrou serveur :
 *   - `sent` : on ne peut pas l'envoyer deux fois ;
 *   - un seul appel par appui, meme si le navigateur double l'evenement
 *     (pointerdown + click sur certains telephones).
 *
 * Qui a buzze en premier reste decide par Supabase : le premier UPDATE qui
 * trouve `buzz_winner is null` gagne, les autres sont refuses. Deux appuis a
 * la milliseconde ne peuvent pas passer tous les deux.
 */
export default function Buzzer({
  armed,
  onBuzz,
}: {
  armed: boolean;
  onBuzz: () => void;
}) {
  const [sent, setSent] = useState(false);
  const fired = useRef(false);

  const fire = () => {
    if (!armed || fired.current) return;
    fired.current = true;
    setSent(true);
    play("buzz");
    // Retour haptique : sur un telephone, c'est ce qui rend le buzz satisfaisant.
    try {
      navigator.vibrate?.(90);
    } catch {
      /* pas de vibreur : tant pis */
    }
    onBuzz();
  };

  return (
    <div className="flex flex-col items-center gap-5">
      <button
        type="button"
        className="buzzer"
        disabled={!armed || sent}
        onPointerDown={(e) => {
          e.preventDefault();
          fire();
        }}
        onClick={(e) => {
          e.preventDefault();
          fire();
        }}
        aria-label="Buzzer"
      >
        {sent ? "ENVOYÉ" : "BUZZ !"}
      </button>
      <p className="text-center font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
        {sent
          ? "Le serveur départage…"
          : armed
            ? "Le premier qui appuie prend la main"
            : "Buzzer verrouillé"}
      </p>
    </div>
  );
}
