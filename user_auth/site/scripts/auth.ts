// server.js
import bcrypt from "bcrypt";

import Fastify from "fastify";
import Database from "better-sqlite3";

import jwt from "jsonwebtoken";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";

import speakeasy from "speakeasy";
import qrcode from "qrcode";

// Initialize DB first
await import("./init-db.js");

const fastify = Fastify({ logger: false });

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

fastify.register(cookie, {
  secret: process.env.COOKIE_SECRET || "a-very-secret-string", // for signed cookies (optional)
  parseOptions: {}, // options for cookie parsing, if needed
});

const db = new Database("/app/site/build/db-auth/auth.db"); // Must match the Docker path

const JWT_SECRET = getEnv("JWT_SECRET");

// Serve the registration form

fastify.post<{ Body: { username: string; password: string } }>(
  "/register",
  async (request, reply) => {
    const { username, password } = request.body;
    //Checks for username restrictions
    if (!username || typeof username !== "string" || username.length < 3) {
      return reply
        .status(400)
        .send({ success: false, error: "Invalid username" });
    }
    //Check for password restrictions
    if (!password || typeof password !== "string" || password.length < 6) {
      return reply
        .status(400)
        .send({ success: false, error: "Invalid password (min 6 characters)" });
    }

    //Hashing password, adding to auth-db
    try {
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert into auth DB
      const insertAuth = db.prepare(`
      INSERT INTO credentials (username, password) VALUES (?, ?)
      `);
      const result = insertAuth.run(username, hashedPassword);
      const userId = result.lastInsertRowid;

      const response = await fetch("http://user-service:5100/users/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId }),
      });

      if (!response.ok) {
        // Optionally: rollback auth DB user or log issue
        throw new Error("Failed to create user profile");
      }

      return reply.send({
        success: true,
        message: "Registration successful",
        userId,
      });
    } catch (err) {
      console.error("Registration error:", err);
      console.error("Error code:", (err as any).code);
      console.error("Error message:", (err as any).message);

      const isDuplicate =
        err instanceof Error &&
        "code" in err &&
        (err as any).code === "SQLITE_CONSTRAINT_UNIQUE";

      return reply.status(isDuplicate ? 409 : 500).send({
        success: false,
        message: isDuplicate
          ? "Username already taken."
          : "Registration failed",
      });
    }
  }
);

fastify.post("/logout", async (request, reply) => {
  // Dynamic cookie settings - must match login settings
  const isHttps = process.env.FORCE_HTTPS === "true";

  reply.clearCookie("token", {
    path: "/",
    sameSite: isHttps ? "none" : "lax",
    secure: isHttps,
  });

  return reply.status(200).send({
    success: true,
    message: "Logged out successfully",
  });
});

// Password change endpoint
fastify.post<{
  Body: { newPassword: string; verification: string; requires2FA: boolean };
}>("/update-password", async (request, reply) => {
  try {
    const token = request.cookies.token;
    if (!token) {
      return reply
        .status(401)
        .send({ success: false, message: "Not authenticated" });
    }

    const { newPassword, verification, requires2FA } = request.body;

    // Verify token and get current user
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: number;
      username: string;
    };
    const userId = decoded.id;

    // Get user data
    const userStmt = db.prepare("SELECT * FROM credentials WHERE id = ?");
    const user = userStmt.get(userId) as AuthUser;

    if (!user) {
      return reply
        .status(404)
        .send({ success: false, message: "User not found" });
    }

    // Verify based on 2FA status
    if (requires2FA) {
      // Verify 2FA token
      const verified = speakeasy.totp.verify({
        secret: user.two_factor_secret!,
        encoding: "base32",
        token: verification,
        window: 1,
      });

      if (!verified) {
        return reply
          .status(401)
          .send({ success: false, message: "Invalid 2FA code" });
      }
    } else {
      // Verify current password
      const validPassword = await bcrypt.compare(verification, user.password);
      if (!validPassword) {
        return reply
          .status(401)
          .send({ success: false, message: "Current password is incorrect" });
      }
    }

    // Validate new password
    if (
      !newPassword ||
      typeof newPassword !== "string" ||
      newPassword.length < 6
    ) {
      return reply.status(400).send({
        success: false,
        message: "New password must be at least 6 characters",
      });
    }

    // Hash and update password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    const updateStmt = db.prepare(
      "UPDATE credentials SET password = ? WHERE id = ?"
    );
    updateStmt.run(hashedNewPassword, userId);

    return reply
      .status(200)
      .send({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("Error updating password:", error);
    return reply
      .status(500)
      .send({ success: false, message: "Failed to update password" });
  }
});

// Username update endpoint
fastify.post<{ Body: { newUsername: string } }>(
  "/update-username",
  async (request, reply) => {
    try {
      const token = request.cookies.token;
      if (!token) {
        return reply
          .status(401)
          .send({ success: false, message: "Not authenticated" });
      }

      const { newUsername } = request.body;
      if (
        !newUsername ||
        typeof newUsername !== "string" ||
        newUsername.length < 3
      ) {
        return reply
          .status(400)
          .send({ success: false, message: "Invalid username" });
      }

      // Verify token and get current user
      const decoded = jwt.verify(token, JWT_SECRET) as {
        id: number;
        username: string;
      };
      const currentUsername = decoded.username;

      // Check if new username already exists
      const checkStmt = db.prepare(
        "SELECT id FROM credentials WHERE username = ? AND id != ?"
      );
      const exists = checkStmt.get(newUsername, decoded.id);

      if (exists) {
        return reply
          .status(409)
          .send({ success: false, message: "Username already taken" });
      }

      // Update username in credentials table
      const updateStmt = db.prepare(
        "UPDATE credentials SET username = ? WHERE id = ?"
      );
      updateStmt.run(newUsername, decoded.id);

      // Generate new token with updated username
      const newToken = jwt.sign(
        { id: decoded.id, username: newUsername },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      // Set new cookie
      // Dynamic cookie settings based on environment
      const isHttps = process.env.FORCE_HTTPS === "true";

      reply.setCookie("token", newToken, {
        httpOnly: true,
        path: "/",
        sameSite: isHttps ? "none" : "lax",
        secure: isHttps,
        maxAge: 3600,
      });

      return reply
        .status(200)
        .send({ success: true, message: "Username updated successfully" });
    } catch (error) {
      console.error("Error updating username:", error);
      return reply
        .status(500)
        .send({ success: false, message: "Failed to update username" });
    }
  }
);

// Handle login form submission
interface AuthUser {
  id: number;
  username: string;
  password: string;
  two_factor_enabled?: number;
  two_factor_secret?: string | null;
}

fastify.post<{ Body: { username: string; password: string } }>(
  "/login",
  async (request, reply) => {
    const { username, password } = request.body;

    if (!username || typeof username !== "string" || username.length < 3) {
      return reply
        .status(400)
        .send({ success: false, error: "Invalid username" });
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return reply
        .status(400)
        .send({ success: false, error: "Invalid password (min 6 characters)" });
    }

    try {
      const stmt = db.prepare("SELECT * FROM credentials WHERE username = ?");
      const user = stmt.get(username) as AuthUser | undefined;

      if (!user) {
        return reply.status(401).send({
          success: false,
          message: "Login failed. User not found. Please try again",
        });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        return reply.status(401).send({
          success: false,
          message: "Login failed. Incorrect password. Please try again",
        });
      }

      if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not defined in environment variables.");
      }
      const jwtSecret = getEnv("JWT_SECRET");

      // If 2FA is enabled, do not issue token here, require OTP step
      if (user.two_factor_enabled) {
        return reply.status(200).send({
          success: true,
          requires2fa: true,
          user: { id: user.id, username: user.username },
        });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username },
        jwtSecret,
        { expiresIn: "1h" }
      );

      // Dynamic cookie settings based on environment
      // For local network access, we need to use lax sameSite and allow HTTP
      const isProduction = process.env.NODE_ENV === "production";
      const isHttps = process.env.FORCE_HTTPS === "true";

      reply.setCookie("token", token, {
        httpOnly: true,
        path: "/",
        sameSite: isHttps ? "none" : "lax", // 'lax' for HTTP, 'none' for HTTPS cross-site
        secure: isHttps, // Only true for HTTPS
        maxAge: 3600,
      });

      return reply.status(200).send({
        success: true,
        message: "Logged in correctly",
        token,
        user: { id: user.id, username: user.username },
      });
    } catch (err) {
      fastify.log.error(err);
      return reply
        .status(401)
        .send({ success: false, message: "Login failed. Please try again" });
    }
  }
);

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(
      `[CONFIG ERROR] Missing required environment variable: ${name}`
    );
    console.error(`Shutting down service gracefully.`);
    process.exit(1); // Exit with error code 1
  }
  return value;
}

fastify.get("/verify", async (request, reply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader)
    return reply.status(401).send({ error: "No token provided" });

  try {
    const token = authHeader.replace("Bearer ", "");
    const decoded = jwt.verify(token, JWT_SECRET);

    if (typeof decoded === "string" || !("username" in decoded)) {
      return reply.status(400).send({ error: "Invalid token payload" });
    }

    const { username } = decoded;

    return reply.status(200).send({ valid: true, user: decoded });
  } catch (err) {
    return reply.status(401).send({ valid: false, error: "Invalid token" });
  }
});

fastify.get("/health", async (request, reply) => {
  return reply.send({ status: "ok" });
});

fastify.get("/protected", async (request, reply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader)
    return reply.status(401).send({ error: "No token provided" });

  try {
    const token = authHeader.replace("Bearer ", "");
    const decoded = jwt.verify(token, JWT_SECRET);

    if (typeof decoded === "string" || !("username" in decoded)) {
      return reply.status(400).send({ error: "Invalid token payload" });
    }

    const { username } = decoded;
    return reply.send({
      success: true,
      message: "Access granted",
      user: decoded,
    });
  } catch (err) {
    return reply.status(401).send({ success: false, message: "Invalid token" });
  }
});

fastify.get("/me", async (request, reply) => {
  const authHeader = request.headers.authorization;
  const cookieToken = (request as any).cookies?.token as string | undefined;
  const rawToken = authHeader?.startsWith("Bearer ")
    ? authHeader.replace("Bearer ", "")
    : cookieToken;
  if (!rawToken) return reply.status(401).send({ error: "No token provided" });

  try {
    const decoded = jwt.verify(rawToken, JWT_SECRET);

    if (typeof decoded === "string" || !("username" in decoded)) {
      return reply.status(400).send({ error: "Invalid token payload" });
    }

    const { username } = decoded;
    return reply.status(200).send({ valid: true, user: decoded });
  } catch (err) {
    return reply.status(401).send({ success: false, error: "Invalid token" });
  }
});

fastify.get("/auth/status", async (request, reply) => {
  const token = (request as any).cookies?.token as string | undefined;

  if (!token) {
    return reply.status(200).send({ loggedIn: false });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (typeof decoded === "string" || !decoded || !("username" in decoded)) {
      return reply.status(200).send({ loggedIn: false });
    }
    const { id, username } = decoded;
    return reply.status(200).send({ loggedIn: true, user: { id, username } });
  } catch (err) {
    return reply.status(200).send({ loggedIn: false });
  }
});

fastify.get("/auth/username", async (request, reply) => {
  const token = (request as any).cookies?.token as string | undefined;

  if (!token) {
    return reply.status(200).send({ loggedIn: false });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    if (typeof decoded !== "object" || !decoded?.username) {
      return reply.status(200).send({ loggedIn: false });
    }

    return reply
      .status(200)
      .send({ loggedIn: true, username: decoded.username });
  } catch (err) {
    return reply.status(200).send({ loggedIn: false });
  }
});

// Get user info by id (used by other services)
fastify.get("/users/:id", async (request, reply) => {
  try {
    const id = parseInt((request.params as any).id, 10);
    if (!id) return reply.status(400).send({ error: "Invalid id" });
    const stmt = db.prepare(
      "SELECT id, username FROM credentials WHERE id = ?"
    );
    const row = stmt.get(id) as any;
    if (!row) return reply.status(404).send({ error: "User not found" });
    return reply.send({ id: row.id, username: row.username });
  } catch (e) {
    console.error(e);
    return reply.status(500).send({ error: "Server error" });
  }
});

// Public user search endpoint (minimal, used by frontend friends sidebar)
// Example: GET /users/search?username=alice
fastify.get("/users/search", async (request, reply) => {
  try {
    const q = (request.query as any)?.username || "";
    if (!q || typeof q !== "string")
      return reply.status(400).send({ users: [] });

    // Use LIKE for partial, case-insensitive matches
    const pattern = `%${q.replace(/%/g, "%")}%`;
    const stmt = db.prepare(
      "SELECT id, username FROM credentials WHERE username LIKE ? LIMIT 20"
    );
    const rows = stmt.all(pattern);

    return reply.send({ users: rows });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ users: [] });
  }
});

// 2FA: Status - check if enabled for current user
fastify.get("/2fa/status", async (request, reply) => {
  try {
    const authHeader = request.headers.authorization;
    const cookieToken = (request as any).cookies?.token as string | undefined;
    const rawToken = authHeader?.startsWith("Bearer ")
      ? authHeader.replace("Bearer ", "")
      : cookieToken;
    if (!rawToken) {
      return reply
        .status(401)
        .send({ success: false, error: "Not authenticated" });
    }
    const decoded = jwt.verify(rawToken, JWT_SECRET) as any;
    const userId = decoded?.id as number | undefined;
    if (!userId) {
      return reply.status(400).send({ success: false, error: "Invalid token" });
    }
    const row = db
      .prepare("SELECT two_factor_enabled FROM credentials WHERE id = ?")
      .get(userId) as { two_factor_enabled: number } | undefined;
    if (!row) {
      return reply
        .status(404)
        .send({ success: false, error: "User not found" });
    }
    return reply.send({ success: true, enabled: !!row.two_factor_enabled });
  } catch (e) {
    return reply.status(401).send({ success: false, error: "Invalid token" });
  }
});

// 2FA: Begin setup - generate secret and QR for current user
fastify.post<{ Body: { userId?: number } }>(
  "/2fa/setup",
  async (request, reply) => {
    let { userId } = request.body || {};
    // Allow inferring userId from JWT cookie or Authorization header
    if (!userId) {
      try {
        const authHeader = request.headers.authorization;
        const cookieToken = (request as any).cookies?.token as
          | string
          | undefined;
        const rawToken = authHeader?.startsWith("Bearer ")
          ? authHeader.replace("Bearer ", "")
          : cookieToken;
        if (!rawToken) {
          return reply
            .status(401)
            .send({ success: false, error: "Not authenticated" });
        }
        const decoded = jwt.verify(rawToken, JWT_SECRET) as any;
        userId = decoded?.id;
      } catch (e) {
        return reply
          .status(401)
          .send({ success: false, error: "Invalid token" });
      }
    }
    if (!userId || typeof userId !== "number") {
      return reply
        .status(400)
        .send({ success: false, error: "Invalid user id" });
    }

    // Prevent setup if already enabled
    const statusRow = db
      .prepare(
        "SELECT username, two_factor_enabled FROM credentials WHERE id = ?"
      )
      .get(userId) as
      | { username: string; two_factor_enabled: number }
      | undefined;
    const userRow = statusRow ? { username: statusRow.username } : undefined;
    if (!userRow) {
      return reply
        .status(404)
        .send({ success: false, error: "User not found" });
    }
    if (statusRow && statusRow.two_factor_enabled) {
      return reply
        .status(400)
        .send({ success: false, error: "2FA already enabled" });
    }

    const secret = speakeasy.generateSecret({
      name: `Transcendence:${userRow.username}`,
    });
    const otpauthUrl = secret.otpauth_url || "";
    const qrDataUrl = await qrcode.toDataURL(otpauthUrl);

    // Store temp secret until user confirms
    const update = db.prepare(
      "UPDATE credentials SET two_factor_secret = ? WHERE id = ?"
    );
    update.run(secret.base32, userId);

    return reply.send({ success: true, secret: secret.base32, qr: qrDataUrl });
  }
);

// 2FA: Confirm and enable using OTP
fastify.post<{ Body: { userId?: number; token: string } }>(
  "/2fa/enable",
  async (request, reply) => {
    let { userId, token } = request.body;
    if (!userId) {
      try {
        const authHeader = request.headers.authorization;
        const cookieToken = (request as any).cookies?.token as
          | string
          | undefined;
        const rawToken = authHeader?.startsWith("Bearer ")
          ? authHeader.replace("Bearer ", "")
          : cookieToken;
        if (!rawToken) {
          return reply
            .status(401)
            .send({ success: false, error: "Not authenticated" });
        }
        const decoded = jwt.verify(rawToken, JWT_SECRET) as any;
        userId = decoded?.id;
      } catch (e) {
        return reply
          .status(401)
          .send({ success: false, error: "Invalid token" });
      }
    }
    if (!userId || typeof userId !== "number" || !token) {
      return reply.status(400).send({ success: false, error: "Invalid input" });
    }

    const row = db
      .prepare("SELECT two_factor_secret FROM credentials WHERE id = ?")
      .get(userId) as { two_factor_secret: string | null } | undefined;
    if (!row || !row.two_factor_secret) {
      return reply
        .status(400)
        .send({ success: false, error: "No 2FA setup in progress" });
    }

    const verified = speakeasy.totp.verify({
      secret: row.two_factor_secret,
      encoding: "base32",
      token,
      window: 1,
    });

    if (!verified) {
      return reply
        .status(401)
        .send({ success: false, error: "Invalid 2FA token" });
    }

    const update = db.prepare(
      "UPDATE credentials SET two_factor_enabled = 1 WHERE id = ?"
    );
    update.run(userId);

    return reply.send({ success: true, message: "2FA enabled" });
  }
);

// 2FA: Disable using OTP (verifies current code) and clears secret
fastify.post<{ Body: { userId?: number; token: string } }>(
  "/2fa/disable",
  async (request, reply) => {
    let { userId, token } = request.body;
    if (!userId) {
      try {
        const authHeader = request.headers.authorization;
        const cookieToken = (request as any).cookies?.token as
          | string
          | undefined;
        const rawToken = authHeader?.startsWith("Bearer ")
          ? authHeader.replace("Bearer ", "")
          : cookieToken;
        if (!rawToken) {
          return reply
            .status(401)
            .send({ success: false, error: "Not authenticated" });
        }
        const decoded = jwt.verify(rawToken, JWT_SECRET) as any;
        userId = decoded?.id;
      } catch (e) {
        return reply
          .status(401)
          .send({ success: false, error: "Invalid token" });
      }
    }
    if (!userId || typeof userId !== "number" || !token) {
      return reply.status(400).send({ success: false, error: "Invalid input" });
    }

    const row = db
      .prepare(
        "SELECT two_factor_secret, two_factor_enabled FROM credentials WHERE id = ?"
      )
      .get(userId) as
      | { two_factor_secret: string | null; two_factor_enabled: number }
      | undefined;
    if (!row) {
      return reply
        .status(404)
        .send({ success: false, error: "User not found" });
    }
    if (!row.two_factor_enabled || !row.two_factor_secret) {
      return reply
        .status(400)
        .send({ success: false, error: "2FA not enabled" });
    }

    const verified = speakeasy.totp.verify({
      secret: row.two_factor_secret,
      encoding: "base32",
      token,
      window: 1,
    });
    if (!verified) {
      return reply
        .status(401)
        .send({ success: false, error: "Invalid 2FA token" });
    }

    const update = db.prepare(
      "UPDATE credentials SET two_factor_enabled = 0, two_factor_secret = NULL WHERE id = ?"
    );
    update.run(userId);
    return reply.send({ success: true, message: "2FA disabled" });
  }
);

// 2FA: Login step with OTP after password validated
fastify.post<{ Body: { username: string; token: string } }>(
  "/login/2fa",
  async (request, reply) => {
    const { username, token } = request.body;
    if (!username || !token) {
      return reply.status(400).send({ success: false, error: "Invalid input" });
    }

    const row = db
      .prepare(
        "SELECT id, two_factor_secret FROM credentials WHERE username = ?"
      )
      .get(username) as
      | { id: number; two_factor_secret: string | null }
      | undefined;
    if (!row || !row.two_factor_secret) {
      return reply
        .status(400)
        .send({ success: false, error: "2FA not set up" });
    }

    const verified = speakeasy.totp.verify({
      secret: row.two_factor_secret,
      encoding: "base32",
      token,
      window: 1,
    });

    if (!verified) {
      return reply
        .status(401)
        .send({ success: false, error: "Invalid 2FA token" });
    }

    const jwtSecret = getEnv("JWT_SECRET");
    const jwtToken = jwt.sign({ id: row.id, username }, jwtSecret, {
      expiresIn: "1h",
    });

    // Dynamic cookie settings - must match login settings
    const isHttps = process.env.FORCE_HTTPS === "true";

    reply.setCookie("token", jwtToken, {
      httpOnly: true,
      path: "/",
      sameSite: isHttps ? "none" : "lax",
      secure: isHttps,
      maxAge: 3600,
    });

    return reply.send({ success: true, token: jwtToken });
  }
);

// Delete account endpoint - deletes user credentials from auth DB
fastify.delete("/delete-account", async (request, reply) => {
  try {
    const token = request.cookies.token;
    if (!token) {
      return reply
        .status(401)
        .send({ success: false, message: "Not authenticated" });
    }

    // Verify token and get user ID
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: number;
      username: string;
    };
    const userId = decoded.id;

    // Delete user credentials from auth database
    const deleteStmt = db.prepare("DELETE FROM credentials WHERE id = ?");
    const result = deleteStmt.run(userId);

    if (result.changes === 0) {
      return reply
        .status(404)
        .send({ success: false, message: "User not found" });
    }

    // Clear the authentication cookie - must match login settings
    const isHttps = process.env.FORCE_HTTPS === "true";

    reply.clearCookie("token", {
      path: "/",
      sameSite: isHttps ? "none" : "lax",
      secure: isHttps,
    });

    return reply.status(200).send({
      success: true,
      message: "Account credentials deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting account credentials:", error);
    return reply
      .status(500)
      .send({
        success: false,
        message: "Failed to delete account credentials",
      });
  }
});

await fastify.listen({ port: 4000, host: "0.0.0.0" });

fastify.log.info("🚀 Auth server running on port 4000");
