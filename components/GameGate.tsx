"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Studio from "@/components/fx/Studio";
import { cleanError, joinGame, prettyCode, teamOf } from "@/lib/api";
import { play } from "@/lib/audio";
import { MAX_PER_TEAM, TEAM_NAME, type Team } from "@/lib/types";
import type { UseGame } from "@/lib/useGame";

/**
 * Le sas d'entree, commun aux trois interfaces : chargement, partie
 * introuvable, panne de connexion, et le formulaire pour rejoindre quand on
 * arrive sur un lien sans etre encore inscrit.
 *
 * Renvoie `null` quand tout va bien : l'appelant affiche alors sa vue.
 */
export default function GameGate({
  g,
  code,
  requirePlayer,
}: {
  g: UseGame;
  code: string;
  /** L'ecran TV se regarde sans etre joueur ; le telephone, non. */
  requirePlayer: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(() => {
    try {
      return window.localStorage.getItem("tf-name") ?? "";
    } catch {
      return "";
    }
  });
  const [team, setTeam] = useState<Team>("R");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (g.loading) {
    return (
      <Frame>
        <p className="pulse-soft font-mono text-[11px] uppercase tracking-[0.26em] text-white/45">
          Connexion à {prettyCode(code)}…
        </p>
      </Frame>
    );
  }

  // Erreur de connexion : surtout ne pas dire "partie introuvable", ce serait
  // une fausse piste.
  if (!g.game && g.error) {
    return (
      <Frame>
        <div className="panel panel-solid pop w-full max-w-sm p-6 text-center">
          <p className="text-4xl">🔌</p>
          <h1 className="display mt-3 text-xl text-white">Connexion impossible</h1>
          <p className="mt-2 text-sm text-white/60">{g.error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn btn-gold mt-5 w-full py-3.5"
          >
            Réessayer
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="btn btn-ghost mt-2.5 w-full py-3"
          >
            Retour à l’accueil
          </button>
        </div>
      </Frame>
    );
  }

  if (g.notFound || !g.game) {
    return (
      <Frame>
        <div className="panel panel-solid pop w-full max-w-sm p-6 text-center">
          <p className="text-4xl">🕵️</p>
          <h1 className="display mt-3 text-xl text-white">Partie introuvable</h1>
          <p className="mt-2 text-sm text-white/60">
            Le code <b className="font-mono text-gold">{prettyCode(code)}</b> ne
            correspond à aucune partie.
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="btn btn-gold mt-5 w-full py-3.5"
          >
            Retour à l’accueil
          </button>
        </div>
      </Frame>
    );
  }

  if (!requirePlayer || g.me) return null;

  const game = g.game;
  const teamR = teamOf(g.players, "R");
  const teamB = teamOf(g.players, "B");

  if (game.status !== "lobby") {
    return (
      <Frame>
        <div className="panel panel-solid pop w-full max-w-sm p-6 text-center">
          <p className="text-4xl">🎬</p>
          <h1 className="display mt-3 text-xl text-white">Le show a déjà commencé</h1>
          <p className="mt-2 text-sm text-white/60">
            Impossible de rejoindre {prettyCode(game.code)} en cours de manche.
            Attends la fin, ou lance ta propre partie.
          </p>
          <button
            type="button"
            onClick={() => router.push(`/g/${game.code}/tv`)}
            className="btn btn-blue mt-5 w-full py-3.5"
          >
            📺 Regarder le plateau
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="btn btn-ghost mt-2.5 w-full py-3"
          >
            Créer une partie
          </button>
        </div>
      </Frame>
    );
  }

  const full = { R: teamR.length >= MAX_PER_TEAM, B: teamB.length >= MAX_PER_TEAM };

  return (
    <Frame>
      <form
        className="panel panel-solid pop w-full max-w-sm p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const pseudo = name.trim();
          if (!pseudo) return setErr("Choisis un pseudo.");
          setBusy(true);
          setErr(null);
          try {
            try {
              window.localStorage.setItem("tf-name", pseudo);
            } catch {
              /* ignore */
            }
            await joinGame(code, pseudo, team);
            play("join");
            await g.refresh();
          } catch (error) {
            setErr(cleanError(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1 className="display text-xl text-white">
          Rejoindre {prettyCode(game.code)}
        </h1>
        <p className="mt-1.5 text-[13px] text-white/55">
          Ce téléphone devient ta télécommande.
        </p>

        <label className="label mt-5" htmlFor="gate-name">
          Ton pseudo
        </label>
        <input
          id="gate-name"
          className="field"
          placeholder="Sarah"
          maxLength={18}
          autoComplete="nickname"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <p className="label mt-5">Ton équipe</p>
        <div className="grid grid-cols-2 gap-3">
          {(["R", "B"] as const).map((t) => {
            const count = t === "R" ? teamR.length : teamB.length;
            const disabled = full[t];
            const on = team === t && !disabled;
            return (
              <button
                key={t}
                type="button"
                disabled={disabled}
                onClick={() => setTeam(t)}
                className={`rounded-2xl border-2 px-3 py-3.5 text-left transition disabled:opacity-40 ${
                  on
                    ? t === "R"
                      ? "border-teamR bg-teamR/15 shadow-glowR"
                      : "border-teamB bg-teamB/15 shadow-glowB"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <span
                  className={`display block text-lg leading-none ${
                    t === "R" ? "text-teamR" : "text-teamB"
                  }`}
                >
                  {t === "R" ? "🔴" : "🔵"} {TEAM_NAME[t]}
                </span>
                <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-white/40">
                  {disabled ? "complète" : `${count} / ${MAX_PER_TEAM}`}
                </span>
              </button>
            );
          })}
        </div>

        {err && (
          <p
            role="alert"
            className="rise mt-4 rounded-xl border border-teamR/35 bg-teamR/10 px-3.5 py-2.5 text-[13px] font-semibold text-teamR-soft"
          >
            {err}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || full[team]}
          className="btn btn-blue mt-5 w-full py-4"
        >
          {busy ? "Connexion…" : "Rejoindre"}
        </button>
      </form>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4">
      <Studio accent="GOLD" />
      <div className="relative z-10 w-full max-w-sm">{children}</div>
    </main>
  );
}
