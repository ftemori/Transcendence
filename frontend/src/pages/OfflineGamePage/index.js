import { Navbar } from "../../components/Navbar/index.js";
import { GameScore } from "../../components/GameScore/index.js";
import { GameControls } from "../../components/GameControls/index.js";
import { useGame } from "../../hooks/useGame.js";
import { checkAuth } from "../../utils/auth.js"; // index.ts

export async function OfflineGamePage() {
  const { initializeGame } = useGame();
  const user = await checkAuth();
  initializeGame();

  return `
    ${Navbar(user)}
    <div class="main-content">
      <div class="game-container">
        <h1>Pong Game - Offline</h1>

        <div id="modeSelection" class="mode-selection">
          <h2>Select Game Mode</h2>
          <div class="mode-buttons">
            <button id="singlePlayerBtn" class="btn btn-primary btn-large mode-btn">
              <div class="mode-title">Single Player</div>
              <div class="mode-description">Play against AI</div>
            </button>
            <button id="multiplayerBtn" class="btn btn-primary btn-large mode-btn">
              <div class="mode-title">Multiplayer</div>
              <div class="mode-description">Two players on one keyboard</div>
            </button>
          </div>
        </div>

        <div id="gameArea" class="game-area" style="display: none;">
          <div class="game-mode-info">
            <span id="currentMode"></span>
            <button id="changeModeBtn" class="btn btn-secondary btn-small">Change Mode</button>
          </div>
          ${GameScore()}
          <canvas id="gameCanvas" width="1000" height="700"></canvas>

          <div id="gameInstructions" class="game-instructions">
            <!-- Instructions will be inserted here based on mode -->
          </div>

          <div class="game-controls-bottom">
            <button id="startButton" class="btn btn-primary btn-large">Start</button>
            <button id="pauseButton" class="btn btn-secondary btn-large">Pause</button>
            <button id="resetButton" class="btn btn-secondary btn-large">Reset</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
