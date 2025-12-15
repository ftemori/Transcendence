import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { createProxyMiddleware } from "http-proxy-middleware";
import https from "https";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const USE_HTTPS = process.env.USE_HTTPS === "true";

console.log("Starting server...");
console.log("BACKEND_URL:", process.env.BACKEND_URL);
console.log("AUTH_URL:", process.env.AUTH_URL);
console.log("USER_URL:", process.env.USER_URL);
console.log("WS_URL:", process.env.WS_URL);
console.log("USE_HTTPS:", USE_HTTPS);

app.use((req, res, next) => {
  console.log(`[Request] ${req.method} ${req.url}`);
  next();
});

// Proxy configuration
if (process.env.BACKEND_URL) {
  app.use(
    "/api",
    createProxyMiddleware({
      target: process.env.BACKEND_URL,
      changeOrigin: true,
      on: {
        error: (err, req, res) => {
          console.error("Proxy error:", err);
          res.status(500).send("Proxy error: " + err.message);
        },
        proxyReq: (proxyReq, req, res) => {
          console.log(
            `[Proxy] ${req.method} ${req.url} -> ${process.env.BACKEND_URL}`
          );
        },
        proxyRes: (proxyRes, req, res) => {
          // Remove headers that might cause issues with HTTP/2 or buffering
          delete proxyRes.headers["connection"];
        },
      },
    })
  );
}

// WS proxying
const wsUrl = process.env.WS_URL || "ws://backend:3000";
console.log("WS Proxy target:", wsUrl);
const wsProxy = createProxyMiddleware({
  target: wsUrl,
  changeOrigin: true,
  ws: true,
  pathRewrite: {
    "^/ws": "/game",
  },
  on: {
    proxyRes: (proxyRes, req, res) => {
      delete proxyRes.headers["connection"];
    },
    proxyReqWs: (proxyReq, req, socket, options, head) => {
      console.log("[WS Proxy] proxyReqWs called for:", req.url);
    },
    error: (err, req, res) => {
      console.error("WS Proxy error:", err.message);
      console.error("WS Proxy error stack:", err.stack);
    },
    open: (proxySocket) => {
      console.log("[WS Proxy] Connection opened");
    },
    close: (res, socket, head) => {
      console.log("[WS Proxy] Connection closed");
    },
  },
});
app.use("/ws", wsProxy);

if (process.env.AUTH_URL) {
  app.use(
    "/auth",
    createProxyMiddleware({
      target: process.env.AUTH_URL,
      changeOrigin: true,
      on: {
        error: (err, req, res) => {
          console.error("Auth Proxy error:", err);
          res.status(500).send("Auth Proxy error: " + err.message);
        },
        proxyRes: (proxyRes, req, res) => {
          delete proxyRes.headers["connection"];
        },
      },
    })
  );
}

if (process.env.USER_URL) {
  app.use(
    "/users",
    createProxyMiddleware({
      target: process.env.USER_URL,
      changeOrigin: true,
      on: {
        error: (err, req, res) => {
          console.error("User Proxy error:", err);
          res.status(500).send("User Proxy error: " + err.message);
        },
        proxyRes: (proxyRes, req, res) => {
          delete proxyRes.headers["connection"];
        },
      },
    })
  );
}

app.use(express.static(__dirname));
app.use("/public", express.static(path.join(__dirname, "public")));

app.use("/frontend", express.static(path.join(__dirname, "../build/frontend")));

// Catch-all route for SPA - must be last
app.use((req, res) => {
  if (!req.path.includes(".")) {
    res.sendFile(path.join(__dirname, "index.html"));
  } else {
    res.status(404).send("File not found");
  }
});

let server;

if (USE_HTTPS) {
  // Load SSL certificates
  const sslOptions = {
    key: fs.readFileSync("/app/certs/server.key"),
    cert: fs.readFileSync("/app/certs/server.crt"),
  };

  server = https.createServer(sslOptions, app);
  server.listen(PORT, () => {
    console.log(`🔒 HTTPS Server running at https://0.0.0.0:${PORT}`);
    console.log(`Open https://10.15.4.8:${PORT} in your browser`);
  });
} else {
  server = app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
  });
}

server.on("upgrade", (req, socket, head) => {
  console.log(`[WS Upgrade] ${req.url}`);
  if (req.url.startsWith("/ws")) {
    console.log(`[WS Upgrade] Proxying to backend`);
    wsProxy.upgrade(req, socket, head);
  } else {
    console.log(`[WS Upgrade] Unknown path, destroying socket`);
    socket.destroy();
  }
});
