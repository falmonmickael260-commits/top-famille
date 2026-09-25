"use client";

import { useEffect, useRef } from "react";

/**
 * Les poussieres lumineuses du studio, en canvas 2D.
 *
 * Une seule boucle requestAnimationFrame, un nombre fixe de particules, et
 * tout est dessine en un seul passage : la charge est constante, meme sur un
 * telephone. On s'arrete des que l'onglet passe en arriere-plan, et on ne
 * demarre pas du tout si l'utilisateur a demande moins d'animations.
 */
export default function Particles({
  count = 46,
  className = "",
}: {
  count?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const dots = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.6 + Math.random() * 1.9,
      vy: -(0.08 + Math.random() * 0.34),
      vx: (Math.random() - 0.5) * 0.14,
      a: 0.16 + Math.random() * 0.5,
      // Une particule sur cinq est doree : le reste est bleu studio.
      gold: Math.random() < 0.2,
      phase: Math.random() * Math.PI * 2,
    }));

    let raf = 0;
    let running = true;

    const frame = (t: number) => {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        d.y += d.vy;
        d.x += d.vx + Math.sin(t / 2600 + d.phase) * 0.12;
        if (d.y < -6) {
          d.y = h + 6;
          d.x = Math.random() * w;
        }
        if (d.x < -6) d.x = w + 6;
        if (d.x > w + 6) d.x = -6;

        const twinkle = 0.65 + 0.35 * Math.sin(t / 700 + d.phase);
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = d.gold
          ? `rgba(245,195,68,${d.a * twinkle})`
          : `rgba(150,195,255,${d.a * twinkle})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onVis = () => {
      const visible = document.visibilityState === "visible";
      if (visible && !running) {
        running = true;
        raf = requestAnimationFrame(frame);
      } else if (!visible) {
        running = false;
        cancelAnimationFrame(raf);
      }
    };

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [count]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
