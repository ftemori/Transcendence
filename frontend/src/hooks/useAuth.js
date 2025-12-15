import { useForm } from "./useForm.js";
import { useNavigation } from "./useNavigation.js";
import { fetchWithLoader } from "../utils/fetchWithLoader.js";
import { useToast } from "../hooks/useToast.js";
import { API_CONFIG } from "../config.js";

export function useAuth() {
  const { handleSubmit } = useForm();
  const { navigateTo } = useNavigation();

  const login = async (credentials) => {
    const { showToast } = useToast();
    try {
      const response = await fetchWithLoader(
        `${API_CONFIG.AUTH_SERVICE_URL}/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(credentials),
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        const msg = data.error || data.message || "Login failed";
        showToast(msg, "error");
        return;
      }

      if (data.requires2fa && data.user && data.user.username) {
        sessionStorage.setItem("pending2faUsername", data.user.username);
        showToast("Two-Factor required. Enter the code.", "info");
        navigateTo("/login-2fa");
        return;
      }

      showToast("Logged in successfully", "success");
      // Initialize friends sidebar immediately after login so the toggle appears without reload
      try {
        const mod = await import("../components/friendsSidebar.js");
        if (mod && typeof mod.initFriendsSidebar === "function") {
          mod.initFriendsSidebar();
        }
      } catch {}
      navigateTo("/profile");
    } catch (error) {
      console.error("Login error:", error);
      showToast("Network error or server unavailable", "error");
    }
  };

  const register = async (userData) => {
    console.log("Register called with", userData);

    const { showToast } = useToast();

    if (userData.password !== userData.confirmPassword) {
      showToast("Passwords do not match", "error");
      return;
    }

    if (userData.password.length < 6) {
      showToast("Password must be at least 6 characters", "error");
      return;
    }

    try {
      const response = await fetchWithLoader(
        `${API_CONFIG.AUTH_SERVICE_URL}/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: userData.username,
            password: userData.password,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        const msg = result.message || "Registration failed";
        showToast(msg, "error");
        return;
      }
      showToast("Registered successfully. Please login.", "success");
      navigateTo("/login");
    } catch (err) {
      console.error("Registration error:", err);
      showToast("Unexpected error during registration", "error");
    }
  };

  const logout = () => {
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("userEmail");
    navigateTo("/login");
  };

  const isAuthenticated = () => {
    return localStorage.getItem("isAuthenticated") === "true";
  };

  const getCurrentUser = () => {
    return {
      email: localStorage.getItem("userEmail"),
      isAuthenticated: isAuthenticated(),
    };
  };

  const setupLoginForm = () => {
    handleSubmit(".auth-form", login);
  };

  const setupRegisterForm = () => {
    handleSubmit(".auth-form", register);
  };

  return {
    login,
    register,
    logout,
    isAuthenticated,
    getCurrentUser,
    setupLoginForm,
    setupRegisterForm,
  };
}
