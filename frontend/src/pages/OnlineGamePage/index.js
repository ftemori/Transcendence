import { Navbar } from "../../components/Navbar/index.js";
import { GameScore } from "../../components/GameScore/index.js";
import { GameControls } from "../../components/GameControls/index.js";
import { useOnlineGame } from "../../hooks/useOnlineGame.js";
import { checkAuth } from "../../utils/auth.js";

export async function OnlineGamePage() {
  const user = await checkAuth();

  if (!user.loggedIn) {
    return `
      ${Navbar(user)}
      <div class="main-content">
        <div class="game-container">
          <div class="auth-required-message">
            <h2>Authentication Required</h2>
            <p>You must be logged in to play online games.</p>
            <div class="auth-actions">
              <a href="/login" class="btn btn-primary btn-large nav-link">Login</a>
              <a href="/register" class="btn btn-secondary btn-large nav-link">Register</a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const { initializeOnlineGame } = useOnlineGame();
  initializeOnlineGame(user);

  return `
    ${Navbar(user)}
    <div class="main-content">
      <div class="game-container">
        <h1>Casual Online Match</h1>
        <div class="status-container" style="margin: 0;">
          <p id="status" style="margin: 0;">Connecting to server...</p>
        </div>
        <div class="online-info" style="margin: 0;">
          <div class="connection-status">
            <div id="connIndicator" class="status-indicator"></div>
            <span id="connText">Connecting...</span>
          </div>
        </div>
        <div class="game-controls-bottom" style="margin: 5px 0;">
          <button id="findMatchButton" class="btn btn-primary">Find Match</button>
          <button id="readyButton" class="btn btn-success" style="display:none;">Ready</button>
          <button id="againButton" class="btn btn-success" style="display:none;">Again</button>
        </div>
        <div id="gameTopRow" style="display:flex; align-items:center; justify-content:space-between; width:100%; max-width:1000px; margin-top: 8px;">
          <div id="playerInfoLeft" style="display:flex; align-items:center; gap:12px; min-width:220px; justify-content:flex-start;">
            <div id="leftAvatar" style="width:60px; height:60px; border-radius:50%; background:#f44336; display:none; overflow:hidden; border: 3px solid #f44336; position:relative;">
              <img id="leftAvatarImg" src="" style="width:100%; height:100%; object-fit:cover;" />
              <span id="leftAvatarFallback" style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:30px; display:none;">👤</span>
            </div>
            <div id="leftPlayerInfo" style="display:none;">
              <div id="leftUsername" style="font-weight:600; color:#f44336; font-size:20px;"></div>
              <div id="leftReadyStatus" style="font-size:12px; padding:3px 10px; border-radius:4px; background:rgba(255,255,255,0.1); color:#aaa; display:inline-block;"></div>
            </div>
          </div>
          ${GameScore()}
          <div id="playerInfoRight" style="display:flex; align-items:center; gap:12px; min-width:220px; justify-content:flex-end;">
            <div id="rightPlayerInfo" style="display:none; text-align:right;">
              <div id="rightUsername" style="font-weight:600; color:#2196f3; font-size:20px;"></div>
              <div id="rightReadyStatus" style="font-size:12px; padding:3px 10px; border-radius:4px; background:rgba(255,255,255,0.1); color:#aaa; display:inline-block;"></div>
            </div>
            <div id="rightAvatar" style="width:60px; height:60px; border-radius:50%; background:#2196f3; display:none; overflow:hidden; border: 3px solid #2196f3; position:relative;">
              <img id="rightAvatarImg" src="" style="width:100%; height:100%; object-fit:cover;" />
              <span id="rightAvatarFallback" style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:30px; display:none;">👤</span>
            </div>
          </div>
        </div>
        <canvas id="gameCanvas" width="1000" height="700"></canvas>
        ${GameControls()}
      </div>
    </div>
  `;
}
