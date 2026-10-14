"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  cleanError,
  ensureAuth,
  fetchPlayers,
  fetchState,
  gameExists,
  tick as tickRpc,
} from "@/lib/api";
import type { Game, GameEventPayload, GameState, Player } from "@/lib/types";
import type { Clock } from "@/lib/useCountdown";

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

/*
 * Battement de coeur : le filet de secours quand Realtime ne pousse rien
 * (canal coupe, message perdu, projet ou le Realtime ne serait pas active).
 *
 * A 15 s, un spectateur qui restait immobile pouvait afficher un chrono
 * perime jusqu'a 15 s de retard sur le vrai etat serveur : le cas le plus
 * genant est le duelliste a qui la main vient de passer (apres l'erreur de
 * l'autre) — sans Realtime pour le prevenir tout de suite, son telephone
 * continuait de decompter l'ANCIENNE fenetre (celle d'avant), tombait a
 * "0.0 s" alors qu'il lui restait en verite plusieurs secondes reelles, puis
 * se corrigeait d'un coup au battement suivant. Le joueur voyait le temps
 * s'ecouler beaucoup trop vite, essayait de repondre "a temps" sur un
 * chrono deja faux, et n'y arrivait pas. A 5 s, le meme rattrapage arrive
 * bien avant que la fenetre de reponse (15 s au plus court) ne soit
 * entierement perimee.
 */
const RESYNC_MS = 5000;
const TICK_GRACE_MS = 120; // on laisse la derniere image s'afficher

/*
 * Au-dela de ce delai, une resynchro est consideree perdue et une nouvelle
 * peut partir. Sans ce garde-fou, une requete qui ne se resout jamais (reseau
 * mobile qui bascule, onglet gele par iOS) laissait le verrou pris pour
 * toujours : plus aucun battement de coeur ne passait, et le telephone
 * restait fige sur un etat perime jusqu'au rechargement de la page.
 */
const STUCK_MS = 15000;

/** Colonnes de tf_players qui ne changent rien a l'affichage. */
const COSMETIC_PLAYER_COLUMNS = new Set(["last_seen"]);

/**
 * Vrai quand deux versions d'une ligne joueur ne different que par son
 * horodatage de battement de coeur.
 *
 * tf_state ecrit `last_seen` et cette table est publiee sur Realtime : sans
 * ce filtre, le battement de CHAQUE telephone reveillait TOUS les autres, qui
 * rechargeaient la liste des joueurs pour rien. A six joueurs cela faisait
 * une quarantaine de requetes par seconde pour une donnee que personne
 * n'affiche — le canal saturait et tombait en boucle.
 */
function isHeartbeatOnly(
  prev: Partial<Player> | undefined,
  next: Partial<Player> | undefined
): boolean {
  if (!prev || !next || !prev.id || !next.id) return false;
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of keys) {
    if (COSMETIC_PLAYER_COLUMNS.has(key)) continue;
    if (prev[key as keyof Player] !== next[key as keyof Player]) return false;
  }
  return true;
}

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
  /** Bornes de l'horloge serveur. Le decompte se fait via useCountdown(). */
  clock: Clock;
  /** Duree totale de la phase en cours, en ms (pour dessiner une jauge). */
  phaseTotalMs: number;
  /** Le beat a animer. Change a chaque phase_seq : jamais rate. */
  beat: { seq: number; event: GameEventPayload | null };
  clearError: () => void;
  run: (fn: () => Promise<GameState>) => Promise<void>;
  refresh: (opts?: { force?: boolean }) => Promise<void>;
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
  const [offsetMs, setOffsetMs] = useState(0);

  const wasDown = useRef(false);
  const tickGuard = useRef(-1);
  /** Derniere phase pour laquelle on possede deja le tableau complet. */
  const loadedSeq = useRef(-1);
  /** Resynchro en cours, pour ne pas en lancer dix en parallele. */
  const inFlight = useRef<{
    token: object;
    promise: Promise<void>;
    startedAt: number;
  } | null>(null);
  const gameIdRef = useRef<string | null>(null);
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
    loadedSeq.current = next.game.phase_seq;
    gameIdRef.current = next.game.id;
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

  /**
   * Re-demande l'etat complet au serveur. Sert de filet partout.
   *
   * Deux garde-fous, parce que chaque appel coute un aller-retour d'environ
   * 100 ms et qu'ils se declenchaient en rafale :
   *   - une seule resynchro a la fois (les suivantes attendent la meme) ;
   *   - on ne redemande rien si on a deja le tableau de cette phase.
   */
  const refresh = useCallback(
    async (opts?: { force?: boolean }) => {
      const current = inFlight.current;
      const stuck = !!current && Date.now() - current.startedAt > STUCK_MS;
      if (!opts?.force && current && !stuck) return current.promise;

      const token = {};
      const promise = (async () => {
        try {
          apply(await fetchState(code));
        } catch {
          /* silencieux : une resynchro ratee sera retentee au battement suivant */
        } finally {
          /* Une requete lente qui se termine APRES qu'une autre soit partie ne
             doit pas liberer le verrou de cette derniere : sinon le garde-fou
             anti-rafale ne protege plus rien. */
          if (inFlight.current?.token === token) inFlight.current = null;
        }
      })();
      inFlight.current = { token, promise, startedAt: Date.now() };
      return promise;
    },
    [code, apply]
  );

  /** Les joueurs seuls : bien plus leger que l'etat complet. */
  const refreshPlayers = useCallback(async () => {
    if (!gameIdRef.current) return;
    try {
      const rows = await fetchPlayers(gameIdRef.current);
      setState((prev) => (prev ? { ...prev, players: rows } : prev));
    } catch {
      /* le battement de coeur rattrapera */
    }
  }, []);

  /* ---------------------------------------------------------------- */
  /*  2. Realtime : tf_games + tf_players + tf_events + presence      */
  /* ---------------------------------------------------------------- */
  const gameId = game?.id ?? null;

  useEffect(() => {
    if (!gameId || !myId) return;

    const channel = supabase.channel(`tf:${code}`, {
      config: { presence: { key: myId } },
    });

    /*
     * La ligne complete arrive (replica identity full) : on l'applique tout de
     * suite, ce qui ne coute rien et fait repartir le chrono sans attendre.
     *
     * On ne redemande l'etat complet QUE si la phase a change et qu'on n'a pas
     * deja le tableau correspondant. Avant, chaque evenement declenchait une
     * resynchro — y compris juste apres une action qui venait de renvoyer
     * l'etat frais. Avec six telephones, un simple buzz provoquait sept
     * allers-retours inutiles, et tout le monde attendait.
     */
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tf_games", filter: `id=eq.${gameId}` },
      (payload) => {
        const next = payload.new as Game | undefined;
        if (!next?.id) return;
        setState((prev) => (prev ? { ...prev, game: next } : prev));
        if (next.phase_seq !== loadedSeq.current) void refresh();
      }
    );

    // Pas de filtre : quand un joueur quitte, game_id passe a null et un
    // filtre "game_id=eq.X" ne verrait jamais l'evenement. On ne recharge que
    // la liste des joueurs : reconstruire tout le tableau serait du gachis.
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tf_players" },
      (payload) => {
        const next = payload.new as Partial<Player> | undefined;
        const prev = payload.old as Partial<Player> | undefined;
        if (next?.game_id !== gameId && prev?.game_id !== gameId) return;
        // Un battement de coeur ne change que `last_seen`. Le drapeau `live`
        // affiche dans la liste est recalcule par le serveur et arrive deja
        // avec la resynchro periodique : inutile de recharger pour ca.
        if (isHeartbeatOnly(prev, next)) return;
        void refreshPlayers();
      }
    );

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setLive(true);
        void channel.track({ user_id: myId });
        void refresh({ force: true });
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
      if (document.visibilityState === "visible") void refresh({ force: true });
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    /* Pas de `force` ici : le battement de coeur part toutes les 5 s, et sur
       un reseau lent une requete peut durer plus longtemps que ca. Force
       aurait empile les resynchros sans limite — chacune ralentissant la
       suivante — jusqu'a la limite de debit de Supabase. */
    const iv = window.setInterval(() => void refresh(), RESYNC_MS);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(iv);
    };
  }, [gameId, refresh]);

  /* ---------------------------------------------------------------- */
  /*  4. L'horloge                                                     */
  /*                                                                   */
  /*  On ne garde ici QUE les bornes fixees par le serveur. Le decompte */
  /*  lui-meme est ticke par useCountdown(), dans le composant qui      */
  /*  l'affiche : sinon un setInterval a 100 ms ferait re-rendre tout   */
  /*  l'arbre dix fois par seconde — y compris le champ de saisie, ce   */
  /*  qui rendait la frappe poussive sur telephone.                     */
  /* ---------------------------------------------------------------- */
  const phaseTotalMs = useMemo(() => {
    if (!game?.phase_ends_at) return 0;
    const start = new Date(game.phase_started_at).getTime();
    const end = new Date(game.phase_ends_at).getTime();
    return Math.max(1, end - start);
  }, [game?.phase_started_at, game?.phase_ends_at]);

  const clock: Clock = useMemo(
    () => ({ endsAt: game?.phase_ends_at ?? null, offsetMs, totalMs: phaseTotalMs }),
    [game?.phase_ends_at, offsetMs, phaseTotalMs]
  );

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
    clock,
    phaseTotalMs,
    beat,
    clearError: useCallback(() => setError(null), []),
    run,
    refresh,
  };
}
