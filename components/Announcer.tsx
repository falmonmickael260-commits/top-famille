"use client";

import { useEffect, useRef, useState } from "react";
import type { Script } from "@/lib/announcer";

/**
 * L'ANIMATEUR, a l'image. Les repliques du script defilent l'une apres
 * l'autre, ecrites lettre par lettre, dans un bandeau qui ne bouge jamais de
 * place - comme un vrai sous-titrage de plateau.
 *
 * Aucun animateur humain n'est necessaire : ce composant est la voix du jeu.
 */
export default function Announcer({
  script,
  className = "",
  size = "md",
}: {
  script: Script;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const timers = useRef<number[]>([]);

  // Chaque nouveau beat repart de la premiere replique.
  useEffect(() => {
    setIndex(0);
    setTyped("");
  }, [script.key]);

  // Enchainement des repliques : le temps d'affichage suit la longueur.
  useEffect(() => {
    const lines = script.lines;
    if (lines.length === 0) return;
    if (index >= lines.length - 1) return;

    const hold = 1100 + Math.min(2200, lines[index].length * 38);
    const t = window.setTimeout(() => setIndex((i) => i + 1), hold);
    timers.current.push(t);
    return () => window.clearTimeout(t);
  }, [index, script.key, script.lines]);

  // Frappe lettre par lettre de la replique courante.
  useEffect(() => {
    const line = script.lines[index] ?? "";
    setTyped("");
    if (!line) return;

    let i = 0;
    const step = line.length > 60 ? 12 : 20;
    const iv = window.setInterval(() => {
      i += 1;
      setTyped(line.slice(0, i));
      if (i >= line.length) window.clearInterval(iv);
    }, step);
    return () => window.clearInterval(iv);
  }, [index, script.key, script.lines]);

  useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
    },
    []
  );

  const sizeCls =
    size === "lg"
      ? "text-[clamp(1.05rem,2.1vw,1.8rem)]"
      : size === "sm"
        ? "text-[0.82rem]"
        : "text-[clamp(0.9rem,1.5vw,1.15rem)]";

  const toneCls =
    script.tone === "good"
      ? "text-emerald-200"
      : script.tone === "bad"
        ? "text-teamR-soft"
        : script.tone === "win"
          ? "text-gold-soft"
          : "text-white/92";

  return (
    <div
      className={`panel flex items-center gap-3 px-4 py-3 ${className}`}
      role="status"
      aria-live="polite"
    >
      {/* La pastille "micro" : elle pulse quand l'animateur parle. */}
      <span
        aria-hidden
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold/15 text-base shadow-[0_0_0_1px_rgba(245,195,68,0.4)]"
      >
        <span className={typed.length < (script.lines[index]?.length ?? 0) ? "pulse-soft" : ""}>
          🎙️
        </span>
      </span>
      <p className={`min-w-0 font-semibold leading-snug ${sizeCls} ${toneCls}`}>
        {typed}
        {typed.length < (script.lines[index]?.length ?? 0) && (
          <span aria-hidden className="ml-0.5 inline-block animate-pulse">
            ▌
          </span>
        )}
      </p>
    </div>
  );
}
