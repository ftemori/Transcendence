import { Navbar } from "../../components/Navbar/index.js";
import { useForm } from "../../hooks/useForm.js";
import { checkAuth } from "../../utils/auth.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { fetchWithLoader } from "../../utils/fetchWithLoader.js";
import { useToast } from "../../hooks/useToast.js";
import { API_CONFIG } from "../../config.js";

export async function Login2FAPage() {
  const { handleSubmit, showError, clearErrors, getFormData } = useForm();
  const loggedIn = await checkAuth();
  const { navigateTo } = useNavigation();

  if (loggedIn?.loggedIn) {
    navigateTo("/profile");
    return "";
  }

  const pendingUsername = sessionStorage.getItem("pending2faUsername");

  setTimeout(() => {
    handleSubmit(".otp-form", async () => {
      const { token } = getFormData(".otp-form");
      if (!pendingUsername) {
        const { showToast } = useToast();
        showToast("No pending user. Please login again.", "error");
        navigateTo("/login");
        return;
      }
      try {
        const res = await fetchWithLoader(
          `${API_CONFIG.AUTH_SERVICE_URL}/login/2fa`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: pendingUsername, token }),
            credentials: "include",
          }
        );
        const data = await res.json();
        if (!res.ok || !data.success) {
          const { showToast } = useToast();
          const msg = data.error || data.message || "Invalid 2FA code";
          showToast(msg, "error");
          return;
        }
        sessionStorage.removeItem("pending2faUsername");
        const { showToast } = useToast();
        showToast("2FA verified successfully", "success");
        navigateTo("/profile");
      } catch (e) {
        const { showToast } = useToast();
        showToast("Network error during 2FA verification", "error");
      }
    });
  }, 0);

  const user = { loggedIn: false };
  return `
    ${Navbar(loggedIn)}
    <div class="main-content">
      <div class="auth-container">
        <form class="auth-form otp-form">
          <h1>Two-Factor Authentication</h1>
          <div class="form-group">
            <label for="token">Enter 2FA Code:</label>
            <input type="text" id="token" name="token" placeholder="6-digit code" required>
          </div>
          <button type="submit" class="btn btn-primary">Verify</button>
        </form>
      </div>
    </div>
  `;
}
