export interface IGameConfig {
  canvasWidth: number;
  canvasHeight: number;
  paddleWidth: number;
  paddleHeight: number;
  ballRadius: number;
  paddleSpeed: number;
  ballSpeed: number;
}

export interface IPlayerInput {
  playerId: string;
  action: "up" | "down" | "stop";
  timestamp: number;
}

export interface IClientState {
  gameId: string;
  playerId: string;
  isConnected: boolean;
  gameState: "waiting" | "playing" | "paused" | "finished";
}

export interface IServerData {
  type: "gameState" | "playerJoined" | "playerLeft" | "gameEnd";
  gameId: string;
  timestamp: number;
  data: any;
}

export interface IGameState {
  ball: {
    x: number;
    y: number;
    vx: number;
    vy: number;
  };
  paddles: {
    left: { x: number; y: number };
    right: { x: number; y: number };
  };
  score: {
    left: number;
    right: number;
  };
  gameStatus: "waiting" | "playing" | "paused" | "finished";
}
