import { useScriptLoader } from "./useScriptLoader.js";

export function useGame() {
  const { loadScript } = useScriptLoader();

  const initializeGame = () => {
    setTimeout(() => {
      if (!window.initGame) {
        loadScript("/utils/game.js", () => {
          if (window.initGame) {
            window.initGame();
          }
        });
      } else {
        window.initGame();
      }
    }, 100);
  };

  const cleanupGame = () => {
    if (
      window.currentGame &&
      typeof window.currentGame.destroy === "function"
    ) {
      window.currentGame.destroy();
      window.currentGame = null;
    }
  };

  return { initializeGame, cleanupGame };
}
