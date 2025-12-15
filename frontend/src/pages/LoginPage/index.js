import { Navbar } from "../../components/Navbar/index.js";
import { useAuth } from "../../hooks/useAuth.js";
import { checkAuth } from "../../utils/auth.js";
import { useNavigation } from "../../hooks/useNavigation.js";

export async function LoginPage() {
  const { setupLoginForm } = useAuth();
  const loggedIn = await checkAuth();
  const { navigateTo } = useNavigation();

  if (loggedIn?.loggedIn) {
    navigateTo("/profile");
    return "";
  }

  setupLoginForm();

  return `
    ${Navbar(loggedIn)}
    <div class="main-content">
      <div class="auth-container">
        <form class="auth-form">
          <h1>Login</h1>
          <div class="form-group">
            <label for="username">Username:</label>
            <input type="text" id="username" name="username" placeholder="Enter username" required>
          </div>
          <div class="form-group">
            <label for="password">Password:</label>
            <input type="password" id="password" name="password" placeholder="Enter password" required>
          </div>
          <button type="submit" class="btn btn-primary">Login</button>
          <p>Don't have an account? <a href="/register">Register</a></p>
        </form>
      </div>
    </div>
  `;
}
