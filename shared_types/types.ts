/* Theese are the types that are needed on both the frontend and the backend.
 * Since the frontend and backend exchange some objects, the types for those objects will be the same.
 */

// Shared game configuration constants - must match backend/src/classes.ts
export const SHARED_GAME_CONFIG = {
  width: 1000,
  height: 700,
  blockSize: 10, // ball radius
  paddleWidth: 10,
  paddleHeight: 100,
  maxPaddleY: 600, // height - paddleHeight
  paddleSpeed: 7,
  ballSpeed: 5,
  ballSpeedY: 3,
  maxBallSpeed: 12,
  maxScore: 11,
};

export interface IGameConfig {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  block: number;
  paddleHeight: number;
  maxPaddleY: number;
  paddleSpeed: number;
  ballSpeed: number;
  score: [number, number];
  maxScore: number;
  gameOver: boolean;
}

interface IPlayerInternal {
  x: number;
  y: number;
  score: number;
}

interface IBallState {
  x: number;
  y: number;
  dx?: number; // Ball velocity X (for client-side prediction)
  dy?: number; // Ball velocity Y (for client-side prediction)
}

export interface IClientState {
  ball: IBallState;
  player: IPlayerInternal;
  opponent: IPlayerInternal;
  gameOver: boolean;
  countdown?: number; // Countdown before game starts (in seconds)
}

// Ball sync message for event-based updates
export interface IBallSyncMessage {
  type: "ballSync";
  event: "paddleHit" | "wallBounce" | "score" | "reset";
  ball: {
    x: number;
    y: number;
    dx: number;
    dy: number;
  };
  leftScore: number;
  rightScore: number;
  timestamp: number;
}

// state data sent from the BACKEND to the client
export interface IServerStateMessage {
  type: "state";
  state: IClientState;
}

// Tournament related server messages
export interface ITournamentUpdateMessage {
  type: "tournamentUpdate";
  tournamentId: string;
  status: "created" | "starting" | "inProgress" | "completed";
  message: string;
}

export interface ITournamentMatchMessage {
  type: "tournamentMatch";
  tournamentId: string;
  round: number;
  opponentId: string;
  role: "left" | "right";
}

export interface ITournamentCompletedMessage {
  type: "tournamentCompleted";
  tournamentId: string;
  winnerId: string;
}

export interface ITournamentForfeitMessage {
  type: "tournamentForfeit";
  tournamentId: string;
  forfeitedPlayerId: number;
  forfeitedUsername: string;
  winnerId?: number;
  winnerUsername?: string;
  reason: string;
  message: string;
}

export interface ITournamentReadyTimeoutMessage {
  type: "tournamentReadyTimeout";
  tournamentId: string;
  timeoutSeconds: number;
  message: string;
}

export type IServerData =
  | IServerStateMessage
  | ITournamentUpdateMessage
  | ITournamentMatchMessage
  | ITournamentCompletedMessage
  | ITournamentForfeitMessage
  | ITournamentReadyTimeoutMessage
  | IBallSyncMessage;

// input data sent from the CLIENT to the backend
export interface IPlayerInput {
  type:
    | "input"
    | "startGame"
    | "pauseGame"
    | "resumeGame"
    | "createTournament"
    | "joinTournament";
  playerId?: number | null;
  paddleUp: boolean | null;
  paddleDown: boolean | null;
  tournamentId?: string;
}
