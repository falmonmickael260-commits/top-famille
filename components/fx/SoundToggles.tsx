"use client";

import { useEffect, useState } from "react";
import { initAudio, isMusicOn, isSfxOn, play, setMusic, setSfx } from "@/lib/audio";

/**
 * 🔊 SON et 🎵 MUSIQUE, comme demande. Deux reglages independants, retenus
 * sur l'appareil. Le premier clic sert aussi a debloquer l'AudioContext :
 * les navigateurs refusent tout son avant un geste de l'utilisateur.
 */
export default function SoundToggles({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const [sfx, setSfxState] = useState(true);
  const [music, setMusicState] = useState(true);

  useEffect(() => {
    initAudio();
    setSfxState(isSfxOn());
    setMusicState(isMusicOn());
  }, []);

  const Btn = ({
    on,
    onClick,
    icon,
    label,
  }: {
    on: boolean;
    onClick: () => void;
    icon: string;
    label: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={`${label} ${on ? "activé" : "coupé"}`}
      className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] transition ${
        on
          ? "bg-white/10 text-white/90 shadow-[inset_0_0_0_1px_rgba(160,195,255,0.28)]"
          : "bg-white/[0.03] text-white/35 shadow-[inset_0_0_0_1px_rgba(160,195,255,0.12)]"
      }`}
    >
      <span aria-hidden className={on ? "" : "opacity-50 grayscale"}>
        {icon}
      </span>
      {!compact && <span>{label}</span>}
    </button>
  );

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Btn
        on={sfx}
        icon="🔊"
        label="Son"
        onClick={() => {
          const next = !sfx;
          setSfx(next);
          setSfxState(next);
          if (next) play("ui");
        }}
      />
      <Btn
        on={music}
        icon="🎵"
        label="Musique"
        onClick={() => {
          const next = !music;
          setMusic(next);
          setMusicState(next);
        }}
      />
    </div>
  );
}
