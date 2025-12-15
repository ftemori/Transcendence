export function GameScore() {
  return `
    <div class="game-score-top">
      <div id="score" class="score-display">
        <span class="player-left">0</span>
        <span class="score-separator">:</span>
        <span class="player-right">0</span>
      </div>
      <div id="status" class="game-status">Press Start to begin</div>
    </div>
  `;
}
