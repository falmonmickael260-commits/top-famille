"use client";

import { useEffect, useRef, useState } from "react";
import { play, unlockAudio } from "@/lib/audio";

/**
 * LE BUZZER. Gros, rond, au milieu du pouce, et il respire tant qu'il est
 * arme : on doit pouvoir taper dessus sans regarder l'ecran.
 *
 * TROIS chemins d'entree, et c'est voulu.
 *
 * Un seul gestionnaire ne suffit pas sur telephone : selon l'appareil, la
 * version du navigateur et le mode d'accessibilite, c'est `touchstart`,
 * `pointerdown` ou `click` qui arrive — parfois un seul des trois. En ne
 * traitant que `pointerdown`, le buzzer restait mort sur certains iPhone.
 * On ecoute donc les trois, et un verrou (`fired`) garantit qu'un seul appui
 * ne part qu'une fois.
 *
 * On n'appelle jamais preventDefault() : sur iOS, couper l'evenement par
 * defaut supprime aussi le retour tactile du systeme et, dans certains cas,
 * le `click` qui suit. Le zoom au double-tap est deja neutralise par
 * `touch-action: manipulation` et le viewport.
 *
 * Qui a buzze en premier reste decide par Supabase : le premier UPDATE qui
 * trouve `buzz_winner is null` gagne. Deux appuis a la milliseconde ne
 * peuvent pas passer tous les deux.
 */
export default function Buzzer({
  armed,
  resetKey,
  onBuzz,
}: {
  armed: boolean;
  /** Change a chaque nouvelle fenetre de buzz : le bouton se rearme. */
  resetKey: number | string;
  onBuzz: () => void;
}) {
  const [sent, setSent] = useState(false);
  const fired = useRef(false);

  useEffect(() => {
    setSent(false);
    fired.current = false;
  }, [resetKey]);

  const fire = () => {
    if (!armed || fired.current) return;
    fired.current = true;
    setSent(true);

    // Le premier appui du joueur est aussi ce qui autorise le son sur iOS.
    unlockAudio();
    play("buzz");

    // Retour haptique : sur un telephone, c'est ce qui rend le buzz
    // satisfaisant. Absent sur iPhone, sans consequence.
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
        data-sent={sent ? "true" : "false"}
        onTouchStart={fire}
        onPointerDown={fire}
        onClick={fire}
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
