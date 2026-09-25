/* Types partages. Ils decrivent exactement ce que renvoient les RPC SQL :
   toute divergence se voit a la compilation. */

export type Team = "R" | "B";

export type GameStatus = "lobby" | "playing" | "finished";

/** La machine d'etat, identique a la contrainte CHECK de tf_games.phase. */
export type Phase =
  | "LOBBY"
  | "INTRO"
  | "FACE_OFF"
  | "BUZZING"
  | "ANSWERING"
  | "CORRECT_ANSWER"
  | "WRONG_ANSWER"
  | "CONTROL_GRANTED"
  | "TEAM_TURN"
  | "THREE_STRIKES"
  | "STEAL"
  | "STEAL_RESULT"
  | "ROUND_RESULT"
  | "ROUND_TRANSITION"
  | "FINALE_INTRO"
  | "FINALE_PLAYER_ONE"
  | "FINALE_PLAYER_TWO"
  | "FINALE_REVEAL"
  | "VICTORY";

export interface Game {
  id: string;
  code: string;
  status: GameStatus;

  phase: Phase;
  phase_seq: number;
  phase_started_at: string;
  phase_ends_at: string | null;

  round_number: number;
  round_multiplier: number;
  question_id: number | null;
  used_question_ids: number[];
  round_points: number;

  control_team: Team | null;
  strikes: number;
  score_r: number;
  score_b: number;

  host_player_id: string | null;

  faceoff_r: string | null;
  faceoff_b: string | null;
  faceoff_tried: string[];
  buzz_winner: string | null;
  buzz_at: string | null;

  turn_order: string[];
  turn_index: number;
  active_player_id: string | null;
  team_ms_left: number;

  steal_team: Team | null;
  steal_by: string | null;
  steal_answer_id: number | null;
  steal_raw: string | null;
  steal_success: boolean | null;

  finale_team: Team | null;
  finale_p1: string | null;
  finale_p2: string | null;
  finale_question_ids: number[];
  finale_slot: number;
  finale_q_index: number;
  finale_reveal_step: number;
  finale_total: number;

  winner_team: Team | "TIE" | null;

  last_event: GameEventPayload | null;
  last_event_at: string | null;
  created_at: string;
}

export interface Player {
  id: string;
  game_id: string | null;
  name: string;
  team: Team;
  connected: boolean;
  /** Calcule par le serveur : connected ET vu il y a moins de 40 s. C'est
      cette valeur, pas `connected`, qui decide si la rotation saute le tour. */
  live: boolean;
  last_seen: string;
  faceoff_count: number;
  joined_at: string;
  created_at: string;
}

/** Une case du tableau. label/points sont null tant que ce n'est pas devoile :
    la donnee ne quitte pas le serveur, ce n'est pas un masquage CSS. */
export interface Slot {
  rank: number;
  revealed: boolean;
  found: boolean;
  label: string | null;
  points: number | null;
  awarded: number;
  team: Team | null;
  playerId: string | null;
}

export interface Board {
  questionId: number;
  /** null pendant FACE_OFF : la question n'apparait qu'au buzzer. */
  prompt: string | null;
  category: string;
  sourceType: "panel" | "survey";
  sourceLabel: string;
  sourceUrl: string | null;
  sourceDate: string | null;
  population: string | null;
  country: string;
  sampleSize: number;
  slots: Slot[];
}

export interface FinaleAnswer {
  slot: number;
  index: number;
  playerId: string | null;
  visible: boolean;
  raw: string | null;
  label: string | null;
  points: number | null;
  duplicate: boolean;
}

export interface Finale {
  team: Team | null;
  p1: string | null;
  p2: string | null;
  slot: number;
  qIndex: number;
  revealStep: number;
  total: number | null;
  target: number;
  questions: { index: number; prompt: string | null }[];
  answers: FinaleAnswer[];
}

export interface GameState {
  game: Game;
  players: Player[];
  board: Board | null;
  finale: Finale | null;
  hiddenLeft: number;
  me: string;
  serverNow: string;
}

/** Charge utile d'un evenement de tf_events : c'est ce qui declenche les
    animations du plateau et les repliques de l'animateur. */
export interface GameEventPayload {
  type: string;
  round?: number;
  multiplier?: number;
  team?: Team | null;
  from?: Team | null;
  player?: string | null;
  playerR?: string | null;
  playerB?: string | null;
  name?: string;
  raw?: string | null;
  label?: string | null;
  rank?: number;
  points?: number;
  answerPoints?: number;
  awarded?: number;
  strikes?: number;
  scope?: "faceoff" | "team";
  reason?: string;
  success?: boolean;
  stolen?: boolean;
  winner?: Team | null;
  cleared?: boolean;
  alreadyFound?: boolean;
  timeout?: boolean;
  turnIndex?: number;
  next?: number;
  last?: boolean;
  slot?: number;
  index?: number;
  step?: number;
  target?: number;
  finaleTeam?: Team | null;
  finaleTotal?: number;
  reached?: boolean;
  rounds?: number;
  p1?: string | null;
  p2?: string | null;
}

export interface GameEvent {
  id: number;
  game_id: string;
  seq: number;
  type: string;
  payload: GameEventPayload;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Constantes miroir du serveur (affichage uniquement)               */
/*  Le serveur reste la seule autorite : ces valeurs ne servent qu'a  */
/*  dessiner des jauges et des libelles.                              */
/* ------------------------------------------------------------------ */

export const MAX_PER_TEAM = 6;
export const MAX_PLAYERS = MAX_PER_TEAM * 2;
export const TOTAL_ROUNDS = 5;
export const FINALE_QUESTIONS = 5;
export const FINALE_TARGET = 200;

export const PHASE_SECONDS: Partial<Record<Phase, number>> = {
  INTRO: 9,
  FACE_OFF: 5,
  BUZZING: 10,
  ANSWERING: 10,
  CORRECT_ANSWER: 3,
  WRONG_ANSWER: 3,
  CONTROL_GRANTED: 4,
  TEAM_TURN: 25,
  THREE_STRIKES: 4,
  STEAL: 20,
  STEAL_RESULT: 5,
  ROUND_RESULT: 9,
  ROUND_TRANSITION: 5,
  FINALE_INTRO: 7,
  FINALE_PLAYER_ONE: 20,
  FINALE_PLAYER_TWO: 20,
  FINALE_REVEAL: 4,
};

export const ROUND_MULTIPLIER = (round: number) =>
  round === 3 ? 2 : round === 5 ? 3 : 1;

export const TEAM_NAME: Record<Team, string> = { R: "ROUGE", B: "BLEUE" };
export const TEAM_DOT: Record<Team, string> = { R: "🔴", B: "🔵" };

/** Phases pendant lesquelles un joueur peut ecrire une reponse. */
export const TYPING_PHASES: Phase[] = [
  "ANSWERING",
  "TEAM_TURN",
  "STEAL",
  "FINALE_PLAYER_ONE",
  "FINALE_PLAYER_TWO",
];
