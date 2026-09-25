"use client";

import { useEffect, useRef, useState } from "react";
import { play } from "@/lib/audio";
import type { Board as BoardData, Slot } from "@/lib/types";

/**
 * LE TABLEAU. Six cases fermees, qui s'ouvrent une par une.
 *
 * Une case fermee ne contient RIEN : le serveur n'envoie ni le libelle ni les
 * points tant que la reponse n'est pas trouvee. Ouvrir les DevTools sur une
 * case fermee ne donne donc rien a lire - ce n'est pas un masquage CSS.
 */
export default function Board({
  board,
  compact = false,
}: {
  board: BoardData | null;
  compact?: boolean;
}) {
  // Les cases ouvertes depuis le dernier rendu : elles recoivent le flash.
  const known = useRef<Set<number>>(new Set());
  const [justOpened, setJustOpened] = useState<Set<number>>(new Set());

  const slots = board?.slots ?? [];
  const openedKey = slots
    .filter((s) => s.revealed)
    .map((s) => s.rank)
    .join(",");

  useEffect(() => {
    const fresh = new Set<number>();
    for (const s of slots) {
      if (s.revealed && !known.current.has(s.rank)) {
        fresh.add(s.rank);
        known.current.add(s.rank);
      }
    }
    if (fresh.size === 0) return;
    setJustOpened(fresh);
    if (fresh.size === 1) play("reveal");
    const t = window.setTimeout(() => setJustOpened(new Set()), 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedKey]);

  // Nouvelle question : on repart de cases fermees.
  const qid = board?.questionId ?? null;
  useEffect(() => {
    known.current = new Set();
    setJustOpened(new Set());
  }, [qid]);

  if (!board) {
    return (
      <div className="screen grid min-h-[12rem] place-items-center p-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-white/28">
          En attente de la question…
        </p>
      </div>
    );
  }

  return (
    <div className="screen p-3 sm:p-4">
      {/* La question, et d'ou viennent les reponses. */}
      <div className="px-1.5 pb-3 pt-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] uppercase tracking-[0.22em] text-white/38">
          <span className="rounded bg-gold/15 px-1.5 py-0.5 text-gold">
            {board.sourceLabel}
          </span>
          <span>{board.sampleSize} réponses</span>
          <span className="text-white/20">·</span>
          <span>{board.category}</span>
          {board.sourceType === "survey" && board.sourceUrl && (
            <>
              <span className="text-white/20">·</span>
              <a
                href={board.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-electric-soft underline decoration-dotted"
              >
                sondage vérifié
              </a>
            </>
          )}
        </p>
        <h2
          className={`display mt-2 text-balance text-white ${
            compact
              ? "text-[clamp(1rem,4.6vw,1.35rem)]"
              : "text-[clamp(1.15rem,2.5vw,2.1rem)]"
          }`}
        >
          {board.prompt ?? "· · ·"}
        </h2>
      </div>

      <div className="grid gap-2">
        {slots.map((s) => (
          <SlotRow key={s.rank} slot={s} just={justOpened.has(s.rank)} compact={compact} />
        ))}
      </div>
    </div>
  );
}

function SlotRow({
  slot,
  just,
  compact,
}: {
  slot: Slot;
  just: boolean;
  compact: boolean;
}) {
  return (
    <div
      className="slot"
      data-open={slot.revealed ? "true" : "false"}
      data-just={just ? "true" : "false"}
      data-team={slot.team ?? ""}
      data-missed={slot.revealed && !slot.found ? "true" : "false"}
    >
      {/* Face cachee : le numero de rang, sur un mur de LED. */}
      <div className="slot-back">
        <span
          className="display text-white/24"
          style={{ fontSize: compact ? "1.4rem" : "clamp(1.5rem,3vw,2.2rem)" }}
        >
          {slot.rank}
        </span>
      </div>

      {/* Face devoilee */}
      <div className="slot-front">
        <span className="slot-flash" aria-hidden />
        <span
          className={`display shrink-0 tabular-nums ${
            slot.found ? "text-gold" : "text-white/30"
          }`}
          style={{ fontSize: compact ? "1rem" : "clamp(1rem,1.7vw,1.4rem)" }}
        >
          {slot.rank}
        </span>
        <span
          className={`display min-w-0 flex-1 truncate ${
            slot.found ? "text-white" : "text-white/45"
          }`}
          style={{ fontSize: compact ? "1.05rem" : "clamp(1.05rem,2vw,1.7rem)" }}
        >
          {slot.label ?? ""}
        </span>
        <span
          className={`display shrink-0 rounded-lg px-2.5 py-0.5 tabular-nums ${
            slot.team === "R"
              ? "bg-teamR/25 text-teamR-soft"
              : slot.team === "B"
                ? "bg-teamB/25 text-teamB-soft"
                : "bg-white/[0.06] text-white/40"
          }`}
          style={{ fontSize: compact ? "1rem" : "clamp(1rem,1.8vw,1.5rem)" }}
        >
          {slot.awarded > 0 && slot.awarded !== slot.points ? (
            <>
              {slot.awarded}
              <span className="ml-1 text-[0.6em] opacity-60">({slot.points})</span>
            </>
          ) : (
            (slot.points ?? "")
          )}
        </span>
      </div>
    </div>
  );
}
