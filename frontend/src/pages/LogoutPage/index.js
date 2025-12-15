import { Navbar } from "../../components/Navbar/index.js";
import { fetchWithLoader } from "../../utils/fetchWithLoader.js";
import { useToast } from "../../hooks/useToast.js";
import { API_CONFIG } from "../../config.js";

export async function LogoutPage() {
  const response = await fetchWithLoader(
    `${API_CONFIG.AUTH_SERVICE_URL}/logout`,
    {
      method: "POST",
      credentials: "include",
    }
  );

  const data = await response.json();

  if (!response.ok || !data.success) {
    const { showToast } = useToast();
    showToast(data.error || data.message || "Logout failed", "error");
    return;
  }

  // Clear all chat history from sessionStorage and close chat window
  try {
    const { clearAllChatHistory, closeChatWindow } = await import(
      "../../components/chat.js"
    );
    clearAllChatHistory();
    closeChatWindow();
  } catch (e) {
    console.error("Failed to clear chat history:", e);
  }

  const { showToast } = useToast();
  showToast("Logged out successfully", "success");
  const user = { loggedIn: false };

  return `
    ${Navbar(user)}
    <div class="main-content">
      <div class="auth-container">
        <form class="auth-form">
          <h1>Logout</h1>
          <p>You've successfully logged out!  <a href="/login">Click here to login again</a></p>
        </form>
      </div>
    </div>
  `;
}
