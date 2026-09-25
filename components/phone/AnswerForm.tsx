"use client";

import { useEffect, useRef, useState } from "react";
import Timer from "@/components/stage/Timer";
import { play } from "@/lib/audio";

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
  remainingMs,
  totalMs,
  busy,
  tone = "gold",
  autoFocus = true,
  resetKey,
  onSubmit,
}: {
  title: string;
  hint?: string;
  remainingMs: number;
  totalMs: number;
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
  const [value, setValue] = useState("");
  const [sent, setSent] = useState(false);
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setValue("");
    setSent(false);
    if (autoFocus) ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const send = () => {
    const v = value.trim();
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
      <Timer remainingMs={remainingMs} totalMs={totalMs} label={title} big />

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
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />

      <button
        type="submit"
        disabled={sent || busy || value.trim() === ""}
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
