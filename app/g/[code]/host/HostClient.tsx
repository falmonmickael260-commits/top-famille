"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Announcer from "@/components/Announcer";
import GameGate from "@/components/GameGate";
import SoundToggles from "@/components/fx/SoundToggles";
import Studio from "@/components/fx/Studio";
import HostRail from "@/components/stage/HostRail";
import Roster from "@/components/stage/Roster";
import ScorePanel from "@/components/stage/ScorePanel";
import Strikes from "@/components/stage/Strikes";
import Timer from "@/components/stage/Timer";
import { script } from "@/lib/announcer";
import { formatSeconds, hostSkip, playerName, prettyCode, restartShow, startShow, teamOf } from "@/lib/api";
import { TOTAL_ROUNDS } from "@/lib/types";
import { useGame } from "@/lib/useGame";

export default function HostClient({ code }: { code: string }) {
  const router = useRouter();
  const g = useGame(code);

  if (g.loading || g.notFound || !g.game || !g.state) {
    return <GameGate g={g} code={code} requirePlayer={false} />;
  }

  const { game, players, state } = g;
  const sc = script(state);
  const hidden = state.hiddenLeft;

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <Studio accent={game.control_team ?? "GOLD"} />

      <div className="relative z-10 mx-auto w-full max-w-3xl px-4 py-5">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="wordmark display text-xl">TOP FAMILLE</h1>
          <span className="rounded-md bg-white/[0.06] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/50">
            console hôte
          </span>
          <span className="flex-1" />
          <SoundToggles />
        </header>

        {!g.isHost && (
          <p className="panel mt-4 border-gold/35 px-4 py-3 text-sm text-gold-soft">
            Tu n&apos;es pas l&apos;hôte de cette partie : cette console est en
            lecture seule. L&apos;hôte est{" "}
            <b>{playerName(players, game.host_player_id)}</b>.
          </p>
        )}

        {g.isHost && (
          <div className="mt-4">
            <HostRail
              game={game}
              busy={g.busy}
              onStart={() => g.run(() => startShow(code))}
              onSkip={() => g.run(() => hostSkip(code))}
              onRestart={() => g.run(() => restartShow(code))}
              onLeave={() => router.push("/")}
            />
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="panel p-4">
            <p className="label">Code de la partie</p>
            <p className="display tabular-nums text-gold neon-gold text-3xl">
              {prettyCode(game.code)}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/g/${game.code}/tv`} className="btn btn-blue px-4 py-2.5 text-[11px]">
                📺 Ouvrir le plateau
              </Link>
              <Link href={`/g/${game.code}`} className="btn btn-ghost px-4 py-2.5 text-[11px]">
                📱 Jouer ici
              </Link>
            </div>
          </div>

          <div className="panel p-4">
            <p className="label">État du serveur</p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[11px]">
              <Row k="statut" v={game.status} />
              <Row k="phase" v={game.phase} />
              <Row k="phase_seq" v={String(game.phase_seq)} />
              <Row
                k="chrono"
                v={game.phase_ends_at ? `${formatSeconds(g.remainingMs)} s` : "—"}
              />
              <Row k="manche" v={`${game.round_number} / ${TOTAL_ROUNDS} (×${game.round_multiplier})`} />
              <Row k="contrôle" v={game.control_team ?? "—"} />
              <Row k="fautes" v={`${game.strikes} / 3`} />
              <Row k="cagnotte" v={String(game.round_points)} />
              <Row k="restant" v={`${hidden} réponse${hidden > 1 ? "s" : ""}`} />
              <Row k="actif" v={playerName(players, game.active_player_id)} />
            </dl>
          </div>
        </div>

        {game.status !== "lobby" && (
          <div className="mt-4">
            <ScorePanel
              scoreR={game.score_r}
              scoreB={game.score_b}
              controlTeam={game.control_team}
              roundPoints={game.round_points}
              roundNumber={game.round_number}
              multiplier={game.round_multiplier}
              totalRounds={TOTAL_ROUNDS}
              compact
            />
          </div>
        )}

        {game.phase_ends_at && (
          <div className="panel mt-4 flex flex-wrap items-center gap-5 px-4 py-3">
            <div className="min-w-[8rem] flex-1">
              <Timer
                remainingMs={g.remainingMs}
                totalMs={g.phaseTotalMs}
                label={game.phase}
                ticking={false}
              />
            </div>
            {game.control_team && <Strikes count={game.strikes} size="sm" />}
          </div>
        )}

        <div className="mt-4">
          <Announcer script={sc} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="panel p-3">
            <Roster
              team="R"
              players={teamOf(players, "R")}
              activeId={game.control_team === "R" ? game.active_player_id : null}
              faceoffId={game.faceoff_r}
              turnOrder={game.control_team === "R" ? game.turn_order : undefined}
              hostId={game.host_player_id}
              compact
            />
          </div>
          <div className="panel p-3">
            <Roster
              team="B"
              players={teamOf(players, "B")}
              activeId={game.control_team === "B" ? game.active_player_id : null}
              faceoffId={game.faceoff_b}
              turnOrder={game.control_team === "B" ? game.turn_order : undefined}
              hostId={game.host_player_id}
              compact
            />
          </div>
        </div>

        {g.error && (
          <p
            role="alert"
            className="rise mt-4 rounded-xl border border-teamR/35 bg-teamR/10 px-4 py-2.5 text-sm font-semibold text-teamR-soft"
          >
            {g.error}
          </p>
        )}
      </div>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="uppercase tracking-[0.14em] text-white/35">{k}</dt>
      <dd className="truncate text-white/80">{v}</dd>
    </>
  );
}
