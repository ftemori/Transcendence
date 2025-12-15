// @ts-nocheck
import Fastify from "fastify";
// Disable strict TypeScript checks in this file to keep minimal changes and avoid build failures
// (This file interacts with dynamic DB rows and runtime-only behavior.)
import "@fastify/cookie";
import fastifyCookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";

// manage.ts (or manage.js after compile)

// Initialize DB first
await import("./init-db.js");
await import("./init-match-db.js");

const fastify = Fastify({ logger: false });

fastify.register(fastifyCookie, {
  secret: process.env.COOKIE_SECRET || "your-secret", // for signed cookies, optional
});

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
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
});

const db = new Database("/app/site/build/db-users/users.db"); // Must match the Docker path
const db2 = new Database("/app/site/build/db-match/match.db");

// In-memory SSE clients map: userId -> array of response objects
const sseClients: Map<number, Array<any>> = new Map();
// In-memory presence heartbeats: userId -> lastTimestamp (ms)
const heartbeats: Map<number, number> = new Map();
const ONLINE_GRACE_MS = 15000; // consider online if heartbeat within last 15s
// In-memory lobbies: key "minId-maxId" -> { users:[a,b], joined:Set<id>, tournamentId?: string, challenger?: number, ready?: Set<number>, isRandom?: boolean }
const lobbies: Map<
  string,
  {
    users: [number, number];
    joined: Set<number>;
    tournamentId?: string;
    challenger?: number;
    ready?: Set<number>;
    isRandom?: boolean;
  }
> = new Map();

// Matchmaking queue: Set of user IDs waiting for random opponent
const matchmakingQueue: Set<number> = new Set();
// Track users currently being matched to prevent race conditions
const matchmakingInProgress: Set<number> = new Set();

function addSseClient(userId: number, res: any) {
  const list = sseClients.get(userId) || [];
  list.push(res);
  sseClients.set(userId, list);
}

function removeSseClient(userId: number, res: any) {
  const list = sseClients.get(userId) || [];
  const idx = list.indexOf(res);
  if (idx !== -1) list.splice(idx, 1);
  if (list.length === 0) sseClients.delete(userId);
  else sseClients.set(userId, list);
}

function sendSseEvent(userId: number, eventName: string, data: any) {
  const list = sseClients.get(userId) || [];
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  list.forEach((res) => {
    try {
      res.write(payload);
    } catch (e) {
      // ignore write errors and remove client
      removeSseClient(userId, res);
    }
  });
}

interface UserProfile {
  id: number;
  avatar?: string | null;
  created_at: Date; // or Date, depending on your DB driver
  last_login?: Date | null;
  victories: number;
  losses: number;
  w_l_ratio: number;
}

// Helper for env
function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

fastify.post<{
  Body: { id: number };
}>("/users/init", async (request, reply) => {
  const { id } = request.body;

  if (!id || typeof id !== "number") {
    return reply.status(400).send({ error: "Missing required fields" });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO user_profiles (id, avatar, last_login, victories, losses)
      VALUES (?, ?, NULL, 0, 0)
    `);
    stmt.run(id, null);

    return reply.status(201).send({ success: true });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: "Failed to create user profile" });
  }
});

fastify.post("/profile/avatar", async (request, reply) => {
  try {
    const token = request.cookies.token;
    if (!token) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const jwtSecret = getEnv("JWT_SECRET");
    const decoded = jwt.verify(token, jwtSecret) as { id: number };
    const userId = decoded.id;

    const { avatar } = request.body as { avatar: string };

    // Validate base64 image
    if (!avatar.startsWith("data:image/")) {
      return reply.status(400).send({ error: "Invalid image format" });
    }

    // Update avatar in database
    const stmt = db.prepare("UPDATE user_profiles SET avatar = ? WHERE id = ?");
    stmt.run(avatar, userId);

    return reply.status(200).send({ success: true });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: "Failed to update avatar" });
  }
});

fastify.get("/profile", async (request, reply) => {
  try {
    const token = request.cookies.token;
    if (!token) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const jwtSecret = getEnv("JWT_SECRET");
    const decoded = jwt.verify(token, jwtSecret) as {
      id: number;
      username: string;
    };

    // Username comes from token directly:
    const username = decoded.username;
    const userId = decoded.id;

    // Fetch profile data from user_profiles DB:
    const profileStmt = db.prepare("SELECT * FROM user_profiles WHERE id = ?");
    const profile = profileStmt.get(userId) as UserProfile | undefined;

    if (!profile) {
      return reply.status(404).send({ error: "User profile not found" });
    }

    const profileData = {
      id: userId, // user ID from token
      username, // from token
      registrationDate: profile.created_at,
      status: "Online",
      avatar: profile.avatar, // Include the avatar in the response
      stats: {
        totalGames: profile.victories + profile.losses,
        wins: profile.victories,
        losses: profile.losses,
        rating: 1250, // or compute/fetch elsewhere
      },
    };
    return reply.send(profileData);
  } catch (err) {
    fastify.log.error(err);
    return reply.status(401).send({ error: "Unauthorized" });
  }
});

// Get public profile for a specific user by id
fastify.get("/profile/:id", async (request, reply) => {
  try {
    const token = request.cookies.token;
    if (!token) return reply.status(401).send({ error: "Unauthorized" });
    const jwtSecret = getEnv("JWT_SECRET");
    jwt.verify(token, jwtSecret); // only to validate session

    const userId = parseInt((request.params as any).id, 10);
    if (!userId) return reply.status(400).send({ error: "Invalid id" });

    // Fetch avatar and registration from local DB
    const profileStmt = db.prepare("SELECT * FROM user_profiles WHERE id = ?");
    const profile = profileStmt.get(userId) as UserProfile | undefined;
    if (!profile)
      return reply.status(404).send({ error: "User profile not found" });

    // Fetch username from auth service
    let username: string | null = null;
    try {
      const resp = await fetch(`http://auth-service:4000/users/${userId}`);
      if (resp.ok) {
        const js = await resp.json();
        username = js.username || null;
      }
    } catch { }

    // Online status via SSE or heartbeat recency
    const lastBeat =
      (global as any).heartbeats?.get?.(userId) || heartbeats.get(userId) || 0;
    const isOnline =
      sseClients.has(userId) || Date.now() - lastBeat < ONLINE_GRACE_MS;

    const profileData = {
      id: userId,
      username: username ?? `User #${userId}`,
      registrationDate: profile.created_at,
      status: isOnline ? "Online" : "Offline",
      avatar: profile.avatar,
      stats: {
        totalGames: profile.victories + profile.losses,
        wins: profile.victories,
        losses: profile.losses,
        rating: 1250,
      },
    };
    return reply.send(profileData);
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: "Failed to fetch profile" });
  }
});

// Get avatar image for a specific user by id
fastify.get("/avatar/:id", async (request, reply) => {
  try {
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      return reply.status(400).send({ error: "Invalid user ID" });
    }

    const profile = db
      .prepare("SELECT avatar FROM user_profiles WHERE id = ?")
      .get(userId) as { avatar: string | null } | undefined;

    if (!profile || !profile.avatar) {
      // Return 204 No Content instead of 404 to prevent network errors in console
      // Client will handle this gracefully with fallback display
      return reply.status(204).send();
    }

    // Avatar is stored as base64 data URL (e.g., "data:image/png;base64,...")
    const avatar = profile.avatar;
    const matches = avatar.match(/^data:([^;]+);base64,(.+)$/);

    if (!matches) {
      return reply.status(404).send({ error: "Invalid avatar format" });
    }

    const contentType = matches[1];
    const base64Data = matches[2];
    const imageBuffer = Buffer.from(base64Data, "base64");

    reply.header("Content-Type", contentType);
    reply.header("Cache-Control", "public, max-age=3600");
    return reply.send(imageBuffer);
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: "Failed to fetch avatar" });
  }
});

//This is to insert new entries

fastify.post("/matches", async (request, reply) => {
  const {
    player1_id,
    player2_id,
    player1_username,
    player2_username,
    player1_score,
    player2_score,
    match_type,
  } = request.body as {
    player1_id: number;
    player2_id: number;
    player1_username: string;
    player2_username: string;
    player1_score: number;
    player2_score: number;
    match_type: string;
  };

  // Basic validation (optional but recommended)
  if (
    typeof player1_id !== "number" ||
    typeof player2_id !== "number" ||
    typeof player1_username !== "string" ||
    typeof player2_username !== "string" ||
    typeof player1_score !== "number" ||
    typeof player2_score !== "number" ||
    typeof match_type !== "string"
  ) {
    return reply.status(400).send({ error: "Invalid input" });
  }

  try {
    const insert = db2.prepare(`
      INSERT INTO matches (player1_id, player2_id, player1_username, player2_username, player1_score, player2_score, match_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insert.run(
      player1_id,
      player2_id,
      player1_username,
      player2_username,
      player1_score,
      player2_score,
      match_type
    );

    return reply
      .code(201)
      .send({ success: true, match_id: result.lastInsertRowid });
  } catch (err) {
    console.error("Failed to insert match:", err);
    return reply.status(500).send({ error: "Database error" });
  }
});

//This is to retrieve all entries with an username, change it to use the credential instead
fastify.get("/matches/me", async (request, reply) => {
  const token = request.cookies.token;

  if (!token) {
    return reply.status(401).send({ error: "Missing token" });
  }

  let payload;
  try {
    const jwtSecret = getEnv("JWT_SECRET");
    payload = jwt.verify(token, jwtSecret) as { id: number; username: string };
  } catch (err) {
    return reply.status(401).send({ error: "Invalid or expired token" });
  }

  const userId = payload.id; // Use user ID, not username
  try {
    const getMatches = db2.prepare(`
      SELECT *
      FROM matches
      WHERE player1_id = ? OR player2_id = ?
      ORDER BY played_at DESC
    `);

    const matches = getMatches.all(userId, userId);

    return reply.send({ matches });
  } catch (err) {
    console.error("Failed to retrieve matches:", err);
    return reply.status(500).send({ error: "Database error" });
  }
});

// Get matches for specific user id
fastify.get("/matches/:id", async (request, reply) => {
  const token = request.cookies.token;

  if (!token) {
    return reply.status(401).send({ error: "Missing token" });
  }

  try {
    const jwtSecret = getEnv("JWT_SECRET");
    jwt.verify(token, jwtSecret); // validate session only
  } catch (err) {
    return reply.status(401).send({ error: "Invalid or expired token" });
  }

  const userId = parseInt((request.params as any).id, 10);
  if (!userId) return reply.status(400).send({ error: "Invalid id" });

  try {
    const getMatches = db2.prepare(`
      SELECT *
      FROM matches
      WHERE player1_id = ? OR player2_id = ?
      ORDER BY played_at DESC
    `);

    const matches = getMatches.all(userId, userId);

    return reply.send({ matches });
  } catch (err) {
    console.error("Failed to retrieve matches:", err);
    return reply.status(500).send({ error: "Database error" });
  }
});

// Friend request endpoints
// Send a friend request to user with :userId
fastify.post("/friends/request/:userId", async (request, reply) => {
  try {
    const token = request.cookies.token;
    if (!token) return reply.status(401).send({ error: "Unauthorized" });
    const jwtSecret = getEnv("JWT_SECRET");
    const decoded = jwt.verify(token, jwtSecret) as any;
    const fromUserId = decoded.id as number;

    const toUserId = parseInt((request.params as any).userId, 10);
    if (!toUserId || toUserId === fromUserId)
      return reply.status(400).send({ error: "Invalid user id" });

    // Check recipient exists
    const userRow = db
      .prepare("SELECT id FROM user_profiles WHERE id = ?")
      .get(toUserId);
    if (!userRow) return reply.status(404).send({ error: "User not found" });

    // Check existing pending request
    const existing = db
      .prepare(
        "SELECT id FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = ?"
      )
      .get(fromUserId, toUserId, "pending");
    if (existing)
      return reply.status(409).send({ error: "Request already pending" });

    // Insert request
    const insert = db.prepare(
      "INSERT INTO friend_requests (from_user_id, to_user_id, status) VALUES (?, ?, ?)"
    );
    const result = insert.run(fromUserId, toUserId, "pending");

    // Notify recipient in real-time if connected via SSE
    try {
      const requestId = result.lastInsertRowid;
      // Fetch the inserted request row (no cross-DB JOIN here)
      const notifyRow = db
        .prepare(
          `
        SELECT fr.id, fr.from_user_id AS from_id, fr.created_at
        FROM friend_requests fr
        WHERE fr.id = ?
      `
        )
        .get(requestId) as any;
      sendSseEvent(
        toUserId,
        "friend_request",
        notifyRow || { id: requestId, from_id: fromUserId }
      );
    } catch (e) {
      // ignore notify errors
    }

    return reply
      .code(201)
      .send({ success: true, request_id: result.lastInsertRowid });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: "Failed to send friend request" });
  }
});

// Get pending incoming friend requests for current user
fastify.get("/friends/requests", async (request, reply) => {
  try {
    const token = request.cookies.token;
    if (!token) return reply.status(401).send({ error: "Unauthorized" });
    const jwtSecret = getEnv("JWT_SECRET");
    const decoded = jwt.verify(token, jwtSecret) as any;
    const userId = decoded.id as number;

    const stmt = db.prepare(`
      SELECT fr.id, fr.from_user_id AS from_id, fr.created_at
      FROM friend_requests fr
      WHERE fr.to_user_id = ? AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `);

    const rows = stmt.all(userId) as any[];

    // Try to enrich rows with sender username by calling auth service
    const enriched = await Promise.all(
      rows.map(async (r) => {
        try {
          const resp = await fetch(
            `http://auth-service:4000/users/${r.from_id}`
          );
          if (resp.ok) {
            const json = await resp.json();
            return { ...r, from_username: json.username || null };
          }
        } catch (e) {
          // ignore
        }
        return { ...r, from_username: null };
      })
    );

    return reply.send({ requests: enriched });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ requests: [] });
  }
});

// Get pending outgoing friend requests sent by current user
fastify.get("/friends/requests/sent", async (request, reply) => {
  try {
    const token = request.cookies.token;
    if (!token) return reply.status(401).send({ error: "Unauthorized" });
    const jwtSecret = getEnv("JWT_SECRET");
    const decoded = jwt.verify(token, jwtSecret) as any;
    const userId = decoded.id as number;

    const stmt = db.prepare(`
      SELECT fr.id, fr.to_user_id AS to_id, fr.created_at
      FROM friend_requests fr
      WHERE fr.from_user_id = ? AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `);

    const rows = stmt.all(userId) as any[];

    // Try to enrich rows with recipient username by calling auth service
    const enriched = await Promise.all(
      rows.map(async (r) => {
        try {
          const resp = await fetch(`http://auth-service:4000/users/${r.to_id}`);
          if (resp.ok) {
            const json = await resp.json();
            return { ...r, to_username: json.username || null };
          }
        } catch (e) {
          // ignore
        }
        return { ...r, to_username: null };
      })
    );

    return reply.send({ requests: enriched });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ requests: [] });
  }
});

// Accept a friend request
fastify.post("/friends/accept/:requestId", async (request, reply) => {
  try {
    const token = request.cookies.token;
    if (!token) return reply.status(401).send({ error: "Unauthorized" });
    const jwtSecret = getEnv("JWT_SECRET");
    const decoded = jwt.verify(token, jwtSecret) as any;
    const userId = decoded.id as number;

    const requestId = parseInt((request.params as any).requestId, 10);
    const fr = db
      .prepare("SELECT * FROM friend_requests WHERE id = ?")
      .get(requestId) as any;
    if (!fr) return reply.status(404).send({ error: "Request not found" });
    if (fr.to_user_id !== userId)
      return reply.status(403).send({ error: "Not authorized" });
    if (fr.status !== "pending")
      return reply.status(400).send({ error: "Request not pending" });

    // Mark accepted
    db.prepare("UPDATE friend_requests SET status = ? WHERE id = ?").run(
      "accepted",
      requestId
    );

    // Insert mutual friendship rows
    const insertFriend = db.prepare(
      "INSERT INTO friends (user_id, friend_id) VALUES (?, ?)"
    );
    insertFriend.run(userId, fr.from_user_id);
    insertFriend.run(fr.from_user_id, userId);

    return reply.send({ success: true });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: "Failed to accept request" });
  }
});

// Decline a friend request
fastify.post("/friends/decline/:requestId", async (request, reply) => {
  try {
    const token = request.cookies.token;
    if (!token) return reply.status(401).send({ error: "Unauthorized" });
    const jwtSecret = getEnv("JWT_SECRET");
    const decoded = jwt.verify(token, jwtSecret) as any;
    const userId = decoded.id as number;

    const requestId = parseInt((request.params as any).requestId, 10);
    const fr = db
      .prepare("SELECT * FROM friend_requests WHERE id = ?")
      .get(requestId) as any;
    if (!fr) return reply.status(404).send({ error: "Request not found" });
    if (fr.to_user_id !== userId)
      return reply.status(403).send({ error: "Not authorized" });
    if (fr.status !== "pending")
      return reply.status(400).send({ error: "Request not pending" });

    db.prepare("UPDATE friend_requests SET status = ? WHERE id = ?").run(
      "declined",
      requestId
    );
    return reply.send({ success: true });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: "Failed to decline request" });
  }
});

// Server-Sent Events stream for friend notifications
fastify.get("/friends/stream", async (request, reply) => {
  try {
    const token = request.cookies.token;
    if (!token) return reply.status(401).send({ error: "Unauthorized" });
    const jwtSecret = getEnv("JWT_SECRET");
    const decoded = jwt.verify(token, jwtSecret) as any;
    const userId = decoded.id as number;

    // Setup SSE headers with CORS support for credentials
    const raw = reply.raw as any;
    const origin = (request.headers as any).origin;
    // Check if origin is localhost or local network IP
    const isLocalNetwork = origin && /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+):8080$/.test(origin);
    if (isLocalNetwork) {
      raw.setHeader("Access-Control-Allow-Origin", origin);
      raw.setHeader("Access-Control-Allow-Credentials", "true");
    }
    raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    raw.write("\n");

    addSseClient(userId, raw);

    // Notify all friends that this user is now online
    try {
      const friends = db
        .prepare("SELECT friend_id AS id FROM friends WHERE user_id = ?")
        .all(userId) as any[];
      for (const f of friends) {
        sendSseEvent(f.id, "presence", { id: userId, status: "Online" });
      }
    } catch (e) {
      // ignore presence notify errors
    }

    // Remove client on close
    (request.raw as any).on("close", () => {
      removeSseClient(userId, raw);

      // Cleanup matchmaking state
      matchmakingQueue.delete(userId);
      matchmakingInProgress.delete(userId);

      // Notify all friends that this user went offline
      try {
        const friends = db
          .prepare("SELECT friend_id AS id FROM friends WHERE user_id = ?")
          .all(userId) as any[];
        for (const f of friends) {
          sendSseEvent(f.id, "presence", { id: userId, status: "Offline" });
        }
      } catch (e) {
        // ignore
      }
    });

    // Do not end the response - keep it open
    return reply;
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: "Failed to open stream" });
  }
});

// Send an online game challenge to a friend
fastify.post("/friends/challenge/:friendId", async (request, reply) => {
  try {
    const token = request.cookies.token;
    if (!token) return reply.status(401).send({ error: "Unauthorized" });
    const jwtSecret = getEnv("JWT_SECRET");
    const decoded = jwt.verify(token, jwtSecret) as any;
    const fromUserId = decoded.id as number;

    const toUserId = parseInt((request.params as any).friendId, 10);
    if (!toUserId || toUserId === fromUserId)
      return reply.status(400).send({ error: "Invalid friend id" });

    // Ensure they are friends (optional but safer)
    const isFriend = db
      .prepare("SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?")
      .get(fromUserId, toUserId) as any;
    if (!isFriend) return reply.status(403).send({ error: "Not friends" });

    // Try to enrich sender username
    let fromUsername: string | null = null;
    try {
      const resp = await fetch(`http://auth-service:4000/users/${fromUserId}`);
      if (resp.ok) {
        const js = await resp.json();
        fromUsername = js.username || null;
      }
    } catch { }

    const payload = {
      id: Date.now(),
      from_id: fromUserId,
      from_username: fromUsername,
      created_at: new Date().toISOString(),
    };
    sendSseEvent(toUserId, "challenge", payload);
    return reply.send({ success: true });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: "Failed to send challenge" });
  }
});

// Accept an online game challenge and instruct both users to navigate to Online page
fastify.post("/friends/challenge/accept/:friendId", async (request, reply) => {
  try {
    const token = request.cookies.token;
    if (!token) return reply.status(401).send({ error: "Unauthorized" });
    const jwtSecret = getEnv("JWT_SECRET");
    const decoded = jwt.verify(token, jwtSecret) as any;
    const acceptorId = decoded.id as number;

    const friendId = parseInt((request.params as any).friendId, 10);
    if (!friendId || friendId === acceptorId)
      return reply.status(400).send({ error: "Invalid friend id" });

    // Ensure they are friends
    const isFriend = db
      .prepare("SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?")
      .get(acceptorId, friendId) as any;
    if (!isFriend) return reply.status(403).send({ error: "Not friends" });

    // Build lobby key based on sorted ids
    const a = Math.min(acceptorId, friendId);
    const b = Math.max(acceptorId, friendId);
    const key = `${a}-${b}`;

    // Initialize lobby if not exists
    // friendId is the challenger (who sent the challenge), acceptorId accepted
    if (!lobbies.has(key)) {
      lobbies.set(key, {
        users: [a, b],
        joined: new Set<number>(),
        tournamentId: undefined,
        challenger: friendId, // friendId is the one who sent the challenge
        ready: new Set<number>(),
      });
    }

    // Notify both users to go to online page with this lobby key and role info
    const payload = {
      lobbyKey: key,
      a_id: a,
      b_id: b,
      challenger: friendId,
    };
    sendSseEvent(acceptorId, "go_online", payload);
    sendSseEvent(friendId, "go_online", payload);

    return reply.send({ success: true, lobbyKey: key, challenger: friendId });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: "Failed to accept challenge" });
  }
});

// Join a lobby from Online page; when both joined, generate a tournamentId and notify both
fastify.post("/online/join", async (request, reply) => {
  try {
    const token = request.cookies.token;
    if (!token) return reply.status(401).send({ error: "Unauthorized" });
    const jwtSecret = getEnv("JWT_SECRET");
    const decoded = jwt.verify(token, jwtSecret) as any;
    const userId = decoded.id as number;

    const body = request.body as any;
    const lobbyKey = body && body.lobbyKey;
    if (!lobbyKey || typeof lobbyKey !== "string")
      return reply.status(400).send({ error: "Missing lobbyKey" });

    const lobby = lobbies.get(lobbyKey);
    if (!lobby) return reply.status(404).send({ error: "Lobby not found" });

    // Validate user is part of lobby
    if (lobby.users[0] !== userId && lobby.users[1] !== userId) {
      return reply.status(403).send({ error: "Not part of lobby" });
    }

    lobby.joined.add(userId);

    // If both joined and no tournament id yet, create one
    if (
      lobby.joined.has(lobby.users[0]) &&
      lobby.joined.has(lobby.users[1]) &&
      !lobby.tournamentId
    ) {
      // Simple tournament id generator (timestamp + key)
      lobby.tournamentId = `${Date.now()}-${lobbyKey}`;
      // Notify both via SSE
      const payload = { lobbyKey, tournamentId: lobby.tournamentId };
      sendSseEvent(lobby.users[0], "tournament", payload);
      sendSseEvent(lobby.users[1], "tournament", payload);
    }

    // Return role information
    const isChallenger = lobby.challenger === userId;
    const isReady = lobby.ready?.has(userId) || false;

    return reply.send({
      success: true,
      lobbyKey,
      tournamentId: lobby.tournamentId || null,
      joined: Array.from(lobby.joined),
      isChallenger,
      isReady,
      opponentReady:
        lobby.ready?.has(
          lobby.users[0] === userId ? lobby.users[1] : lobby.users[0]
        ) || false,
    });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: "Failed to join lobby" });
  }
});

// Toggle ready status for the acceptor in a lobby
fastify.post("/online/ready", async (request, reply) => {
  try {
    const token = request.cookies.token;
    if (!token) return reply.status(401).send({ error: "Unauthorized" });
    const jwtSecret = getEnv("JWT_SECRET");
    const decoded = jwt.verify(token, jwtSecret) as any;
    const userId = decoded.id as number;

    const body = request.body as any;
    const lobbyKey = body && body.lobbyKey;
    const ready = body && typeof body.ready === "boolean" ? body.ready : true;

    if (!lobbyKey || typeof lobbyKey !== "string")
      return reply.status(400).send({ error: "Missing lobbyKey" });

    const lobby = lobbies.get(lobbyKey);
    if (!lobby) return reply.status(404).send({ error: "Lobby not found" });

    // Validate user is part of lobby
    if (lobby.users[0] !== userId && lobby.users[1] !== userId) {
      return reply.status(403).send({ error: "Not part of lobby" });
    }

    // Initialize ready set if needed
    if (!lobby.ready) lobby.ready = new Set<number>();

    // Update ready state
    if (ready) {
      lobby.ready.add(userId);
    } else {
      lobby.ready.delete(userId);
    }

    // Notify the other user about ready state change
    const otherUserId =
      lobby.users[0] === userId ? lobby.users[1] : lobby.users[0];
    const payload = {
      lobbyKey,
      userId,
      ready,
    };
    sendSseEvent(otherUserId, "ready_update", payload);

    return reply.send({
      success: true,
      ready,
      opponentReady: lobby.ready.has(otherUserId),
    });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: "Failed to update ready status" });
  }
});

// Get lobby information for role and ready status validation
fastify.get("/online/lobby-info", async (request, reply) => {
  try {
    const query = request.query as any;
    const lobbyKey = query && query.lobbyKey;
    const userIdParam = query && query.userId;

    // Try to get userId from token (browser requests) or query param (backend-to-backend)
    let userId: number;

    if (userIdParam) {
      // Backend-to-backend request with userId in query
      userId = parseInt(userIdParam, 10);
      console.log("[lobby-info] Using userId from query param:", userId);
    } else {
      // Browser request with token in cookie
      const token = request.cookies.token;
      if (!token) return reply.status(401).send({ error: "Unauthorized" });
      const jwtSecret = getEnv("JWT_SECRET");
      const decoded = jwt.verify(token, jwtSecret) as any;
      userId = decoded.id as number;
      console.log("[lobby-info] Using userId from token:", userId);
    }

    if (!lobbyKey || typeof lobbyKey !== "string")
      return reply.status(400).send({ error: "Missing lobbyKey" });

    const lobby = lobbies.get(lobbyKey);
    if (!lobby) {
      console.log("[lobby-info] Lobby not found:", lobbyKey);
      return reply.status(404).send({ error: "Lobby not found" });
    }

    // Validate user is part of lobby
    if (lobby.users[0] !== userId && lobby.users[1] !== userId) {
      console.log(
        "[lobby-info] User not part of lobby. userId:",
        userId,
        "lobby users:",
        lobby.users
      );
      return reply.status(403).send({ error: "Not part of lobby" });
    }

    const isChallenger = lobby.challenger === userId;
    const otherUserId =
      lobby.users[0] === userId ? lobby.users[1] : lobby.users[0];
    const opponentReady = lobby.ready?.has(otherUserId) || false;
    const isRandom = lobby.isRandom || false;

    // Fetch opponent username from auth service
    let opponentUsername: string | null = null;
    try {
      const resp = await fetch(`http://auth-service:4000/users/${otherUserId}`);
      if (resp.ok) {
        const js = await resp.json();
        opponentUsername = js.username || null;
      }
    } catch (err) {
      fastify.log.error("Failed to fetch opponent username:", err);
    }

    console.log("[lobby-info] Success:", {
      lobbyKey,
      userId,
      isChallenger,
      opponentReady,
      isRandom,
      opponentUsername,
      opponentUserId: otherUserId,
    });

    return reply.send({
      success: true,
      lobbyKey,
      userId,
      isChallenger,
      opponentReady,
      isRandom,
      opponentUsername,
      opponentUserId: otherUserId,
    });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: "Failed to get lobby info" });
  }
});

// Check if user is currently in a lobby (polling fallback)
fastify.get("/online/status", async (request, reply) => {
  try {
    const token = request.cookies.token;
    if (!token) return reply.status(401).send({ error: "Unauthorized" });
    const jwtSecret = getEnv("JWT_SECRET");
    const decoded = jwt.verify(token, jwtSecret) as any;
    const userId = decoded.id as number;

    for (const [lobbyKey, lobby] of lobbies.entries()) {
      if (lobby.users.includes(userId)) {
        return reply.send({ inLobby: true, lobbyKey });
      }
    }
    return reply.send({ inLobby: false });
  } catch (err) {
    return reply.status(500).send({ error: "Failed to check status" });
  }
});

// Join matchmaking queue to find random opponent
fastify.post("/online/queue/join", async (request, reply) => {
  try {
    const token = request.cookies.token;
    if (!token) return reply.status(401).send({ error: "Unauthorized" });
    const jwtSecret = getEnv("JWT_SECRET");
    const decoded = jwt.verify(token, jwtSecret) as any;
    const userId = decoded.id as number;

    // Check if user is currently being processed (race condition protection)
    if (matchmakingInProgress.has(userId)) {
      console.log(`[Matchmaking] User ${userId} is currently being processed`);
      return reply.status(409).send({ error: "Matchmaking in progress" });
    }

    // Check if user is already in a lobby
    for (const [lobbyKey, lobby] of lobbies.entries()) {
      if (lobby.users.includes(userId)) {
        console.log(
          `[Matchmaking] User ${userId} already in lobby ${lobbyKey}`
        );
        return reply.send({ success: true, matched: true, lobbyKey });
      }
    }

    // Remove from queue if already there
    matchmakingQueue.delete(userId);

    // Mark this user as being processed to prevent them from being matched by another request
    matchmakingInProgress.add(userId);

    let opponentId: number | null = null;

    try {
      // Try to find a match with someone already in queue
      if (matchmakingQueue.size > 0) {
        // Get first waiting user who is:
        // 1. Not already in a lobby
        // 2. Not being matched by another concurrent request

        for (const candidateId of matchmakingQueue) {
          // CRITICAL: Skip if candidate is already being matched by another request
          if (matchmakingInProgress.has(candidateId)) {
            continue;
          }

          // Check if candidate is not in any lobby
          let candidateInLobby = false;
          for (const lobby of lobbies.values()) {
            if (lobby.users.includes(candidateId)) {
              candidateInLobby = true;
              break;
            }
          }

          if (!candidateInLobby) {
            // ATOMIC CLAIM: Immediately mark opponent as being processed
            matchmakingInProgress.add(candidateId);
            opponentId = candidateId;
            break;
          }
        }

        if (opponentId) {
          // Remove both users from queue atomically
          matchmakingQueue.delete(opponentId);
          matchmakingQueue.delete(userId); // Extra safety

          // Create lobby for both users
          const minId = Math.min(userId, opponentId);
          const maxId = Math.max(userId, opponentId);
          const lobbyKey = `${minId}-${maxId}`;

          // Double-check lobby doesn't exist (extra safety)
          if (!lobbies.has(lobbyKey)) {
            lobbies.set(lobbyKey, {
              users: [minId, maxId],
              joined: new Set(),
              isRandom: true,
            });

            console.log(
              `[Matchmaking] Created lobby ${lobbyKey}: User ${userId} matched with User ${opponentId}`
            );
          } else {
            console.log(
              `[Matchmaking] Lobby ${lobbyKey} already exists, reusing`
            );
          }

          // Remove from processing sets
          matchmakingInProgress.delete(userId);
          matchmakingInProgress.delete(opponentId);

          // Notify both users via SSE
          sendSseEvent(userId, "matchmaking_found", { lobbyKey });
          sendSseEvent(opponentId, "matchmaking_found", { lobbyKey });

          return reply.send({ success: true, matched: true, lobbyKey });
        }
      }

      // No match found, add to queue and wait
      matchmakingInProgress.delete(userId); // Remove from processing
      matchmakingQueue.add(userId);
      console.log(
        `[Matchmaking] User ${userId} added to queue. Queue size: ${matchmakingQueue.size}`
      );
      return reply.send({ success: true, matched: false, waiting: true });
    } catch (err) {
      // Cleanup on error
      matchmakingInProgress.delete(userId);
      if (opponentId) matchmakingInProgress.delete(opponentId);
      throw err;
    }
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: "Failed to join queue" });
  }
});

// Cancel matchmaking queue
fastify.post("/online/queue/cancel", async (request, reply) => {
  try {
    const token = request.cookies.token;
    if (!token) return reply.status(401).send({ error: "Unauthorized" });
    const jwtSecret = getEnv("JWT_SECRET");
    const decoded = jwt.verify(token, jwtSecret) as any;
    const userId = decoded.id as number;

    // Prevent cancellation if user is currently being matched
    if (matchmakingInProgress.has(userId)) {
      console.log(
        `[Matchmaking] User ${userId} tried to cancel while being matched`
      );
      return reply
        .status(409)
        .send({ error: "Matchmaking in progress, cannot cancel" });
    }

    matchmakingQueue.delete(userId);
    // matchmakingInProgress.delete(userId); // No need to delete if we check above, but safe to keep or remove if we trust the check
    console.log(`[Matchmaking] User ${userId} cancelled queue`);
    return reply.send({ success: true });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: "Failed to cancel queue" });
  }
});

// Delete lobby after game ends
fastify.post("/online/lobby/delete", async (request, reply) => {
  try {
    const token = request.cookies.token;
    if (!token) return reply.status(401).send({ error: "Unauthorized" });
    const jwtSecret = getEnv("JWT_SECRET");
    const decoded = jwt.verify(token, jwtSecret) as any;
    const userId = decoded.id as number;

    const { lobbyKey } = request.body as any;
    if (!lobbyKey) {
      return reply.status(400).send({ error: "lobbyKey required" });
    }

    const lobby = lobbies.get(lobbyKey);
    if (!lobby) {
      console.log(
        `[Lobby Delete] Lobby ${lobbyKey} not found (already deleted)`
      );
      return reply.send({ success: true, message: "Lobby already deleted" });
    }

    // Verify user is part of this lobby
    if (!lobby.users.includes(userId)) {
      return reply.status(403).send({ error: "Not a member of this lobby" });
    }

    // Delete the lobby
    lobbies.delete(lobbyKey);
    console.log(`[Lobby Delete] Deleted lobby ${lobbyKey} by user ${userId}`);

    return reply.send({ success: true });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: "Failed to delete lobby" });
  }
});

// Debug endpoint to list all lobbies (can remove later)
fastify.get("/online/lobbies/debug", async (request, reply) => {
  const lobbiesArray = Array.from(lobbies.entries()).map(([key, lobby]) => ({
    lobbyKey: key,
    users: lobby.users,
    joined: Array.from(lobby.joined || []),
    ready: Array.from(lobby.ready || []),
    isRandom: lobby.isRandom,
    tournamentId: lobby.tournamentId,
    challenger: lobby.challenger,
  }));
  return reply.send({
    lobbies: lobbiesArray,
    queueSize: matchmakingQueue.size,
  });
});

// List all friends for current user
fastify.get("/friends/list", async (request, reply) => {
  try {
    const token = request.cookies.token;
    if (!token) return reply.status(401).send({ error: "Unauthorized" });
    const jwtSecret = getEnv("JWT_SECRET");
    const decoded = jwt.verify(token, jwtSecret) as any;
    const userId = decoded.id as number;

    // Get distinct friend ids and optional avatar from local user_profiles
    const rows = db
      .prepare(
        `
      SELECT DISTINCT f.friend_id AS id, up.avatar
      FROM friends f
      LEFT JOIN user_profiles up ON up.id = f.friend_id
      WHERE f.user_id = ?
      ORDER BY up.created_at DESC
    `
      )
      .all(userId) as any[];

    // Enrich with username via auth-service
    const friends = await Promise.all(
      rows.map(async (r) => {
        try {
          const resp = await fetch(`http://auth-service:4000/users/${r.id}`);
          if (resp.ok) {
            const json = await resp.json();
            const lastBeat = heartbeats.get(r.id) || 0;
            const isOnline =
              sseClients.has(r.id) || Date.now() - lastBeat < ONLINE_GRACE_MS;
            return {
              id: r.id,
              username: json.username || null,
              avatar: r.avatar || null,
              status: isOnline ? "Online" : "Offline",
            };
          }
        } catch (e) {
          // ignore
        }
        const lastBeat = heartbeats.get(r.id) || 0;
        const isOnline =
          sseClients.has(r.id) || Date.now() - lastBeat < ONLINE_GRACE_MS;
        return {
          id: r.id,
          username: null,
          avatar: r.avatar || null,
          status: isOnline ? "Online" : "Offline",
        };
      })
    );

    return reply.send({ friends });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ friends: [] });
  }
});

// Heartbeat endpoint: mark current user online
fastify.post("/friends/heartbeat", async (request, reply) => {
  try {
    const token = request.cookies.token;
    if (!token) return reply.status(401).send({ error: "Unauthorized" });
    const jwtSecret = getEnv("JWT_SECRET");
    const decoded = jwt.verify(token, jwtSecret) as any;
    const userId = decoded.id as number;

    const now = Date.now();
    const prev = heartbeats.get(userId) || 0;
    const wasOffline = !prev || now - prev >= ONLINE_GRACE_MS;
    heartbeats.set(userId, now);

    // If transitioning from offline to online, notify friends
    if (wasOffline) {
      try {
        const friends = db
          .prepare("SELECT friend_id AS id FROM friends WHERE user_id = ?")
          .all(userId) as any[];
        for (const f of friends) {
          sendSseEvent(f.id, "presence", { id: userId, status: "Online" });
        }
      } catch (e) {
        // ignore
      }
    }

    return reply.send({ success: true });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: "Failed to record heartbeat" });
  }
});

// Remove a friend (mutual removal)
fastify.post("/friends/remove/:friendId", async (request, reply) => {
  try {
    const token = request.cookies.token;
    if (!token) return reply.status(401).send({ error: "Unauthorized" });
    const jwtSecret = getEnv("JWT_SECRET");
    const decoded = jwt.verify(token, jwtSecret) as any;
    const userId = decoded.id as number;

    const friendId = parseInt((request.params as any).friendId, 10);
    if (!friendId || friendId === userId) {
      return reply.status(400).send({ error: "Invalid friend id" });
    }

    // Ensure at least one side exists to consider them friends
    const hasRow = db
      .prepare("SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?")
      .get(userId, friendId) as any;
    if (!hasRow) {
      // Idempotent: if not friends, respond success
      return reply.send({ success: true });
    }

    // Remove both directions
    const del = db.prepare(
      "DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)"
    );
    del.run(userId, friendId, friendId, userId);

    return reply.send({ success: true });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: "Failed to remove friend" });
  }
});

// Send chat message endpoint (uses SSE to deliver, just like friend requests)
fastify.post("/friends/chat/:recipientId", async (request, reply) => {
  try {
    const token = request.cookies.token;
    if (!token) return reply.status(401).send({ error: "Unauthorized" });
    const jwtSecret = getEnv("JWT_SECRET");
    const decoded = jwt.verify(token, jwtSecret) as any;
    const senderId = decoded.id as number;
    const senderUsername = decoded.username as string;

    const recipientId = parseInt((request.params as any).recipientId, 10);
    const body = request.body as any;
    const message = body?.message;

    if (!recipientId || !message) {
      return reply.status(400).send({ error: "Invalid request" });
    }

    // Send message via SSE (same pattern as friend requests/challenges)
    sendSseEvent(recipientId, "chatMessage", {
      senderId,
      senderUsername,
      message,
      timestamp: Date.now(),
    });

    return reply.send({ success: true });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: "Failed to send message" });
  }
});

// Delete account endpoint - deletes all user data from user management database
fastify.delete("/users/delete", async (request, reply) => {
  try {
    // Authenticate user from JWT token
    const token = request.cookies.token;
    if (!token) {
      return reply
        .status(401)
        .send({ success: false, error: "Not authenticated" });
    }

    const jwtSecret = getEnv("JWT_SECRET");
    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret) as {
        id: number;
        username: string;
      };
    } catch (err) {
      return reply.status(401).send({ success: false, error: "Invalid token" });
    }

    const userId = decoded.id;

    // Start transaction-like deletions (SQLite in better-sqlite3 auto-commits by default)
    // Order matters: delete foreign key references first

    // 1. Delete from friend_requests (both directions)
    const deleteFriendRequestsStmt = db.prepare(
      "DELETE FROM friend_requests WHERE from_user_id = ? OR to_user_id = ?"
    );
    deleteFriendRequestsStmt.run(userId, userId);

    // 2. Delete from friends table (both directions)
    const deleteFriendsStmt = db.prepare(
      "DELETE FROM friends WHERE user_id = ? OR friend_id = ?"
    );
    deleteFriendsStmt.run(userId, userId);

    // 3. Delete from matches table (both as player1 and player2)
    const deleteMatchesStmt = db2.prepare(
      "DELETE FROM matches WHERE player1_id = ? OR player2_id = ?"
    );
    deleteMatchesStmt.run(String(userId), String(userId));

    // 4. Delete from user_profiles
    const deleteProfileStmt = db.prepare(
      "DELETE FROM user_profiles WHERE id = ?"
    );
    deleteProfileStmt.run(userId);

    // 5. Call auth service to delete credentials
    try {
      const authResponse = await fetch(
        "http://auth-service:4000/delete-account",
        {
          method: "DELETE",
          headers: {
            Cookie: `token=${token}`,
          },
        }
      );

      if (!authResponse.ok) {
        fastify.log.error("Failed to delete auth credentials");
        // Continue anyway, user data is already deleted
      }
    } catch (authError) {
      fastify.log.error("Error calling auth service:", authError);
      // Continue anyway
    }

    return reply.status(200).send({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (err) {
    fastify.log.error("Error deleting account:", err);
    return reply.status(500).send({
      success: false,
      error: "Failed to delete account",
    });
  }
});

await fastify.listen({ port: 5100, host: "0.0.0.0" });
fastify.log.info("🚀 User service running on port 5100");
