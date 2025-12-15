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

class TournamentGame {
  constructor(clientId = null) {
    this.canvas = null;
    this.ctx = null;
    this.socket = null;
    this.gameState = null;
    this.keys = {};
    this.connected = false;
    this.playerId = null;
    this.clientId = clientId;
    this.playerUsername = null;
    console.log("[TournamentGame] Initialized with clientId:", clientId);
    this.tournament = { id: null, round: 0, role: null, opponentId: null, opponentUsername: null };
    this.gameStarted = false;
    this.countdown = 0;
    this.isReady = false;
    this.roundComplete = false; // Track if waiting for next round
    this.isEliminated = false; // Track if player has been eliminated from tournament

    this.lastInputSent = 0;
    this.inputThrottle = 1000 / 60;
    this.inputInterval = null;
    this.lastInputState = { paddleUp: false, paddleDown: false };
    this.paused = false;
    this.startButton = null;
    this.stateWatchdogInterval = null;
    this.lastStateTime = null;
    this.countdownActive = false;
    this.readyTimeoutInterval = null; // Interval for ready timeout countdown
    this.gameOverHandled = false; // Track if game over animation was shown

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
    this.setupEventListeners();
    this.connectToServer();
    this.setupButtons();
    this.setupTournamentControls();
    this.updateConnectionIndicator();

    // Add cleanup on page unload
    this.unloadHandler = () => {
      console.log("[TournamentGame] Page unloading, cleaning up");
      this.cleanup();
    };
    window.addEventListener("beforeunload", this.unloadHandler);
    window.addEventListener("unload", this.unloadHandler);
  }

  connectToServer() {
    try {
      this.socket = new WebSocket(API_CONFIG.WS_URL);

      this.socket.onopen = async () => {
        console.log("Connected to tournament server");
        this.connected = true;
        this.reconnectAttempts = 0; // Reset reconnection counter on success
        this.updateStatus("Connected! Create or join a tournament to begin.");
        this.updateConnectionIndicator();

        // Fetch player username if we have clientId
        if (this.clientId && !this.playerUsername) {
          try {
            const profileRes = await fetch(
              `${API_CONFIG.USER_SERVICE_URL}/profile/${this.clientId}`,
              { credentials: "include" }
            );
            if (profileRes.ok) {
              const profileData = await profileRes.json();
              this.playerUsername = profileData.username || "You";
              console.log("[TournamentGame] Player username set:", this.playerUsername);
            }
          } catch (err) {
            console.error("Failed to fetch player username:", err);
          }
        }

        // Start state watchdog
        this.startStateWatchdog();

        // Auto-rejoin tournament if ID is in sessionStorage
        // Ignore lobby keys from online games (they contain dashes)
        try {
          const tid = sessionStorage.getItem("currentTournamentId");
          if (tid && !tid.includes("-")) {
            console.log(`Auto-rejoining tournament ${tid}...`);
            this.rejoinTournament(tid);
          }
        } catch { }
      };

      this.socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "state") {
          this.gameState = data.state;
          this.lastStateTime = Date.now();

          // Update countdown from server
          if (typeof this.gameState.countdown === "number") {
            const wasCountdownActive = this.countdownActive;
            this.countdown = this.gameState.countdown;
            this.countdownActive = this.countdown > 0;
            // Hide Ready button when countdown starts
            if (this.countdownActive && !wasCountdownActive) {
              this.updateTournamentButtons();
            }
          } else {
            this.countdownActive = false;
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

          if (this.playerId === null) {
            // Determine player ID based on tournament role
            if (this.tournament.role === "left") {
              this.playerId = 1;
              this.playerColor = "#f44336";
              this.opponentColor = "#2196f3";
            } else if (this.tournament.role === "right") {
              this.playerId = 2;
              this.playerColor = "#2196f3";
              this.opponentColor = "#f44336";
            } else {
              // Fallback for non-tournament games
              this.playerId = this.gameState.ball.x < 0 ? 1 : 2;
              if (this.playerId === 1) {
                this.playerColor = "#f44336";
                this.opponentColor = "#2196f3";
              } else {
                this.playerColor = "#2196f3";
                this.opponentColor = "#f44336";
              }
            }
            this.startCountdown();
            this.startPredictionLoop(); // Start ball prediction
          }
          if (this.gameStarted) {
            this.draw();
            this.updateScore();

            // Draw countdown overlay if active
            if (this.countdownActive && this.countdown >= 0) {
              this.drawCountdown();
            }

            if (!this.countdownActive) {
              this.updateStatus("Tournament match in progress");
            }

            // Check for game over
            if (this.gameState.gameOver && !this.gameOverHandled) {
              this.gameOverHandled = true;
              this.showTournamentMatchWinner();
            }
          }
        } else if (data.type === "waiting") {
          this.updateStatus("Waiting for tournament match...");
        } else if (data.type === "gameStart") {
          this.updateStatus("Tournament match starting!");
        } else if (data.type === "tournamentUpdate") {
          if (data.tournamentId) {
            this.tournament.id = data.tournamentId;
            this.updateTournamentIdDisplay();
          }
          this.updateStatus(`[Tournament ${data.status}] ${data.message}`);
          this.updateTournamentButtons();
        } else if (data.type === "tournamentMatch") {
          this.tournament.id = data.tournamentId;
          this.tournament.round = data.round;
          this.tournament.role = data.role;
          this.tournament.opponentId = data.opponentId;
          this.tournament.opponentUsername = data.opponentUsername || `Player ${data.opponentId}`;
          // Reset round complete flag so game can start
          this.roundComplete = false;
          this.isReady = false;
          this.gameOverHandled = false; // Reset game over flag for new match
          // Reset player ID so countdown will trigger again for new match
          this.playerId = null;
          this.gameStarted = false;

          // CRITICAL: Restart input loop in case it was stopped (e.g., after previous tournament)
          this.startInputLoop();

          this.updateTournamentIdDisplay();
          this.updateStatus(
            `Tournament match starting (Round ${data.round}). Opponent: ${this.tournament.opponentUsername}. You are ${data.role}.`
          );
          this.updateTournamentButtons();
          // Update player info display
          this.updatePlayerInfoDisplay();
        } else if (data.type === "tournamentCompleted") {
          const msg = `Tournament ${data.tournamentId} completed. Winner: ${data.winnerId}`;
          this.updateStatus(msg);

          // Stop all game loops
          if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
          }
          this.stopInputLoop();
          this.stopStateWatchdog();

          // Reset tournament state to allow creating/joining new tournaments
          this.tournament.id = null;
          this.tournament.round = 0;
          this.tournament.role = null;
          this.tournament.opponentId = null;
          this.tournament.opponentUsername = null;
          this.isReady = false;
          this.roundComplete = false;
          this.gameStarted = false;
          this.gameState = null;
          this.playerId = null;
          this.isEliminated = false;
          this.countdownActive = false;
          this.countdown = 0;
          this.gameOverHandled = false;
          this.paused = false;

          // Reset input state
          this.keys = {};
          this.lastInputState = { paddleUp: false, paddleDown: false };

          // Reset local paddle
          this.localPaddleY = 312.5; // GAME_CONFIG.height / 2 - GAME_CONFIG.paddleHeight / 2
          this.localPaddleDy = 0;

          // Reset predicted ball
          this.predictedBall = { x: 500, y: 350, dx: 0, dy: 0 };

          // Clear from sessionStorage
          try {
            sessionStorage.removeItem("currentTournamentId");
          } catch { }

          // Clear the canvas
          if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          }

          // Reset score display
          const leftScoreElement = document.querySelector(".player-left");
          const rightScoreElement = document.querySelector(".player-right");
          if (leftScoreElement) leftScoreElement.textContent = "0";
          if (rightScoreElement) rightScoreElement.textContent = "0";

          // Clear bracket display
          const bracketContainer = document.getElementById("bracketContainer");
          if (bracketContainer) {
            bracketContainer.innerHTML = "";
          }

          // Clear participants display
          const participantsList = document.getElementById("participantsList");
          if (participantsList) {
            participantsList.innerHTML = "";
          }
          const participantCount = document.getElementById("participantCount");
          if (participantCount) {
            participantCount.textContent = "0";
          }

          // Update UI
          this.updateTournamentIdDisplay();
          this.updateTournamentButtons();

          // Show Play Again button
          this.showPlayAgainButton();
        } else if (data.type === "tournamentParticipants") {
          // Update participant count and list
          this.updateParticipants(
            data.count,
            data.participants,
            data.round,
            data.status
          );
        } else if (data.type === "tournamentBracket") {
          // Update tournament bracket display
          this.updateBracket(data.bracket, data.round);
        } else if (data.type === "tournamentRoundComplete") {
          // Round completed, waiting for players to ready up
          this.roundComplete = true;
          this.gameStarted = false;
          this.isReady = false;
          this.updateStatus(data.message);
          this.updateTournamentButtons();
        } else if (data.type === "tournamentRoundReady") {
          // Update ready status display for current round
          this.updateRoundReadyStatus(data.readyPlayers, data.activePlayers);
        } else if (data.type === "tournamentForfeit") {
          // Handle player forfeit notification
          console.log("[Tournament] Forfeit:", data);
          this.updateStatus(data.message);

          // Check if we won by forfeit (we're the winner)
          if (data.winnerId === this.clientId) {
            console.log("[Tournament] We won by forfeit!");
            // Stop the game loop if running
            if (this.animationFrame) {
              cancelAnimationFrame(this.animationFrame);
              this.animationFrame = null;
            }
            // Show win animation
            this.showTournamentMatchWinner(true, "Opponent forfeited!");
            // Reset game state for next round
            this.gameStarted = false;
            this.roundComplete = true;
            this.isReady = false;
          } else if (data.forfeitedPlayerId === this.clientId) {
            // We are the one who forfeited - game should end
            console.log("[Tournament] We forfeited");
            if (this.animationFrame) {
              cancelAnimationFrame(this.animationFrame);
              this.animationFrame = null;
            }
            this.gameStarted = false;
            this.isEliminated = true;
          }

          // Update bracket display will happen via tournamentBracket message
          this.updateTournamentButtons();
        } else if (data.type === "tournamentReadyTimeout") {
          // Handle ready timeout warning
          console.log("[Tournament] Ready timeout warning:", data);
          this.updateStatus(`⚠️ ${data.message}`);
          // Start countdown display
          this.showReadyTimeoutCountdown(data.timeoutSeconds);
        } else if (data.type === "pauseUpdate") {
          this.paused = !!data.paused;
          try {
            const btn =
              this.startButton || document.getElementById("startButton");
            if (btn && this.gameStarted) {
              btn.textContent = this.paused ? "Continue" : "Pause";
            }
          } catch { }
          this.updateStatus(
            this.paused ? "Paused" : "Tournament match in progress"
          );
        } else if (data.type === "ballSync") {
          // Handle ball sync events (paddle hit, wall bounce, score, reset)
          this.handleBallSync(data);
        } else if (data.type === "chatMessage") {
          // Handle incoming chat message (auto-open chat and display)
          try {
            console.log("[Chat] Received message:", data);
            const { senderId, senderUsername, message } = data;
            if (senderId && message) {
              import("../components/chat.js")
                .then(({ openChatWindow, displayChatMessage }) => {
                  openChatWindow(senderId, senderUsername || `User ${senderId}`);
                  setTimeout(() => displayChatMessage(senderId, message, false), 0);
                })
                .catch((err) => {
                  console.error("[Chat] Failed to import chat module:", err);
                });
            }
          } catch (e) {
            console.error("Failed to handle chat message:", e);
          }
        }
      };

      this.socket.onclose = (event) => {
        console.log("Disconnected from tournament server, code:", event.code);
        this.connected = false;
        this.stopInputLoop();
        this.stopStateWatchdog();
        this.updateConnectionIndicator();

        // Don't reconnect if intentionally closed
        if (this.intentionalClose) {
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
          this.updateStatus(`Connection lost. Reconnecting in ${Math.round(delay / 1000)}s... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

          this.reconnectTimeout = setTimeout(() => {
            console.log(`[TournamentGame] Reconnection attempt ${this.reconnectAttempts}`);
            this.connectToServer();

            // Re-join tournament after reconnection if we have a tournament ID
            if (this.tournament.id) {
              setTimeout(() => {
                if (this.socket && this.socket.readyState === 1) {
                  console.log(`[TournamentGame] Rejoining tournament ${this.tournament.id}`);
                  this.socket.send(JSON.stringify({
                    type: "rejoinTournament",
                    tournamentId: this.tournament.id
                  }));
                }
              }, 500);
            }
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
      console.error("Failed to connect to tournament server:", error);
      this.updateStatus("Failed to connect to server");
      this.updateConnectionIndicator();
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
    // Remove tournament page button setup - not needed
  }

  setupTournamentControls() {
    const createBtn = document.getElementById("createTournamentBtn");
    const joinBtn = document.getElementById("joinTournamentBtn");
    const idInput = document.getElementById("tournamentIdInput");
    const readyBtn = document.getElementById("readyButton");
    const leaveBtn = document.getElementById("leaveTournamentBtn");

    // Auto-uppercase input as user types
    if (idInput) {
      idInput.addEventListener("input", (e) => {
        e.target.value = e.target.value.toUpperCase();
      });

      // Allow pressing Enter to join
      idInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          const id = idInput.value.trim();
          if (id) this.joinTournament(id);
        }
      });
    }

    if (createBtn) {
      createBtn.addEventListener("click", () => this.createTournament());
    }
    if (joinBtn) {
      joinBtn.addEventListener("click", () => {
        const id = idInput?.value?.trim();
        if (id) this.joinTournament(id);
      });
    }

    if (readyBtn) {
      readyBtn.addEventListener("click", () => this.toggleReady());
    }

    if (leaveBtn) {
      leaveBtn.addEventListener("click", () => this.leaveTournament());
    }
  }

  toggleReady() {
    if (!this.tournament.id || !this.socket || !this.connected) return;

    this.isReady = !this.isReady;

    // Clear ready timeout countdown if player readied up
    if (this.isReady && this.readyTimeoutInterval) {
      clearInterval(this.readyTimeoutInterval);
      this.readyTimeoutInterval = null;
    }

    this.socket.send(
      JSON.stringify({
        type: "setTournamentReady",
        tournamentId: this.tournament.id,
        ready: this.isReady,
      })
    );

    this.updateTournamentButtons();

    // If round is complete and player clicked ready, update status
    if (this.roundComplete && this.isReady) {
      this.updateStatus("Ready! Waiting for other players...");
    }
  }

  updateTournamentButtons() {
    const createBtn = document.getElementById("createTournamentBtn");
    const joinBtn = document.getElementById("joinTournamentBtn");
    const idInput = document.getElementById("tournamentIdInput");
    const readyBtn = document.getElementById("readyButton");
    const playAgainBtn = document.getElementById("playAgainBtn");
    const leaveBtn = document.getElementById("leaveTournamentBtn");
    const leaveContainer = document.getElementById("leaveTournamentContainer");
    const gameTopRow = document.getElementById("gameTopRow");

    // If player has joined a tournament
    const inTournament = !!this.tournament.id;

    // Hide create and join controls completely when in tournament
    if (createBtn) {
      createBtn.style.display = inTournament ? "none" : "inline-block";
      createBtn.disabled = !this.connected;
      createBtn.style.opacity = !this.connected ? "0.5" : "1";
      createBtn.style.cursor = !this.connected ? "not-allowed" : "pointer";
    }

    if (joinBtn) {
      joinBtn.style.display = inTournament ? "none" : "inline-block";
      joinBtn.disabled = !this.connected;
      joinBtn.style.opacity = !this.connected ? "0.5" : "1";
      joinBtn.style.cursor = !this.connected ? "not-allowed" : "pointer";
    }

    if (idInput) {
      idInput.style.display = inTournament ? "none" : "inline-block";
      idInput.disabled = !this.connected;
      idInput.style.opacity = !this.connected ? "0.5" : "1";
      idInput.style.cursor = !this.connected ? "not-allowed" : "pointer";
    }

    // Show Leave Tournament button container when in tournament
    if (leaveContainer) {
      leaveContainer.style.display = inTournament ? "flex" : "none";
    }

    // Hide Play Again button if in tournament
    if (playAgainBtn) {
      playAgainBtn.style.display = "none";
    }

    // Update ready button
    let shouldShowReady = false;
    if (readyBtn) {
      // Show ready button if:
      // 1. In tournament and game hasn't started (initial ready)
      // 2. Round is complete and waiting for next round
      // BUT hide when:
      // - Countdown is active (match is about to start)
      // - Player has been eliminated from tournament
      shouldShowReady =
        inTournament &&
        !this.isEliminated &&
        (!this.gameStarted || this.roundComplete) &&
        !this.countdownActive;

      if (shouldShowReady) {
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

    // Dynamically adjust spacing between bracket and scoreboard
    // Add extra space when buttons are visible (play again, etc.)
    const playAgainVisible = playAgainBtn && playAgainBtn.style.display !== "none";
    if (gameTopRow) {
      gameTopRow.style.marginTop = (shouldShowReady || playAgainVisible) ? "10px" : "0";
    }
  }

  updateConnectionIndicator() {
    const ind = document.getElementById("connIndicator");
    const text = document.getElementById("connText");
    if (ind) ind.classList.toggle("online", !!this.connected);
    if (text) text.textContent = this.connected ? "Online" : "Offline";
    this.updateTournamentButtons();
  }

  updateTournamentIdDisplay() {
    const el = document.getElementById("tournamentIdDisplay");
    if (el) el.textContent = this.tournament.id || "-";
  }

  draw() {
    if (!this.ctx || !this.gameState || this.playerId === null) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Use local paddle position for player's paddle (smooth), server position for opponent
    const playerPaddleY = this.localPaddleY;
    const opponentPaddleY = this.gameState.opponent.y;

    this.ctx.fillStyle = this.playerColor || "#0000ff";
    this.ctx.fillRect(this.gameState.player.x, playerPaddleY, 15, 75);

    this.ctx.fillStyle = this.opponentColor || "#ff0000";
    this.ctx.fillRect(
      this.gameState.opponent.x,
      opponentPaddleY,
      15,
      75
    );

    this.ctx.fillStyle = "#ffffff";

    // Use predicted ball position for smoother rendering
    let ballX = this.ballPredictionEnabled ? this.predictedBall.x : this.gameState.ball.x;
    let ballY = this.ballPredictionEnabled ? this.predictedBall.y : this.gameState.ball.y;

    // Let ball go off-screen naturally - server will reset on score
    // Don't reflect or clamp ball position

    this.ctx.beginPath();
    this.ctx.arc(ballX, ballY, 7.5, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.setLineDash([5, 5]);
    this.ctx.beginPath();
    this.ctx.moveTo(this.canvas.width / 2, 0);
    this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
    this.ctx.strokeStyle = "#ffffff";
    this.ctx.stroke();
    this.ctx.setLineDash([]);
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

  /**
   * Handle ball sync events from server (paddle hit, wall bounce, score, reset)
   * This is the ONLY ball position data - clients predict movement between events
   */
  handleBallSync(data) {
    if (!data.ball) return;

    // Update predicted ball with authoritative server state
    this.predictedBall.x = data.ball.x;
    this.predictedBall.y = data.ball.y;
    this.predictedBall.dx = data.ball.dx;
    this.predictedBall.dy = data.ball.dy;
    this.lastBallUpdate = Date.now();

    // On score or reset events, stop ball prediction temporarily
    // The ball will stay at center until server sends new velocity via paddleHit
    if (data.event === "score" || data.event === "reset") {
      // Stop ball movement until server sends new direction
      this.predictedBall.dx = 0;
      this.predictedBall.dy = 0;
    }

    // Update scores from sync message for players
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
  }

  /**
   * Start the client-side ball prediction render loop
   */
  startPredictionLoop() {
    if (this.animationFrameId) return;

    let lastFrameTime = performance.now();

    const predictionLoop = (currentTime) => {
      if (!this.gameStarted || this.paused) {
        this.animationFrameId = requestAnimationFrame(predictionLoop);
        return;
      }

      const deltaTime = (currentTime - lastFrameTime) / 1000;
      lastFrameTime = currentTime;

      // Update local paddle position for smooth movement
      this.updateLocalPaddle(deltaTime);

      // Update ball prediction
      if (this.ballPredictionEnabled && this.predictedBall.dx !== 0 && !this.countdownActive) {
        this.updateBallPrediction(deltaTime);
      }

      // Draw
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
   */
  updateBallPrediction(deltaTime) {
    const frameScale = deltaTime * 60;

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

  startCountdown() {
    this.countdown = 10;
    this.gameStarted = false;

    const countdownInterval = setInterval(() => {
      this.updateStatus(`Tournament match starts in ${this.countdown}...`);
      this.drawCountdown();

      this.countdown--;

      if (this.countdown < 0) {
        clearInterval(countdownInterval);
        this.gameStarted = true;
        this.roundComplete = false; // Reset round complete flag when match starts
        this.updateStatus("Tournament match in progress");
        this.updateTournamentButtons(); // Hide ready button when match starts
        this.startPredictionLoop(); // Start client-side ball prediction
        try {
          const btn =
            this.startButton || document.getElementById("startButton");
          if (btn) btn.textContent = "Pause";
        } catch { }
      }
    }, 1000);
  }

  drawCountdown() {
    if (!this.ctx) return;

    // Draw game field background first
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.setLineDash([5, 5]);
    this.ctx.beginPath();
    this.ctx.moveTo(this.canvas.width / 2, 0);
    this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
    this.ctx.strokeStyle = "#ffffff";
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Draw paddles so players can see them during countdown
    // Left paddle (red player)
    this.ctx.fillStyle = "#f44336";
    const leftPaddleY = this.playerId === 1 ? this.localPaddleY : (this.gameState?.opponent?.y || GAME_CONFIG.height / 2 - GAME_CONFIG.paddleHeight / 2);
    this.ctx.fillRect(10, leftPaddleY, GAME_CONFIG.paddleWidth, GAME_CONFIG.paddleHeight);

    // Right paddle (blue player)
    this.ctx.fillStyle = "#2196f3";
    const rightPaddleY = this.playerId === 2 ? this.localPaddleY : (this.gameState?.opponent?.y || GAME_CONFIG.height / 2 - GAME_CONFIG.paddleHeight / 2);
    this.ctx.fillRect(GAME_CONFIG.width - 10 - GAME_CONFIG.paddleWidth, rightPaddleY, GAME_CONFIG.paddleWidth, GAME_CONFIG.paddleHeight);

    // Draw ball in center (stationary during countdown)
    this.ctx.fillStyle = "#ffffff";
    this.ctx.beginPath();
    this.ctx.arc(GAME_CONFIG.width / 2, GAME_CONFIG.height / 2, GAME_CONFIG.blockSize, 0, Math.PI * 2);
    this.ctx.fill();

    // Draw semi-transparent overlay
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw countdown number or GO!
    this.ctx.fillStyle = "#ffffff";
    this.ctx.font = "bold 72px Arial";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";

    if (this.countdown > 0) {
      this.ctx.fillText(
        this.countdown.toString(),
        this.canvas.width / 2,
        this.canvas.height / 2
      );
    } else if (this.countdown === 0) {
      this.ctx.fillText("GO!", this.canvas.width / 2, this.canvas.height / 2);
    }
  }

  updateStatus(message) {
    const statusElement = document.getElementById("status");
    if (statusElement) {
      statusElement.textContent = message;
    }
  }

  /**
   * Show a countdown for the ready timeout
   */
  showReadyTimeoutCountdown(seconds) {
    // Clear any existing timeout countdown
    if (this.readyTimeoutInterval) {
      clearInterval(this.readyTimeoutInterval);
    }

    let remaining = seconds;

    // Update status immediately
    if (!this.isReady) {
      this.updateStatus(`⚠️ ${remaining}s to ready up or forfeit!`);
    }

    this.readyTimeoutInterval = setInterval(() => {
      remaining--;

      if (remaining <= 0) {
        clearInterval(this.readyTimeoutInterval);
        this.readyTimeoutInterval = null;
        if (!this.isReady) {
          this.updateStatus("⚠️ Time's up! Forfeiting...");
        }
        return;
      }

      // Only show countdown if player hasn't readied up yet
      if (!this.isReady) {
        this.updateStatus(`⚠️ ${remaining}s to ready up or forfeit!`);
      }
    }, 1000);
  }

  /**
   * Reset all tournament UI elements to their initial state
   * Called when creating a new tournament or leaving one
   */
  resetTournamentUI() {
    // Reset tournament state
    this.tournament.id = null;
    this.tournament.round = 0;
    this.tournament.role = null;
    this.tournament.opponentId = null;
    this.tournament.opponentUsername = null;
    this.isReady = false;
    this.roundComplete = false;
    this.isEliminated = false;
    this.gameStarted = false;
    this.playerId = null;
    this.gameState = null;
    this.gameOverHandled = false;
    this.countdownActive = false;
    this.countdown = 0;

    // Reset ball prediction
    this.predictedBall = { x: GAME_CONFIG.width / 2, y: GAME_CONFIG.height / 2, dx: 0, dy: 0 };
    this.localPaddleY = GAME_CONFIG.height / 2 - GAME_CONFIG.paddleHeight / 2;

    // Stop any running loops and intervals
    this.stopPredictionLoop();
    if (this.readyTimeoutInterval) {
      clearInterval(this.readyTimeoutInterval);
      this.readyTimeoutInterval = null;
    }

    // Hide participants list
    const participantsList = document.getElementById("participantsList");
    if (participantsList) participantsList.style.display = "none";

    // Hide and clear bracket
    const bracket = document.getElementById("tournamentBracket");
    const bracketContainer = document.getElementById("bracketContainer");
    if (bracket) bracket.style.display = "none";
    if (bracketContainer) bracketContainer.innerHTML = "";

    // Clear participants container
    const participantsContainer = document.getElementById("participantsContainer");
    if (participantsContainer) participantsContainer.innerHTML = "";

    // Reset scores to 0
    const leftScoreElement = document.querySelector(".player-left");
    const rightScoreElement = document.querySelector(".player-right");
    if (leftScoreElement) leftScoreElement.textContent = "0";
    if (rightScoreElement) rightScoreElement.textContent = "0";

    // Hide player info displays
    const leftPlayerInfo = document.getElementById("leftPlayerInfo");
    const rightPlayerInfo = document.getElementById("rightPlayerInfo");
    const leftAvatar = document.getElementById("leftAvatar");
    const rightAvatar = document.getElementById("rightAvatar");
    if (leftPlayerInfo) leftPlayerInfo.style.display = "none";
    if (rightPlayerInfo) rightPlayerInfo.style.display = "none";
    if (leftAvatar) leftAvatar.style.display = "none";
    if (rightAvatar) rightAvatar.style.display = "none";

    // Clear usernames
    const leftUsername = document.getElementById("leftUsername");
    const rightUsername = document.getElementById("rightUsername");
    if (leftUsername) leftUsername.textContent = "";
    if (rightUsername) rightUsername.textContent = "";

    // Clear canvas
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Remove any winner overlays
    const winnerOverlay = document.getElementById("tournamentWinnerOverlay");
    if (winnerOverlay) winnerOverlay.remove();

    // Reset participant count display
    const countElement = document.getElementById("participantCount");
    if (countElement) countElement.textContent = "0";

    // Clear sessionStorage
    try {
      sessionStorage.removeItem("currentTournamentId");
    } catch { }

    console.log("[TournamentGame] UI reset complete");
  }

  createTournament() {
    if (!this.socket || !this.connected) return;

    // Reset all tournament UI and state
    this.resetTournamentUI();

    this.socket.send(
      JSON.stringify({
        type: "createTournament",
        playerId: this.clientId ?? null,
      })
    );
    this.updateStatus("Creating tournament...");
    this.updateTournamentButtons(); // Update button states
  }

  joinTournament(id) {
    if (!this.socket || !this.connected) return;

    // Reset UI from any previous tournament
    this.resetTournamentUI();

    this.tournament.id = id; // Store tournament ID

    // Save to sessionStorage only if it's a tournament ID (not a lobby key)
    try {
      if (!id.includes("-")) {
        sessionStorage.setItem("currentTournamentId", id);
      }
    } catch { }

    this.socket.send(
      JSON.stringify({
        type: "joinTournament",
        tournamentId: id,
        playerId: this.clientId ?? null,
      })
    );
    this.updateStatus(`Joining tournament ${id}...`);
    this.updateTournamentButtons(); // Update button states
  }

  rejoinTournament(id) {
    if (!this.socket || !this.connected) return;
    this.tournament.id = id; // Store tournament ID

    this.socket.send(
      JSON.stringify({
        type: "rejoinTournament",
        tournamentId: id,
        playerId: this.clientId ?? null,
      })
    );
    this.updateStatus(`Rejoining tournament ${id}...`);
    this.updateTournamentIdDisplay();
    this.updateTournamentButtons(); // Update button states
  }

  leaveTournament() {
    // Notify server about leaving the tournament before disconnecting
    if (this.socket && this.socket.readyState === WebSocket.OPEN && this.tournament.id) {
      console.log("[TournamentGame] Sending leaveTournament message to server");
      this.socket.send(
        JSON.stringify({
          type: "leaveTournament",
          tournamentId: this.tournament.id,
        })
      );
    }

    // Reset all tournament UI and state
    this.resetTournamentUI();

    // Update UI
    this.updateTournamentIdDisplay();
    this.updateTournamentButtons();
    this.updateStatus("Left tournament. Create or join a new one.");

    // Reconnect to get a fresh state
    if (this.socket) {
      this.socket.close();
    }
    setTimeout(() => {
      this.connectToServer();
    }, 100);
  }

  updateParticipants(count, participants, round, status) {
    // Update participant count
    const countElement = document.getElementById("participantCount");
    if (countElement) {
      countElement.textContent = count;
    }

    // Update participants list
    const listContainer = document.getElementById("participantsList");
    const participantsContainer = document.getElementById(
      "participantsContainer"
    );

    if (!participantsContainer) return;

    // Show participants list:
    // - Before tournament starts (status === 'created')
    // - Between rounds when waiting for players to ready up (roundComplete === true)
    const shouldShowParticipants =
      status === "created" || (this.roundComplete && status === "inProgress");

    if (listContainer) {
      if (shouldShowParticipants && count > 0) {
        listContainer.style.display = "block";
      } else {
        listContainer.style.display = "none";
      }
    }

    if (!shouldShowParticipants) return;

    // Clear existing participants
    participantsContainer.innerHTML = "";

    // Add each participant
    participants.forEach((participant) => {
      const participantCard = document.createElement("div");
      const isReady = participant.ready || false;
      participantCard.style.cssText = `
        padding: 10px 15px;
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(118, 75, 162, 0.3) 100%);
        border-radius: 8px;
        color: white;
        font-weight: 500;
        border: 2px solid ${isReady ? "#4ade80" : "rgba(255, 255, 255, 0.2)"};
        display: flex;
        align-items: center;
        gap: 8px;
      `;

      // Add a player icon
      const icon = document.createElement("span");
      icon.textContent = "👤";
      icon.style.fontSize = "18px";

      // Add username
      const username = document.createElement("span");
      username.textContent = participant.username || `Player ${participant.id}`;

      participantCard.appendChild(icon);
      participantCard.appendChild(username);
      participantsContainer.appendChild(participantCard);
    });

    // Update button states
    this.updateTournamentButtons();
  }

  updatePlayerInfoDisplay() {
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

    if (!this.tournament.opponentId) {
      // Hide player info when not in a match
      if (leftPlayerInfo) leftPlayerInfo.style.display = "none";
      if (leftAvatar) leftAvatar.style.display = "none";
      if (rightPlayerInfo) rightPlayerInfo.style.display = "none";
      if (rightAvatar) rightAvatar.style.display = "none";
      return;
    }

    // Determine which side is "me" based on role
    const iAmLeft = this.tournament.role === "left";

    // Assign player/opponent to left/right based on paddle side
    const leftName = iAmLeft ? (this.playerUsername || "You") : this.tournament.opponentUsername;
    const rightName = iAmLeft ? this.tournament.opponentUsername : (this.playerUsername || "You");
    const leftUserId = iAmLeft ? this.clientId : this.tournament.opponentId;
    const rightUserId = iAmLeft ? this.tournament.opponentId : this.clientId;

    // Update left side
    if (leftPlayerInfo) leftPlayerInfo.style.display = "block";
    if (leftAvatar) leftAvatar.style.display = "block";
    if (leftUsername) leftUsername.textContent = leftName;

    // Handle avatar with fallback - use cache-busting to prevent stale 404 caching
    const leftAvatarFallback = document.getElementById("leftAvatarFallback");
    if (leftAvatarImg && leftUserId) {
      // Add timestamp to prevent browser caching of 404 responses
      const leftAvatarUrl = `${API_CONFIG.USER_SERVICE_URL}/avatar/${leftUserId}?_t=${Date.now()}`;
      // Reset handlers and hide until loaded
      leftAvatarImg.onload = () => {
        leftAvatarImg.style.display = "block";
        if (leftAvatarFallback) leftAvatarFallback.style.display = "none";
      };
      leftAvatarImg.onerror = () => {
        leftAvatarImg.style.display = "none";
        if (leftAvatarFallback) leftAvatarFallback.style.display = "block";
      };
      // Start loading - hide image until onload fires
      leftAvatarImg.style.display = "none";
      if (leftAvatarFallback) leftAvatarFallback.style.display = "block";
      leftAvatarImg.src = leftAvatarUrl;
    } else if (leftAvatarFallback) {
      if (leftAvatarImg) leftAvatarImg.style.display = "none";
      leftAvatarFallback.style.display = "block";
    }
    if (leftReadyStatus) leftReadyStatus.style.display = "none"; // Tournament uses separate ready system

    // Update right side
    if (rightPlayerInfo) rightPlayerInfo.style.display = "block";
    if (rightAvatar) rightAvatar.style.display = "block";
    if (rightUsername) rightUsername.textContent = rightName;

    // Handle avatar with fallback - use cache-busting to prevent stale 404 caching
    const rightAvatarFallback = document.getElementById("rightAvatarFallback");
    if (rightAvatarImg && rightUserId) {
      // Add timestamp to prevent browser caching of 404 responses
      const rightAvatarUrl = `${API_CONFIG.USER_SERVICE_URL}/avatar/${rightUserId}?_t=${Date.now()}`;
      // Reset handlers and hide until loaded
      rightAvatarImg.onload = () => {
        rightAvatarImg.style.display = "block";
        if (rightAvatarFallback) rightAvatarFallback.style.display = "none";
      };
      rightAvatarImg.onerror = () => {
        rightAvatarImg.style.display = "none";
        if (rightAvatarFallback) rightAvatarFallback.style.display = "block";
      };
      // Start loading - hide image until onload fires
      rightAvatarImg.style.display = "none";
      if (rightAvatarFallback) rightAvatarFallback.style.display = "block";
      rightAvatarImg.src = rightAvatarUrl;
    } else if (rightAvatarFallback) {
      if (rightAvatarImg) rightAvatarImg.style.display = "none";
      rightAvatarFallback.style.display = "block";
    }
    if (rightReadyStatus) rightReadyStatus.style.display = "none"; // Tournament uses separate ready system
  }

  showTournamentMatchWinner(didIWinOverride = null, customMessage = null) {
    // For forfeit wins, we might not have game state, so handle that case
    let playerScore = 0;
    let opponentScore = 0;
    let didIWin = didIWinOverride;

    if (this.gameState) {
      // Determine winner based on scores
      playerScore = this.gameState.player.score;
      opponentScore = this.gameState.opponent.score;
      if (didIWin === null) {
        didIWin = playerScore > opponentScore;
      }
    } else if (didIWin === null) {
      // No game state and no override - can't determine winner
      return;
    }

    const winnerUsername = didIWin
      ? (this.playerUsername || "You")
      : this.tournament.opponentUsername;
    const winnerUserId = didIWin ? this.clientId : this.tournament.opponentId;

    // Create winner overlay
    const overlay = document.createElement("div");
    overlay.id = "tournamentWinnerOverlay";
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

    // Add CSS animation if not exists
    if (!document.getElementById("tournamentWinnerAnimStyle")) {
      const style = document.createElement("style");
      style.id = "tournamentWinnerAnimStyle";
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
      gap: 20px;
      animation: scaleIn 0.6s ease-out;
    `;

    // Add avatar
    const avatarContainer = document.createElement("div");
    avatarContainer.style.cssText = `
      width: 200px;
      height: 200px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea, #764ba2);
      display: flex;
      align-items: center;
      justify-content: center;
      border: 5px solid #ffd700;
      box-shadow: 0 0 40px rgba(255, 215, 0, 0.6);
      overflow: hidden;
    `;

    if (winnerUserId) {
      const avatarImg = document.createElement("img");
      avatarImg.src = `${API_CONFIG.USER_SERVICE_URL}/avatar/${winnerUserId}`;
      avatarImg.style.cssText = `width: 100%; height: 100%; object-fit: cover;`;
      avatarImg.onerror = () => {
        avatarImg.style.display = "none";
        const fallback = document.createElement("span");
        fallback.textContent = "👤";
        fallback.style.fontSize = "80px";
        avatarContainer.appendChild(fallback);
      };
      avatarContainer.appendChild(avatarImg);
    } else {
      const fallback = document.createElement("span");
      fallback.textContent = "👤";
      fallback.style.fontSize = "80px";
      avatarContainer.appendChild(fallback);
    }
    content.appendChild(avatarContainer);

    // Add winner text
    const winnerText = document.createElement("div");
    winnerText.innerHTML = `🏆 <span style="color: #ffd700;">${winnerUsername}</span> wins! 🏆`;
    winnerText.style.cssText = `
      color: white;
      font-size: 36px;
      font-weight: bold;
      text-shadow: 0 0 20px rgba(255, 215, 0, 0.8);
      text-align: center;
    `;
    content.appendChild(winnerText);

    // Add custom message or score
    const infoText = document.createElement("div");
    if (customMessage) {
      infoText.textContent = customMessage;
      infoText.style.cssText = `
        color: rgba(255, 255, 255, 0.9);
        font-size: 24px;
        font-weight: bold;
      `;
    } else {
      const leftScore = this.playerId === 1 ? playerScore : opponentScore;
      const rightScore = this.playerId === 1 ? opponentScore : playerScore;
      infoText.textContent = `${leftScore} - ${rightScore}`;
      infoText.style.cssText = `
        color: white;
        font-size: 48px;
        font-weight: bold;
      `;
    }
    content.appendChild(infoText);

    // Add round info
    const roundText = document.createElement("div");
    roundText.textContent = `Round ${this.tournament.round}`;
    roundText.style.cssText = `
      color: rgba(255, 255, 255, 0.7);
      font-size: 18px;
    `;
    content.appendChild(roundText);

    overlay.appendChild(content);
    document.body.appendChild(overlay);

    // Remove overlay after 4 seconds
    setTimeout(() => {
      overlay.style.animation = "fadeIn 0.5s ease-out reverse";
      setTimeout(() => {
        overlay.remove();
      }, 500);
    }, 4000);
  }

  updateRoundReadyStatus(readyPlayers, activePlayers) {
    // This could be used to show visual indicators of who is ready
    // For now, just log it
    console.log(
      `Round ready status: ${readyPlayers.length}/${activePlayers.length} players ready`
    );
  }

  showPlayAgainButton() {
    let playAgainBtn = document.getElementById("playAgainBtn");

    // Create button if it doesn't exist
    if (!playAgainBtn) {
      playAgainBtn = document.createElement("button");
      playAgainBtn.id = "playAgainBtn";
      playAgainBtn.className = "btn btn-success btn-large";
      playAgainBtn.textContent = "Play Again";
      playAgainBtn.style.marginTop = "20px";

      playAgainBtn.addEventListener("click", () => {
        window.location.reload();
      });

      // Add to controls area
      const controlsArea = document.querySelector(".game-controls-bottom");
      if (controlsArea) {
        controlsArea.appendChild(playAgainBtn);
      }
    }

    playAgainBtn.style.display = "inline-block";
  }

  updateBracket(bracket, currentRound) {
    const bracketContainer = document.getElementById("tournamentBracket");
    const innerContainer = document.getElementById("bracketContainer");

    if (!innerContainer || !bracket || bracket.length === 0) return;

    // Check if current player has been eliminated from the tournament
    // A player is eliminated if they lost a match (were in a match with a winner and they're not the winner)
    const myUserId = this.clientId;

    let wasEliminated = false;
    for (const round of bracket) {
      for (const match of round) {
        if (match.winner) {
          // Use == for type-safe comparison (string vs number)
          const wasInMatch = (match.left?.id == myUserId || match.right?.id == myUserId);
          const isWinner = match.winner.id == myUserId;
          if (wasInMatch && !isWinner) {
            wasEliminated = true;
            break;
          }
        }
      }
      if (wasEliminated) break;
    }

    // Update eliminated status and UI if it changed
    if (wasEliminated && !this.isEliminated) {
      this.isEliminated = true;
      this.gameStarted = false; // Eliminated players are no longer in a game
      this.roundComplete = false; // Eliminated players don't need to ready up
      this.stopPredictionLoop(); // Stop game rendering
      console.log("[TournamentGame] Player has been eliminated from tournament");
      this.updateStatus("You have been eliminated from the tournament.");
      this.updateTournamentButtons();
    }

    // Show bracket container
    if (bracketContainer) {
      bracketContainer.style.display = "block";
    }

    // Clear existing bracket
    innerContainer.innerHTML = "";

    // Display each round
    bracket.forEach((round, roundIndex) => {
      const roundDiv = document.createElement("div");
      roundDiv.style.cssText = `
        margin-bottom: 12px;
        padding: 10px;
        background: rgba(255,255,255,0.05);
        border-radius: 8px;
        border-left: 3px solid ${roundIndex + 1 === currentRound ? "#667eea" : "rgba(255,255,255,0.2)"
        };
      `;

      const roundTitle = document.createElement("h4");
      roundTitle.textContent = `Round ${roundIndex + 1}`;
      roundTitle.style.cssText = `
        color: white;
        margin-bottom: 8px;
        font-size: 14px;
        font-weight: 600;
      `;
      roundDiv.appendChild(roundTitle);

      const matchesContainer = document.createElement("div");
      matchesContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 8px;
      `;

      round.forEach((match, matchIndex) => {
        const matchDiv = document.createElement("div");
        matchDiv.style.cssText = `
          padding: 8px 12px;
          background: rgba(0,0,0,0.3);
          border-radius: 6px;
          border: 1px solid ${match.inProgress ? "#667eea" : "rgba(255,255,255,0.1)"
          };
        `;

        const matchTitle = document.createElement("div");
        matchTitle.textContent = `Match ${matchIndex + 1}`;
        matchTitle.style.cssText = `
          color: #aaa;
          font-size: 11px;
          margin-bottom: 4px;
        `;
        matchDiv.appendChild(matchTitle);

        // Players display
        const playersDiv = document.createElement("div");
        playersDiv.style.cssText = `
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        `;

        const leftPlayer = document.createElement("div");
        leftPlayer.textContent = match.left ? match.left.username : "BYE";
        leftPlayer.style.cssText = `
          color: white;
          font-weight: ${match.winner && match.winner.id === match.left?.id ? "700" : "400"
          };
          opacity: ${match.winner && match.winner.id !== match.left?.id ? "0.5" : "1"
          };
          flex: 1;
          text-align: left;
        `;

        // Score/VS display in the middle
        const centerDiv = document.createElement("div");
        centerDiv.style.cssText = `
          display: flex;
          align-items: center;
          gap: 8px;
        `;

        if (match.inProgress) {
          // Show live scores for in-progress matches
          const leftScoreSpan = document.createElement("span");
          leftScoreSpan.textContent = match.leftScore || "0";
          leftScoreSpan.style.cssText = `color: #f44336; font-weight: bold; font-size: 16px;`;
          leftScoreSpan.id = `match-${roundIndex}-${matchIndex}-left-score`;

          const separator = document.createElement("span");
          separator.textContent = " : ";
          separator.style.cssText = `color: white; font-weight: bold;`;

          const rightScoreSpan = document.createElement("span");
          rightScoreSpan.textContent = match.rightScore || "0";
          rightScoreSpan.style.cssText = `color: #2196f3; font-weight: bold; font-size: 16px;`;
          rightScoreSpan.id = `match-${roundIndex}-${matchIndex}-right-score`;

          centerDiv.appendChild(leftScoreSpan);
          centerDiv.appendChild(separator);
          centerDiv.appendChild(rightScoreSpan);
        } else {
          const vs = document.createElement("span");
          vs.textContent = "vs";
          vs.style.cssText = `color: #667eea; font-weight: 600;`;
          centerDiv.appendChild(vs);
        }

        const rightPlayer = document.createElement("div");
        rightPlayer.textContent = match.right ? match.right.username : "BYE";
        rightPlayer.style.cssText = `
          color: white;
          font-weight: ${match.winner && match.winner.id === match.right?.id ? "700" : "400"
          };
          opacity: ${match.winner && match.winner.id !== match.right?.id ? "0.5" : "1"
          };
          flex: 1;
          text-align: right;
        `;

        playersDiv.appendChild(leftPlayer);
        playersDiv.appendChild(centerDiv);
        playersDiv.appendChild(rightPlayer);
        matchDiv.appendChild(playersDiv);

        // Winner indicator
        if (match.winner) {
          const winnerDiv = document.createElement("div");
          winnerDiv.textContent = `Winner: ${match.winner.username} 🏆`;
          winnerDiv.style.cssText = `
            margin-top: 4px;
            color: #4ade80;
            font-size: 11px;
            font-weight: 600;
            text-align: center;
          `;
          matchDiv.appendChild(winnerDiv);
        } else if (match.inProgress) {
          const statusContainer = document.createElement("div");
          statusContainer.style.cssText = `
            margin-top: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
          `;

          const statusDiv = document.createElement("span");
          statusDiv.textContent = "⚔️ Live";
          statusDiv.style.cssText = `
            color: #667eea;
            font-size: 11px;
            font-weight: 600;
          `;
          statusContainer.appendChild(statusDiv);

          matchDiv.appendChild(statusContainer);
        }

        matchesContainer.appendChild(matchDiv);
      });

      roundDiv.appendChild(matchesContainer);
      innerContainer.appendChild(roundDiv);
    });
  }

  startStateWatchdog() {
    this.stopStateWatchdog();
    this.lastStateTime = Date.now();
    this.stateWatchdogInterval = setInterval(() => {
      if (this.gameStarted && this.lastStateTime) {
        const timeSinceLastState = Date.now() - this.lastStateTime;
        if (timeSinceLastState > 2000) {
          console.warn(
            "[TournamentGame] No state received for 2 seconds - connection may be frozen"
          );
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

  cleanup() {
    this.intentionalClose = true; // Prevent reconnection attempts
    this.stopInputLoop();
    this.stopStateWatchdog();
    this.stopPredictionLoop();

    // Clear reconnection timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Clear ready timeout interval
    if (this.readyTimeoutInterval) {
      clearInterval(this.readyTimeoutInterval);
      this.readyTimeoutInterval = null;
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

    this.connected = false;
    this.gameStarted = false;
    this.gameState = null;
    this.playerId = null;
  }
}

window.initTournamentGame = (clientId) => {
  if (
    window.tournamentGameInstance &&
    typeof window.tournamentGameInstance.cleanup === "function"
  ) {
    window.tournamentGameInstance.cleanup();
  }

  const game = new TournamentGame(clientId);
  window.tournamentGameInstance = game;
  game.init();
  window.createTournament = () => game.createTournament();
  window.joinTournament = (id) => game.joinTournament(id);
  window.getTournamentId = () => game.tournament?.id || null;
};
