// Tournament management for single-elimination (Olympic system)
import {
  createGameWithPlayers,
  onGameOver,
  getPlayerBySocket,
  getPlayerById,
  isPlayerInGame,
  getGame,
  endGame,
} from "./game.js";
import type { IPlayer } from "./types.js";
import { persistTournamentResult } from "./persistence.js";

export type TournamentStatus =
  | "created"
  | "starting"
  | "inProgress"
  | "completed";

type SocketLike = { send: (data: string) => void };

interface Match {
  left?: IPlayer;
  right?: IPlayer;
  gameId?: string;
  winner?: IPlayer;
}

// Valid tournament sizes - must be exactly 4 or 8 players
const VALID_TOURNAMENT_SIZES = [4, 8];
const READY_TIMEOUT_MS = 30000; // 30 seconds to ready up

export class Tournament {
  id: string;
  creator: IPlayer;
  status: TournamentStatus = "created";
  players: IPlayer[] = [];
  playersReady: Set<number> = new Set(); // Track which players are ready
  roundPlayersReady: Set<number> = new Set(); // Track which players are ready for next round
  createdAt: number = Date.now();
  startTimeout?: ReturnType<typeof setTimeout>;
  kickoffRetryTimeout?: ReturnType<typeof setTimeout>;
  readyTimeout?: ReturnType<typeof setTimeout>; // Timeout for ready-up phase
  round: number = 0;
  bracket: Match[][] = [];

  constructor(id: string, creator: IPlayer) {
    this.id = id;
    this.creator = creator;
    this.players.push(creator);
    console.log(`[Tournament ${this.id}] created by ${creator.id}`);
    // Remove auto-start timer - now controlled by ready system
  }

  join(player: IPlayer) {
    console.log(
      `[Tournament ${this.id}] join attempt by ${player.id} (status=${this.status})`
    );
    if (this.status !== "created" && this.status !== "starting") return false;
    if (!this.players.find((p) => p.id === player.id))
      this.players.push(player);
    console.log(
      `[Tournament ${this.id}] players now: ${this.players
        .map((p) => p.id)
        .join(",")}`
    );

    // Broadcast updated participant list to all players
    this.broadcastParticipantUpdate();

    return true;
  }

  broadcastParticipantUpdate() {
    const participantData = {
      type: "tournamentParticipants",
      tournamentId: this.id,
      count: this.players.length,
      round: this.round,
      status: this.status,
      participants: this.players.map((p) => ({
        id: p.id,
        username: p.username || `Player ${p.id}`,
        ready:
          this.status === "created"
            ? this.playersReady.has(p.id)
            : this.roundPlayersReady.has(p.id),
      })),
    };

    for (const p of this.players) {
      try {
        p.socket.send(JSON.stringify(participantData));
      } catch (e) {
        console.error(
          `[Tournament ${this.id}] Failed to send participant update to ${p.id}`,
          e
        );
      }
    }
  }

  setPlayerReady(playerId: number, ready: boolean) {
    // Initial ready (before tournament starts)
    if (this.status === "created") {
      if (ready) {
        this.playersReady.add(playerId);
      } else {
        this.playersReady.delete(playerId);
      }

      console.log(
        `[Tournament ${this.id}] Player ${playerId} initial ready=${ready}. Ready count: ${this.playersReady.size}/${this.players.length}`
      );

      // Broadcast updated participant list with ready status
      this.broadcastParticipantUpdate();

      // Check if all players are ready
      if (this.playersReady.size === this.players.length) {
        // Validate tournament size - must be exactly 4 or 8 players
        if (!VALID_TOURNAMENT_SIZES.includes(this.players.length)) {
          console.log(
            `[Tournament ${this.id}] Cannot start - need exactly 4 or 8 players, have ${this.players.length}`
          );
          // Broadcast error to all players
          for (const p of this.players) {
            try {
              p.socket.send(
                JSON.stringify({
                  type: "tournamentUpdate",
                  tournamentId: this.id,
                  status: "error",
                  message: `Cannot start - need exactly 4 or 8 players (currently ${this.players.length}). Waiting for more players...`,
                })
              );
            } catch { }
          }
          return true;
        }

        console.log(
          `[Tournament ${this.id}] All ${this.players.length} players ready! Starting tournament...`
        );
        this.start();
      }

      return true;
    }

    // Round ready (during tournament for next round)
    if (this.status === "inProgress") {
      if (ready) {
        this.roundPlayersReady.add(playerId);
      } else {
        this.roundPlayersReady.delete(playerId);
      }

      // Find active players in current round
      // After a round completes and advances, this.round is already incremented
      // So we need to check the current round (this.round - 1) for active players
      const currentRoundMatches = this.bracket[this.round - 1];
      const activePlayers = new Set<number>();
      if (currentRoundMatches) {
        currentRoundMatches.forEach((match) => {
          // Only count players in matches that haven't been decided yet
          if (!match.winner) {
            if (match.left) activePlayers.add(match.left.id);
            if (match.right) activePlayers.add(match.right.id);
          }
        });
      }

      console.log(
        `[Tournament ${this.id}] Player ${playerId} round ready=${ready}. Ready count: ${this.roundPlayersReady.size}/${activePlayers.size}. Active players: ${Array.from(activePlayers).join(",")}`
      );

      // Broadcast ready status to all tournament players
      this.broadcastRoundReadyStatus(activePlayers);

      // Start ready timeout when first player readies up for the round
      if (this.roundPlayersReady.size === 1 && !this.readyTimeout) {
        console.log(
          `[Tournament ${this.id}] Starting ${READY_TIMEOUT_MS / 1000}s ready timeout for round ${this.round}`
        );
        this.readyTimeout = setTimeout(() => {
          this.handleReadyTimeout();
        }, READY_TIMEOUT_MS);

        // Notify all active players about the timeout
        for (const p of this.players) {
          if (activePlayers.has(p.id)) {
            try {
              p.socket.send(
                JSON.stringify({
                  type: "tournamentReadyTimeout",
                  tournamentId: this.id,
                  timeoutSeconds: READY_TIMEOUT_MS / 1000,
                  message: `${READY_TIMEOUT_MS / 1000} seconds to ready up or forfeit!`,
                })
              );
            } catch { }
          }
        }
      }

      // Check if all active players are ready
      const allReady = Array.from(activePlayers).every((pid) =>
        this.roundPlayersReady.has(pid)
      );

      if (allReady && activePlayers.size > 0) {
        // Clear ready timeout since all players are ready
        if (this.readyTimeout) {
          clearTimeout(this.readyTimeout);
          this.readyTimeout = undefined;
        }

        console.log(
          `[Tournament ${this.id}] All players ready for round ${this.round}! Starting matches...`
        );
        // Clear ready status for next round
        this.roundPlayersReady.clear();
        this.kickoffRound();
      }

      return true;
    }

    console.log(
      `[Tournament ${this.id}] Cannot set ready in status ${this.status}`
    );
    return false;
  }

  start() {
    if (this.status === "completed" || this.status === "inProgress") return;
    if (this.startTimeout) {
      clearTimeout(this.startTimeout);
      this.startTimeout = undefined;
    }
    if (this.readyTimeout) {
      clearTimeout(this.readyTimeout);
      this.readyTimeout = undefined;
    }
    this.status = "starting";
    console.log(
      `[Tournament ${this.id}] starting with ${this.players.length} players`
    );

    const entrants = [...this.players];

    // Validate tournament size - must be exactly 4 or 8 players
    if (!VALID_TOURNAMENT_SIZES.includes(entrants.length)) {
      console.log(
        `[Tournament ${this.id}] Invalid player count ${entrants.length}, need exactly 4 or 8`
      );
      this.status = "created"; // Reset to created so players can still join
      // Broadcast error to all players
      for (const p of this.players) {
        try {
          p.socket.send(
            JSON.stringify({
              type: "tournamentUpdate",
              tournamentId: this.id,
              status: "error",
              message: `Cannot start - need exactly 4 or 8 players (currently ${entrants.length})`,
            })
          );
        } catch { }
      }
      return;
    }

    // shuffle
    for (let i = entrants.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [entrants[i], entrants[j]] = [entrants[j], entrants[i]];
    }

    // round 1
    const firstRound: Match[] = [];
    for (let i = 0; i < entrants.length; i += 2) {
      const left = entrants[i];
      const right = entrants[i + 1];
      if (right) {
        firstRound.push({ left, right });
      } else {
        firstRound.push({ left, winner: left });
        console.log(`[Tournament ${this.id}] bye -> ${left.id} advances`);
      }
    }
    this.bracket.push(firstRound);
    this.status = "inProgress";
    this.round = 1;

    // Broadcast tournament bracket to all players
    this.broadcastBracket();

    this.kickoffRound();
  }

  broadcastRoundReadyStatus(activePlayers: Set<number>) {
    const readyData = {
      type: "tournamentRoundReady",
      tournamentId: this.id,
      round: this.round,
      readyPlayers: Array.from(this.roundPlayersReady),
      activePlayers: Array.from(activePlayers),
    };

    for (const p of this.players) {
      try {
        p.socket.send(JSON.stringify(readyData));
      } catch (e) {
        console.error(
          `[Tournament ${this.id}] Failed to send ready status to ${p.id}`,
          e
        );
      }
    }
  }

  broadcastBracket() {
    const bracketData = {
      type: "tournamentBracket",
      tournamentId: this.id,
      round: this.round,
      bracket: this.bracket.map((round) =>
        round.map((match) => {
          // Get live scores if match is in progress
          let leftScore = 0;
          let rightScore = 0;
          if (match.gameId && !match.winner) {
            const game = getGame(match.gameId);
            if (game) {
              leftScore = game.leftPlayer?.score || 0;
              rightScore = game.rightPlayer?.score || 0;
            }
          }

          return {
            left: match.left
              ? {
                id: match.left.id,
                username: match.left.username || `Player ${match.left.id}`,
              }
              : null,
            right: match.right
              ? {
                id: match.right.id,
                username: match.right.username || `Player ${match.right.id}`,
              }
              : null,
            winner: match.winner
              ? {
                id: match.winner.id,
                username: match.winner.username || `Player ${match.winner.id}`,
              }
              : null,
            inProgress: !!match.gameId && !match.winner,
            gameId: match.gameId || null,
            leftScore,
            rightScore,
          };
        })
      ),
    };

    for (const p of this.players) {
      try {
        p.socket.send(JSON.stringify(bracketData));
      } catch (e) {
        console.error(
          `[Tournament ${this.id}] Failed to send bracket to ${p.id}`,
          e
        );
      }
    }
  }

  private kickoffRound() {
    if (this.status === "completed") return;
    const matches = this.bracket[this.round - 1];
    if (!matches) return;
    // If any match in this round already has a running game, do not attempt to create another.
    // We'll be called again via the game-over listener to advance the bracket.
    if (matches.some((m) => !!m.gameId && !m.winner)) {
      return;
    }
    console.log(
      `[Tournament ${this.id}] kickoff round ${this.round}, matches=${matches.length}`
    );

    let gamesCreated = false;

    // PARALLEL MATCHES: Start all matches in this round simultaneously
    for (const m of matches) {
      if (m.winner) continue; // bye or already decided
      if (m.gameId) continue; // match already created/in progress
      if (!m.left || !m.right) continue;

      // Defer match start if any player is already in a game
      if (isPlayerInGame(m.left) || isPlayerInGame(m.right)) {
        if (!this.kickoffRetryTimeout) {
          this.kickoffRetryTimeout = setTimeout(() => {
            this.kickoffRetryTimeout = undefined;
            this.kickoffRound();
          }, 1000);
        }
        return; // try again shortly when players are free
      }

      // Refresh player socket references from the canonical socketToPlayer map
      // This ensures we use current socket even if player reconnected since joining tournament
      const leftPlayer = getPlayerById(m.left.id);
      const rightPlayer = getPlayerById(m.right.id);

      if (!leftPlayer || !rightPlayer) {
        console.log(`[Tournament ${this.id}] Cannot create match - player(s) not connected`);
        continue;
      }

      // Update tournament's stored references with current socket info
      m.left.socket = leftPlayer.socket;
      m.right.socket = rightPlayer.socket;

      // Create match using refreshed player references
      const gameId = createGameWithPlayers(leftPlayer, rightPlayer);
      m.gameId = gameId;
      gamesCreated = true;
      console.log(
        `[Tournament ${this.id}] round ${this.round} match: ${m.left.id} vs ${m.right.id} -> game ${gameId}`
      );
      onGameOver(gameId, ({ winner }) => {
        console.log(
          `[Tournament ${this.id}] game ${gameId} finished, winner=${winner.id}`
        );
        m.winner = winner;
        // Broadcast updated bracket after match finishes
        this.broadcastBracket();
        this.checkRoundCompletion();
      });

      try {
        m.left.socket.send(
          JSON.stringify({
            type: "tournamentMatch",
            tournamentId: this.id,
            round: this.round,
            opponentId: m.right.id,
            opponentUsername: m.right.username,
            role: "left",
          })
        );
      } catch { }
      try {
        m.right.socket.send(
          JSON.stringify({
            type: "tournamentMatch",
            tournamentId: this.id,
            round: this.round,
            opponentId: m.left.id,
            opponentUsername: m.left.username,
            role: "right",
          })
        );
      } catch { }
    }

    // Broadcast updated bracket after starting matches
    if (gamesCreated) {
      this.broadcastBracket();
    }
  }
  private async checkRoundCompletion() {
    const matches = this.bracket[this.round - 1];
    if (!matches) return;
    const allDone = matches.every((m) => !!m.winner);

    // If not all matches in the round are done, try to start the next match
    if (!allDone) {
      console.log(
        `[Tournament ${this.id}] Match finished, starting next match in round ${this.round}...`
      );
      this.kickoffRound(); // Start the next match in this round
      return;
    }

    if (matches.length === 1) {
      const champion = matches[0].winner!;
      this.status = "completed";
      // Cancel any pending retry timer now that tournament is done
      if (this.kickoffRetryTimeout) {
        clearTimeout(this.kickoffRetryTimeout);
        this.kickoffRetryTimeout = undefined;
      }
      // Also cancel any scheduled auto-start timer defensively
      if (this.startTimeout) {
        clearTimeout(this.startTimeout);
        this.startTimeout = undefined;
      }
      console.log(`[Tournament ${this.id}] completed, winner=${champion.id}`);
      for (const p of this.players) {
        try {
          p.socket.send(
            JSON.stringify({
              type: "tournamentCompleted",
              tournamentId: this.id,
              winnerId: champion.id,
            })
          );
        } catch { }
      }
      try {
        await persistTournamentResult({
          tournamentId: this.id,
          winnerId: champion.id,
          players: this.players.map((p) => p.id),
          rounds: this.bracket.map((r) => r.length),
        });
      } catch (e) {
        console.error(`[Tournament ${this.id}] persist failed`, e);
      }
      // Remove from manager registry to prevent any further accidental scheduling
      try {
        tournamentManager.tournaments.delete(this.id);
      } catch { }
      return;
    }

    const nextRound: Match[] = [];
    for (let i = 0; i < matches.length; i += 2) {
      const a = matches[i].winner!;
      const b = matches[i + 1].winner!;
      nextRound.push({ left: a, right: b });
    }
    this.bracket.push(nextRound);
    this.round += 1;
    console.log(`[Tournament ${this.id}] advancing to round ${this.round}`);
    // Clear any stale retry timer before starting next round scheduling
    if (this.kickoffRetryTimeout) {
      clearTimeout(this.kickoffRetryTimeout);
      this.kickoffRetryTimeout = undefined;
    }
    // Clear round ready status for new round
    this.roundPlayersReady.clear();
    // Broadcast participant update to show reset ready status
    this.broadcastParticipantUpdate();
    // Broadcast updated bracket
    this.broadcastBracket();
    // Notify players that round is complete and they need to ready up
    const activePlayers = new Set<number>();
    nextRound.forEach((match) => {
      if (match.left) activePlayers.add(match.left.id);
      if (match.right) activePlayers.add(match.right.id);
    });
    for (const p of this.players) {
      if (activePlayers.has(p.id)) {
        try {
          p.socket.send(
            JSON.stringify({
              type: "tournamentRoundComplete",
              tournamentId: this.id,
              round: this.round,
              message: `Round ${this.round - 1} complete! Click Ready to continue.`,
            })
          );
        } catch { }
      }
    }
    // Don't auto-start next round - wait for all players to be ready
  }

  /**
   * Handle ready timeout - forfeit players who didn't ready up in time
   */
  private handleReadyTimeout() {
    this.readyTimeout = undefined;

    if (this.status !== "inProgress") return;

    const currentRoundMatches = this.bracket[this.round - 1];
    if (!currentRoundMatches) return;

    // Find active players who need to be ready
    const activePlayers = new Set<number>();
    currentRoundMatches.forEach((match) => {
      if (!match.winner) {
        if (match.left) activePlayers.add(match.left.id);
        if (match.right) activePlayers.add(match.right.id);
      }
    });

    // Find players who didn't ready up
    const notReadyPlayers: number[] = [];
    for (const playerId of activePlayers) {
      if (!this.roundPlayersReady.has(playerId)) {
        notReadyPlayers.push(playerId);
      }
    }

    if (notReadyPlayers.length === 0) {
      console.log(`[Tournament ${this.id}] Ready timeout fired but all players are ready`);
      return;
    }

    console.log(
      `[Tournament ${this.id}] Ready timeout! Players not ready: ${notReadyPlayers.join(", ")}`
    );

    // Forfeit each player who didn't ready up
    for (const playerId of notReadyPlayers) {
      this.forfeitPlayer(playerId, "ready timeout");
    }
  }

  /**
   * Forfeit a player from the tournament (disconnect or timeout)
   * Sets their opponent as winner of the current match
   */
  forfeitPlayer(playerId: number, reason: string = "disconnect") {
    console.log(`[Tournament ${this.id}] Player ${playerId} forfeited (${reason})`);

    if (this.status !== "inProgress") {
      // If tournament hasn't started, just remove the player
      const playerIndex = this.players.findIndex((p) => p.id === playerId);
      if (playerIndex !== -1) {
        const removedPlayer = this.players[playerIndex];
        this.players.splice(playerIndex, 1);
        this.playersReady.delete(playerId);

        // Notify remaining players
        for (const p of this.players) {
          try {
            p.socket.send(
              JSON.stringify({
                type: "tournamentForfeit",
                tournamentId: this.id,
                forfeitedPlayerId: playerId,
                forfeitedUsername: removedPlayer.username || `Player ${playerId}`,
                reason,
                message: `${removedPlayer.username || `Player ${playerId}`} left the tournament`,
              })
            );
          } catch { }
        }
        this.broadcastParticipantUpdate();
      }
      return;
    }

    // Find the match this player is in for the current round
    const currentRoundMatches = this.bracket[this.round - 1];
    if (!currentRoundMatches) return;

    for (const match of currentRoundMatches) {
      if (match.winner) continue; // Match already decided

      const isLeft = match.left?.id === playerId;
      const isRight = match.right?.id === playerId;

      if (isLeft || isRight) {
        // End the running game if there is one
        if (match.gameId) {
          console.log(`[Tournament ${this.id}] Ending game ${match.gameId} due to forfeit`);
          endGame(match.gameId);
          match.gameId = undefined; // Clear the game reference
        }

        // Set opponent as winner
        const winner = isLeft ? match.right : match.left;
        const loser = isLeft ? match.left : match.right;

        if (winner) {
          match.winner = winner;
          console.log(
            `[Tournament ${this.id}] ${winner.username || winner.id} wins by forfeit against ${loser?.username || loser?.id}`
          );

          // Notify winner about the forfeit win
          try {
            winner.socket.send(
              JSON.stringify({
                type: "gameOver",
                won: true,
                reason: "forfeit",
                message: `You win! Opponent ${reason}.`,
              })
            );
          } catch { }

          // Notify all players about the forfeit
          for (const p of this.players) {
            try {
              p.socket.send(
                JSON.stringify({
                  type: "tournamentForfeit",
                  tournamentId: this.id,
                  forfeitedPlayerId: playerId,
                  forfeitedUsername: loser?.username || `Player ${playerId}`,
                  winnerId: winner.id,
                  winnerUsername: winner.username || `Player ${winner.id}`,
                  reason,
                  message: `${winner.username || winner.id} wins by forfeit (opponent ${reason})`,
                })
              );
            } catch { }
          }

          // Broadcast updated bracket
          this.broadcastBracket();

          // Check if round is complete
          this.checkRoundCompletion();
        } else {
          // No opponent (bye match or error) - just mark as complete
          console.log(`[Tournament ${this.id}] No opponent for forfeited player ${playerId}`);
        }
        break;
      }
    }
  }

  /**
   * Get a player in this tournament by their ID
   */
  getPlayerById(playerId: number): IPlayer | undefined {
    return this.players.find((p) => p.id === playerId);
  }

  /**
   * Check if a player is in an active match in this tournament
   */
  isPlayerInActiveMatch(playerId: number): boolean {
    if (this.status !== "inProgress") return false;

    const currentRoundMatches = this.bracket[this.round - 1];
    if (!currentRoundMatches) return false;

    return currentRoundMatches.some(
      (match) =>
        !match.winner &&
        (match.left?.id === playerId || match.right?.id === playerId)
    );
  }
}

export class TournamentManager {
  tournaments: Map<string, Tournament> = new Map();

  private generateSimpleId(): string {
    // Generate a simple 4-character alphanumeric code (uppercase letters and numbers)
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Exclude similar looking chars like I, 1, O, 0
    let id = "";
    for (let i = 0; i < 4; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Check if already exists, regenerate if collision
    if (this.tournaments.has(id)) {
      return this.generateSimpleId();
    }
    return id;
  }

  createTournament(creatorSocket: SocketLike): Tournament | null {
    const creator = getPlayerBySocket(creatorSocket as any);
    if (!creator) {
      console.error("[Tournament] Cannot create - player not found for socket");
      return null;
    }
    const id = this.generateSimpleId();
    const t = new Tournament(id, creator);
    this.tournaments.set(id, t);
    try {
      creator.socket.send(
        JSON.stringify({
          type: "tournamentUpdate",
          tournamentId: id,
          status: "created",
          message: "Tournament created. Others can join for 1 minute.",
        })
      );
    } catch { }
    // Send initial participant list
    t.broadcastParticipantUpdate();
    return t;
  }

  joinTournament(tournamentId: string, socket: SocketLike): boolean {
    // Normalize tournament ID to uppercase for case-insensitive matching
    const normalizedId = tournamentId.toUpperCase();
    let t = this.tournaments.get(normalizedId);
    const player = getPlayerBySocket(socket as any);
    if (!player) {
      console.error("[Tournament] Cannot join - player not found for socket");
      return false;
    }
    // If tournament doesn't exist yet, create it on-demand with this player as creator.
    if (!t) {
      console.log(`[Tournament ${normalizedId}] not found, creating on-demand`);
      t = new Tournament(normalizedId, player);
      this.tournaments.set(normalizedId, t);
      try {
        (player.socket as any).send(
          JSON.stringify({
            type: "tournamentUpdate",
            tournamentId: normalizedId,
            status: t.status,
            message: "Tournament created. Others can join for 1 minute.",
          })
        );
      } catch { }
      // Send initial participant list
      t.broadcastParticipantUpdate();
    }
    const ok = t.join(player);
    return ok;
  }

  setPlayerReady(
    tournamentId: string,
    socket: SocketLike,
    ready: boolean
  ): boolean {
    const normalizedId = tournamentId.toUpperCase();
    const t = this.tournaments.get(normalizedId);
    const player = getPlayerBySocket(socket as any);

    if (!t || !player) {
      console.error(
        "[Tournament] Cannot set ready - tournament or player not found"
      );
      return false;
    }

    return t.setPlayerReady(player.id, ready);
  }

  // Rejoin tournament after reconnect
  rejoinTournament(tournamentId: string, socket: SocketLike): boolean {
    const normalizedId = tournamentId.toUpperCase();
    const t = this.tournaments.get(normalizedId);
    const player = getPlayerBySocket(socket as any);

    if (!t || !player) {
      console.log(
        `[Tournament] Cannot rejoin ${normalizedId} - tournament or player not found`
      );
      return false;
    }

    // Check if player is already in this tournament
    const alreadyIn = t.players.find((p) => p.id === player.id);
    if (!alreadyIn) {
      console.log(
        `[Tournament ${normalizedId}] Player ${player.id} not in tournament, adding them`
      );
      // Try to add them if tournament still accepting players
      if (t.status === "created" || t.status === "starting") {
        t.join(player);
      } else {
        console.log(
          `[Tournament ${normalizedId}] Cannot rejoin - tournament already in progress`
        );
        return false;
      }
    }

    // Update player's socket reference (important after reconnect)
    const existingPlayer = t.players.find((p) => p.id === player.id);
    if (existingPlayer) {
      existingPlayer.socket = player.socket;
    }

    // Send current tournament state
    try {
      player.socket.send(
        JSON.stringify({
          type: "tournamentUpdate",
          tournamentId: normalizedId,
          status: t.status,
          message: `Rejoined tournament. Status: ${t.status}`,
        })
      );

      // Send participant list
      t.broadcastParticipantUpdate();

      // Send bracket if tournament is in progress
      if (t.status === "inProgress" && t.bracket.length > 0) {
        t.broadcastBracket();

        // Check if this player has an active match
        const currentRoundMatches = t.bracket[t.round - 1];
        if (currentRoundMatches) {
          for (const match of currentRoundMatches) {
            if (
              !match.winner &&
              (match.left?.id === player.id || match.right?.id === player.id)
            ) {
              // Player has an active match, send tournamentMatch message
              const role = match.left?.id === player.id ? "left" : "right";
              const opponent = role === "left" ? match.right : match.left;
              player.socket.send(
                JSON.stringify({
                  type: "tournamentMatch",
                  tournamentId: normalizedId,
                  round: t.round,
                  opponentId: opponent?.id,
                  opponentUsername: opponent?.username,
                  role: role,
                })
              );
              break;
            }
          }
        }
      }
    } catch (e) {
      console.error(
        `[Tournament ${normalizedId}] Failed to send rejoin data`,
        e
      );
    }

    console.log(
      `[Tournament ${normalizedId}] Player ${player.id} successfully rejoined`
    );
    return true;
  }

  /**
   * Handle a player explicitly leaving a tournament
   * This is different from disconnect - the player actively chose to leave
   */
  leaveTournament(tournamentId: string, socket: SocketLike): boolean {
    const normalizedId = tournamentId.toUpperCase();
    const t = this.tournaments.get(normalizedId);
    const player = getPlayerBySocket(socket as any);

    if (!t || !player) {
      console.log(
        `[Tournament] Cannot leave ${normalizedId} - tournament or player not found`
      );
      return false;
    }

    // Check if player is actually in this tournament
    const tournamentPlayer = t.getPlayerById(player.id);
    if (!tournamentPlayer) {
      console.log(
        `[Tournament ${normalizedId}] Player ${player.id} not in tournament`
      );
      return false;
    }

    console.log(
      `[Tournament ${normalizedId}] Player ${player.id} (${player.username}) is leaving`
    );

    // Forfeit the player (this handles both pre-tournament and mid-match scenarios)
    t.forfeitPlayer(player.id, "left the tournament");

    // Remove player from tournament roster if tournament hasn't started
    if (t.status === "created" || t.status === "starting") {
      const playerIndex = t.players.findIndex((p) => p.id === player.id);
      if (playerIndex !== -1) {
        t.players.splice(playerIndex, 1);
        t.playersReady.delete(player.id);
        t.broadcastParticipantUpdate();
      }
    }

    // If only one player remains and tournament is in progress, they win
    if (t.status === "inProgress") {
      // Count remaining active players (those who haven't been eliminated)
      const remainingPlayers = t.players.filter((p) => {
        // Check if player has been eliminated (lost a match where they were not the winner)
        for (const round of t.bracket) {
          for (const match of round) {
            if (match.winner && (match.left?.id === p.id || match.right?.id === p.id)) {
              if (match.winner.id !== p.id) {
                return false; // Player was eliminated
              }
            }
          }
        }
        return true;
      });

      // If this player was one of the remaining, remove them
      const remainingAfterLeave = remainingPlayers.filter((p) => p.id !== player.id);

      if (remainingAfterLeave.length === 1) {
        // Only one player left - declare them the winner
        const champion = remainingAfterLeave[0];
        console.log(
          `[Tournament ${normalizedId}] Only ${champion.username} remains - declaring winner`
        );

        t.status = "completed";

        // Cancel any pending timeouts
        if (t.readyTimeout) {
          clearTimeout(t.readyTimeout);
          t.readyTimeout = undefined;
        }
        if (t.kickoffRetryTimeout) {
          clearTimeout(t.kickoffRetryTimeout);
          t.kickoffRetryTimeout = undefined;
        }

        // Notify all players
        for (const p of t.players) {
          try {
            p.socket.send(
              JSON.stringify({
                type: "tournamentCompleted",
                tournamentId: t.id,
                winnerId: champion.id,
                reason: "All other players left",
              })
            );
          } catch { }
        }

        // Clean up
        this.tournaments.delete(normalizedId);
      }
    }

    return true;
  }
}

export const tournamentManager = new TournamentManager();
