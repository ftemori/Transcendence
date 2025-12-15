import { useRouter } from "../hooks/useRouter.js";

class Router {
  constructor() {
    this.routes = [];
    this.currentPath = "";
    this.router = useRouter(this);
  }

  addRoute(path, component) {
    this.routes.push({ path, component });
  }

  async navigate(path) {
    this.cleanup();
    this.currentPath = path;
    // Delegate navigation and rendering to useRouter.navigate to avoid double render
    this.router.navigate(path);
    // Removed extra await this.render(); which caused double rendering
  }

  async handleRoute() {
    this.cleanup();
    const path = window.location.pathname;
    this.currentPath = path;
    await this.render();
  }

  cleanup() {
    if (
      window.currentGame &&
      typeof window.currentGame.destroy === "function"
    ) {
      window.currentGame.destroy();
      window.currentGame = null;
    }

    if (
      window.onlineGameInstance &&
      typeof window.onlineGameInstance.cleanup === "function"
    ) {
      window.onlineGameInstance.cleanup();
      window.onlineGameInstance = null;
    }

    if (
      window.tournamentGameInstance &&
      typeof window.tournamentGameInstance.cleanup === "function"
    ) {
      window.tournamentGameInstance.cleanup();
      window.tournamentGameInstance = null;
    }
  }

  async render() {
    const route = this.routes.find((r) => r.path === this.currentPath);
    const app = document.getElementById("app");

    if (app && route) {
      app.innerHTML = await route.component();
      this.attachEventListeners();
    } else if (app) {
      app.innerHTML = "<h1>404 - Page Not Found</h1>";
    }
  }

  attachEventListeners() {
    this.router.attachNavigationListeners();
  }

  async init() {
    window.addEventListener("popstate", () => this.handleRoute());
    await this.handleRoute();
  }
}

export { Router };
