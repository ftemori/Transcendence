import { useScriptLoader } from "./useScriptLoader.js";

export function useTournament() {
  const { loadScript } = useScriptLoader();

  const initializeTournament = (user) => {
    setTimeout(() => {
      // user comes from checkAuth() which returns { loggedIn: true, user: { id, username } }
      // So we need to access user.user.id
      const userId = user?.user?.id || user?.id;
      if (!window.initTournamentGame) {
        loadScript("/utils/tournamentGame.js", () => {
          if (window.initTournamentGame) {
            window.initTournamentGame(userId);
          }
        });
      } else {
        window.initTournamentGame(userId);
      }
    }, 100);
  };

  const cleanupTournament = () => {
    if (
      window.tournamentGameInstance &&
      typeof window.tournamentGameInstance.cleanup === "function"
    ) {
      window.tournamentGameInstance.cleanup();
      window.tournamentGameInstance = null;
    }
  };

  return { initializeTournament, cleanupTournament };
}
