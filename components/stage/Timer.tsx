"use client";

import { useEffect, useRef } from "react";
import { formatSeconds } from "@/lib/api";
import { play } from "@/lib/audio";
import { useCountdown, type Clock } from "@/lib/useCountdown";

/**
 * Le chrono du plateau. La valeur vient du serveur (`phase_ends_at`) : le
 * navigateur ne fait que la dessiner. Un rechargement retrouve la seconde
 * exacte, et un telephone mal a l'heure affiche quand meme le bon temps.
 *
 * Il TICKE LUI-MEME. C'est important : tant que le decompte vivait dans
 * useGame, il faisait re-rendre tout l'arbre dix fois par seconde — y compris
 * le champ de saisie, ce qui rendait la frappe poussive. Ici, seul ce
 * composant se re-rend.
 */
export default function Timer({
  clock,
  label,
  big = false,
  ticking = true,
}: {
  clock: Clock;
  label?: string;
  big?: boolean;
  /** Le tic-tac des 5 dernieres secondes. */
  ticking?: boolean;
}) {
  const remainingMs = useCountdown(clock, 10);
  const lastSecond = useRef(-1);
  const seconds = Math.ceil(remainingMs / 1000);
  const danger = remainingMs > 0 && remainingMs <= 5000;

  useEffect(() => {
    if (!ticking || !danger) return;
    if (seconds === lastSecond.current) return;
    lastSecond.current = seconds;
    if (seconds > 0) play("tick");
  }, [seconds, danger, ticking]);

  const total = clock.totalMs;
  const pct = total > 0 ? Math.max(0, Math.min(100, (remainingMs / total) * 100)) : 0;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        {label && (
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-white/40">
            {label}
          </p>
        )}
        <p
          className={`display tabular-nums leading-none transition-colors ${
            danger ? "text-teamR neon-r" : "text-gold neon-gold"
          }`}
          style={{ fontSize: big ? "clamp(2.2rem,7vw,4rem)" : "clamp(1.1rem,2.4vw,1.7rem)" }}
        >
          {formatSeconds(remainingMs)}
          <span className="ml-1 text-[0.38em] opacity-55">s</span>
        </p>
      </div>
      <div className="timer-bar mt-1.5">
        <div
          className="timer-fill"
          data-danger={danger ? "true" : "false"}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Le meme decompte, en chiffre seul et sans jauge — pour les ecrans ou le
 * joueur n'agit pas mais doit suivre. Deux rafraichissements par seconde
 * suffisent : c'est autant de rendus en moins sur un telephone.
 */
export function SecondsLeft({
  clock,
  className = "",
}: {
  clock: Clock;
  className?: string;
}) {
  const ms = useCountdown(clock, 2);
  if (ms <= 0) return null;
  return (
    <p className={`display tabular-nums ${className}`}>
      {Math.ceil(ms / 1000)}
      <span className="text-[0.5em]">s</span>
    </p>
  );
}
