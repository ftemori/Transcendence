import { Navbar } from "../../components/Navbar/index.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useForm } from "../../hooks/useForm.js";
import { checkAuth } from "../../utils/auth.js";
import { useNavigation } from "../../hooks/useNavigation.js";

export async function RegisterPage() {
  const { setupRegisterForm } = useAuth();
  const { setupRealTimeValidation } = useForm();
  const loggedIn = await checkAuth();
  const { navigateTo } = useNavigation();

  if (loggedIn?.loggedIn) {
    navigateTo("/profile");
    return "";
  }
  setupRegisterForm();
  const validationRules = {
    username: { required: true, minLength: 3 },
    email: { required: true, email: true },
    password: { required: true, minLength: 6 },
    confirmPassword: { required: true },
  };

  // Inline validation disabled; relying on toasts from useAuth/register
  // setupRealTimeValidation(".auth-form", validationRules);
  return `
    ${Navbar(loggedIn)}
    <div class="main-content">
      <div class="auth-container">
        <form class="auth-form">
          <h1>Register</h1>
          <div class="form-group">
            <label for="username">Username:</label>
            <input type="text" id="username" name="username" placeholder="Enter username" required>
          </div>
          <div class="form-group">
            <label for="password">Password:</label>
            <input type="password" id="password" name="password" placeholder="Enter password" required>
          </div>
          <div class="form-group">
            <label for="confirmPassword">Confirm Password:</label>
            <input type="password" id="confirmPassword" name="confirmPassword" placeholder="Confirm password" required>
          </div>
          <button type="submit" class="btn btn-primary">Register</button>
          <p>Already have an account? <a href="/login">Login</a></p>
        </form>
      </div>
    </div>
  `;
}
