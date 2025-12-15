// Avalanche Fuji testnet integration utilities
// Note: Provide PRIVATE_KEY, AVAX_RPC_URL, TOURNAMENT_CONTRACT_ADDRESS via env.

import { ethers } from "ethers";
import { TournamentScoresABI } from "./contracts/TournamentScoresABI.js";

let provider: ethers.JsonRpcProvider | null = null;
let wallet: ethers.Wallet | null = null;
let contract: ethers.Contract | null = null;

export function initBlockchain() {
  try {
    const rpcUrl =
      process.env.AVAX_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
    const pkRaw = process.env.PRIVATE_KEY || "";
    const addr = process.env.TOURNAMENT_CONTRACT_ADDRESS || "";

    if (!pkRaw || !addr) {
      console.warn(
        "[Blockchain] PRIVATE_KEY or CONTRACT_ADDRESS not set. Writes disabled."
      );
      provider = new ethers.JsonRpcProvider(rpcUrl);
      wallet = null;
      contract = null;
      return;
    }

    const pk = pkRaw.startsWith("0x") ? pkRaw : `0x${pkRaw}`;
    provider = new ethers.JsonRpcProvider(rpcUrl);
    wallet = new ethers.Wallet(pk, provider);
    contract = new ethers.Contract(addr, TournamentScoresABI, wallet);
    console.log(
      "[Blockchain] initialized with account",
      wallet.address,
      "contract",
      addr
    );
  } catch (e) {
    console.error("[Blockchain] init failed", e);
  }
}

function ensureInit() {
  if (!provider) initBlockchain();
}

export async function recordTournamentResult(
  tournamentId: string,
  winnerId: string
) {
  ensureInit();
  if (!contract || !wallet) {
    console.warn(
      "[Blockchain] contract not configured; skipping on-chain write"
    );
    return;
  }
  try {
    const tx = await contract.recordResult(tournamentId, winnerId);
    console.log("[Blockchain] recordResult tx sent", tx.hash);
    const rc = await tx.wait();
    console.log("[Blockchain] recordResult confirmed in block", rc.blockNumber);
  } catch (e) {
    console.error("[Blockchain] recordResult failed", e);
  }
}

export async function getTournamentResult(
  tournamentId: string
): Promise<{
  tournamentId: string;
  winnerId: string;
  timestamp: bigint;
} | null> {
  ensureInit();
  if (!contract) return null;
  try {
    const [id, winner, ts] = await contract.getResult(tournamentId);
    return { tournamentId: id, winnerId: winner, timestamp: ts };
  } catch (e) {
    console.error("[Blockchain] getResult failed", e);
    return null;
  }
}

export interface TournamentRecord {
  tournamentId: string;
  winnerId: string;
  timestamp: number;
}

export async function getAllTournaments(): Promise<TournamentRecord[]> {
  ensureInit();
  if (!provider) return [];

  try {
    const rpcUrl =
      process.env.AVAX_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
    const addr = process.env.TOURNAMENT_CONTRACT_ADDRESS || "";

    if (!addr) {
      console.warn("[Blockchain] No contract address configured");
      return [];
    }

    // Use read-only provider for public queries
    const readProvider = new ethers.JsonRpcProvider(rpcUrl);
    const readContract = new ethers.Contract(addr, TournamentScoresABI, readProvider);

    const count = await readContract.getTournamentCount();
    const tournaments: TournamentRecord[] = [];

    for (let i = 0; i < count; i++) {
      try {
        const [id, winner, ts] = await readContract.getTournamentAt(i);
        tournaments.push({
          tournamentId: id,
          winnerId: winner,
          timestamp: Number(ts),
        });
      } catch (e) {
        console.error(`[Blockchain] Failed to fetch tournament at index ${i}`, e);
      }
    }

    console.log(`[Blockchain] Fetched ${tournaments.length} tournaments`);
    return tournaments;
  } catch (e) {
    console.error("[Blockchain] getAllTournaments failed", e);
    return [];
  }
}

export function getContractAddress(): string {
  return process.env.TOURNAMENT_CONTRACT_ADDRESS || "";
}
