"use client";

import { useEffect, useRef, useState } from "react";
import Timer from "@/components/stage/Timer";
import { play } from "@/lib/audio";
import type { Clock } from "@/lib/useCountdown";

/**
 * LE CHAMP DE REPONSE. Un seul champ, un seul bouton, un chrono au-dessus.
 *
 * On bloque l'envoi d'une reponse vide et le double envoi. La validation, elle,
 * est entierement serveur : `_tf_match()` normalise (majuscules, accents,
 * ponctuation, articles, pluriels, fautes de frappe) et compare aux formes
 * acceptees, que le navigateur ne connait pas.
 */
export default function AnswerForm({
  title,
  hint,
  clock,
  busy,
  tone = "gold",
  autoFocus = true,
  resetKey,
  onSubmit,
}: {
  title: string;
  hint?: string;
  clock: Clock;
  busy: boolean;
  tone?: "gold" | "r" | "b";
  autoFocus?: boolean;
  /**
   * Change a chaque nouvelle question : le champ se vide et se rearme.
   *
   * Indispensable, et pas seulement confortable. En finale, la PHASE ne
   * change pas entre les cinq questions : React reutilisait donc la meme
   * instance, `sent` restait vrai, et le finaliste se retrouvait avec un
   * champ desactive et un bouton « Envoye… » des la question 2. Il ne
   * pouvait repondre qu'a une seule question sur cinq.
   *
   * Les appelants passent `phase_seq`, qui s'incremente a chaque beat du
   * serveur — y compris entre deux questions de finale.
   */
  resetKey: number | string;
  onSubmit: (value: string) => void;
}) {
  /*
   * Le champ est NON CONTROLE, volontairement.
   *
   * Avec `value` dans un state React, chaque lettre tapee provoquait un
   * rendu du formulaire — et le parent en provoquait dix de plus par seconde
   * a cause du chrono. Sur un telephone, la saisie devenait poussive et le
   * curseur sautait. Ici la valeur vit dans le DOM, on ne la lit qu'a l'envoi :
   * taper ne declenche plus aucun rendu.
   */
  const [sent, setSent] = useState(false);
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (ref.current) ref.current.value = "";
    setSent(false);
    if (autoFocus) ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  /*
   * GARDER LE CHAMP SOUS LES YEUX QUAND LE CLAVIER S'OUVRE.
   *
   * Le viewport est en `interactive-widget: resizes-content`, donc la page
   * retrecit — mais le navigateur ne fait pas toujours defiler jusqu'au champ
   * focalise, et sur iOS la zone visible bouge encore apres l'ouverture du
   * clavier. Sans ca, le joueur voit le clavier surgir et son champ
   * disparaitre : il tape a l'aveugle, ou croit que l'ecran a bugue.
   *
   * On le ramene donc au centre a l'ouverture, puis a chaque changement de
   * la zone visible.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ramener = () => {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    };

    const onFocus = () => {
      // Deux passes : le clavier met un instant a s'installer.
      window.setTimeout(ramener, 120);
      window.setTimeout(ramener, 420);
    };
    el.addEventListener("focus", onFocus);

    const vv = window.visualViewport;
    const onViewport = () => {
      if (document.activeElement === el) ramener();
    };
    vv?.addEventListener("resize", onViewport);

    return () => {
      el.removeEventListener("focus", onFocus);
      vv?.removeEventListener("resize", onViewport);
    };
  }, [resetKey]);

  const send = () => {
    const v = (ref.current?.value ?? "").trim();
    if (!v || sent || busy) return;
    setSent(true);
    play("ui");
    onSubmit(v);
  };

  const btn = tone === "r" ? "btn-r" : tone === "b" ? "btn-b" : "btn-gold";

  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <Timer clock={clock} label={title} big />

      {hint && (
        <p className="mt-3 text-center text-[13px] leading-snug text-white/60">{hint}</p>
      )}

      <input
        ref={ref}
        className="field field-xl mt-5"
        placeholder="ta réponse"
        maxLength={40}
        disabled={sent}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="send"
        defaultValue=""
      />

      <button
        type="submit"
        disabled={sent || busy}
        className={`btn ${btn} mt-4 w-full py-5 text-lg`}
      >
        {sent ? "Envoyé…" : "Valider"}
      </button>

      <p className="mt-3 text-center font-mono text-[9px] uppercase tracking-[0.18em] text-white/28">
        accents, majuscules et articles n&apos;ont pas d&apos;importance
      </p>
    </form>
  );
}
