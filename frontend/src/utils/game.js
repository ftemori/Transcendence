class PongGame {
  constructor(canvasId, mode = "multiplayer") {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      throw new Error(`Canvas element "${canvasId}" not found`);
    }
    this.ctx = this.canvas.getContext("2d");
    this.gameRunning = false;
    this.gamePaused = false;
    this.animationId = null;
    this.mode = mode;

    this.ball = {
      x: this.canvas.width / 2,
      y: this.canvas.height / 2,
      vx: 5,
      vy: 3,
      radius: 10,
    };

    this.paddles = {
      left: {
        x: 10,
        y: this.canvas.height / 2 - 50,
        width: 10,
        height: 100,
        speed: 7,
      },
      right: {
        x: this.canvas.width - 20,
        y: this.canvas.height / 2 - 50,
        width: 10,
        height: 100,
        speed: 7,
      },
    };

    // Maximum score for offline games
    this.maxScore = 11;
    this.score = { left: 0, right: 0 };
    this.keys = {};

    this.aiEnabled = false;
    this.aiSide = "right";
    this.aiInterval = null;
    this.aiReactionMs = 250;
    this.aiTargetY = null;
    this.aiHasTarget = false;
    this.aiApproachDir = 0;
    this.aiMoveDir = "none";
    this.aiReleaseTimeout = null;
    // AI difficulty settings - tuned to be beatable
    this.aiReactionVariance = 350; // Random delay 0-350ms (was 150ms)
    this.aiPredictionError = 100; // Random offset ±100px (was 40px)
    this.aiMissChance = 0.30; // 30% chance to miss (was 15%)

    this.setupEventListeners();
    this.configureMode(mode);
    this.draw();
  }

  configureMode(mode) {
    this.mode = mode;
    if (mode === "singleplayer") {
      this.enableAI("right");
    } else {
      this.disableAI();
    }
  }

  clearAITimers() {
    if (this.aiInterval) {
      clearTimeout(this.aiInterval);
      clearInterval(this.aiInterval);
      this.aiInterval = null;
    }
    if (this.aiReleaseTimeout) {
      clearTimeout(this.aiReleaseTimeout);
      this.aiReleaseTimeout = null;
    }
  }

  resetAITracking() {
    this.aiHasTarget = false;
    this.aiTargetY = null;
    this.aiApproachDir = 0;
    this.aiMoveDir = "none";
  }

  enableAI(side = "right") {
    this.aiEnabled = true;
    this.aiSide = side;
    this.clearAITimers();
    this.resetAITracking();
    this.startAI();
  }

  disableAI() {
    this.aiEnabled = false;
    this.clearAITimers();
    this.resetAITracking();
  }

  startAI() {
    if (!this.aiEnabled) return;

    this.clearAITimers();

    const scheduleNextDecision = () => {
      if (!this.aiEnabled) return;

      // Variable reaction time: base + random delay
      const delay = this.aiReactionMs + Math.random() * this.aiReactionVariance;

      this.aiInterval = setTimeout(() => {
        if (!this.gameRunning || this.gamePaused || !this.aiEnabled) return;

        this.makeAIDecision();
        scheduleNextDecision();
      }, delay);
    };

    scheduleNextDecision();
  }

  makeAIDecision() {
    if (!this.gameRunning || this.gamePaused || !this.aiEnabled) return;

    const vx = this.ball.vx;
    const movingTowards = this.aiSide === "right" ? vx > 0 : vx < 0;

    if (movingTowards && !this.aiHasTarget) {
      const paddle = this.paddles[this.aiSide];
      const paddleCenter = paddle.y + paddle.height / 2;
      const tolerance = 6;

      // Add random prediction error
      const predictionError =
        (Math.random() - 0.5) * 2 * this.aiPredictionError;
      this.aiTargetY = this.predictBallYAtX(paddle.x) + predictionError;

      // Sometimes AI completely misses (aims at wrong spot)
      if (Math.random() < this.aiMissChance) {
        this.aiTargetY = Math.random() * this.canvas.height;
      }

      this.aiHasTarget = true;
      this.aiApproachDir = vx > 0 ? 1 : -1;
      this.aiMoveDir = "none";

      if (this.aiTargetY < paddleCenter - tolerance) {
        this.aiMoveDir = "up";
      } else if (this.aiTargetY > paddleCenter + tolerance) {
        this.aiMoveDir = "down";
      }

      if (this.aiMoveDir !== "none") {
        const distance = Math.max(
          0,
          Math.abs(this.aiTargetY - paddleCenter) - tolerance
        );
        const framesNeeded = distance / paddle.speed;
        const timeMs = Math.max(0, Math.ceil((framesNeeded / 60) * 1000));

        if (this.aiReleaseTimeout) {
          clearTimeout(this.aiReleaseTimeout);
        }
        this.aiReleaseTimeout = setTimeout(() => {
          this.aiMoveDir = "none";
          this.aiReleaseTimeout = null;
        }, timeMs);
      }
    }

    if (!movingTowards && this.aiHasTarget) {
      this.resetAITracking();
    }
  }

  updateAIMovement() {
    if (!this.aiEnabled) return;

    const paddle = this.paddles[this.aiSide];

    if (this.aiMoveDir === "up") {
      paddle.y = Math.max(0, paddle.y - paddle.speed);
    } else if (this.aiMoveDir === "down") {
      paddle.y = Math.min(
        this.canvas.height - paddle.height,
        paddle.y + paddle.speed
      );
    }

    if (this.aiTargetY != null) {
      const paddleCenter = paddle.y + paddle.height / 2;
      const tolerance = 6;
      if (Math.abs(this.aiTargetY - paddleCenter) <= tolerance) {
        this.aiMoveDir = "none";
        if (this.aiReleaseTimeout) {
          clearTimeout(this.aiReleaseTimeout);
          this.aiReleaseTimeout = null;
        }
      }
    }
  }

  reflectY(y, min, max) {
    const range = max - min;
    let m = (y - min) % (2 * range);
    if (m < 0) m += 2 * range;
    return m <= range ? min + m : max - (m - range);
  }

  predictBallYAtX(targetX) {
    const { x, y, vx, vy, radius } = this.ball;

    if (vx === 0) return y;

    let contactX = targetX;
    if (this.aiSide === "right") {
      contactX = targetX - radius;
      if (vx <= 0) return this.canvas.height / 2;
    } else {
      contactX = targetX + this.paddles.left.width + radius;
      if (vx >= 0) return this.canvas.height / 2;
    }

    const dx = contactX - x;
    const slope = vy / vx;
    const yLinear = y + slope * dx;

    return this.reflectY(yLinear, radius, this.canvas.height - radius);
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
  }

  teardownEventListeners() {
    if (this.keydownHandler) {
      document.removeEventListener("keydown", this.keydownHandler);
      this.keydownHandler = null;
    }
    if (this.keyupHandler) {
      document.removeEventListener("keyup", this.keyupHandler);
      this.keyupHandler = null;
    }
  }

  start() {
    if (!this.gameRunning) {
      this.gameRunning = true;
      this.gamePaused = false;
      if (this.mode === "singleplayer") {
        // Ensure AI is enabled and restart the decision loop now that game is running
        this.enableAI(this.aiSide);
      }
      this.updateStatus("Game started!");
      this.gameLoop();
    }
  }

  pause() {
    if (!this.gameRunning) return;
    this.gamePaused = !this.gamePaused;
    this.updateStatus(this.gamePaused ? "Game paused" : "Game continues");
  }

  reset() {
    this.gameRunning = false;
    this.gamePaused = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    this.ball.x = this.canvas.width / 2;
    this.ball.y = this.canvas.height / 2;
    this.ball.vx = 5 * (Math.random() > 0.5 ? 1 : -1);
    this.ball.vy = 3 * (Math.random() > 0.5 ? 1 : -1);

    this.paddles.left.y = this.canvas.height / 2 - this.paddles.left.height / 2;
    this.paddles.right.y =
      this.canvas.height / 2 - this.paddles.right.height / 2;

    this.score = { left: 0, right: 0 };
    this.updateScore();

    if (this.mode === "singleplayer") {
      this.enableAI(this.aiSide);
    } else {
      this.disableAI();
    }

    this.updateStatus('Game reset. Press "Start" to begin');
    this.draw();
  }

  update() {
    if (!this.gameRunning || this.gamePaused) return;

    this.ball.x += this.ball.vx;
    this.ball.y += this.ball.vy;

    if (
      this.ball.y <= this.ball.radius ||
      this.ball.y >= this.canvas.height - this.ball.radius
    ) {
      this.ball.vy = -this.ball.vy;
    }

    if (this.ball.x <= -this.ball.radius) {
      this.score.right += 1;
      this.updateStatus("Point for Player 2");
      this.resetBall(-1);
      this.updateScore();
    } else if (this.ball.x >= this.canvas.width + this.ball.radius) {
      this.score.left += 1;
      this.updateStatus("Point for Player 1");
      this.resetBall(1);
      this.updateScore();
    }

    // Check for victory (stop the game when a player reaches maxScore)
    if (
      (this.maxScore && this.score.left >= this.maxScore) ||
      (this.maxScore && this.score.right >= this.maxScore)
    ) {
      // Determine winner
      const winner = this.score.left >= this.maxScore ? "Player 1" : "Player 2";
      this.updateStatus(`${winner} wins!`);
      this.gameRunning = false;
      // Ensure any AI timers are cleared
      this.clearAITimers();
      return;
    }

    this.checkPaddleCollision();
    this.updatePaddles();
    this.updateScore();
  }

  updatePaddles() {
    if (this.keys["w"] || this.keys["W"]) {
      this.paddles.left.y = Math.max(
        0,
        this.paddles.left.y - this.paddles.left.speed
      );
    }
    if (this.keys["s"] || this.keys["S"]) {
      this.paddles.left.y = Math.min(
        this.canvas.height - this.paddles.left.height,
        this.paddles.left.y + this.paddles.left.speed
      );
    }

    if (this.mode === "singleplayer") {
      this.updateAIMovement();
    } else {
      const moveUp = this.keys["o"] || this.keys["O"];
      const moveDown = this.keys["l"] || this.keys["L"];

      if (moveUp) {
        this.paddles.right.y = Math.max(
          0,
          this.paddles.right.y - this.paddles.right.speed
        );
      }
      if (moveDown) {
        this.paddles.right.y = Math.min(
          this.canvas.height - this.paddles.right.height,
          this.paddles.right.y + this.paddles.right.speed
        );
      }
    }
  }

  checkPaddleCollision() {
    const left = this.paddles.left;
    const right = this.paddles.right;

    if (
      this.ball.x - this.ball.radius <= left.x + left.width &&
      this.ball.y >= left.y &&
      this.ball.y <= left.y + left.height &&
      this.ball.vx < 0
    ) {
      this.ball.vx = -this.ball.vx;
      this.applyPaddleSpin(left);
    }

    if (
      this.ball.x + this.ball.radius >= right.x &&
      this.ball.y >= right.y &&
      this.ball.y <= right.y + right.height &&
      this.ball.vx > 0
    ) {
      this.ball.vx = -this.ball.vx;
      this.applyPaddleSpin(right);
      if (this.mode === "singleplayer") {
        this.resetAITracking();
      }
    }
  }

  applyPaddleSpin(paddle) {
    const paddleCenter = paddle.y + paddle.height / 2;
    const offset = this.ball.y - paddleCenter;
    this.ball.vy += offset * 0.05;

    const speed = Math.hypot(this.ball.vx, this.ball.vy);
    const maxSpeed = 12;
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      this.ball.vx *= scale;
      this.ball.vy *= scale;
    }
  }

  resetBall(direction = 1) {
    this.ball.x = this.canvas.width / 2;
    this.ball.y = this.canvas.height / 2;
    this.ball.vx = 5 * direction;
    this.ball.vy = (Math.random() > 0.5 ? 1 : -1) * 3;
    this.resetAITracking();
  }

  draw() {
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.strokeStyle = "#fff";
    this.ctx.setLineDash([5, 15]);
    this.ctx.beginPath();
    this.ctx.moveTo(this.canvas.width / 2, 0);
    this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    this.ctx.fillStyle = "#fff";
    this.ctx.beginPath();
    this.ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillRect(
      this.paddles.left.x,
      this.paddles.left.y,
      this.paddles.left.width,
      this.paddles.left.height
    );
    this.ctx.fillRect(
      this.paddles.right.x,
      this.paddles.right.y,
      this.paddles.right.width,
      this.paddles.right.height
    );
  }

  updateScore() {
    const leftScoreElement = document.querySelector(".player-left");
    const rightScoreElement = document.querySelector(".player-right");

    if (leftScoreElement) {
      leftScoreElement.textContent = this.score.left;
    }
    if (rightScoreElement) {
      rightScoreElement.textContent = this.score.right;
    }
  }

  updateStatus(message) {
    const statusElement = document.getElementById("status");
    if (statusElement) {
      statusElement.textContent = message;
    }
  }

  gameLoop() {
    if (!this.gameRunning) {
      this.animationId = null;
      return;
    }

    if (!this.gamePaused) {
      this.update();
    }
    this.draw();

    this.animationId = requestAnimationFrame(() => this.gameLoop());
  }

  destroy() {
    this.gameRunning = false;
    this.gamePaused = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.clearAITimers();
    this.teardownEventListeners();
  }
}

function replaceWithClone(element) {
  if (!element || !element.parentNode) return element;
  const clone = element.cloneNode(true);
  element.parentNode.replaceChild(clone, element);
  return clone;
}

function initGame() {
  if (window.currentGame && typeof window.currentGame.destroy === "function") {
    window.currentGame.destroy();
    window.currentGame = null;
  }
  if (window.offlineVisibilityHandler) {
    document.removeEventListener(
      "visibilitychange",
      window.offlineVisibilityHandler
    );
    window.offlineVisibilityHandler = null;
  }

  const modeSelection = document.getElementById("modeSelection");
  const gameArea = document.getElementById("gameArea");
  if (modeSelection) modeSelection.style.display = "block";
  if (gameArea) gameArea.style.display = "none";

  const statusElement = document.getElementById("status");
  if (statusElement) {
    statusElement.textContent = "Select a mode to begin";
  }

  setupModeSelection();
}

function setupModeSelection() {
  const singlePlayerBtn = replaceWithClone(
    document.getElementById("singlePlayerBtn")
  );
  const multiplayerBtn = replaceWithClone(
    document.getElementById("multiplayerBtn")
  );
  const changeModeBtn = replaceWithClone(
    document.getElementById("changeModeBtn")
  );

  if (singlePlayerBtn) {
    singlePlayerBtn.addEventListener("click", () =>
      startGameMode("singleplayer")
    );
  }

  if (multiplayerBtn) {
    multiplayerBtn.addEventListener("click", () =>
      startGameMode("multiplayer")
    );
  }

  if (changeModeBtn) {
    changeModeBtn.addEventListener("click", () => {
      if (
        window.currentGame &&
        typeof window.currentGame.destroy === "function"
      ) {
        window.currentGame.destroy();
        window.currentGame = null;
      }
      if (window.offlineVisibilityHandler) {
        document.removeEventListener(
          "visibilitychange",
          window.offlineVisibilityHandler
        );
        window.offlineVisibilityHandler = null;
      }

      const modeSelection = document.getElementById("modeSelection");
      const gameArea = document.getElementById("gameArea");
      if (modeSelection) modeSelection.style.display = "block";
      if (gameArea) gameArea.style.display = "none";

      const statusElement = document.getElementById("status");
      if (statusElement) {
        statusElement.textContent = "Select a mode to begin";
      }
    });
  }
}

function startGameMode(mode) {
  const modeSelection = document.getElementById("modeSelection");
  const gameArea = document.getElementById("gameArea");
  const currentModeSpan = document.getElementById("currentMode");

  if (modeSelection) modeSelection.style.display = "none";
  if (gameArea) gameArea.style.display = "block";

  if (window.currentGame && typeof window.currentGame.destroy === "function") {
    window.currentGame.destroy();
  }

  if (window.offlineVisibilityHandler) {
    document.removeEventListener(
      "visibilitychange",
      window.offlineVisibilityHandler
    );
    window.offlineVisibilityHandler = null;
  }

  const game = new PongGame("gameCanvas", mode);
  window.currentGame = game;

  if (currentModeSpan) {
    currentModeSpan.textContent =
      mode === "singleplayer"
        ? "Mode: Single Player (vs AI)"
        : "Mode: Multiplayer (2 Players)";
  }

  updateGameInstructions(mode);

  const attachButton = (id, handler) => {
    const button = document.getElementById(id);
    if (!button) return;
    const clone = button.cloneNode(true);
    button.parentNode.replaceChild(clone, button);
    clone.addEventListener("click", handler);
  };

  attachButton("startButton", () => game.start());
  attachButton("pauseButton", () => game.pause());
  attachButton("resetButton", () => game.reset());

  window.offlineVisibilityHandler = () => {
    if (document.hidden && game.gameRunning) {
      game.reset();
    }
  };
  document.addEventListener(
    "visibilitychange",
    window.offlineVisibilityHandler
  );

  game.reset();
}

function updateGameInstructions(mode) {
  const instructionsElement = document.getElementById("gameInstructions");
  if (!instructionsElement) return;

  if (mode === "singleplayer") {
    instructionsElement.innerHTML = `
      <div class="player-controls player-1-solo">
        <div class="player-label">Player Controls</div>
        <div class="controls-text">Move Up: <span class="key">W</span></div>
        <div class="controls-text">Move Down: <span class="key">S</span></div>
      </div>
    `;
  } else {
    instructionsElement.innerHTML = `
      <div class="game-controls-info">
        <div class="player-controls player-1">
          <div class="player-label">Player 1</div>
          <div class="controls-text">Move Up: <span class="key">W</span></div>
          <div class="controls-text">Move Down: <span class="key">S</span></div>
        </div>
        <div class="player-controls player-2">
          <div class="player-label">Player 2</div>
          <div class="controls-text">Move Up: <span class="key">O</span></div>
          <div class="controls-text">Move Down: <span class="key">L</span></div>
        </div>
      </div>
    `;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { PongGame, initGame };
} else {
  window.PongGame = PongGame;
  window.initGame = initGame;
}
