export interface IPaddle {
  x: number;
  y: number;
  width: number;
  height: number;
  dy: number;
  move(): void;
}

export interface IPlayer {
  socket: any;
  id: number; // Authenticated user ID from JWT
  username: string; // Username from JWT
  paddle: IPaddle | null;
  score: number;
}

export interface IBall {
  x: number;
  y: number;
  radius: number;
  width: number; // kept for backwards compatibility
  height: number; // kept for backwards compatibility
  resetting: boolean;
  dx: number;
  dy: number;
  move(): void;
  collides(paddle: IPaddle): boolean;
}

// interface for the server-side representation of the game
export interface IInternalState {
  id: string;
  leftPlayer: IPlayer;
  rightPlayer: IPlayer;
  ball: IBall;
  state: "playing" | "paused" | "gameOver";
  countdown: number; // Countdown before ball starts moving (in seconds)
  countdownTicks: number; // Frame counter for countdown
}
