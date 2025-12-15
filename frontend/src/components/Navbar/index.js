export function Navbar(user = { loggedIn: false }) {
  return `
    <nav class="navbar">
      <div class="nav-container">
        <div class="nav-brand">
          <h1>Transcendence</h1>
        </div>
        <ul class="nav-menu">
          <li><a href="/" class="nav-link">Home</a></li>
          <li><a href="/offline" class="nav-link">Offline</a></li>
          <li><a href="/online" class="nav-link">Online</a></li>
          <li><a href="/tournament" class="nav-link">Tournament</a></li>
          <li><a href="/results" class="nav-link">Results</a></li>
          ${user.loggedIn
      ? `<li><a href="/profile" class="nav-link">${user.username || "Profile"}</a></li>
              <li><a href="/settings" class="nav-link">Settings</a></li>
              <li><a href="/logout" class="nav-link" id="logout-link">Logout</a></li>`
      : `<li><a href="/login" class="nav-link">Login</a></li>`
    }
        </ul>
      </div>
    </nav>
  `;
}
