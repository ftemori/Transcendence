import { API_CONFIG } from "../config.js";

// Shared game constants (must match backend)
const GAME_CONFIG = {
  width: 1000,
  height: 700,
  blockSize: 10, // ball radius
  paddleWidth: 15,
  paddleHeight: 75,
  maxPaddleY: 625, // height - paddleHeight (700 - 75)
  paddleSpeed: 7,
  ballSpeed: 5,
  ballSpeedY: 3,
  maxBallSpeed: 12,
  maxScore: 11,
};

class OnlineGame {
  constructor(clientId = null) {
    this.canvas = null;
    this.ctx = null;
    this.socket = null;
    this.gameState = null;
    this.keys = {};
    this.connected = false;
    this.playerId = null;
    this.clientId = clientId; // external id coming from auth (if any)
    this.gameStarted = false;
    this.countdown = 0;

    this.lastInputSent = 0;
    this.inputThrottle = 1000 / 60;
    this.inputInterval = null;
    this.lastInputState = { paddleUp: false, paddleDown: false };
    this.paused = false;
    this.startButton = null;

    // Challenge role tracking
    this.lobbyKey = null;
    this.isChallenger = false;
    this.isReady = false;
    this.opponentReady = false;
    this.isRandom = false;
    this.searchingForMatch = false;
    this.gameOverShown = false;
    this.rematchRequested = false;
    this.opponentWantsRematch = false;
    this.gameStartTimeout = null;
    this.lastStateTime = null;
    
    // Client-side ball prediction
    this.predictedBall = { x: GAME_CONFIG.width / 2, y: GAME_CONFIG.height / 2, dx: 0, dy: 0 };
    this.lastBallUpdate = 0;
    this.ballPredictionEnabled = true;
    this.animationFrameId = null;
    
    // Client-side paddle prediction for smooth local movement
    this.localPaddleY = GAME_CONFIG.height / 2 - GAME_CONFIG.paddleHeight / 2;
    this.localPaddleDy = 0;
    
    // Reconnection settings
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Initial delay in ms
    this.maxReconnectDelay = 30000; // Max delay of 30 seconds
    this.reconnectTimeout = null;
    this.intentionalClose = false;
  }
  init() {
    this.canvas = document.getElementById("gameCanvas");
    if (!this.canvas) {
      console.error("Canvas not found");
      return;
    }

    this.ctx = this.canvas.getContext("2d");

    // Check if lobby key is in URL
    const params = new URLSearchParams(window.location.search);
    this.lobbyKey = params.get("lobby");

    console.log("[OnlineGame] Initialized with lobbyKey:", this.lobbyKey || "NONE");
    console.log("[OnlineGame] Current URL:", window.location.href);

    this.setupEventListeners();
    this.connectToServer();
    this.setupButtons();
    this.updateConnectionIndicator();
    
    // Add cleanup on page unload
    this.unloadHandler = () => {
      console.log("[OnlineGame] Page unloading, cleaning up");
      this.cleanup();
    };
    window.addEventListener("beforeunload", this.unloadHandler);
    window.addEventListener("unload", this.unloadHandler);

    // Fetch lobby info if lobby key exists
    if (this.lobbyKey) {
      this.fetchLobbyInfo();
    } else {
      this.updateStatus("Waiting for lobby assignment...");
    }
  }

  setLobbyKey(lobbyKey) {
    console.log("[OnlineGame] setLobbyKey called:", lobbyKey);
    this.lobbyKey = lobbyKey;
    
    if (lobbyKey) {
      this.updateStatus("Lobby assigned! Fetching info...");
      this.fetchLobbyInfo();
    }
  }

  connectToServer() {
    console.log(
      "[OnlineGame] connectToServer called, WS_URL:",
      API_CONFIG.WS_URL
    );
    try {
      this.socket = new WebSocket(API_CONFIG.WS_URL);

      this.socket.onopen = () => {
        console.log("Connected to game server");
        this.connected = true;
        this.reconnectAttempts = 0; // Reset reconnection counter on success
        // User is automatically added on connection via JWT cookie on server
        this.updateStatus("Connected! Click Find Match to start.");
        this.updateConnectionIndicator();
        this.updateButtonState();
        
        // Start state watchdog
        this.startStateWatchdog();
      };

      this.socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        // Only log non-state messages to avoid console spam
        if (data.type !== "state") {
          console.log("[OnlineGame] Received message:", data.type, data);
        }
        
        // Track last state received time
        if (data.type === "state") {
          this.lastStateTime = Date.now();
        }
        
        if (data.type === "state") {
          this.gameState = data.state;
          if (this.playerId === null) {
            // Store player info from server
            this.playerUsername = this.gameState.playerUsername || "Player";
            this.opponentUsername =
              this.gameState.opponentUsername || "Opponent";

            // Update match info immediately when we receive usernames
            this.updateMatchInfo();
            this.playerUserId = this.gameState.playerUserId;
            this.opponentUserId = this.gameState.opponentUserId;

            // Determine which paddle we control based on our actual user ID (clientId)
            // and the lobby key format: "userId1-userId2" where userId1 is left (player 1)
            const lobbyParts = this.lobbyKey ? this.lobbyKey.split("-") : [];
            if (lobbyParts.length === 2 && this.clientId) {
              const leftPlayerId = parseInt(lobbyParts[0]);
              // If my actual userId (clientId) matches the left player, I'm player 1 (left paddle)
              this.playerId = this.clientId === leftPlayerId ? 1 : 2;
              console.log(
                `[OnlineGame] Determined playerId: ${this.playerId} (clientId: ${this.clientId}, leftPlayerId: ${leftPlayerId})`
              );
            } else {
              // Fallback: check if our clientId matches playerUserId from state
              if (this.clientId && this.playerUserId) {
                // playerUserId in state represents player 1 (left)
                this.playerId = this.clientId === this.playerUserId ? 1 : 2;
                console.log(
                  `[OnlineGame] Fallback playerId: ${this.playerId} (clientId: ${this.clientId}, playerUserId: ${this.playerUserId})`
                );
              } else {
                // Last resort: use ball position
                this.playerId = this.gameState.ball.x < 0 ? 1 : 2;
                console.log(
                  `[OnlineGame] Ball position fallback playerId: ${this.playerId}`
                );
              }
            }

            if (this.playerId === 1) {
              this.playerColor = "#f44336";
              this.opponentColor = "#2196f3";
            } else {
              this.playerColor = "#2196f3";
              this.opponentColor = "#f44336";
            }

            // Don't start client-side countdown - use server countdown instead
            this.gameStarted = true;
            
            // Start the prediction render loop
            this.startPredictionLoop();
          }

          // Sync ball state from server (authoritative update)
          if (this.gameState.ball) {
            this.predictedBall.x = this.gameState.ball.x;
            this.predictedBall.y = this.gameState.ball.y;
            if (typeof this.gameState.ball.dx === "number") {
              this.predictedBall.dx = this.gameState.ball.dx;
            }
            if (typeof this.gameState.ball.dy === "number") {
              this.predictedBall.dy = this.gameState.ball.dy;
            }
            this.lastBallUpdate = Date.now();
          }
          
          // Sync local paddle position with server (correction for drift)
          // Only correct if not actively moving to avoid jitter
          if (this.gameState.player && this.localPaddleDy === 0) {
            this.localPaddleY = this.gameState.player.y;
          }

          // Update countdown from server
          if (typeof this.gameState.countdown === "number") {
            this.countdown = this.gameState.countdown;
            // Active countdown shows numbers from 10 to 1, then 1 second pause at 0
            this.countdownActive = this.countdown >= 0;
          } else {
            this.countdownActive = false;
          }
          
          // Clear gameStart timeout since we received state
          if (this.gameStartTimeout) {
            clearTimeout(this.gameStartTimeout);
            this.gameStartTimeout = null;
          }

          if (this.gameStarted) {
            this.draw();
            this.updateScore();
            
            // Draw countdown overlay if active
            if (this.countdownActive && this.countdown >= 0) {
              this.drawCountdown();
            }

            // Check for game over
            if (this.gameState.gameOver && !this.gameOverShown) {
              this.gameOverShown = true;
              this.stopInputLoop(); // Stop sending input when game ends
              this.showWinnerAnimation();
            } else if (!this.gameState.gameOver && !this.countdownActive) {
              this.updateStatus("Game in progress");
            }
          }
        } else if (data.type === "waiting") {
          this.updateStatus("Waiting for opponent...");
        } else if (data.type === "gameStart") {
          this.updateStatus("Game starting!");
          
          // Set timeout to check if we receive state within 3 seconds
          if (this.gameStartTimeout) clearTimeout(this.gameStartTimeout);
          this.gameStartTimeout = setTimeout(() => {
            if (!this.gameStarted && !this.gameState) {
              console.error("[OnlineGame] No game state received after gameStart");
              this.updateStatus("Connection issue - please refresh the page");
            }
          }, 3000);
        } else if (data.type === "pauseUpdate") {
          // Sync pause state from server (affects both players)
          this.paused = !!data.paused;
          try {
            const btn =
              this.startButton || document.getElementById("startButton");
            if (btn && this.gameStarted) {
              btn.textContent = this.paused ? "Continue" : "Pause";
            }
          } catch {}
          this.updateStatus(this.paused ? "Paused" : "Game in progress");
        } else if (data.type === "chatMessage") {
          // Handle incoming chat message (auto-open chat and display)
          try {
            console.log("[Chat] Received message:", data);
            const { senderId, senderUsername, message } = data;
            if (senderId && message) {
              import("../components/chat.js")
                .then(({ openChatWindow, displayChatMessage }) => {
                  // Open chat window if it doesn't exist (auto-open on receive)
                  openChatWindow(
                    senderId,
                    senderUsername || `User ${senderId}`
                  );
                  // Defer display slightly to avoid a race where the messages container
                  // might not exist immediately after creating the chat window.
                  setTimeout(
                    () => displayChatMessage(senderId, message, false),
                    0
                  );
                })
                .catch((err) => {
                  console.error("[Chat] Failed to import chat module:", err);
                });
            }
          } catch (e) {
            console.error("Failed to handle chat message:", e);
          }
        } else if (data.type === "rematchRequest") {
          // Opponent wants a rematch
          this.opponentWantsRematch = true;
          this.updateRematchStatus();
        } else if (data.type === "rematchAccepted") {
          // Both players want rematch, reset game
          this.resetForRematch();
        } else if (data.type === "ballSync") {
          // Handle ball sync events (paddle hit, wall bounce, score, reset)
          this.handleBallSync(data);
        }
      };

      this.socket.onclose = (event) => {
        console.log("Disconnected from server, code:", event.code);
        this.connected = false;
        this.stopInputLoop();
        this.stopStateWatchdog();
        this.updateConnectionIndicator();
        
        // Don't reconnect if intentionally closed or game is over
        if (this.intentionalClose || this.gameOverShown) {
          this.updateStatus("Disconnected from server");
          return;
        }
        
        // Attempt reconnection with exponential backoff
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          const delay = Math.min(
            this.reconnectDelay * Math.pow(2, this.reconnectAttempts),
            this.maxReconnectDelay
          );
          this.reconnectAttempts++;
          this.updateStatus(`Connection lost. Reconnecting in ${Math.round(delay/1000)}s... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          
          this.reconnectTimeout = setTimeout(() => {
            console.log(`[OnlineGame] Reconnection attempt ${this.reconnectAttempts}`);
            this.connectToServer();
          }, delay);
        } else {
          this.updateStatus("Connection lost. Please refresh the page.");
        }
      };

      this.socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        // Don't stop everything on error - let onclose handle reconnection
        this.updateConnectionIndicator();
      };
    } catch (error) {
      console.error("Failed to connect to server:", error);
      this.updateStatus("Failed to connect to server");
      this.updateConnectionIndicator();
    }
  }

  startStateWatchdog() {
    this.stopStateWatchdog();
    this.stateWatchdogInterval = setInterval(() => {
      if (this.gameStarted && this.lastStateTime) {
        const timeSinceLastState = Date.now() - this.lastStateTime;
        if (timeSinceLastState > 2000) {
          console.error("[OnlineGame] No state received for 2 seconds - connection may be frozen");
          this.updateStatus("Connection frozen - try refreshing");
        }
      }
    }, 1000);
  }

  stopStateWatchdog() {
    if (this.stateWatchdogInterval) {
      clearInterval(this.stateWatchdogInterval);
      this.stateWatchdogInterval = null;
    }
  }

  setupEventListeners() {
    this.keydownHandler = (e) => {
      this.keys[e.key] = true;
    };

    this.keyupHandler = (e) => {
      this.keys[e.key] = false;
    };

    document.addEventListener("keydown", this.keydownHandler);
    document.addEventListener("keyup", this.keyupHandler);

    this.startInputLoop();
  }

  startInputLoop() {
    if (this.inputInterval) {
      clearInterval(this.inputInterval);
    }

    this.inputInterval = setInterval(() => {
      this.sendInput();
    }, this.inputThrottle);
  }
  stopInputLoop() {
    if (this.inputInterval) {
      clearInterval(this.inputInterval);
      this.inputInterval = null;
    }
  }

  sendInput() {
    if (!this.socket || !this.connected || this.paused) return;

    const paddleUp =
      this.keys["o"] || this.keys["O"] || this.keys["w"] || this.keys["W"];
    const paddleDown =
      this.keys["l"] || this.keys["L"] || this.keys["s"] || this.keys["S"];

    const currentInput = {
      paddleUp: paddleUp || false,
      paddleDown: paddleDown || false,
    };
    
    // Update local paddle velocity for smooth rendering
    if (currentInput.paddleUp) {
      this.localPaddleDy = -GAME_CONFIG.paddleSpeed;
    } else if (currentInput.paddleDown) {
      this.localPaddleDy = GAME_CONFIG.paddleSpeed;
    } else {
      this.localPaddleDy = 0;
    }

    // Only send if input has changed
    if (
      currentInput.paddleUp !== this.lastInputState.paddleUp ||
      currentInput.paddleDown !== this.lastInputState.paddleDown
    ) {
      this.socket.send(
        JSON.stringify({
          type: "input",
          playerId: this.clientId ?? null,
          ...currentInput,
        })
      );
      this.lastInputState = currentInput;
    }
  }

  setupButtons() {
    const findMatchButton = document.getElementById("findMatchButton");
    const readyButton = document.getElementById("readyButton");
    const againButton = document.getElementById("againButton");

    if (findMatchButton) {
      findMatchButton.addEventListener("click", async () => {
        if (!this.socket || !this.connected) return;
        if (this.searchingForMatch) {
          await this.cancelMatchmaking();
        } else {
          await this.startMatchmaking();
        }
      });
    }

    if (readyButton) {
      readyButton.addEventListener("click", () => {
        this.toggleReady();
      });
    }

    if (againButton) {
      againButton.addEventListener("click", () => {
        window.location.reload();
      });
    }

    this.updateButtonState();
  }

  async startMatchmaking() {
    console.log(
      "[startMatchmaking] Called, searchingForMatch:",
      this.searchingForMatch
    );
    if (this.searchingForMatch) {
      console.log("[startMatchmaking] Already searching, ignoring");
      return;
    }

    this.searchingForMatch = true;
    this.updateStatus("Searching for opponent...");
    this.updateButtonText();

    try {
      console.log("[startMatchmaking] Calling /online/queue/join");
      const res = await fetch(
        `${API_CONFIG.USER_SERVICE_URL}/online/queue/join`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      if (res.ok) {
        const data = await res.json();
        console.log("[startMatchmaking] Queue response:", data);
        if (data.matched) {
          // Instant match found
          const lobbyKey = data.lobbyKey;
          this.handleMatchFound(lobbyKey);
        } else {
          // Start polling for match status as fallback for SSE
          this.startMatchmakingPoll();
        }
      }
    } catch (e) {
      console.error("Failed to join queue:", e);
      this.searchingForMatch = false;
      this.updateStatus("Failed to join queue. Try again.");
      this.updateButtonText();
    }
  }

  startMatchmakingPoll() {
    // Polling is a fallback for SSE - use longer interval
    if (this.matchmakingPollInterval) clearInterval(this.matchmakingPollInterval);
    
    // Less aggressive polling (5s instead of 3s) since SSE should be primary
    this.matchmakingPollInterval = setInterval(async () => {
      // Stop polling if no longer searching or already matched
      if (!this.searchingForMatch || this.lobbyKey) {
        clearInterval(this.matchmakingPollInterval);
        this.matchmakingPollInterval = null;
        return;
      }
      try {
        const res = await fetch(`${API_CONFIG.USER_SERVICE_URL}/online/status`, {
          credentials: "include"
        });
        if (res.ok) {
          const data = await res.json();
          if (data.inLobby && data.lobbyKey) {
            console.log("[Matchmaking] Poll found match:", data.lobbyKey);
            clearInterval(this.matchmakingPollInterval);
            this.matchmakingPollInterval = null;
            this.handleMatchFound(data.lobbyKey);
          }
        }
      } catch (e) {
        console.error("[Matchmaking] Poll error:", e);
      }
    }, 5000); // 5 second interval as fallback
  }

  async handleMatchFound(lobbyKey) {
    // Prevent duplicate handling
    if (this.lobbyKey === lobbyKey) {
      console.log("[Matchmaking] Already handling this lobby:", lobbyKey);
      return;
    }
    
    // Stop polling immediately
    if (this.matchmakingPollInterval) {
      clearInterval(this.matchmakingPollInterval);
      this.matchmakingPollInterval = null;
    }
    
    console.log("[Matchmaking] Match confirmed:", lobbyKey);

    // Update URL without navigation (we're already on the page)
    history.replaceState(
      null,
      "",
      `/online?lobby=${encodeURIComponent(lobbyKey)}`
    );

    // Update instance directly
    this.searchingForMatch = false;
    this.lobbyKey = lobbyKey;

    // Join lobby
    try {
      console.log("[Matchmaking] Joining lobby:", lobbyKey);
      const joinRes = await fetch(
        `${API_CONFIG.USER_SERVICE_URL}/online/join`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ lobbyKey }),
        }
      );
      console.log("[Matchmaking] Join response:", joinRes.ok);
    } catch (err) {
      console.error("[Matchmaking] Join failed:", err);
    }

    // Fetch lobby info and trigger auto-start
    console.log("[Matchmaking] Fetching lobby info...");
    await this.fetchLobbyInfo();
  }

  async cancelMatchmaking() {
    if (!this.searchingForMatch) return;

    // Stop polling
    if (this.matchmakingPollInterval) {
      clearInterval(this.matchmakingPollInterval);
      this.matchmakingPollInterval = null;
    }

    try {
      await fetch(`${API_CONFIG.USER_SERVICE_URL}/online/queue/cancel`, {
        method: "POST",
        credentials: "include",
      });
    } catch (e) {
      console.error("Failed to cancel matchmaking:", e);
    }

    this.searchingForMatch = false;
    this.updateStatus("Connected! Click Start Game to find an opponent.");
    this.updateButtonText();
  }

  async fetchLobbyInfo() {
    if (!this.lobbyKey) {
      console.warn("[OnlineGame] fetchLobbyInfo called but lobbyKey is null");
      return;
    }
    console.log("[OnlineGame] Fetching lobby info for lobbyKey:", this.lobbyKey);
    try {
      const res = await fetch(
        `${
          API_CONFIG.USER_SERVICE_URL
        }/online/lobby-info?lobbyKey=${encodeURIComponent(this.lobbyKey)}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        console.log("[OnlineGame] Lobby info:", data);
        this.isChallenger = data.isChallenger || false;
        this.opponentReady = data.opponentReady || false;
        this.isRandom = data.isRandom || false;

        // Store the authenticated user ID from the response
        if (data.userId) {
          this.clientId = data.userId;
          this.playerUserId = data.userId;
          console.log(
            "[OnlineGame] User ID set from lobby info:",
            this.clientId
          );
        }

        // Store opponent info if available
        if (data.opponentUsername) {
          this.opponentUsername = data.opponentUsername;
        }
        if (data.opponentUserId) {
          this.opponentUserId = data.opponentUserId;
        }

        // Fetch own username if we don't have it yet
        if (!this.playerUsername && this.clientId) {
          try {
            const profileRes = await fetch(
              `${API_CONFIG.USER_SERVICE_URL}/profile/${this.clientId}`,
              { credentials: "include" }
            );
            if (profileRes.ok) {
              const profileData = await profileRes.json();
              this.playerUsername = profileData.username || "You";
              console.log(
                "[OnlineGame] Player username set:",
                this.playerUsername
              );
            }
          } catch (err) {
            console.error("Failed to fetch player username:", err);
          }
        }

        this.updateButtonText();
        this.updateMatchInfo();

        // Different status messages for random vs challenge
        if (this.isRandom) {
          console.log("[OnlineGame] Random match detected, will auto-start");
          this.updateStatus(
            "Random match found! Game will start automatically."
          );
          // Only the first user (based on lobby key ordering) starts the game
          // Lobby key format is "minId-maxId", so we can determine who goes first
          this.tryAutoStartRandom();
        } else {
          // For invited matches, player info will be displayed during countdown
          // (when playerId is assigned by the server, so we know which paddle each user controls)
          this.updateStatus(
            this.isChallenger
              ? this.opponentReady
                ? "Opponent is ready! You can start the game."
                : "Waiting for opponent to be ready..."
              : "Click Ready when you're prepared to play"
          );
        }
      }
    } catch (e) {
      console.error("Failed to fetch lobby info:", e);
    }
  }

  tryAutoStartRandom() {
    console.log("[OnlineGame] tryAutoStartRandom - now using ready system");
    // Random matches now use ready system - both players must click Ready
    this.updateStatus("Match found! Click Ready when you're prepared.");
    this.updateButtonState();
  }

  updateMatchInfo() {
    // Get left/right player info elements
    const leftAvatar = document.getElementById("leftAvatar");
    const leftAvatarImg = document.getElementById("leftAvatarImg");
    const leftPlayerInfo = document.getElementById("leftPlayerInfo");
    const leftUsername = document.getElementById("leftUsername");
    const leftReadyStatus = document.getElementById("leftReadyStatus");
    
    const rightAvatar = document.getElementById("rightAvatar");
    const rightAvatarImg = document.getElementById("rightAvatarImg");
    const rightPlayerInfo = document.getElementById("rightPlayerInfo");
    const rightUsername = document.getElementById("rightUsername");
    const rightReadyStatus = document.getElementById("rightReadyStatus");

    // Show player info only when in lobby (before game starts) or when we have player info
    if (this.lobbyKey) {
      // Determine which side is "me" (playerId 1 = left, playerId 2 = right)
      // But playerId is only set after game starts, so we need to use lobbyKey parsing
      const lobbyParts = this.lobbyKey ? this.lobbyKey.split("-") : [];
      let iAmLeft = false;
      
      if (lobbyParts.length === 2 && this.clientId) {
        const leftPlayerId = parseInt(lobbyParts[0]);
        iAmLeft = this.clientId === leftPlayerId;
      } else if (this.playerId) {
        iAmLeft = this.playerId === 1;
      }

      // Assign player/opponent to left/right based on paddle side
      const leftName = iAmLeft ? this.playerUsername : this.opponentUsername;
      const rightName = iAmLeft ? this.opponentUsername : this.playerUsername;
      const leftReady = iAmLeft ? this.isReady : this.opponentReady;
      const rightReady = iAmLeft ? this.opponentReady : this.isReady;
      const leftUserId = iAmLeft ? this.playerUserId : this.opponentUserId;
      const rightUserId = iAmLeft ? this.opponentUserId : this.playerUserId;

      // Update left side
      if (leftName) {
        if (leftPlayerInfo) leftPlayerInfo.style.display = "block";
        if (leftAvatar) leftAvatar.style.display = "block";
        if (leftUsername) leftUsername.textContent = leftName;
        
        // Handle avatar with fallback
        const leftAvatarFallback = document.getElementById("leftAvatarFallback");
        if (leftAvatarImg && leftUserId) {
          leftAvatarImg.src = `${API_CONFIG.USER_SERVICE_URL}/avatar/${leftUserId}`;
          leftAvatarImg.style.display = "block";
          if (leftAvatarFallback) leftAvatarFallback.style.display = "none";
          leftAvatarImg.onerror = () => { 
            leftAvatarImg.style.display = "none"; 
            if (leftAvatarFallback) leftAvatarFallback.style.display = "block";
          };
        } else if (leftAvatarFallback) {
          if (leftAvatarImg) leftAvatarImg.style.display = "none";
          leftAvatarFallback.style.display = "block";
        }
        
        if (leftReadyStatus && !this.gameStarted) {
          leftReadyStatus.textContent = leftReady ? "✓ Ready" : "Not Ready";
          leftReadyStatus.style.background = leftReady ? "rgba(74, 222, 128, 0.3)" : "rgba(255,255,255,0.1)";
          leftReadyStatus.style.color = leftReady ? "#4ade80" : "#aaa";
          leftReadyStatus.style.display = "inline-block";
        } else if (leftReadyStatus) {
          leftReadyStatus.style.display = "none";
        }
      }

      // Update right side  
      if (rightName && rightName !== "Waiting...") {
        if (rightPlayerInfo) rightPlayerInfo.style.display = "block";
        if (rightAvatar) rightAvatar.style.display = "block";
        if (rightUsername) rightUsername.textContent = rightName;
        
        // Handle avatar with fallback
        const rightAvatarFallback = document.getElementById("rightAvatarFallback");
        if (rightAvatarImg && rightUserId) {
          rightAvatarImg.src = `${API_CONFIG.USER_SERVICE_URL}/avatar/${rightUserId}`;
          rightAvatarImg.style.display = "block";
          if (rightAvatarFallback) rightAvatarFallback.style.display = "none";
          rightAvatarImg.onerror = () => { 
            rightAvatarImg.style.display = "none"; 
            if (rightAvatarFallback) rightAvatarFallback.style.display = "block";
          };
        } else if (rightAvatarFallback) {
          if (rightAvatarImg) rightAvatarImg.style.display = "none";
          rightAvatarFallback.style.display = "block";
        }
        
        if (rightReadyStatus && !this.gameStarted) {
          rightReadyStatus.textContent = rightReady ? "✓ Ready" : "Not Ready";
          rightReadyStatus.style.background = rightReady ? "rgba(74, 222, 128, 0.3)" : "rgba(255,255,255,0.1)";
          rightReadyStatus.style.color = rightReady ? "#4ade80" : "#aaa";
          rightReadyStatus.style.display = "inline-block";
        } else if (rightReadyStatus) {
          rightReadyStatus.style.display = "none";
        }
      } else {
        // Waiting for opponent
        if (rightPlayerInfo) rightPlayerInfo.style.display = "block";
        if (rightUsername) rightUsername.textContent = "Waiting...";
        if (rightAvatar) rightAvatar.style.display = "none";
        if (rightReadyStatus) rightReadyStatus.style.display = "none";
      }
    } else {
      // Hide all player info when not in lobby
      if (leftPlayerInfo) leftPlayerInfo.style.display = "none";
      if (leftAvatar) leftAvatar.style.display = "none";
      if (rightPlayerInfo) rightPlayerInfo.style.display = "none";
      if (rightAvatar) rightAvatar.style.display = "none";
    }
  }

  async toggleReady() {
    if (!this.lobbyKey) return;

    this.isReady = !this.isReady;

    try {
      const res = await fetch(`${API_CONFIG.USER_SERVICE_URL}/online/ready`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          lobbyKey: this.lobbyKey,
          ready: this.isReady,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        console.log("[OnlineGame] Ready response:", data);

        // Update opponent ready status from response
        if (typeof data.opponentReady === "boolean") {
          this.opponentReady = data.opponentReady;
        }

        this.updateButtonState();
        this.updateMatchInfo();

        // Update status based on ready state
        if (this.isReady) {
          if (this.opponentReady) {
            this.updateStatus("Both players ready! Starting game...");
          } else {
            this.updateStatus("Ready! Waiting for opponent...");
          }
        } else {
          this.updateStatus("Click Ready when you're prepared");
        }

        // Auto-start if both players are ready
        if (this.isReady && this.opponentReady && !this.gameStarted) {
          if (!this.lobbyKey) {
            console.error("[OnlineGame] Cannot auto-start - lobbyKey is missing!");
            this.updateStatus("Error: Lobby key missing. Please refresh the page.");
            return;
          }
          console.log("[OnlineGame] Both ready, starting game now with lobbyKey:", this.lobbyKey);
          this.startGame();
        }
      }
    } catch (e) {
      console.error("Failed to toggle ready:", e);
      this.isReady = !this.isReady; // revert on error
    }
  }

  updateButtonState() {
    const findMatchBtn = document.getElementById("findMatchButton");
    const readyBtn = document.getElementById("readyButton");
    const againBtn = document.getElementById("againButton");

    // Update Find Match button
    if (findMatchBtn) {
      if (this.searchingForMatch) {
        findMatchBtn.textContent = "Cancel Search";
        findMatchBtn.disabled = false;
        findMatchBtn.style.display = "inline-block";
      } else if (this.lobbyKey && !this.gameOverShown) {
        // In lobby - hide find match button
        findMatchBtn.style.display = "none";
      } else {
        findMatchBtn.textContent = "Find Match";
        findMatchBtn.disabled = !this.connected || this.gameStarted;
        findMatchBtn.style.display = "inline-block";
      }
      findMatchBtn.style.opacity = findMatchBtn.disabled ? "0.5" : "1";
      findMatchBtn.style.cursor = findMatchBtn.disabled
        ? "not-allowed"
        : "pointer";
    }

    // Update Ready button
    if (readyBtn) {
      if (this.lobbyKey && !this.gameStarted && !this.gameOverShown) {
        // In lobby - show ready button
        readyBtn.style.display = "inline-block";
        readyBtn.textContent = this.isReady ? "Not Ready" : "Ready";
        readyBtn.className = this.isReady
          ? "btn btn-secondary btn-large"
          : "btn btn-primary btn-large";
        readyBtn.disabled = false;
        readyBtn.style.opacity = "1";
        readyBtn.style.cursor = "pointer";
      } else {
        readyBtn.style.display = "none";
      }
    }

    // Update Again button
    if (againBtn) {
      if (this.gameOverShown) {
        againBtn.style.display = "inline-block";
        againBtn.disabled = false;
      } else {
        againBtn.style.display = "none";
      }
      againBtn.style.opacity = againBtn.disabled ? "0.5" : "1";
      againBtn.style.cursor = againBtn.disabled ? "not-allowed" : "pointer";
    }
  }

  updateButtonText() {
    // Legacy compatibility - just call updateButtonState
    this.updateButtonState();
  }

  updateOpponentReady(ready) {
    this.opponentReady = ready;
    this.updateButtonState();
    this.updateMatchInfo();

    // Update status
    if (ready) {
      if (this.isReady) {
        this.updateStatus("Both players ready! Starting game...");
        // Auto-start if both ready
        if (!this.gameStarted) {
          this.startGame();
        }
      } else {
        this.updateStatus("Opponent is ready! Click Ready to start.");
      }
    } else {
      this.updateStatus("Waiting for opponent to be ready...");
    }
  }

  startGame() {
    if (!this.socket || !this.connected || this.gameStarted) return;

    if (!this.lobbyKey) {
      console.error("[OnlineGame] Cannot start game - no lobby key set");
      this.updateStatus("Error: No lobby key. Please refresh and try again.");
      return;
    }

    console.log("[OnlineGame] Starting game - both players ready, lobbyKey:", this.lobbyKey);
    this.socket.send(
      JSON.stringify({
        type: "startGame",
        playerId: this.clientId ?? null,
        lobbyKey: this.lobbyKey,
        userId: this.clientId,
      })
    );
  }

  updateConnectionIndicator() {
    const ind = document.getElementById("connIndicator");
    const text = document.getElementById("connText");
    if (ind) ind.classList.toggle("online", !!this.connected);
    if (text) text.textContent = this.connected ? "Online" : "Offline";
  }

  draw() {
    if (!this.ctx || !this.gameState || this.playerId === null) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Use local paddle position for player's paddle (smooth), server position for opponent
    const playerPaddleY = this.localPaddleY;
    const opponentPaddleY = this.gameState.opponent.y;

    this.ctx.fillStyle = this.playerColor || "#0000ff";
    this.ctx.fillRect(this.gameState.player.x, playerPaddleY, 10, 100);

    this.ctx.fillStyle = this.opponentColor || "#ff0000";
    this.ctx.fillRect(
      this.gameState.opponent.x,
      opponentPaddleY,
      10,
      100
    );

    this.ctx.fillStyle = "#ffffff";

    // Use predicted ball position for smoother rendering
    const ballX = this.ballPredictionEnabled ? this.predictedBall.x : this.gameState.ball.x;
    const ballY = this.ballPredictionEnabled ? this.predictedBall.y : this.gameState.ball.y;

    // Only draw the ball if it's within the visible canvas bounds
    if (ballX >= -10 && ballX <= this.canvas.width + 10) {
      this.ctx.beginPath();
      this.ctx.arc(ballX, ballY, 10, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.setLineDash([5, 5]);
    this.ctx.beginPath();
    this.ctx.moveTo(this.canvas.width / 2, 0);
    this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
    this.ctx.strokeStyle = "#ffffff";
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  /**
   * Handle ball sync events from server (paddle hit, wall bounce, score, reset)
   * These events provide authoritative ball state and trigger prediction correction
   */
  handleBallSync(data) {
    if (!data.ball) return;
    
    // Update predicted ball with authoritative server state
    this.predictedBall.x = data.ball.x;
    this.predictedBall.y = data.ball.y;
    this.predictedBall.dx = data.ball.dx;
    this.predictedBall.dy = data.ball.dy;
    this.lastBallUpdate = Date.now();
    
    // Update scores from sync message
    if (this.gameState) {
      if (this.playerId === 1) {
        this.gameState.player.score = data.leftScore;
        this.gameState.opponent.score = data.rightScore;
      } else {
        this.gameState.player.score = data.rightScore;
        this.gameState.opponent.score = data.leftScore;
      }
      this.updateScore();
    }
    
    // Log significant events (not wall bounces to reduce spam)
    if (data.event !== "wallBounce") {
      console.log(`[BallSync] ${data.event}: pos(${data.ball.x.toFixed(1)}, ${data.ball.y.toFixed(1)}) vel(${data.ball.dx.toFixed(2)}, ${data.ball.dy.toFixed(2)})`);
    }
  }

  /**
   * Start the client-side ball prediction render loop
   * Runs at 60fps to smoothly interpolate ball position between server updates
   */
  startPredictionLoop() {
    if (this.animationFrameId) return; // Already running
    
    let lastFrameTime = performance.now();
    
    const predictionLoop = (currentTime) => {
      if (!this.gameStarted || this.paused || this.gameOverShown) {
        this.animationFrameId = requestAnimationFrame(predictionLoop);
        return;
      }
      
      const deltaTime = (currentTime - lastFrameTime) / 1000; // Convert to seconds
      lastFrameTime = currentTime;
      
      // Update local paddle position for smooth movement
      this.updateLocalPaddle(deltaTime);
      
      // Only predict ball if we have velocity data and countdown is done
      if (this.ballPredictionEnabled && this.predictedBall.dx !== 0 && !this.countdownActive) {
        this.updateBallPrediction(deltaTime);
      }
      
      // Redraw with predicted positions
      if (this.gameState && !this.countdownActive) {
        this.draw();
      }
      
      this.animationFrameId = requestAnimationFrame(predictionLoop);
    };
    
    this.animationFrameId = requestAnimationFrame(predictionLoop);
  }

  /**
   * Stop the prediction render loop
   */
  stopPredictionLoop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Update ball position using client-side prediction
   * Simulates ball physics locally between server updates for smooth movement
   */
  updateBallPrediction(deltaTime) {
    // Scale by 60 because server runs at 60fps and velocity is per-frame
    const frameScale = deltaTime * 60;
    
    // Move ball by velocity
    this.predictedBall.x += this.predictedBall.dx * frameScale;
    this.predictedBall.y += this.predictedBall.dy * frameScale;
    
    // Wall bounce prediction (top/bottom walls ONLY - not left/right)
    if (this.predictedBall.y - GAME_CONFIG.blockSize <= 0) {
      this.predictedBall.y = GAME_CONFIG.blockSize;
      this.predictedBall.dy = Math.abs(this.predictedBall.dy);
    } else if (this.predictedBall.y + GAME_CONFIG.blockSize >= GAME_CONFIG.height) {
      this.predictedBall.y = GAME_CONFIG.height - GAME_CONFIG.blockSize;
      this.predictedBall.dy = -Math.abs(this.predictedBall.dy);
    }
    
    // Let ball continue past left/right boundaries (no clamping)
    // Server will reset ball position after scoring
  }

  /**
   * Update local paddle position for smooth movement
   */
  updateLocalPaddle(deltaTime) {
    if (this.localPaddleDy === 0) return;
    
    const frameScale = deltaTime * 60; // Scale to match server's 60fps
    this.localPaddleY += this.localPaddleDy * frameScale;
    
    // Clamp to bounds
    if (this.localPaddleY < 0) this.localPaddleY = 0;
    if (this.localPaddleY > GAME_CONFIG.maxPaddleY) this.localPaddleY = GAME_CONFIG.maxPaddleY;
  }

  updateScore() {
    if (!this.gameState) return;

    const leftScoreElement = document.querySelector(".player-left");
    const rightScoreElement = document.querySelector(".player-right");

    if (this.playerId === 1) {
      if (leftScoreElement) {
        leftScoreElement.textContent = this.gameState.player.score;
      }
      if (rightScoreElement) {
        rightScoreElement.textContent = this.gameState.opponent.score;
      }
    } else {
      if (leftScoreElement) {
        leftScoreElement.textContent = this.gameState.opponent.score;
      }
      if (rightScoreElement) {
        rightScoreElement.textContent = this.gameState.player.score;
      }
    }
  }

  startCountdown() {
    this.countdown = 10;
    this.gameStarted = true; // Start drawing immediately
    this.countdownActive = true; // Track countdown state separately

    const countdownInterval = setInterval(() => {
      this.updateStatus(`Game starts in ${this.countdown}...`);

      this.countdown--;

      if (this.countdown < 0) {
        clearInterval(countdownInterval);
        this.countdownActive = false;
        this.updateStatus("Game in progress");
        // Switch Start button to Pause when game begins
        try {
          const btn =
            this.startButton || document.getElementById("startButton");
          if (btn) btn.textContent = "Pause";
        } catch {}
        // Display player info when game starts
        this.displayPlayerInfo();
      }
    }, 1000);
  }

  async displayPlayerInfo() {
    // Fetch avatars for both players
    let myAvatar = null;
    let opponentAvatar = null;

    try {
      if (this.playerUserId) {
        const res = await fetch(
          `${API_CONFIG.USER_SERVICE_URL}/profile/${this.playerUserId}`,
          {
            credentials: "include",
          }
        );
        if (res.ok) {
          const data = await res.json();
          myAvatar = data.avatar;
        }
      }
    } catch (e) {
      console.error("Failed to fetch player avatar:", e);
    }

    try {
      if (this.opponentUserId) {
        const res = await fetch(
          `${API_CONFIG.USER_SERVICE_URL}/profile/${this.opponentUserId}`,
          {
            credentials: "include",
          }
        );
        if (res.ok) {
          const data = await res.json();
          opponentAvatar = data.avatar;
        }
      }
    } catch (e) {
      console.error("Failed to fetch opponent avatar:", e);
    }

    // If my paddle is left, put me on left and opponent on right. Otherwise opposite.
    if (this.playerId === 1) {
      this.updatePlayerInfoDisplay("Left", this.playerUsername, myAvatar);
      this.updatePlayerInfoDisplay(
        "Right",
        this.opponentUsername,
        opponentAvatar
      );
    } else {
      this.updatePlayerInfoDisplay("Right", this.playerUsername, myAvatar);
      this.updatePlayerInfoDisplay(
        "Left",
        this.opponentUsername,
        opponentAvatar
      );
    }
  }

  updatePlayerInfoDisplay(side, username, avatar) {
    const container = document.getElementById(`playerInfo${side}`);
    if (!container) return;

    // Use uploaded avatar if available, otherwise show gradient placeholder with initial
    const avatarHtml = avatar
      ? `<img src="${avatar}" alt="${username}" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 2px solid #667eea;">`
      : `<div style="width: 100px; height: 100px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 40px;">${username
          .charAt(0)
          .toUpperCase()}</div>`;

    container.innerHTML = `
      ${side === "Left" ? avatarHtml : ""}
      <span style="font-weight: 600; font-size: 20px; color: white;">${username}</span>
      ${side === "Right" ? avatarHtml : ""}
    `;
  }

  async showWinnerAnimation() {
    if (!this.gameState) return;

    // Delete lobby when game ends
    if (this.lobbyKey) {
      try {
        await fetch(`${API_CONFIG.USER_SERVICE_URL}/online/lobby/delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ lobbyKey: this.lobbyKey }),
        });
        console.log("[OnlineGame] Lobby deleted:", this.lobbyKey);
      } catch (e) {
        console.error("[OnlineGame] Failed to delete lobby:", e);
      }
    }

    // Determine winner
    const playerScore = this.gameState.player.score;
    const opponentScore = this.gameState.opponent.score;
    const didIWin = playerScore > opponentScore;

    const winnerUsername = didIWin
      ? this.playerUsername
      : this.opponentUsername;
    const winnerUserId = didIWin ? this.playerUserId : this.opponentUserId;

    // Fetch winner's avatar
    let winnerAvatar = null;
    try {
      if (winnerUserId) {
        const res = await fetch(
          `${API_CONFIG.USER_SERVICE_URL}/profile/${winnerUserId}`,
          {
            credentials: "include",
          }
        );
        if (res.ok) {
          const data = await res.json();
          winnerAvatar = data.avatar;
        }
      }
    } catch (e) {
      console.error("Failed to fetch winner avatar:", e);
    }

    // Create winner overlay
    const overlay = document.createElement("div");
    overlay.id = "winnerOverlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      animation: fadeIn 0.5s ease-in;
    `;

    // Add CSS animation
    if (!document.getElementById("winnerAnimationStyle")) {
      const style = document.createElement("style");
      style.id = "winnerAnimationStyle";
      style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.5); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    // Create content container
    const content = document.createElement("div");
    content.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 30px;
      animation: scaleIn 0.6s ease-out;
    `;

    // Add avatar if exists
    if (winnerAvatar) {
      const avatarImg = document.createElement("img");
      avatarImg.src = winnerAvatar;
      avatarImg.alt = winnerUsername;
      avatarImg.style.cssText = `
        width: 300px;
        height: 300px;
        border-radius: 50%;
        object-fit: cover;
        border: 5px solid #667eea;
        box-shadow: 0 0 40px rgba(102, 126, 234, 0.6);
      `;
      content.appendChild(avatarImg);
    }

    // Add winner text
    const winnerText = document.createElement("div");
    winnerText.textContent = `${winnerUsername} won!`;
    winnerText.style.cssText = `
      color: white;
      font-size: 48px;
      font-weight: bold;
      text-shadow: 0 0 20px rgba(102, 126, 234, 0.8);
      text-align: center;
    `;
    content.appendChild(winnerText);

    overlay.appendChild(content);
    document.body.appendChild(overlay);

    this.updateStatus(`${winnerUsername} won!`);

    // Remove overlay after 5 seconds and show rematch button
    setTimeout(() => {
      overlay.style.animation = "fadeIn 0.5s ease-out reverse";
      setTimeout(() => {
        overlay.remove();
        this.showRematchButton();
      }, 500);
    }, 5000);
  }

  showRematchButton() {
    // Get the canvas and its position
    const canvas = document.getElementById("gameCanvas");
    if (!canvas) return;

    // Create rematch container
    const rematchContainer = document.createElement("div");
    rematchContainer.id = "rematchContainer";
    rematchContainer.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 15px;
      z-index: 100;
      animation: scaleIn 0.5s ease-out;
    `;

    // Create rematch button
    const rematchBtn = document.createElement("button");
    rematchBtn.id = "rematchButton";
    rematchBtn.textContent = "Play Again";
    rematchBtn.style.cssText = `
      padding: 15px 40px;
      font-size: 24px;
      font-weight: bold;
      color: white;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      border-radius: 10px;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
      transition: transform 0.2s, box-shadow 0.2s;
    `;
    rematchBtn.onmouseover = () => {
      rematchBtn.style.transform = "scale(1.05)";
      rematchBtn.style.boxShadow = "0 6px 20px rgba(102, 126, 234, 0.6)";
    };
    rematchBtn.onmouseout = () => {
      rematchBtn.style.transform = "scale(1)";
      rematchBtn.style.boxShadow = "0 4px 15px rgba(102, 126, 234, 0.4)";
    };
    rematchBtn.onclick = () => this.requestRematch();

    // Create status message element
    const statusMsg = document.createElement("div");
    statusMsg.id = "rematchStatus";
    statusMsg.style.cssText = `
      color: white;
      font-size: 18px;
      text-align: center;
      min-height: 30px;
    `;

    rematchContainer.appendChild(rematchBtn);
    rematchContainer.appendChild(statusMsg);
    
    // Create a wrapper around the canvas to position the button relative to it
    let canvasWrapper = canvas.parentElement.querySelector('.canvas-wrapper');
    if (!canvasWrapper) {
      canvasWrapper = document.createElement("div");
      canvasWrapper.className = "canvas-wrapper";
      canvasWrapper.style.cssText = `
        position: relative;
        display: inline-block;
        margin: 0 auto;
      `;
      canvas.parentNode.insertBefore(canvasWrapper, canvas);
      canvasWrapper.appendChild(canvas);
    }
    
    canvasWrapper.appendChild(rematchContainer);

    this.updateRematchStatus();
  }

  requestRematch() {
    if (this.rematchRequested) return;

    this.rematchRequested = true;

    // Send rematch request to server
    if (this.socket && this.connected) {
      this.socket.send(JSON.stringify({ type: "requestRematch" }));
    }

    this.updateRematchStatus();
  }

  updateRematchStatus() {
    const statusMsg = document.getElementById("rematchStatus");
    if (!statusMsg) return;

    if (this.rematchRequested && this.opponentWantsRematch) {
      statusMsg.textContent = "Both players ready! Starting new game...";
      statusMsg.style.color = "#4ade80";
    } else if (this.rematchRequested) {
      statusMsg.textContent = "Waiting for opponent...";
      statusMsg.style.color = "#fbbf24";
    } else if (this.opponentWantsRematch) {
      const opponentName = this.opponentUsername || "Opponent";
      statusMsg.textContent = `${opponentName} wants a rematch`;
      statusMsg.style.color = "#60a5fa";
    } else {
      statusMsg.textContent = "";
    }
  }

  resetForRematch() {
    // Remove rematch UI
    const rematchContainer = document.getElementById("rematchContainer");
    if (rematchContainer) {
      rematchContainer.remove();
    }

    // Clear player info displays
    const player1Info = document.getElementById("player1-info");
    const player2Info = document.getElementById("player2-info");
    if (player1Info) player1Info.innerHTML = "";
    if (player2Info) player2Info.innerHTML = "";

    // Clear all cached game state (avatars, usernames, IDs, colors, etc.)
    this.gameState = null;
    this.playerId = null;
    this.playerUsername = null;
    this.opponentUsername = null;
    this.playerUserId = null;
    this.opponentUserId = null;
    this.playerColor = null;
    this.opponentColor = null;

    // Reset game flags
    this.gameOverShown = false;
    this.rematchRequested = false;
    this.opponentWantsRematch = false;
    this.gameStarted = false;
    this.countdown = 0;
    this.paused = false;

    // Reset input state
    this.keys = {};
    this.lastInputState = { paddleUp: false, paddleDown: false };
    
    // Reset local paddle position
    this.localPaddleY = GAME_CONFIG.height / 2 - GAME_CONFIG.paddleHeight / 2;
    this.localPaddleDy = 0;
    
    // Restart input loop (it may have been stopped on game over)
    this.startInputLoop();

    this.updateStatus("Starting rematch...");

    // The backend will send a new gameState message which will trigger
    // the normal game initialization flow including player assignment,
    // avatar fetching, and countdown - just like a fresh game
  }

  drawCountdown() {
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw paddles during countdown
    if (this.gameState && this.gameState.player && this.gameState.opponent) {
      this.ctx.fillStyle = this.playerColor || "#0000ff";
      this.ctx.fillRect(this.gameState.player.x, this.gameState.player.y, 10, 100);

      this.ctx.fillStyle = this.opponentColor || "#ff0000";
      this.ctx.fillRect(this.gameState.opponent.x, this.gameState.opponent.y, 10, 100);
    }

    // Draw center line
    this.ctx.setLineDash([5, 5]);
    this.ctx.beginPath();
    this.ctx.moveTo(this.canvas.width / 2, 0);
    this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
    this.ctx.strokeStyle = "#ffffff";
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Show countdown number only from 10 to 1 (not at 0)
    if (this.countdown > 0) {
      this.ctx.fillStyle = "#ffffff";
      this.ctx.font = "72px Arial";
      this.ctx.textAlign = "center";
      this.ctx.fillText(
        this.countdown.toString(),
        this.canvas.width / 2,
        this.canvas.height / 2 + 25
      );
    }
  }
  updateStatus(message) {
    const statusElement = document.getElementById("status");
    if (statusElement) {
      statusElement.textContent = message;
    }
  }

  cleanup() {
    this.intentionalClose = true; // Prevent reconnection attempts
    this.stopInputLoop();
    this.stopStateWatchdog();
    this.stopPredictionLoop(); // Stop ball prediction loop
    
    // Clear reconnection timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Stop matchmaking poll
    if (this.matchmakingPollInterval) {
      clearInterval(this.matchmakingPollInterval);
      this.matchmakingPollInterval = null;
    }

    // Delete lobby if exists
    if (this.lobbyKey) {
      fetch(`${API_CONFIG.USER_SERVICE_URL}/online/lobby/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ lobbyKey: this.lobbyKey }),
      }).catch(e => console.error("[OnlineGame] Failed to delete lobby on cleanup:", e));
    }

    // Cancel matchmaking if searching
    if (this.searchingForMatch) {
      fetch(`${API_CONFIG.USER_SERVICE_URL}/online/queue/cancel`, {
        method: "POST",
        credentials: "include",
      }).catch(e => console.error("[OnlineGame] Failed to cancel queue on cleanup:", e));
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    if (this.keydownHandler) {
      document.removeEventListener("keydown", this.keydownHandler);
      this.keydownHandler = null;
    }
    if (this.keyupHandler) {
      document.removeEventListener("keyup", this.keyupHandler);
      this.keyupHandler = null;
    }
    if (this.unloadHandler) {
      window.removeEventListener("beforeunload", this.unloadHandler);
      window.removeEventListener("unload", this.unloadHandler);
      this.unloadHandler = null;
    }

    // Clear all game state and cached data
    this.connected = false;
    this.gameStarted = false;
    this.gameState = null;
    this.playerId = null;
    this.gameOverShown = false;
    this.rematchRequested = false;
    this.opponentWantsRematch = false;
    this.countdown = 0;
    this.paused = false;

    // Clear cached player data
    this.playerUsername = null;
    this.opponentUsername = null;
    this.playerUserId = null;
    this.opponentUserId = null;
    this.playerColor = null;
    this.opponentColor = null;

    // Reset input state
    this.keys = {};
    this.lastInputState = { paddleUp: false, paddleDown: false };

    // Remove winner overlay if it exists
    const overlay = document.getElementById("winnerOverlay");
    if (overlay) {
      overlay.remove();
    }

    // Remove rematch container if it exists
    const rematchContainer = document.getElementById("rematchContainer");
    if (rematchContainer) {
      rematchContainer.remove();
    }

    // Clear player info displays
    const player1Info = document.getElementById("player1-info");
    const player2Info = document.getElementById("player2-info");
    if (player1Info) player1Info.innerHTML = "";
    if (player2Info) player2Info.innerHTML = "";
  }
}

window.initOnlineGame = (clientId) => {
  console.log("[initOnlineGame] Called with clientId:", clientId);
  console.trace("[initOnlineGame] Call stack");

  // Check if we already have an instance with the same lobby
  const params = new URLSearchParams(window.location.search);
  const lobbyKey = params.get("lobby");

  if (window.onlineGameInstance) {
    // If we have an instance and it matches the current lobby, don't reinitialize
    if (lobbyKey && window.onlineGameInstance.lobbyKey === lobbyKey) {
      console.log("[initOnlineGame] Same lobby, skipping reinitialization");
      return;
    }

    console.log("[initOnlineGame] Cleaning up existing instance");
    if (typeof window.onlineGameInstance.cleanup === "function") {
      window.onlineGameInstance.cleanup();
    }
  }

  const game = new OnlineGame(clientId);
  window.onlineGameInstance = game;
  game.init();
};
