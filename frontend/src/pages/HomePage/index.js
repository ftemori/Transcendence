import { Navbar } from "../../components/Navbar/index.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { checkAuth } from "../../utils/auth.js";

export async function HomePage() {
  const { setupHeroNavigation } = useNavigation();
  const user = await checkAuth();

  setupHeroNavigation();

  return `
    ${Navbar(user)}
    <div class="main-content">
      <div class="hero-section">
        <h1>Welcome to Transcendence</h1>
        <p>Classic Pong game with modern features</p>
        <div class="hero-buttons">
          <a href="/offline" class="btn btn-primary">Play Offline</a>
          <a href="/online" class="btn btn-success">Play Online</a>
          ${
            user.loggedIn
              ? '<a href="/profile" class="btn btn-secondary">My Profile</a>'
              : ""
          }
        </div>
      </div>

      <div class="features-section">
        <h2>Game Features</h2>
        <div class="features-grid">
          <div class="feature-card">
            <h3>🎮 Classic Gameplay</h3>
            <p>Enjoy the original Pong mechanics with modern improvements</p>
          </div>
          <div class="feature-card">
            <h3>🏠 Offline Mode</h3>
            <p>Play locally on one screen with a friend</p>
          </div>
          <div class="feature-card">
            <h3>🌐 Online Mode</h3>
            <p>Play remotely with friends over the internet</p>
          </div>
          <div class="feature-card">
            <h3>📊 Statistics</h3>
            <p>Track your progress and achievements</p>
          </div>
        </div>
      </div>
    </div>
  `;
}
