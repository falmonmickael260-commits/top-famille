"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Loader from "@/components/Loader";
import RulesModal, { RULES_SEEN_KEY } from "@/components/RulesModal";
import Particles from "@/components/fx/Particles";
import SoundToggles from "@/components/fx/SoundToggles";
import Studio from "@/components/fx/Studio";
import { cleanError, createGame, joinGame, parseCode, prettyCode } from "@/lib/api";
import { initAudio, play, setMood } from "@/lib/audio";
import { isSupabaseConfigured } from "@/lib/supabase";
import { MAX_PER_TEAM, TEAM_NAME, type Team } from "@/lib/types";

type Screen = "menu" | "create" | "join";

const NAME_KEY = "tf-name";
const LOADER_KEY = "tf-loader-seen";

export default function HomePage() {
  const router = useRouter();

  // Le loader ne rejoue pas a chaque aller-retour dans la meme session : on
  // veut l'ouverture du show, pas une animation qui se met en travers.
  const [booting, setBooting] = useState(true);
  const [showLoader, setShowLoader] = useState(false);

  const [screen, setScreen] = useState<Screen>("menu");
  const [name, setName] = useState("");
  const [team, setTeam] = useState<Team>("R");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState(false);

  useEffect(() => {
    try {
      const seen = window.sessionStorage.getItem(LOADER_KEY);
      setShowLoader(!seen);
    } catch {
      setShowLoader(true);
    }
    setBooting(false);

    try {
      const saved = window.localStorage.getItem(NAME_KEY);
      if (saved) setName(saved);
      if (!window.localStorage.getItem(RULES_SEEN_KEY)) {
        // Les regles s'ouvrent d'office la premiere fois sur cet appareil.
        setRules(true);
      }
    } catch {
      /* navigation privee : on n'insiste pas */
    }
  }, []);

  useEffect(() => {
    if (!showLoader && !booting) setMood("lobby");
  }, [showLoader, booting]);

  const closeRules = () => {
    setRules(false);
    try {
      window.localStorage.setItem(RULES_SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const loaderDone = () => {
    try {
      window.sessionStorage.setItem(LOADER_KEY, "1");
    } catch {
      /* ignore */
    }
    setShowLoader(false);
  };

  const remember = (value: string) => {
    try {
      window.localStorage.setItem(NAME_KEY, value);
    } catch {
      /* ignore */
    }
  };

  async function handleCreate() {
    const pseudo = name.trim();
    if (!pseudo) return setError("Choisis un pseudo.");
    setBusy(true);
    setError(null);
    try {
      remember(pseudo);
      const state = await createGame(pseudo, team);
      play("ui");
      // L'hote atterrit sur le plateau : c'est l'ecran qu'on met sur la TV.
      router.push(`/g/${state.game.code}/tv`);
    } catch (err) {
      setError(cleanError(err));
      setBusy(false);
    }
  }

  async function handleJoin() {
    const pseudo = name.trim();
    const c = parseCode(code);
    if (!pseudo) return setError("Choisis un pseudo.");
    if (c.length < 4) return setError("Le code fait 4 caractères, comme TF-4827.");
    setBusy(true);
    setError(null);
    try {
      remember(pseudo);
      await joinGame(c, pseudo, team);
      play("join");
      router.push(`/g/${c}`);
    } catch (err) {
      setError(cleanError(err));
      setBusy(false);
    }
  }

  if (booting) return <div className="min-h-dvh bg-[#03060f]" />;
  if (showLoader) return <Loader onDone={loaderDone} />;

  return (
    <main
      className="relative min-h-dvh overflow-hidden"
      onPointerDown={() => initAudio()}
    >
      {/* Bleu profond : l'or est reserve au logo et aux boutons, sinon
          tout le plateau devient terne. */}
      <Studio accent={null} />
      <Particles count={40} />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 py-7">
        <header className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/35">
            Jeu télévisé · temps réel
          </span>
          <SoundToggles />
        </header>

        <div className="flex flex-1 flex-col justify-center py-8">
          {/* Le logo, au centre, comme sur le plateau */}
          <div className="text-center">
            <h1 className="wordmark wordmark-sheen display text-[clamp(2.6rem,15vw,5.5rem)]">
              TOP FAMILLE
            </h1>
            <div
              aria-hidden
              className="mx-auto mt-2.5 h-[3px] w-[62%] rounded-full bg-gradient-to-r from-transparent via-gold to-transparent"
              style={{ boxShadow: "0 0 22px rgba(245,195,68,0.7)" }}
            />
            <p className="byline mt-5 text-[clamp(0.58rem,2.4vw,0.76rem)]">
              by Lewishalmito
            </p>
          </div>

          {!isSupabaseConfigured && (
            <div className="panel rise mt-8 border-gold/35 p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
                Configuration requise
              </p>
              <p className="mt-2 text-sm text-white/70">
                Remplis <code className="text-gold-soft">.env.local</code> avec{" "}
                <code className="text-gold-soft">NEXT_PUBLIC_SUPABASE_URL</code> et{" "}
                <code className="text-gold-soft">
                  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
                </code>
                , puis relance <code className="text-gold-soft">npm run dev</code>.
              </p>
            </div>
          )}

          {/* ---------------- MENU ---------------- */}
          {screen === "menu" && (
            <div className="rise mt-10 space-y-3">
              <button
                type="button"
                onClick={() => {
                  play("ui");
                  setScreen("create");
                  setError(null);
                }}
                className="btn btn-gold w-full py-5 text-base"
              >
                <span aria-hidden>🎮</span>
                <span>Créer une partie</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  play("ui");
                  setScreen("join");
                  setError(null);
                }}
                className="btn btn-blue w-full py-5 text-base"
              >
                <span aria-hidden>🔑</span>
                <span>Rejoindre une partie</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  play("ui");
                  setRules(true);
                }}
                className="btn btn-ghost w-full py-4 text-sm"
              >
                <span aria-hidden>❓</span>
                <span>Comment jouer</span>
              </button>
            </div>
          )}

          {/* ---------------- CREER ---------------- */}
          {screen === "create" && (
            <form
              className="panel panel-solid pop mt-10 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                void handleCreate();
              }}
            >
              <h2 className="display text-xl text-white">Créer une partie</h2>
              <p className="mt-1.5 text-[13px] text-white/55">
                Tu deviens <b className="text-gold">host</b>. Le plateau
                s&apos;ouvrira sur cet écran — mets-le sur la télévision, et fais
                rejoindre les joueurs avec le code.
              </p>

              <label className="label mt-5" htmlFor="c-name">
                Ton pseudo
              </label>
              <input
                id="c-name"
                className="field"
                placeholder="Mickaël"
                maxLength={18}
                autoComplete="nickname"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <TeamPicker value={team} onChange={setTeam} />

              {error && <ErrorNote>{error}</ErrorNote>}

              <button type="submit" disabled={busy} className="btn btn-gold mt-5 w-full py-4">
                {busy ? "Ouverture du plateau…" : "Créer et ouvrir le plateau"}
              </button>
              <BackButton onClick={() => setScreen("menu")} />
            </form>
          )}

          {/* ---------------- REJOINDRE ---------------- */}
          {screen === "join" && (
            <form
              className="panel panel-solid pop mt-10 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                void handleJoin();
              }}
            >
              <h2 className="display text-xl text-white">Rejoindre une partie</h2>
              <p className="mt-1.5 text-[13px] text-white/55">
                Ce téléphone devient ta télécommande.
              </p>

              <label className="label mt-5" htmlFor="j-code">
                Code de la partie
              </label>
              <input
                id="j-code"
                className="field field-xl font-mono"
                placeholder="TF-4827"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={9}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
              {parseCode(code).length >= 4 && (
                <p className="mt-2 text-center font-mono text-[11px] tracking-[0.2em] text-gold/70">
                  {prettyCode(parseCode(code))}
                </p>
              )}

              <label className="label mt-5" htmlFor="j-name">
                Ton pseudo
              </label>
              <input
                id="j-name"
                className="field"
                placeholder="Sarah"
                maxLength={18}
                autoComplete="nickname"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <TeamPicker value={team} onChange={setTeam} />

              {error && <ErrorNote>{error}</ErrorNote>}

              <button type="submit" disabled={busy} className="btn btn-blue mt-5 w-full py-4">
                {busy ? "Connexion…" : "Rejoindre"}
              </button>
              <BackButton onClick={() => setScreen("menu")} />
            </form>
          )}
        </div>

        <footer className="text-center">
          <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-white/22">
            TOP FAMILLE · by Lewishalmito
          </p>
        </footer>
      </div>

      <RulesModal open={rules} onClose={closeRules} />
    </main>
  );
}

/* -------------------------------------------------------------------- */

function TeamPicker({
  value,
  onChange,
}: {
  value: Team;
  onChange: (t: Team) => void;
}) {
  return (
    <>
      <p className="label mt-5">Ton équipe</p>
      <div className="grid grid-cols-2 gap-3">
        {(["R", "B"] as const).map((t) => {
          const on = value === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => {
                play("ui");
                onChange(t);
              }}
              aria-pressed={on}
              className={`rounded-2xl border-2 px-4 py-4 text-left transition ${
                on
                  ? t === "R"
                    ? "border-teamR bg-teamR/15 shadow-glowR"
                    : "border-teamB bg-teamB/15 shadow-glowB"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20"
              }`}
            >
              <span
                className={`display block text-2xl leading-none ${
                  t === "R" ? "text-teamR" : "text-teamB"
                }`}
              >
                {t === "R" ? "🔴" : "🔵"} {TEAM_NAME[t]}
              </span>
              <span className="mt-1.5 block font-mono text-[9px] uppercase tracking-[0.2em] text-white/40">
                {MAX_PER_TEAM} joueurs max
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 w-full rounded-xl py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-white/40 transition hover:text-white/70"
    >
      ← Retour
    </button>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rise mt-4 rounded-xl border border-teamR/35 bg-teamR/10 px-3.5 py-2.5 text-[13px] font-semibold text-teamR-soft"
    >
      {children}
    </p>
  );
}
