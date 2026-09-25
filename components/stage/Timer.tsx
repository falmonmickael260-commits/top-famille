"use client";

import { useEffect, useRef } from "react";
import { formatSeconds } from "@/lib/api";
import { play } from "@/lib/audio";

/**
 * Le chrono du plateau. La valeur vient du serveur (`phase_ends_at`) : le
 * navigateur ne fait que la dessiner. Un rechargement retrouve la seconde
 * exacte, et un telephone mal a l'heure affiche quand meme le bon temps.
 */
export default function Timer({
  remainingMs,
  totalMs,
  label,
  big = false,
  ticking = true,
}: {
  remainingMs: number;
  totalMs: number;
  label?: string;
  big?: boolean;
  /** Le tic-tac des 5 dernieres secondes. */
  ticking?: boolean;
}) {
  const lastSecond = useRef(-1);
  const seconds = Math.ceil(remainingMs / 1000);
  const danger = remainingMs > 0 && remainingMs <= 5000;

  useEffect(() => {
    if (!ticking || !danger) return;
    if (seconds === lastSecond.current) return;
    lastSecond.current = seconds;
    if (seconds > 0) play("tick");
  }, [seconds, danger, ticking]);

  const pct = totalMs > 0 ? Math.max(0, Math.min(100, (remainingMs / totalMs) * 100)) : 0;

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
        <div className="timer-fill" data-danger={danger ? "true" : "false"} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
