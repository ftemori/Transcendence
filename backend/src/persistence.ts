import { recordTournamentResult } from "./blockchain.js";

// Minimal Avalanche C-Chain client stub to persist tournament results.
// Replace with a real Avalanche client integration.

export interface TournamentResultRecord {
  tournamentId: string;
  winnerId: number; // User ID from auth system
  players: number[]; // User IDs from auth system
  rounds: number[]; // number of matches per round
  timestamp?: number;
}

export async function persistTournamentResult(
  result: TournamentResultRecord
): Promise<void> {
  const payload = { ...result, timestamp: Date.now() };
  console.log("[Persist] Tournament", JSON.stringify(payload));
  try {
    await recordTournamentResult(
      result.tournamentId,
      result.winnerId.toString()
    );
  } catch (e) {
    console.error("[Persist] blockchain write failed", e);
  }
}
