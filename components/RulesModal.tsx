"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FINALE_TARGET, TOTAL_ROUNDS } from "@/lib/types";

export const RULES_SEEN_KEY = "tf-rules-seen";

/** ❓ COMMENT JOUER. Les vraies regles, dans l'ordre du show. */
export default function RulesModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] grid place-items-center bg-black/72 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Comment jouer"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.2 }}
        >
          <motion.div
            className="panel panel-solid max-h-[86dvh] w-full max-w-lg overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.92, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={
              reduceMotion
                ? { duration: 0.01 }
                : { type: "spring", stiffness: 340, damping: 30 }
            }
          >
        <h2 className="display text-2xl text-gold neon-gold">Comment jouer</h2>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.24em] text-white/40">
          {TOTAL_ROUNDS} manches · puis la grande finale
        </p>

        <Section n="1" title="Le matériel">
          Le plateau va sur la <b>télévision ou l&apos;ordinateur</b>. Chaque
          joueur garde son <b>téléphone</b> : c&apos;est sa télécommande. Un seul
          code de partie pour tout le monde.
        </Section>

        <Section n="2" title="Le face-à-face">
          À chaque manche, <b>un joueur de chaque équipe</b> s&apos;affronte — et
          ce ne sont jamais les deux mêmes, le jeu fait tourner tout le monde. La
          question s&apos;affiche, les deux peuvent <b>buzzer</b>. Le premier a{" "}
          <b>10 secondes</b> pour écrire sa réponse.
        </Section>

        <Section n="3" title="Prendre le contrôle">
          Bonne réponse : <b>toute son équipe</b> prend le contrôle de la manche.
          Mauvaise réponse : la main passe à l&apos;adversaire du duel, qui a
          aussi 10 secondes. Si personne ne trouve,{" "}
          <b>la manche ne va à personne</b>.
        </Section>

        <Section n="4" title="Le tour de l'équipe">
          L&apos;équipe qui a le contrôle joue <b>chacun son tour</b>, dans un
          ordre strict. Après chaque réponse — bonne ou mauvaise — la main passe
          au joueur suivant. Celui qui s&apos;est trompé <b>ne rejoue pas tout de
          suite</b>. L&apos;équipe a <b>25 secondes</b> au total.
        </Section>

        <Section n="5" title="Trois fautes">
          Les fautes appartiennent à l&apos;<b>équipe</b>, pas au joueur. À la{" "}
          <b>troisième faute</b> — ou si le temps s&apos;écoule — le tour
          s&apos;arrête net.
        </Section>

        <Section n="6" title="Le vol de manche">
          L&apos;équipe adverse se concerte et donne <b>UNE SEULE réponse</b>. Si
          elle est bonne, <b>tous les points de la manche</b> lui passent. Si
          elle est fausse, l&apos;équipe en place garde tout.
        </Section>

        <Section n="7" title="Les points">
          Chaque réponse du panel vaut ses points. Manche 3 : <b>×2</b>. Manche 5
          : <b>×3</b>.
        </Section>

        <Section n="8" title="La grande finale">
          L&apos;équipe en tête envoie <b>deux joueurs</b>. Cinq questions
          chacun, 20 secondes par question. Le second ne voit pas les réponses du
          premier. Objectif : <b>{FINALE_TARGET} points</b>. Atteint, elle
          gagne ; manqué, la victoire passe à l&apos;autre équipe.
        </Section>

        <div className="mt-6 rounded-xl border border-electric/25 bg-electric/[0.07] p-3.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-electric-soft">
            D&apos;où viennent les réponses ?
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/70">
            Les classements et les points sont le <b>barème éditorial du jeu</b>,
            affiché « PANEL TOP FAMILLE ». Ils ne proviennent d&apos;aucun
            institut de sondage et ne sont jamais présentés comme tels.
          </p>
        </div>

        <button type="button" onClick={onClose} className="btn btn-gold mt-6 w-full">
          J&apos;ai compris
        </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Section({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5 flex gap-3">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-gold/15 font-mono text-[11px] font-bold text-gold">
        {n}
      </span>
      <div className="min-w-0">
        <h3 className="text-[13px] font-extrabold uppercase tracking-wider text-white">
          {title}
        </h3>
        <p className="mt-1 text-[13px] leading-relaxed text-white/65">{children}</p>
      </div>
    </div>
  );
}
