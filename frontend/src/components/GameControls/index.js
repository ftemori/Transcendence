export function GameControls() {
  const currentPath = window.location.pathname;
  const isOnline = currentPath.includes("/online");
  const isTournament = currentPath.includes("/tournament");

  // Online and tournament modes - only show single player controls (everyone plays on their own screen)
  if (isOnline || isTournament) {
    return `
      <div class="game-instructions">
        <div class="controls-grid">
          <div class="player-controls-inline">
            <div class="player-section">
              <span class="player-label">Controls:</span>
              <span class="controls-inline">
                <span class="key">W</span>/<span class="key">S</span> - Move Up/Down
              </span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Offline mode - show both players controls (local multiplayer)
  return `
    <div class="game-instructions">
      <div class="controls-grid">
        <div class="player-controls-inline">
          <div class="player-section">
            <span class="player-label">Player 1 (Left):</span>
            <span class="controls-inline">
              <span class="key">W</span>/<span class="key">S</span> - Move Up/Down
            </span>
          </div>
          <div class="player-section">
            <span class="player-label">Player 2 (Right):</span>
            <span class="controls-inline">
              <span class="key">O</span>/<span class="key">L</span> - Move Up/Down
            </span>
          </div>
        </div>
      </div>
    </div>
  `;
}
