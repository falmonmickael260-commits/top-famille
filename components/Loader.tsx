"use client";

import { useEffect, useRef, useState } from "react";
import Particles from "@/components/fx/Particles";
import { initAudio, play } from "@/lib/audio";

/**
 * LE LOADER CINEMATIQUE. Ce n'est pas un spinner : c'est l'ouverture du show.
 *
 * Chronologie (ms) - noir, etincelles, projecteurs, plateau, logo, animation
 * du logo, reflet, signature, barre de progression, transition :
 *
 *    0   noir absolu
 *  260   les premieres etincelles
 *  620   les projecteurs s'allument et balaient
 * 1080   le plateau apparait (grille, sol, LED)
 * 1520   TOP FAMILLE tombe lettre par lettre
 * 2180   le logo respire et le soulignement se trace
 * 2560   un reflet traverse le logo
 * 2900   "by Lewishalmito" se revele
 * 3200   la barre de progression se remplit
 * 4300   fondu vers l'accueil
 *
 * Un seul requestAnimationFrame pilote tout : les elements lisent le temps,
 * il n'y a pas dix minuteurs a desynchroniser. Cliquer passe l'intro.
 */

const T = {
  sparks: 260,
  spots: 620,
  stage: 1080,
  logo: 1520,
  breathe: 2180,
  sheen: 2560,
  byline: 2900,
  bar: 3200,
  out: 4300,
  done: 4900,
} as const;

const TITLE = "TOP FAMILLE";

export default function Loader({ onDone }: { onDone: () => void }) {
  const [t, setT] = useState(0);
  const raf = useRef(0);
  const start = useRef(0);
  const finished = useRef(false);
  const rang = useRef(false);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    cancelAnimationFrame(raf.current);
    onDone();
  };

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      // Pas de mise en scene : on va droit a l'accueil.
      finish();
      return;
    }

    start.current = performance.now();

    /* Le temps est lu sur l'horloge, jamais accumule : peu importe quelle
       source le declenche, l'intro est toujours au bon endroit. */
    const tick = () => {
      if (finished.current) return;
      const e = performance.now() - start.current;
      setT(e);
      if (e >= T.logo && !rang.current) {
        rang.current = true;
        // Le son ne partira que si l'utilisateur a deja interagi avec la page
        // (regle des navigateurs). Sinon il arrivera a l'accueil.
        play("intro");
      }
      if (e >= T.done) finish();
    };

    const frame = () => {
      if (finished.current) return;
      tick();
      raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);

    /* Filet de securite. Un onglet ouvert en arriere-plan ne recoit AUCUN
       requestAnimationFrame : sans ce timer, le loader resterait fige a la
       premiere image et le joueur n'atteindrait jamais l'accueil. L'intervalle
       est grossier (il ne sert qu'a avancer), et il continue de tourner en
       arriere-plan la ou rAF s'arrete. */
    const iv = window.setInterval(tick, 120);
    const safety = window.setTimeout(finish, T.done + 900);

    /* Retour au premier plan : on reprend l'animation fluide la ou le temps
       reel en est, sans rejouer le debut. */
    const onVisible = () => {
      if (document.visibilityState !== "visible" || finished.current) return;
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelAnimationFrame(raf.current);
      window.clearInterval(iv);
      window.clearTimeout(safety);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Rampe 0 -> 1 entre `from` et `from + dur`. */
  const ramp = (from: number, dur: number) =>
    Math.max(0, Math.min(1, (t - from) / dur));

  const eased = (x: number) => 1 - Math.pow(1 - x, 3);

  const spots = eased(ramp(T.spots, 700));
  const stage = eased(ramp(T.stage, 620));
  const breathe = ramp(T.breathe, 600);

  /* Le reflet est un ALLER-RETOUR, pas un aller simple.
     Le degrade du logo fait 220 % de large : a background-position 100 % la
     fenetre visible tombe sur l'or le plus sombre (#8a6207) et le titre
     disparait sur le fond bleu. On repasse donc par 0 %, ou la fenetre
     couvre le coeur clair du degrade. */
  const sheenSweep = ramp(T.sheen, 900);
  const sheenPos = sheenSweep <= 0.5 ? sheenSweep * 2 : 2 - sheenSweep * 2;
  const byline = eased(ramp(T.byline, 520));
  const bar = eased(ramp(T.bar, 1000));
  const out = ramp(T.out, 560);

  return (
    <div
      className="fixed inset-0 z-[100] overflow-hidden bg-[#03060f]"
      style={{ opacity: 1 - out, transition: "opacity 120ms linear" }}
      onClick={finish}
      role="presentation"
    >
      {/* 2. Les etincelles */}
      <div style={{ opacity: eased(ramp(T.sparks, 700)) * 0.9 }}>
        <Particles count={34} />
      </div>

      {/* 3. Les projecteurs */}
      <div className="absolute inset-0" style={{ opacity: spots }} aria-hidden>
        <div className="spot spot-a" />
        <div className="spot spot-b" />
        <div className="spot spot-c" />
      </div>

      {/* 4. Le plateau */}
      <div className="absolute inset-0" style={{ opacity: stage }} aria-hidden>
        <div
          className="studio-floor"
          style={{ transform: `scale(${1.06 - 0.06 * stage})` }}
        />
        <div
          className="studio-grid"
          style={{ opacity: 0.85 * stage, transform: `perspective(520px) rotateX(${72 - 8 * stage}deg)` }}
        />
        <div className="studio-reflect" style={{ opacity: stage }} />
        <div className="led-top" style={{ transform: `scaleX(${stage})` }} />
      </div>

      <div className="studio-vignette absolute inset-0" aria-hidden />

      {/* 5, 6, 7. Le logo */}
      <div className="relative z-10 grid h-full place-items-center px-6">
        <div className="w-full max-w-4xl text-center">
          {/* Le degrade dore est porte par CHAQUE lettre, jamais par le
              titre. Raison : `background-clip: text` ne suit pas un enfant
              transforme — avec le degrade sur le <h1>, les lettres animees ne
              recevaient aucune peinture et le logo restait invisible sur le
              fond bleu. Le decalage `- i * 7 %` fait en plus voyager le
              reflet de gauche a droite, lettre apres lettre. */}
          <h1
            className="display text-[clamp(2.6rem,12vw,8rem)]"
            style={{
              transform: `scale(${1 + 0.012 * Math.sin(breathe * Math.PI * 2)})`,
            }}
          >
            {TITLE.split("").map((ch, i) => {
              // Chaque lettre tombe a son tour : 46 ms d'ecart.
              const k = eased(ramp(T.logo + i * 46, 420));
              if (ch === " ") {
                return (
                  <span
                    key={`sp-${i}`}
                    className="inline-block"
                    style={{ whiteSpace: "pre" }}
                  >
                    &nbsp;
                  </span>
                );
              }
              return (
                <span
                  key={`${ch}-${i}`}
                  className="wordmark inline-block"
                  style={{
                    backgroundPosition: `${sheenPos * 100 - i * 7}% 50%`,
                    opacity: k,
                    transform: `translateY(${(1 - k) * -54}px) rotate(${(1 - k) * -7}deg)`,
                    filter: `blur(${(1 - k) * 9}px)`,
                  }}
                >
                  {ch}
                </span>
              );
            })}
          </h1>

          {/* Le filet d'or qui se trace sous le logo */}
          <div
            aria-hidden
            className="mx-auto mt-3 h-[3px] rounded-full bg-gradient-to-r from-transparent via-gold to-transparent"
            style={{
              width: `${eased(ramp(T.breathe, 700)) * 72}%`,
              boxShadow: "0 0 24px rgba(245,195,68,0.8)",
            }}
          />

          {/* 8. La signature */}
          <p
            className="byline mt-6 text-[clamp(0.6rem,1.5vw,0.86rem)]"
            style={{
              opacity: byline,
              transform: `translateY(${(1 - byline) * 14}px)`,
              letterSpacing: `${0.2 + byline * 0.24}em`,
            }}
          >
            by Lewishalmito
          </p>

          {/* 9. La barre de progression */}
          <div className="mx-auto mt-10 w-[min(22rem,70vw)]" style={{ opacity: ramp(T.bar, 260) }}>
            <div className="timer-bar">
              <div className="timer-fill" style={{ width: `${bar * 100}%` }} />
            </div>
            <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.34em] text-white/35">
              Mise en place du plateau · {Math.round(bar * 100)} %
            </p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          initAudio();
          finish();
        }}
        className="absolute bottom-5 right-5 z-20 rounded-xl bg-white/[0.06] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/45 transition hover:bg-white/10 hover:text-white/80"
        style={{ opacity: t > 900 ? 1 : 0 }}
      >
        Passer l&apos;intro →
      </button>
    </div>
  );
}
