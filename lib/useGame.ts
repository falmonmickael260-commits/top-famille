"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  cleanError,
  ensureAuth,
  fetchState,
  gameExists,
  tick as tickRpc,
} from "@/lib/api";
import type { Game, GameEventPayload, GameState, Player } from "@/lib/types";

/**
 * L'unique source d'etat du jeu cote client.
 *
 * Trois regles tenues ici :
 *
 *  1. Supabase est la seule autorite. Ce hook ne calcule jamais qui a buzze,
 *     qui est actif, combien il y a de fautes ni qui gagne : il affiche ce que
 *     le serveur a decide.
 *
 *  2. Le chronometre est serveur. On affiche `phase_ends_at - maintenant`,
 *     recale par `serverNow` : un telephone mal a l'heure montre quand meme
 *     le bon temps restant.
 *
 *  3. Quand un chrono arrive a zero, quelqu'un doit appeler tf_tick. Tous les
 *     clients le font, en decalage : l'hote tout de suite, les autres apres.
 *     tf_tick est idempotent (verrou sur phase_seq), donc un seul appel agit.
 */

const RESYNC_MS = 15000;   // battement de coeur (le serveur tolere 40 s)
const TICK_GRACE_MS = 120; // on laisse la derniere image s'afficher

export interface UseGame {
  myId: string | null;
  game: Game | null;
  players: Player[];
  state: GameState | null;
  me: Player | null;
  isHost: boolean;
  loading: boolean;
  notFound: boolean;
  busy: boolean;
  error: string | null;
  live: boolean;
  reconnected: boolean;
  /** Temps restant sur la phase en cours, en ms (0 si pas de chrono). */
  remainingMs: number;
  /** Duree totale de la phase en cours, en ms (pour dessiner une jauge). */
  phaseTotalMs: number;
  /** Le beat a animer. Change a chaque phase_seq : jamais rate. */
  beat: { seq: number; event: GameEventPayload | null };
  clearError: () => void;
  run: (fn: () => Promise<GameState>) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useGame(code: string): UseGame {
  const [myId, setMyId] = useState<string | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [reconnected, setReconnected] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [offsetMs, setOffsetMs] = useState(0);

  const wasDown = useRef(false);
  const tickGuard = useRef(-1);
  const seqRef = useRef(-1);

  const game = state?.game ?? null;
  const players = state?.players ?? [];

  /* La boucle de tick lit l'etat dans des refs, jamais dans ses dependances :
     sinon chaque rafraichissement la recreerait, et le tick programme serait
     annule avant d'avoir eu le temps de partir (voir l'effet 5). */
  const gameRef = useRef<Game | null>(null);
  const playersRef = useRef<Player[]>([]);
  const offsetRef = useRef(0);
  gameRef.current = game;
  playersRef.current = players;

  /** Applique une reponse RPC et recale l'horloge sur celle du serveur. */
  const apply = useCallback((next: GameState) => {
    setState(next);
    if (next.serverNow) {
      const server = new Date(next.serverNow).getTime();
      if (Number.isFinite(server)) {
        const delta = Date.now() - server;
        offsetRef.current = delta;
        setOffsetMs(delta);
      }
    }
  }, []);

  /* ---------------------------------------------------------------- */
  /*  1. Chargement initial                                           */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const uid = await ensureAuth();
        if (cancelled) return;
        setMyId(uid);

        if (!(await gameExists(code))) {
          if (!cancelled) {
            setNotFound(true);
            setLoading(false);
          }
          return;
        }
        const next = await fetchState(code);
        if (!cancelled) apply(next);
      } catch (err) {
        if (!cancelled) setError(cleanError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, apply]);

  /** Re-demande l'etat complet au serveur. Sert de filet partout. */
  const refresh = useCallback(async () => {
    try {
      apply(await fetchState(code));
    } catch {
      /* silencieux : une resynchro ratee sera retentee au battement suivant */
    }
  }, [code, apply]);

  /* ---------------------------------------------------------------- */
  /*  2. Realtime : tf_games + tf_players + tf_events + presence      */
  /* ---------------------------------------------------------------- */
  const gameId = game?.id ?? null;

  useEffect(() => {
    if (!gameId || !myId) return;

    const channel = supabase.channel(`tf:${code}`, {
      config: { presence: { key: myId } },
    });

    // La ligne complete arrive (replica identity full) : on s'en sert tout de
    // suite pour que le chrono ne clignote pas, puis on redemande l'etat
    // complet (le tableau, lui, n'est pas dans la ligne).
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tf_games", filter: `id=eq.${gameId}` },
      (payload) => {
        const next = payload.new as Game | undefined;
        if (!next?.id) return;
        setState((prev) => (prev ? { ...prev, game: next } : prev));
        void refresh();
      }
    );

    // Pas de filtre : quand un joueur quitte, game_id passe a null et un
    // filtre "game_id=eq.X" ne verrait jamais l'evenement.
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tf_players" },
      (payload) => {
        const next = payload.new as Partial<Player> | undefined;
        const prev = payload.old as Partial<Player> | undefined;
        if (next?.game_id === gameId || prev?.game_id === gameId) void refresh();
      }
    );

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setLive(true);
        void channel.track({ user_id: myId });
        void refresh();
        if (wasDown.current) {
          wasDown.current = false;
          setReconnected(true);
          window.setTimeout(() => setReconnected(false), 2600);
        }
      } else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        setLive(false);
        wasDown.current = true;
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [gameId, myId, code, refresh]);

  /* ---------------------------------------------------------------- */
  /*  3. Battement de coeur + resynchro au retour sur l'onglet        */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (!gameId) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    const iv = window.setInterval(() => void refresh(), RESYNC_MS);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(iv);
    };
  }, [gameId, refresh]);

  /* ---------------------------------------------------------------- */
  /*  4. Chronometre                                                  */
  /* ---------------------------------------------------------------- */
  const hasClock = !!game?.phase_ends_at;

  useEffect(() => {
    if (!hasClock) return;
    // 100 ms : assez fin pour un chrono de plateau au dixieme, assez large
    // pour ne pas peser sur les animations.
    const iv = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(iv);
  }, [hasClock, game?.phase_seq]);

  const remainingMs = useMemo(() => {
    if (!game?.phase_ends_at) return 0;
    return Math.max(0, new Date(game.phase_ends_at).getTime() - (now - offsetMs));
  }, [game?.phase_ends_at, now, offsetMs]);

  const phaseTotalMs = useMemo(() => {
    if (!game?.phase_ends_at) return 0;
    const start = new Date(game.phase_started_at).getTime();
    const end = new Date(game.phase_ends_at).getTime();
    return Math.max(1, end - start);
  }, [game?.phase_started_at, game?.phase_ends_at]);

  /* ---------------------------------------------------------------- */
  /*  5. Le tick : personne ne doit pouvoir figer le show             */
  /*                                                                  */
  /*  Une SEULE boucle, montee une fois pour la partie. C'est le point */
  /*  important : la version precedente programmait un setTimeout dans */
  /*  un effet qui dependait de l'etat. Or l'etat se rafraichit sans   */
  /*  cesse (Realtime, battement de coeur) — le nettoyage de l'effet   */
  /*  annulait donc le tick avant qu'il ne parte, et le garde          */
  /*  anti-doublon empechait de le reprogrammer. Resultat : le chrono  */
  /*  expirait, plus personne n'avancait la machine, et le show se     */
  /*  figeait definitivement.                                          */
  /*                                                                  */
  /*  Ici le retard n'est plus porte par un minuteur annulable mais    */
  /*  deduit du temps DEJA ecoule depuis l'expiration : l'hote (le     */
  /*  plateau, en general) part le premier, les telephones servent de  */
  /*  filet s'il a ferme son onglet, chacun a son tour pour ne pas     */
  /*  taper le serveur a douze en meme temps. tf_tick etant idempotent, */
  /*  un seul appel fait effet.                                        */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (!gameId || !myId) return;

    const iv = window.setInterval(() => {
      const g = gameRef.current;
      if (!g || g.status === "finished" || !g.phase_ends_at) return;
      if (tickGuard.current === g.phase_seq) return;

      const endsAt = new Date(g.phase_ends_at).getTime();
      const expiredFor = Date.now() - offsetRef.current - endsAt;
      if (expiredFor < 0) return;

      const isHostHere = g.host_player_id === myId;
      const index = Math.max(0, playersRef.current.findIndex((p) => p.id === myId));
      const wait = isHostHere ? TICK_GRACE_MS : 700 + index * 400;
      if (expiredFor < wait) return;

      tickGuard.current = g.phase_seq;
      tickRpc(code)
        .then(apply)
        .catch(() => {
          tickGuard.current = -1; // on pourra retenter au tour suivant
        });
    }, 250);

    return () => window.clearInterval(iv);
  }, [gameId, myId, code, apply]);

  /* ---------------------------------------------------------------- */
  /*  6. Le beat a animer                                             */
  /*     On le lit sur la ligne (last_event), pas sur le flux          */
  /*     d'evenements : une trame Realtime perdue ne peut donc pas     */
  /*     faire sauter une animation.                                   */
  /* ---------------------------------------------------------------- */
  const beat = useMemo(
    () => ({ seq: game?.phase_seq ?? -1, event: game?.last_event ?? null }),
    [game?.phase_seq, game?.last_event]
  );

  useEffect(() => {
    if (beat.seq !== seqRef.current) seqRef.current = beat.seq;
  }, [beat.seq]);

  /* ---------------------------------------------------------------- */
  /*  7. Actions                                                      */
  /* ---------------------------------------------------------------- */
  const run = useCallback(
    async (fn: () => Promise<GameState>) => {
      setBusy(true);
      setError(null);
      try {
        apply(await fn());
      } catch (err) {
        setError(cleanError(err));
      } finally {
        setBusy(false);
      }
    },
    [apply]
  );

  const me = useMemo(
    () => players.find((p) => p.id === myId) ?? null,
    [players, myId]
  );

  return {
    myId,
    game,
    players,
    state,
    me,
    isHost: !!game && game.host_player_id === myId,
    loading,
    notFound,
    busy,
    error,
    live,
    reconnected,
    remainingMs,
    phaseTotalMs,
    beat,
    clearError: useCallback(() => setError(null), []),
    run,
    refresh,
  };
}
