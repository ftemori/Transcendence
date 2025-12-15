import { Router } from "./routes/router.js";
import { checkAuth } from "./utils/auth.js";
import { HomePage } from "./pages/HomePage/index.js";
import { OfflineGamePage } from "./pages/OfflineGamePage/index.js";
import { OnlineGamePage } from "./pages/OnlineGamePage/index.js";
import { TournamentPage } from "./pages/TournamentPage/index.js";
import { ProfilePage } from "./pages/ProfilePage/index.js";
import { SettingsPage } from "./pages/SettingsPage/index.js";
import { LoginPage } from "./pages/LoginPage/index.js";
import { RegisterPage } from "./pages/RegisterPage/index.js";
import { LogoutPage } from "./pages/LogoutPage/index.js";
import { Login2FAPage } from "./pages/Login2FAPage/index.js";
import { TournamentResultsPage } from "./pages/TournamentResultsPage/index.js";
import { API_CONFIG } from "./config.js";

function initGlobalChatSocket() {
  try {
    // Use configured WS URL so it works both locally and in production behind a proxy
    const wsUrl = API_CONFIG.WS_URL;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log("[Global Chat] WebSocket connected");
      window.globalChatSocket = socket;
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "chatMessage") {
          console.log("[Global Chat] Received message:", data);
          // Handle incoming chat message
          import("./components/chat.js").then(
            ({ openChatWindow, displayChatMessage }) => {
              const { senderId, senderUsername, message } = data;
              if (senderId && message) {
                // Ensure chat window is created before attempting to display the message.
                openChatWindow(senderId, senderUsername || `User ${senderId}`);
                // Defer display to avoid race with DOM creation
                setTimeout(
                  () => displayChatMessage(senderId, message, false),
                  0
                );
              }
            }
          );
        }
      } catch (e) {
        console.error("[Global Chat] Error handling message:", e);
      }
    };

    socket.onerror = (error) => {
      console.error("[Global Chat] WebSocket error:", error);
    };

    socket.onclose = () => {
      console.log("[Global Chat] WebSocket disconnected");
      window.globalChatSocket = null;
      // Reconnect after 3 seconds
      setTimeout(() => initGlobalChatSocket(), 3000);
    };
  } catch (err) {
    console.error("[Global Chat] Failed to initialize WebSocket:", err);
  }
}

async function initializeApp() {
  const router = new Router();
  router.addRoute("/", HomePage);
  router.addRoute("/offline", OfflineGamePage);
  router.addRoute("/online", OnlineGamePage);
  router.addRoute("/tournament", TournamentPage);
  router.addRoute("/profile", ProfilePage);
  router.addRoute("/settings", SettingsPage);
  router.addRoute("/login", LoginPage);
  router.addRoute("/register", RegisterPage);
  router.addRoute("/logout", LogoutPage);
  router.addRoute("/login-2fa", Login2FAPage);
  router.addRoute("/results", TournamentResultsPage);

  router.init();
  // Initialize global friends sidebar toggle (minimal, non-invasive)
  // Initialize friends sidebar without blocking app startup
  try {
    const auth = await checkAuth();
    if (auth && auth.loggedIn) {
      import("./components/friendsSidebar.js")
        .then((mod) => {
          if (mod && typeof mod.initFriendsSidebar === "function")
            mod.initFriendsSidebar();
        })
        .catch(() => { });

      // Initialize global chat WebSocket for real-time messaging
      initGlobalChatSocket();
    }
  } catch { }

  // Start a lightweight heartbeat to indicate presence every 5s
  try {
    const sendHeartbeat = () => {
      fetch(`${API_CONFIG.USER_SERVICE_URL}/friends/heartbeat`, {
        method: "POST",
        credentials: "include",
      }).catch(() => { });
    };
    // Initial beat soon after load, then every 5 seconds
    setTimeout(sendHeartbeat, 1000);
    const hb = setInterval(sendHeartbeat, 5000);
    window.addEventListener("beforeunload", () => {
      try {
        clearInterval(hb);
      } catch { }
    });
  } catch { }
}

document.addEventListener("DOMContentLoaded", initializeApp);
