"use client";

import { useEffect, useState } from "react";

/**
 * Le bandeau plein ecran des grands moments : trois fautes, vol de manche,
 * prise de controle, victoire. Il arrive en fracas, tient deux secondes,
 * repart. Piloté par `text` + `keyId` : un meme texte a une nouvelle phase
 * rejoue l'animation.
 */
export default function Slam({
  text,
  keyId,
  tone = "drama",
}: {
  text: string | null | undefined;
  keyId: number;
  tone?: "good" | "bad" | "drama" | "win";
}) {
  const [shown, setShown] = useState<{ text: string; id: number } | null>(null);

  useEffect(() => {
    if (!text) return;
    setShown({ text, id: keyId });
    const t = window.setTimeout(() => setShown(null), 2200);
    return () => window.clearTimeout(t);
  }, [text, keyId]);

  if (!shown) return null;

  const cls =
    tone === "good"
      ? "text-emerald-200 neon"
      : tone === "bad"
        ? "text-teamR neon-r"
        : tone === "win"
          ? "wordmark wordmark-sheen"
          : "text-gold neon-gold";

  return (
    <div className="slam" key={shown.id} role="status" aria-live="polite">
      <p className={`slam-text ${cls}`}>{shown.text}</p>
    </div>
  );
}
