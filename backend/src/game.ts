import type { IPlayerInput } from "../../shared_types/types.js";
import { Ball, GAME_CONFIG, Paddle } from "./classes.js";
import type { IInternalState, IPlayer } from "./types.js";
import { tournamentManager } from "./tournament.js";

const playerWaitlist: IPlayer[] = []; // waitlist for players that are looking for a game
const socketToPlayer: Map<any, IPlayer> = new Map(); // for keeping easy player finding
const playerToGame: Map<number, string> = new Map(); // for keeping track if a player is in a game (keyed by player ID)
const games: Map<string, IInternalState> = new Map(); // gamesStates mapped to gameIds
const gameLoops: Map<string, ReturnType<typeof setInterval>> = new Map(); // Game loops (setTime() intervals) mapped to gameIds

// Track last opponent by player id for rematch purposes
const lastOpponentById: Map<number, number> = new Map();
// Store pending rematch requests keyed by sorted pair "minId-maxId"
const rematchRequests: Map<string, Set<number>> = new Map();

// Disconnect grace period: track disconnected players waiting to reconnect
const DISCONNECT_GRACE_MS = 10000; // 10 seconds to reconnect
const disconnectedPlayers: Map<number, {
  player: IPlayer;
  gameId: string;
  timeout: ReturnType<typeof setTimeout>;
  disconnectedAt: number;
}> = new Map();

// Notify listeners when a game ends
type GameOverListener = (payload: {
  gameId: string;
  leftPlayer: IPlayer;
  rightPlayer: IPlayer;
  leftScore: number;
  rightScore: number;
  winner: IPlayer;
  loser: IPlayer;
}) => void;
const gameOverListeners: Map<string, GameOverListener[]> = new Map();

export function onGameOver(gameId: string, listener: GameOverListener): void {
  const arr = gameOverListeners.get(gameId) ?? [];
  arr.push(listener);
  gameOverListeners.set(gameId, arr);
}

export function getPlayerBySocket(socket: any): IPlayer | undefined {
  return socketToPlayer.get(socket);
}

export function getPlayerById(userId: number): IPlayer | undefined {
  for (const p of socketToPlayer.values()) {
    if (p.id === userId) return p;
  }
  return undefined;
}

export function getOrCreatePlayerForSocket(
  socket: any,
  userId: number,
  username: string
): IPlayer {
  let p = socketToPlayer.get(socket);
  if (p) return p;
  p = { id: userId, username, socket, paddle: null, score: 0 };
  socketToPlayer.set(socket, p);
  return p;
}

// Check if a player is currently in an active game
export function isPlayerInGame(player: IPlayer): boolean {
  return playerToGame.has(player.id);
}

// Get a game by its ID
export function getGame(gameId: string): IInternalState | undefined {
  return games.get(gameId);
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export function requestRematchBySocket(socket: any): void {
  const player = socketToPlayer.get(socket);
  if (!player) return;
  const oppId = lastOpponentById.get(player.id);
  if (oppId == null) return;
  const key = pairKey(player.id, oppId);
  let set = rematchRequests.get(key);
  if (!set) {
    set = new Set();
    rematchRequests.set(key, set);
  }
  set.add(player.id);

  // Notify opponent about rematch request
  const opponent = getPlayerById(oppId);
  if (opponent && opponent.socket) {
    try {
      opponent.socket.send(JSON.stringify({ type: "rematchRequest" }));
    } catch (e) {
      console.error("Failed to notify opponent of rematch request:", e);
    }
  }

  // If both players agreed and both are free, start a new game between the same players
  if (set.has(player.id) && set.has(oppId)) {
    const p1 = getPlayerById(player.id);
    const p2 = getPlayerById(oppId);
    if (!p1 || !p2) return;
    if (isPlayerInGame(p1) || isPlayerInGame(p2)) return; // wait until both free
    // Clear request state and start rematch
    rematchRequests.delete(key);

    // Notify both players that rematch is accepted
    try {
      p1.socket.send(JSON.stringify({ type: "rematchAccepted" }));
    } catch { }
    try {
      p2.socket.send(JSON.stringify({ type: "rematchAccepted" }));
    } catch { }

    // Ensure players are assigned to same sides as before (lower ID = left, higher ID = right)
    const leftPlayer = p1.id < p2.id ? p1 : p2;
    const rightPlayer = p1.id < p2.id ? p2 : p1;

    try {
      createGameWithPlayers(leftPlayer, rightPlayer);
    } catch { }
  }
}

// Track frame count for reduced state broadcast frequency
const gameFrameCounters: Map<string, number> = new Map();
const STATE_BROADCAST_INTERVAL = 3; // Send full state every N frames (60/3 = 20fps for full state)

function startGameLoop(gameId: string): void {
  gameFrameCounters.set(gameId, 0);

  const interval = setInterval(() => {
    updateGame(gameId);
    // If the game got cleaned up during update (game over), skip broadcasting quietly
    if (!games.has(gameId)) return; // guard if game cleaned up during update

    // Increment frame counter
    const frameCount = (gameFrameCounters.get(gameId) ?? 0) + 1;
    gameFrameCounters.set(gameId, frameCount);

    // Broadcast full state at reduced frequency (ball sync happens via events)
    if (frameCount % STATE_BROADCAST_INTERVAL === 0) {
      broadcastGameState(gameId);
    }
  }, 1000 / 60);
  gameLoops.set(gameId, interval);
}

/**
 * Broadcast ball position/velocity sync to both players
 * Called on ball events: paddleHit, wallBounce, score, reset
 * This is the ONLY ball position data - clients predict movement between events
 */
function broadcastBallSync(gameId: string, event: "paddleHit" | "wallBounce" | "score" | "reset"): void {
  const game = games.get(gameId);
  if (!game) return;

  const ballSyncData = {
    type: "ballSync",
    event,
    ball: {
      x: game.ball.x,
      y: game.ball.y,
      dx: game.ball.dx,
      dy: game.ball.dy,
    },
    leftScore: game.leftPlayer.score,
    rightScore: game.rightPlayer.score,
    timestamp: Date.now(),
  };

  const message = JSON.stringify(ballSyncData);

  // Send to players
  try {
    if (game.leftPlayer.socket.readyState === 1) {
      game.leftPlayer.socket.send(message);
    }
  } catch { }

  try {
    if (game.rightPlayer.socket.readyState === 1) {
      game.rightPlayer.socket.send(message);
    }
  } catch { }
}

export function endGame(gameId: string): void {
  const interval = gameLoops.get(gameId);
  if (interval) {
    clearInterval(interval);
    gameLoops.delete(gameId);
  }
  gameFrameCounters.delete(gameId); // Clean up frame counter
  const game = games.get(gameId);
  if (game) {
    logResults(game);
    playerToGame.delete(game.leftPlayer.id);
    playerToGame.delete(game.rightPlayer.id);
    games.delete(gameId);
  }
  gameOverListeners.delete(gameId);
}

// Pause or resume the game associated with a client socket
export function setGamePausedBySocket(socket: any, paused: boolean): void {
  const player = socketToPlayer.get(socket);
  if (!player) return;
  const gameId = playerToGame.get(player.id);
  if (!gameId) return;
  const game = games.get(gameId);
  if (!game) return;
  if (game.state === "gameOver") return;
  game.state = paused ? "paused" : "playing";
  try {
    if (game.leftPlayer?.paddle) game.leftPlayer.paddle.dy = 0;
  } catch { }
  try {
    if (game.rightPlayer?.paddle) game.rightPlayer.paddle.dy = 0;
  } catch { }
  try {
    game.leftPlayer.socket.send(
      JSON.stringify({ type: "pauseUpdate", paused })
    );
  } catch { }
  try {
    game.rightPlayer.socket.send(
      JSON.stringify({ type: "pauseUpdate", paused })
    );
  } catch { }
}

function updateGame(gameId: string): void {
  const game = games.get(gameId);
  if (!game || game.state != "playing") return;

  // Handle countdown (decrement once per second)
  if (game.countdown > 0) {
    // Decrement countdown roughly once per second (60 ticks)
    game.countdownTicks++;
    if (game.countdownTicks >= 60) {
      game.countdown--;
      game.countdownTicks = 0;
    }
  }

  // Always allow paddles to move (even during countdown and pause)
  game.leftPlayer.paddle?.move();
  game.rightPlayer.paddle?.move();

  // Only move ball if countdown is finished (countdown = 0 means 1 second pause, < 0 means game started)
  if (game.countdown <= 0) {
    // Track ball state before move for collision detection
    const prevBallY = game.ball.y;
    const prevBallDy = game.ball.dy;

    game.ball.move();

    // Detect wall bounce (dy direction changed)
    if (Math.sign(game.ball.dy) !== Math.sign(prevBallDy) && prevBallDy !== 0) {
      broadcastBallSync(gameId, "wallBounce");
    }
  }

  // Only check scoring if countdown is finished (pause at 0 is ok, just no scoring during countdown)
  if (game.countdown > 0) return;

  // Check if ball has gone past the paddles (center + radius beyond boundaries)
  if (
    (game.ball.x + game.ball.radius < 0 || game.ball.x - game.ball.radius > GAME_CONFIG.width) &&
    !game.ball.resetting
  ) {
    game.ball.resetting = true;

    // Award point
    if (game.ball.x + game.ball.radius < 0) {
      game.rightPlayer.score += 1;
    } else if (game.ball.x - game.ball.radius > GAME_CONFIG.width) {
      game.leftPlayer.score += 1;
    }
    console.log(
      `[Game ${gameId}] score L:${game.leftPlayer.score} R:${game.rightPlayer.score}`
    );

    // Broadcast score event immediately
    broadcastBallSync(gameId, "score");

    if (
      game.rightPlayer.score == GAME_CONFIG.maxScore ||
      game.leftPlayer.score == GAME_CONFIG.maxScore
    ) {
      game.state = "gameOver";
      // Send a final state so clients see the last point and gameOver=true before cleanup
      try {
        broadcastGameState(gameId);
      } catch { }

      const leftScore = game.leftPlayer.score;
      const rightScore = game.rightPlayer.score;
      const winner =
        leftScore > rightScore ? game.leftPlayer : game.rightPlayer;
      const loser =
        winner === game.leftPlayer ? game.rightPlayer : game.leftPlayer;

      const listeners = gameOverListeners.get(gameId) ?? [];
      for (const l of listeners) {
        try {
          l({
            gameId,
            leftPlayer: game.leftPlayer,
            rightPlayer: game.rightPlayer,
            leftScore,
            rightScore,
            winner,
            loser,
          });
        } catch (e) {
          console.error("Error in gameOver listener:", e);
        }
      }
      endGame(gameId);
      return;
    }

    setTimeout(() => {
      game.ball.resetting = false;
      game.ball.x = GAME_CONFIG.width / 2;
      game.ball.y = GAME_CONFIG.height / 2;
      // Randomize new ball direction
      game.ball.dx = GAME_CONFIG.ballSpeed * (Math.random() < 0.5 ? -1 : 1);
      game.ball.dy = GAME_CONFIG.ballSpeedY * (Math.random() < 0.5 ? -1 : 1);
      // Broadcast ball reset with new position/velocity
      broadcastBallSync(gameId, "reset");
    }, 400);
  }

  // Only process paddle collisions if countdown is finished
  if (game.countdown <= 0) {
    if (game.leftPlayer.paddle && game.ball.collides(game.leftPlayer.paddle)) {
      // Push ball out of paddle to prevent sticking
      game.ball.x = game.leftPlayer.paddle.x + game.leftPlayer.paddle.width + game.ball.radius + 1;
      game.ball.dx = Math.abs(game.ball.dx); // Force ball to go right
      applyPaddleSpin(game.ball, game.leftPlayer.paddle);
      // Broadcast paddle hit event with new velocity
      broadcastBallSync(gameId, "paddleHit");
    } else if (
      game.rightPlayer.paddle &&
      game.ball.collides(game.rightPlayer.paddle)
    ) {
      // Push ball out of paddle to prevent sticking
      game.ball.x = game.rightPlayer.paddle.x - game.ball.radius - 1;
      game.ball.dx = -Math.abs(game.ball.dx); // Force ball to go left
      applyPaddleSpin(game.ball, game.rightPlayer.paddle);
      // Broadcast paddle hit event with new velocity
      broadcastBallSync(gameId, "paddleHit");
    }
  }
}

function applyPaddleSpin(ball: Ball, paddle: Paddle): void {
  const paddleCenter = paddle.y + paddle.height / 2;
  const offset = ball.y - paddleCenter;
  ball.dy += offset * 0.05;

  const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
  if (speed > GAME_CONFIG.maxBallSpeed) {
    const scale = GAME_CONFIG.maxBallSpeed / speed;
    ball.dx *= scale;
    ball.dy *= scale;
  }
}

function broadcastGameState(gameId: string): void {
  const game = games.get(gameId);
  if (game == undefined) {
    // game may have ended this tick; silently ignore
    return;
  }
  if (!game.leftPlayer.paddle || !game.rightPlayer.paddle) {
    return;
  }

  const rightData = {
    ball: { x: game.ball.x, y: game.ball.y, dx: game.ball.dx, dy: game.ball.dy },
    player: {
      x: game.rightPlayer.paddle.x,
      y: game.rightPlayer.paddle.y,
      score: game.rightPlayer.score,
    },
    opponent: {
      x: game.leftPlayer.paddle.x,
      y: game.leftPlayer.paddle.y,
      score: game.leftPlayer.score,
    },
    playerUserId: game.rightPlayer.id,
    playerUsername: game.rightPlayer.username,
    opponentUserId: game.leftPlayer.id,
    opponentUsername: game.leftPlayer.username,
    gameOver: game.state === "gameOver",
    countdown: game.countdown > 0 ? game.countdown : undefined,
  };

  const leftData = {
    ball: { x: game.ball.x, y: game.ball.y, dx: game.ball.dx, dy: game.ball.dy },
    player: {
      x: game.leftPlayer.paddle.x,
      y: game.leftPlayer.paddle.y,
      score: game.leftPlayer.score,
    },
    opponent: {
      x: game.rightPlayer.paddle.x,
      y: game.rightPlayer.paddle.y,
      score: game.rightPlayer.score,
    },
    playerUserId: game.leftPlayer.id,
    playerUsername: game.leftPlayer.username,
    opponentUserId: game.rightPlayer.id,
    opponentUsername: game.rightPlayer.username,
    gameOver: game.state === "gameOver",
    countdown: game.countdown > 0 ? game.countdown : undefined,
  };

  try {
    if (game.rightPlayer.socket.readyState === 1) { // 1 = OPEN
      game.rightPlayer.socket.send(
        JSON.stringify({ type: "state", state: rightData })
      );
    } else {
      console.log(`[Game ${gameId}] Right player socket not ready (state: ${game.rightPlayer.socket.readyState})`);
    }
  } catch (err: any) {
    console.log(
      `[Game ${gameId}] Failed to send to right player (${game.rightPlayer.id}):`,
      err?.message
    );
    console.log(`[Game ${gameId}] Ending game due to disconnected player`);
    endGame(gameId);
    return;
  }
  try {
    if (game.leftPlayer.socket.readyState === 1) { // 1 = OPEN
      game.leftPlayer.socket.send(
        JSON.stringify({ type: "state", state: leftData })
      );
    } else {
      console.log(`[Game ${gameId}] Left player socket not ready (state: ${game.leftPlayer.socket.readyState})`);
    }
  } catch (err: any) {
    console.log(
      `[Game ${gameId}] Failed to send to left player (${game.leftPlayer.id}):`,
      err?.message
    );
    console.log(`[Game ${gameId}] Ending game due to disconnected player`);
    endGame(gameId);
    return;
  }
}

function createGame(): string | null {
  if (playerWaitlist.length < 2) {
    return null;
  }
  const player1 = playerWaitlist.shift() as IPlayer;
  const player2 = playerWaitlist.shift() as IPlayer;

  // Assign left/right based on user IDs (lower ID = left, higher ID = right)
  // This ensures consistent paddle assignment regardless of connection order
  let leftPlayer: IPlayer;
  let rightPlayer: IPlayer;

  if (player1.id < player2.id) {
    leftPlayer = player1;
    rightPlayer = player2;
  } else {
    leftPlayer = player2;
    rightPlayer = player1;
  }

  console.log(
    `[Game] Assigning players: Left=${leftPlayer.username}(${leftPlayer.id}), Right=${rightPlayer.username}(${rightPlayer.id})`
  );

  const gameId = _createGameInternal(leftPlayer, rightPlayer);
  return gameId;
}

export function createGameWithPlayers(
  leftPlayer: IPlayer,
  rightPlayer: IPlayer
): string {
  return _createGameInternal(leftPlayer, rightPlayer);
}

function _createGameInternal(
  leftPlayer: IPlayer,
  rightPlayer: IPlayer
): string {
  const gameId = `game_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  // Ensure these specific players are not also lingering in the public waitlist
  try {
    const rm = (p: IPlayer) => {
      const idx = playerWaitlist.findIndex((x) => x === p || x.id === p.id);
      if (idx !== -1) playerWaitlist.splice(idx, 1);
    };
    rm(leftPlayer);
    rm(rightPlayer);
  } catch { }

  leftPlayer.paddle = new Paddle("left");
  rightPlayer.paddle = new Paddle("right");
  leftPlayer.score = 0;
  rightPlayer.score = 0;

  const newGame: IInternalState = {
    id: gameId,
    leftPlayer,
    rightPlayer,
    ball: new Ball(),
    state: "playing",
    countdown: 10, // 10 second countdown (10 to 1) + 1 second pause (0) before ball starts moving
    countdownTicks: 0, // Frame counter for countdown
  };
  games.set(gameId, newGame);
  playerToGame.set(leftPlayer.id, gameId);
  playerToGame.set(rightPlayer.id, gameId);
  // remember last opponent for rematch flow
  try {
    lastOpponentById.set(leftPlayer.id, rightPlayer.id);
  } catch { }
  try {
    lastOpponentById.set(rightPlayer.id, leftPlayer.id);
  } catch { }
  console.log(`[Game ${gameId}] created: leftPlayer.id=${leftPlayer.id} (${leftPlayer.username}), rightPlayer.id=${rightPlayer.id} (${rightPlayer.username})`);
  console.log(`[Game ${gameId}] playerToGame entries: ${leftPlayer.id}->${playerToGame.get(leftPlayer.id)}, ${rightPlayer.id}->${playerToGame.get(rightPlayer.id)}`);
  // Notify clients a new game has started (useful for rematch UI)
  try {
    leftPlayer.socket.send(JSON.stringify({ type: "gameStart" }));
  } catch { }
  try {
    rightPlayer.socket.send(JSON.stringify({ type: "gameStart" }));
  } catch { }

  // Start game loop immediately
  startGameLoop(gameId);

  // No need for firstServe logic - countdown replaces it
  return gameId;
}

export function handlePlayerInput(data: IPlayerInput, socket: any): void {
  let player = socketToPlayer.get(socket);
  if (!player) {
    console.log("unknown socket - total registered sockets:", socketToPlayer.size);
    console.log("input data:", data);
    console.log("socket object type:", typeof socket, "constructor:", socket?.constructor?.name);
    console.log("socketToPlayer entries:");
    for (const [sock, p] of socketToPlayer.entries()) {
      console.log(`  - userId ${p.id} (${p.username}), socket === input socket: ${sock === socket}, socket type: ${sock?.constructor?.name}`);
    }

    // Try to find player by userId from input data
    if (data.playerId) {
      const playerById = getPlayerById(data.playerId);
      if (playerById) {
        console.log(`  Found player by ID ${data.playerId}, updating socket mapping`);
        // Remove old socket mapping
        for (const [sock, p] of socketToPlayer.entries()) {
          if (p === playerById) {
            socketToPlayer.delete(sock);
            break;
          }
        }
        // Add new mapping
        playerById.socket = socket;
        socketToPlayer.set(socket, playerById);
        console.log(`  Updated socket mapping for player ${playerById.username}`);
        // Set player for continued processing
        player = playerById;
      } else {
        console.log(`  Player ${data.playerId} not found`);
        return;
      }
    } else {
      return;
    }
  }

  if (!player) {
    console.log("player is null after recovery attempt");
    return;
  }

  const gameId = playerToGame.get(player.id);
  if (!gameId) {
    return;
  }

  // Get the game and find the actual player object in the game
  // This is critical: the game's leftPlayer/rightPlayer may be different instances
  // than what's in socketToPlayer, so we need to use the game's instances
  const game = games.get(gameId);
  if (!game) {
    console.log(`player ${player.id} has gameId ${gameId} but game not found`);
    return;
  }

  // Find which player in the game this is (by ID) and use that paddle
  // Log the comparison to debug color-based issues
  console.log(`[Input] player.id=${player.id} (type: ${typeof player.id}), game.leftPlayer.id=${game.leftPlayer.id} (type: ${typeof game.leftPlayer.id}), game.rightPlayer.id=${game.rightPlayer.id} (type: ${typeof game.rightPlayer.id})`);

  let gamePlayer: IPlayer | null = null;
  if (game.leftPlayer.id === player.id) {
    gamePlayer = game.leftPlayer;
    console.log(`[Input] player ${player.id} matched as LEFT player`);
  } else if (game.rightPlayer.id === player.id) {
    gamePlayer = game.rightPlayer;
    console.log(`[Input] player ${player.id} matched as RIGHT player`);
  }

  if (!gamePlayer || !gamePlayer.paddle) {
    console.log(`[Input] player ${player.id} NOT FOUND in game! leftPlayer.id=${game.leftPlayer.id}, rightPlayer.id=${game.rightPlayer.id}`);
    return;
  }

  // Fix controls: in canvas, decreasing Y moves up; increasing Y moves down
  if (data.paddleUp === true) {
    gamePlayer.paddle.dy = -GAME_CONFIG.paddleSpeed;
  } else if (data.paddleDown === true) {
    gamePlayer.paddle.dy = GAME_CONFIG.paddleSpeed;
  } else if (data.paddleDown === false && data.paddleUp === false) {
    gamePlayer.paddle.dy = 0;
  }
}

export function startGame(): void {
  const gameId = createGame();
  if (gameId) {
    console.log("starting game loop");
  } else {
    console.log("game cannot be created");
  }
}

export function addNewClient(
  socket: any,
  userId: number,
  username: string
): void {
  // Check if player already exists (by userId) and remove old socket mapping
  let existingPlayer: IPlayer | undefined;
  const socketsToDelete: any[] = [];

  for (const [sock, player] of socketToPlayer.entries()) {
    if (player.id === userId) {
      existingPlayer = player;
      socketsToDelete.push(sock);
    }
  }

  // Clean up old socket mappings
  for (const sock of socketsToDelete) {
    socketToPlayer.delete(sock);
  }

  let playerInstance: IPlayer;

  if (existingPlayer) {
    // Check if player's game still exists
    const gameId = playerToGame.get(existingPlayer.id);
    if (gameId && !games.has(gameId)) {
      // Game was ended but player mapping wasn't cleaned
      console.log(`Cleaning up stale game mapping for player ${userId}`);
      playerToGame.delete(existingPlayer.id);
    }

    // Update existing player with new socket
    existingPlayer.socket = socket;
    playerInstance = existingPlayer;
    console.log(`Client reconnected: ${username} (ID: ${userId})`);

    // If player is in an active game, update the game's reference too
    if (gameId && games.has(gameId)) {
      console.log(`Player ${userId} reconnected to active game ${gameId}`);
      const game = games.get(gameId);
      if (game) {
        // Update socket reference in the game's player objects
        // Important: Update the actual object in the game, not a copy
        if (game.leftPlayer === existingPlayer) {
          console.log(`Updated leftPlayer socket for game ${gameId}`);
        } else if (game.rightPlayer === existingPlayer) {
          console.log(`Updated rightPlayer socket for game ${gameId}`);
        }
      }
    }
  } else {
    // Create new player
    playerInstance = {
      id: userId,
      username,
      socket,
      paddle: null,
      score: 0,
    };
    playerWaitlist.push(playerInstance);
    console.log(
      `Client connected: ${username} (ID: ${userId}). Total clients:`,
      playerWaitlist.length
    );
  }

  // Update socketToPlayer mapping with the player instance
  socketToPlayer.set(socket, playerInstance);

  // Check if this player was disconnected and is now reconnecting
  const disconnectInfo = disconnectedPlayers.get(playerInstance.id);
  if (disconnectInfo) {
    console.log(`[Game] Player ${playerInstance.id} reconnected within grace period`);
    clearTimeout(disconnectInfo.timeout);
    disconnectedPlayers.delete(playerInstance.id);

    // Resume the game if it was paused
    const game = games.get(disconnectInfo.gameId);
    if (game && game.state === "paused") {
      game.state = "playing";
      // Notify both players game is resumed
      try {
        game.leftPlayer.socket.send(JSON.stringify({
          type: "pauseUpdate",
          paused: false,
          message: "Opponent reconnected"
        }));
      } catch { }
      try {
        game.rightPlayer.socket.send(JSON.stringify({
          type: "pauseUpdate",
          paused: false,
          message: "Opponent reconnected"
        }));
      } catch { }
    }
  }
}

/**
 * Handle immediate forfeit when grace period expires
 */
function handleDisconnectForfeit(playerId: number): void {
  const disconnectInfo = disconnectedPlayers.get(playerId);
  if (!disconnectInfo) return;

  const { player, gameId } = disconnectInfo;
  disconnectedPlayers.delete(playerId);

  console.log(`[Game] Player ${playerId} grace period expired, forfeiting`);

  const game = games.get(gameId);
  if (game) {
    // Determine winner (opponent of disconnected player)
    const winner = game.leftPlayer.id === player.id ? game.rightPlayer : game.leftPlayer;
    const loser = player;

    const listeners = gameOverListeners.get(gameId) ?? [];
    for (const l of listeners) {
      try {
        l({
          gameId,
          leftPlayer: game.leftPlayer,
          rightPlayer: game.rightPlayer,
          leftScore: game.leftPlayer.score,
          rightScore: game.rightPlayer.score,
          winner,
          loser,
        });
      } catch (e) {
        console.error("Error in gameOver listener:", e);
      }
    }

    // Notify remaining player
    try {
      winner.socket.send(JSON.stringify({
        type: "opponentDisconnected",
        message: "Opponent disconnected - you win!"
      }));
    } catch { }

    endGame(gameId);
  }

  socketToPlayer.delete(player.socket);
  playerToGame.delete(player.id);
}

export function removeClient(socket: any): void {
  const removalIndex = playerWaitlist.findIndex(
    (item) => item.socket == socket
  );
  if (removalIndex !== -1) {
    playerWaitlist.splice(removalIndex, 1);
  }
  const player = socketToPlayer.get(socket);
  if (player) {
    const gameId = playerToGame.get(player.id);

    // Check if player is in a tournament - tournaments forfeit immediately (no grace period)
    for (const [tournamentId, tournament] of tournamentManager.tournaments) {
      const tournamentPlayer = tournament.getPlayerById(player.id);
      if (tournamentPlayer) {
        console.log(
          `[Game] Player ${player.id} disconnected from tournament ${tournamentId}`
        );
        // Forfeit the player if they're in an active match
        if (tournament.isPlayerInActiveMatch(player.id)) {
          tournament.forfeitPlayer(player.id, "disconnect");
        }
        socketToPlayer.delete(socket);
        playerToGame.delete(player.id);
        console.log("Client disconnected (tournament). Total clients:", playerWaitlist.length);
        return;
      }
    }

    // For casual games, use grace period
    if (gameId) {
      const game = games.get(gameId);
      if (game && game.state !== "gameOver") {
        console.log(`[Game] Player ${player.id} disconnected, starting ${DISCONNECT_GRACE_MS / 1000}s grace period`);

        // Pause the game
        game.state = "paused";

        // Notify opponent about disconnect and grace period
        const opponent = game.leftPlayer.id === player.id ? game.rightPlayer : game.leftPlayer;
        try {
          opponent.socket.send(JSON.stringify({
            type: "opponentDisconnecting",
            gracePeriodMs: DISCONNECT_GRACE_MS,
            message: `Opponent disconnected. Waiting ${DISCONNECT_GRACE_MS / 1000}s for reconnect...`
          }));
        } catch { }

        // Set up grace period timeout
        const timeout = setTimeout(() => {
          handleDisconnectForfeit(player.id);
        }, DISCONNECT_GRACE_MS);

        disconnectedPlayers.set(player.id, {
          player,
          gameId,
          timeout,
          disconnectedAt: Date.now()
        });

        // Remove socket mapping but keep player in game
        socketToPlayer.delete(socket);
        console.log("Client disconnected (grace period started). Total clients:", playerWaitlist.length);
        return;
      }
    }

    // No active game or game already over - clean up immediately
    socketToPlayer.delete(socket);
    playerToGame.delete(player.id);
  }
  console.log("Client disconnected. Total clients:", playerWaitlist.length);
}

export async function logResults(game: IInternalState) {
  try {
    console.log("Entered simulateMatchInsert ");
    const matchScore = {
      player1_id: game.leftPlayer.id,
      player2_id: game.rightPlayer.id,
      player1_username: game.leftPlayer.username,
      player2_username: game.rightPlayer.username,
      player1_score: game.leftPlayer.score,
      player2_score: game.rightPlayer.score,
      match_type: "online",
    };

    try {
      console.log(matchScore);
      const response = await fetch("http://user-service:5100/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(matchScore),
      });

      const data = await response.json();

      console.log("➡️ Sent:", matchScore);
      console.log(`⬅️ ${response.status}:`, data);
    } catch (err) {
      console.error("❌ Failed to call user_management service:", err);
    }
  } catch (err) {
    console.error("Failed to check username:", err);
    return;
  }
}
