import { useScriptLoader } from "./useScriptLoader.js";

export function useOnlineGame() {
  const { loadScript } = useScriptLoader();

  const initializeOnlineGame = (user) => {
    const clientId = user && user.loggedIn ? user.id || null : null;
    setTimeout(() => {
      if (!window.initOnlineGame) {
        loadScript("/utils/onlineGame.js", () => {
          if (window.initOnlineGame) {
            window.initOnlineGame(clientId);
          }
        });
      } else {
        window.initOnlineGame(clientId);
      }
    }, 100);
  };

  const getConnectionStatus = () => {
    const statusElement = document.getElementById("status");
    return statusElement ? statusElement.textContent : "Unknown";
  };

  const updateConnectionStatus = (status) => {
    const statusElement = document.getElementById("status");
    if (statusElement) {
      statusElement.textContent = status;
    }
  };

  const resetConnection = () => {
    updateConnectionStatus("Reconnecting...");
    initializeOnlineGame();
  };

  return {
    initializeOnlineGame,
    getConnectionStatus,
    updateConnectionStatus,
    resetConnection,
  };
}
