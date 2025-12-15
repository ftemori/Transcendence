import { Navbar } from "../../components/Navbar/index.js";
import { GameScore } from "../../components/GameScore/index.js";
import { GameControls } from "../../components/GameControls/index.js";
import { useTournament } from "../../hooks/useTournament.js";
import { checkAuth } from "../../utils/auth.js";

export async function TournamentPage() {
  const user = await checkAuth();

  if (!user.loggedIn) {
    return `
      ${Navbar(user)}
      <div class="main-content">
        <div class="game-container">
          <div class="auth-required-message">
            <h2>Authentication Required</h2>
            <p>You must be logged in to participate in tournaments.</p>
            <div class="auth-actions">
              <a href="/login" class="btn btn-primary btn-large nav-link">Login</a>
              <a href="/register" class="btn btn-secondary btn-large nav-link">Register</a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const { initializeTournament } = useTournament();
  initializeTournament(user);

  return `
    ${Navbar(user)}
    <div class="main-content">
      <div class="game-container">
        <h1>Tournament Mode</h1>
        <div class="status-container">
          <p id="status">Connecting to server...</p>
        </div>
        <div class="online-info" style="margin-bottom: 5px;">
          <div class="connection-status">
            <div id="connIndicator" class="status-indicator"></div>
            <span id="connText">Connecting...</span>
          </div>
          <div class="room-info">
            <p>Tournament ID: <span id="tournamentIdDisplay">-</span></p>
            <p>Participants: <span id="participantCount">0</span></p>
          </div>
        </div>
        <div id="leaveTournamentContainer" class="game-controls-bottom" style="margin-top: 2px; margin-bottom: 2px; display: none;">
          <button id="leaveTournamentBtn" class="btn btn-danger btn-large">Leave Tournament</button>
        </div>
        <div id="participantsList" class="participants-list" style="max-width: 1000px; width: 100%; margin: 5px auto; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 10px; display: none;">
          <h3 style="margin-bottom: 10px; color: white; font-size: 18px;">Tournament Participants</h3>
          <div id="participantsContainer" style="display: flex; flex-wrap: wrap; gap: 10px;">
            <!-- Participants will be added here dynamically -->
          </div>
        </div>
        <div id="tournamentBracket" class="tournament-bracket" style="max-width: 1000px; width: 100%; margin: 5px auto; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 10px; display: none;">
          <h3 style="margin-bottom: 8px; color: white; font-size: 16px;">Tournament Bracket</h3>
          <div id="bracketContainer">
            <!-- Tournament bracket will be added here dynamically -->
          </div>
        </div>
        <div class="game-controls-bottom">
          <button id="createTournamentBtn" class="btn btn-success btn-large">Create Tournament</button>
        </div>
        <div class="game-controls-bottom" style="margin-top: 10px;">
          <input id="tournamentIdInput" 
                 class="btn btn-secondary btn-large" 
                 style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); text-align: center; font-size: 18px; text-transform: uppercase; letter-spacing: 2px; max-width: 200px;" 
                 placeholder="Enter Code" 
                 maxlength="4"
                 pattern="[A-Za-z0-9]{4}" />
          <button id="joinTournamentBtn" class="btn btn-secondary btn-large">Join Tournament</button>
        </div>
        <div class="game-controls-bottom" style="margin-top: 10px;">
          <button id="readyButton" class="btn btn-primary btn-large" style="display: none;">Ready</button>
        </div>
        <div id="gameTopRow" style="display:flex; align-items:center; justify-content:space-between; width:100%; max-width:1000px; margin-top: 0;">
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
