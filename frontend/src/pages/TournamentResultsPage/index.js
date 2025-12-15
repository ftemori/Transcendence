import { Navbar } from "../../components/Navbar/index.js";
import { checkAuth } from "../../utils/auth.js";
import { API_CONFIG } from "../../config.js";

export async function TournamentResultsPage() {
    const user = await checkAuth();

    // Set up data fetching after render
    setTimeout(async () => {
        const container = document.getElementById("tournaments-container");
        if (!container) return;

        try {
            container.innerHTML = '<p class="loading-message">Loading tournament results from blockchain...</p>';

            const resp = await fetch(`${API_CONFIG.BACKEND_URL}/api/tournaments`, {
                credentials: "include",
            });

            if (!resp.ok) throw new Error("Failed to fetch tournaments");

            const data = await resp.json();

            if (!data.success || !data.tournaments || data.tournaments.length === 0) {
                container.innerHTML = `
          <div class="no-results">
            <h3>🏆 No Tournament Results Yet</h3>
            <p>Complete a tournament to see results stored on the blockchain!</p>
            <a href="/tournament" class="btn btn-primary">Start a Tournament</a>
          </div>
        `;
                return;
            }

            const contractAddress = data.contractAddress;
            const explorerBaseUrl = "https://testnet.snowtrace.io";

            let tableHtml = `
        <div class="blockchain-info">
          <span class="blockchain-badge">⛓️ Avalanche Fuji Testnet</span>
          <a href="${explorerBaseUrl}/address/${contractAddress}" target="_blank" class="contract-link">
            View Contract on Snowtrace ↗
          </a>
        </div>
        <table class="results-table">
          <thead>
            <tr>
              <th>Tournament ID</th>
              <th>Winner</th>
              <th>Date</th>
              <th>Blockchain</th>
            </tr>
          </thead>
          <tbody>
      `;

            // Sort by timestamp descending (newest first)
            data.tournaments.sort((a, b) => b.timestamp - a.timestamp);

            for (const t of data.tournaments) {
                const date = new Date(t.timestamp * 1000).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                });

                tableHtml += `
          <tr>
            <td><code>${t.tournamentId}</code></td>
            <td>
              <span class="winner-badge">🏆 ${t.winnerUsername}</span>
            </td>
            <td>${date}</td>
            <td>
              <a href="${explorerBaseUrl}/address/${contractAddress}" target="_blank" class="verify-link">
                Verify ↗
              </a>
            </td>
          </tr>
        `;
            }

            tableHtml += `
          </tbody>
        </table>
        <p class="results-count">${data.tournaments.length} tournament(s) recorded on blockchain</p>
      `;

            container.innerHTML = tableHtml;
        } catch (err) {
            console.error("Failed to load tournaments:", err);
            container.innerHTML = `
        <div class="error-message">
          <p>❌ Failed to load tournament results</p>
          <p>Please try again later.</p>
        </div>
      `;
        }
    }, 100);

    return `
    ${Navbar(user)}
    <div class="main-content">
      <div class="results-page">
        <h1>🏆 Tournament Results</h1>
        <p class="page-subtitle">All results are permanently stored on the Avalanche blockchain</p>
        <div id="tournaments-container">
          <p class="loading-message">Loading...</p>
        </div>
      </div>
    </div>
  `;
}
