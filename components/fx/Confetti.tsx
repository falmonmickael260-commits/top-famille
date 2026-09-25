"use client";

import { useEffect, useRef } from "react";

/**
 * Les confettis de la victoire. Canvas 2D, gravite, rotation, et ils
 * disparaissent d'eux-memes : aucune particule ne survit a la scene.
 */
export default function Confetti({ burst = 0 }: { burst?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const COLORS = ["#f5c344", "#ffe08a", "#ff3b5c", "#38a8ff", "#ffffff", "#6aa5ff"];
    const bits = Array.from({ length: 190 }, () => ({
      x: w * (0.1 + Math.random() * 0.8),
      y: -20 - Math.random() * h * 0.7,
      w: 5 + Math.random() * 8,
      h: 8 + Math.random() * 14,
      vy: 1.6 + Math.random() * 3.4,
      vx: (Math.random() - 0.5) * 2.4,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.24,
      c: COLORS[Math.floor(Math.random() * COLORS.length)],
      sway: Math.random() * Math.PI * 2,
    }));

    let raf = 0;
    let alive = true;

    const frame = (t: number) => {
      if (!alive) return;
      ctx.clearRect(0, 0, w, h);
      let onScreen = 0;
      for (const b of bits) {
        b.y += b.vy;
        b.x += b.vx + Math.sin(t / 420 + b.sway) * 0.9;
        b.rot += b.vr;
        if (b.y < h + 40) onScreen++;

        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.fillStyle = b.c;
        ctx.globalAlpha = 0.92;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.restore();
      }
      if (onScreen === 0) {
        alive = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [burst]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[70] h-full w-full"
    />
  );
}
