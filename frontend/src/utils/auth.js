import { fetchWithLoader } from "./fetchWithLoader.js";
import { API_CONFIG } from "../config.js";

export async function checkAuth() {
  try {
    const res = await fetchWithLoader(
      `${API_CONFIG.AUTH_SERVICE_URL}/auth/status`,
      {
        method: "GET",
        credentials: "include",
      }
    );

    const data = await res.json();
    return data.loggedIn ? data : { loggedIn: false };
  } catch (err) {
    console.error("Failed to check auth status:", err);
    return { loggedIn: false };
  }
}
