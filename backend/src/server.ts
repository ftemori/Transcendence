import "dotenv/config";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import jwt from "jsonwebtoken";
import { IPlayerInput } from "../../shared_types/types.js";

// Helper to safely send WebSocket messages
function safeSend(socket: any, data: object): boolean {
  try {
    if (socket && socket.readyState === 1) {
      // 1 = OPEN
      socket.send(JSON.stringify(data));
      return true;
    }
  } catch (e) {
    console.error("[WS] safeSend error:", e);
  }
  return false;
}
import { initBlockchain, getAllTournaments, getContractAddress } from "./blockchain.js";
import {
  addNewClient,
  createGameWithPlayers,
  getPlayerById,
  getPlayerBySocket,
  handlePlayerInput,
  isPlayerInGame,
  removeClient,
  requestRematchBySocket,
  setGamePausedBySocket,
  startGame,
} from "./game.js";
import { tournamentManager } from "./tournament.js";

const fastify = Fastify();

// CORS configuration
await fastify.register(cors, {
  origin: (origin, cb) => {
    // Allow requests with no origin (e.g., mobile apps, curl)
    if (!origin) {
      cb(null, true);
      return;
    }

    // List of allowed origins
    const allowedOrigins = [
      "http://localhost:8080",
      "http://127.0.0.1:8080",
      "https://localhost:8080",
      "https://127.0.0.1:8080",
      "http://pong.042067.xyz",
      "https://pong.042067.xyz",
    ];

    // Check if origin matches allowed list OR is a local network IP (HTTP or HTTPS)
    const isLocalNetwork =
      /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+):8080$/.test(
        origin
      );

    if (allowedOrigins.includes(origin) || isLocalNetwork) {
      cb(null, true);
    } else {
      cb(new Error("Not allowed by CORS"), false);
    }
  },
  credentials: true,
});

fastify.register(cookie);
fastify.register(websocket);

initBlockchain();

// JWT verification helper
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_here";

interface JWTPayload {
  id: number;
  username: string;
}

// Register WebSocket route
fastify.register(async (fastify: any) => {
  fastify.get("/game", { websocket: true }, (socket: any, req: any) => {
    console.log("[WS] client connected");

    // Extract and verify JWT from cookie
    const token = req.cookies?.token;
    if (!token) {
      console.log("[WS] No auth token, closing connection");
      socket.close(1008, "Authentication required");
      return;
    }

    let userId: number;
    let username: string;
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      userId = decoded.id;
      username = decoded.username;
      console.log(`[WS] Authenticated user: ${username} (ID: ${userId})`);
    } catch (err) {
      console.log("[WS] Invalid token, closing connection");
      socket.close(1008, "Invalid authentication token");
      return;
    }

    // Add authenticated user to the game with their real user ID
    addNewClient(socket, userId, username);

    socket.on("message", async (message: string) => {
      try {
        const data: any = JSON.parse(message as any);
        console.log("[WS] received", data);
        if (data.type === "input") {
          handlePlayerInput(data, socket);
        } else if (data.type === "startGame") {
          console.log("[WS] startGame request, lobbyKey:", data.lobbyKey);
          // Check if user can start game (must be challenger and opponent must be ready)
          const player = getPlayerBySocket(socket);
          console.log(
            "[WS] player from socket:",
            player ? player.username : "NULL"
          );
          if (player && data.lobbyKey) {
            // Fetch lobby info from user-service to verify role and ready state
            // Use the authenticated userId from the WebSocket connection
            try {
              console.log("[WS] Fetching lobby info for user:", userId);
              const lobbyResp = await fetch(
                `http://user-service:5100/online/lobby-info?lobbyKey=${encodeURIComponent(
                  data.lobbyKey
                )}&userId=${userId}`
              );
              console.log("[WS] Lobby info response status:", lobbyResp.status);
              if (lobbyResp.ok) {
                const lobbyInfo = await lobbyResp.json();
                console.log("[WS] Lobby info:", lobbyInfo);

                // Parse lobby key to get player IDs
                const lobbyParts = data.lobbyKey.split("-");
                if (lobbyParts.length === 2) {
                  const player1Id = parseInt(lobbyParts[0]);
                  const player2Id = parseInt(lobbyParts[1]);

                  // Get current player from socket (guaranteed to be correct)
                  const currentPlayer = getPlayerBySocket(socket);
                  if (!currentPlayer) {
                    console.log("[WS] Current player not found in socket map");
                    return;
                  }

                  // Find opponent player
                  const opponentId =
                    currentPlayer.id === player1Id ? player2Id : player1Id;
                  const opponentPlayer = getPlayerById(opponentId);

                  if (!opponentPlayer) {
                    console.log("[WS] Opponent not found:", opponentId);
                    safeSend(socket, {
                      type: "error",
                      message: "Opponent not connected",
                    });
                    return;
                  }

                  // Check if players are already in a game
                  if (
                    isPlayerInGame(currentPlayer) ||
                    isPlayerInGame(opponentPlayer)
                  ) {
                    console.log(
                      "[WS] Players already in game, ignoring duplicate startGame"
                    );
                    return;
                  }

                  // Determine left/right based on user IDs
                  let leftPlayer: any, rightPlayer: any;
                  if (player1Id < player2Id) {
                    leftPlayer =
                      currentPlayer.id === player1Id
                        ? currentPlayer
                        : opponentPlayer;
                    rightPlayer =
                      currentPlayer.id === player2Id
                        ? currentPlayer
                        : opponentPlayer;
                  } else {
                    leftPlayer =
                      currentPlayer.id === player2Id
                        ? currentPlayer
                        : opponentPlayer;
                    rightPlayer =
                      currentPlayer.id === player1Id
                        ? currentPlayer
                        : opponentPlayer;
                  }

                  console.log(
                    "[WS] Both players connected, starting game between",
                    leftPlayer.username,
                    "and",
                    rightPlayer.username
                  );
                  createGameWithPlayers(leftPlayer, rightPlayer);
                } else {
                  console.log("[WS] Invalid lobby key format:", data.lobbyKey);
                  safeSend(socket, {
                    type: "error",
                    message: "Invalid lobby key",
                  });
                }
              } else {
                console.log("[WS] Lobby info fetch failed");
                safeSend(socket, {
                  type: "error",
                  message: "Failed to fetch lobby info",
                });
              }
            } catch (err) {
              console.log("[WS] Lobby info fetch error:", err);
              safeSend(socket, {
                type: "error",
                message: "Error fetching lobby info",
              });
            }
          } else {
            console.log("[WS] No lobby key provided");
            safeSend(socket, {
              type: "error",
              message: "No lobby key provided",
            });
          }
        } else if (data.type === "requestRematch") {
          console.log("[WS] requestRematch");
          try {
            requestRematchBySocket(socket);
          } catch (e) {
            console.error("rematch err", e);
          }
        } else if (data.type === "pauseGame") {
          console.log("[WS] pauseGame request");
          setGamePausedBySocket(socket, true);
        } else if (data.type === "resumeGame") {
          console.log("[WS] resumeGame request");
          setGamePausedBySocket(socket, false);
        } else if (data.type === "createTournament") {
          console.log("[Tournament] create request");
          const t = tournamentManager.createTournament(socket);
          if (t) {
            console.log(`[Tournament ${t.id}] created`);
            safeSend(socket, {
              type: "tournamentUpdate",
              tournamentId: t.id,
              status: t.status,
              message: "Tournament created. Share ID to let others join.",
            });
          } else {
            safeSend(socket, {
              type: "error",
              message: "Failed to create tournament",
            });
          }
        } else if (data.type === "joinTournament" && data.tournamentId) {
          console.log(`[Tournament ${data.tournamentId}] join request`);
          const ok = tournamentManager.joinTournament(
            data.tournamentId,
            socket
          );
          console.log(`[Tournament ${data.tournamentId}] join result ok=${ok}`);
          safeSend(socket, {
            type: "tournamentUpdate",
            tournamentId: data.tournamentId,
            status: ok ? "starting" : "created",
            message: ok ? "Joined tournament." : "Join failed.",
          });
        } else if (
          data.type === "setTournamentReady" &&
          data.tournamentId !== undefined
        ) {
          console.log(
            `[Tournament ${data.tournamentId}] ready request from ${userId}, ready=${data.ready}`
          );
          const ok = tournamentManager.setPlayerReady(
            data.tournamentId,
            socket,
            data.ready
          );
          if (!ok) {
            safeSend(socket, {
              type: "tournamentUpdate",
              tournamentId: data.tournamentId,
              status: "error",
              message: "Failed to set ready status.",
            });
          }
        } else if (
          data.type === "rejoinTournament" &&
          data.tournamentId !== undefined
        ) {
          console.log(
            `[Tournament ${data.tournamentId}] rejoin request from ${userId}`
          );
          const ok = tournamentManager.rejoinTournament(
            data.tournamentId,
            socket
          );
          if (!ok) {
            safeSend(socket, {
              type: "tournamentUpdate",
              tournamentId: data.tournamentId,
              status: "error",
              message: "Failed to rejoin tournament.",
            });
          }
        } else if (
          data.type === "leaveTournament" &&
          data.tournamentId !== undefined
        ) {
          console.log(
            `[Tournament ${data.tournamentId}] leave request from ${userId}`
          );
          const ok = tournamentManager.leaveTournament(
            data.tournamentId,
            socket
          );
          safeSend(socket, {
            type: "tournamentUpdate",
            tournamentId: data.tournamentId,
            status: ok ? "left" : "error",
            message: ok
              ? "Left tournament successfully."
              : "Failed to leave tournament.",
          });
        } else if (
          data.type === "chatMessage" &&
          data.recipientId &&
          data.message
        ) {
          console.log(
            `[Chat] ${userId} -> ${data.recipientId}: ${data.message}`
          );
          const sender = getPlayerBySocket(socket);
          const recipient = getPlayerById(data.recipientId);
          if (sender && recipient && recipient.socket) {
            safeSend(recipient.socket, {
              type: "chatMessage",
              senderId: userId,
              senderUsername: username,
              message: data.message,
              timestamp: Date.now(),
            });
          }
        }
      } catch (error) {
        console.error("[WS] ERROR parsing message as JSON:", error);
      }
    });

    socket.on("close", () => {
      console.log("[WS] client disconnected");
      removeClient(socket);
    });
  });

  fastify.get("/", (_req: any, rep: any) => {
    rep.send("Pong Game Server Running!");
  });
});

// Public API endpoint to get all tournament results from blockchain
fastify.get("/api/tournaments", async (_req: any, rep: any) => {
  try {
    const tournaments = await getAllTournaments();
    const contractAddress = getContractAddress();

    // Enrich tournament data with winner usernames
    const enrichedTournaments = await Promise.all(
      tournaments.map(async (t) => {
        let winnerUsername = `User #${t.winnerId}`;
        try {
          const resp = await fetch(`http://auth-service:4000/users/${t.winnerId}`);
          if (resp.ok) {
            const data = await resp.json();
            winnerUsername = data.username || winnerUsername;
          }
        } catch { }
        return {
          ...t,
          winnerUsername,
          date: new Date(t.timestamp * 1000).toISOString(),
        };
      })
    );

    return rep.send({
      success: true,
      contractAddress,
      tournaments: enrichedTournaments,
    });
  } catch (e) {
    console.error("[API] /api/tournaments failed", e);
    return rep.status(500).send({ success: false, error: "Failed to fetch tournaments" });
  }
});

// Start server
fastify.listen({ port: 3000, host: "0.0.0.0" }, (err: any, address: any) => {
  if (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
  console.log("Pong server running on", address);
});
